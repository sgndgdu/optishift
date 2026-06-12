/* eslint-disable @typescript-eslint/no-explicit-any */
import { spawn } from "child_process";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import Database from "better-sqlite3";
import { requireAuth } from "@/lib/auth";

const ENGINE_PATH = path.resolve(process.cwd(), "../engine/optishift_engine.py");
const ENGINE_TIMEOUT_MS = 15_000;

function runEngine(payload: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [ENGINE_PATH, "--api"]);
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (err?: Error, out?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      err ? reject(err) : resolve(out!);
    };

    const timer = setTimeout(() => {
      proc.kill();
      finish(new Error("Optimizasyon motoru zaman aşımına uğradı (15s)"));
    }, ENGINE_TIMEOUT_MS);

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("error", (err) => finish(err));
    proc.on("close", (code) => {
      if (code !== 0 && code !== null) {
        finish(new Error(stderr || `Engine çıkış kodu: ${code}`));
      } else {
        finish(undefined, stdout);
      }
    });

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  // Diğer API'larla tutarlılık için snake_case da kabul edilir
  const branchId: string | undefined = body.locationId ?? body.location_id;
  if (!branchId) {
    return NextResponse.json({ error: "locationId (veya location_id) zorunlu" }, { status: 400 });
  }
  // week_start: schedule sayfasından ISO Pazartesi tarihi gelir (YYYY-MM-DD)
  // Gelmezse otomatik olarak bu haftanın Pazartesisini hesapla
  const week_start: string = (() => {
    if (body.week_start && /^\d{4}-\d{2}-\d{2}$/.test(body.week_start)) return body.week_start;
    const now = new Date();
    const day = now.getDay(); // 0=Pazar
    const diff = day === 0 ? -6 : 1 - day; // Pazartesi'ye geri git
    now.setDate(now.getDate() + diff);
    return now.toISOString().split("T")[0];
  })();

  try {
    const db = new Database(path.join(process.cwd(), "optishift.db"));

    // Location'ı DB'den çek ve org'a ait olduğunu doğrula
    const locationRow = db.prepare(`SELECT * FROM locations WHERE id = ? AND org_id = ?`).get(branchId, auth.org_id) as any;
    if (!locationRow) {
      db.close();
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }
    const orgId: string = auth.org_id;

    // Shift tanımlarını parse et; yoksa 2-vardiyalı varsayılan modeli kullan
    const defaultShifts = [
      { name: "Sabah", start: "08:00", end: "16:00", base_points: 3 },
      { name: "Akşam", start: "16:00", end: "00:00", base_points: 5 },
    ];
    let shiftsPayload = defaultShifts;
    if (locationRow?.shift_definitions) {
      try {
        const defs = JSON.parse(locationRow.shift_definitions);
        if (Array.isArray(defs) && defs.length > 0) {
          shiftsPayload = defs.map((d: any) => ({
            id:          String(d.id ?? d.name ?? ""),
            name:        String(d.name ?? "Vardiya"),
            start:       String(d.start ?? "08:00"),
            end:         String(d.end   ?? "16:00"),
            base_points: Number(d.base_points ?? 5),
          }));
        }
      } catch { /* parse hatası → varsayılan shifts kullan */ }
    }

    // Aktif personeli çek
    let personnelRows = db.prepare(`SELECT * FROM personnel WHERE assigned_location_ids LIKE ? AND status = 'active'`).all(`%"${branchId}"%`) as any[];

    // Müdür/admin varsayılan olarak otomatik planlamaya dahil edilmez (locations.rules toggle'ı)
    let includeManagersInSchedule = false;
    if (locationRow?.rules) {
      try {
        includeManagersInSchedule = !!JSON.parse(locationRow.rules)?.include_managers_in_schedule;
      } catch { /* ignore */ }
    }
    if (!includeManagersInSchedule) {
      personnelRows = personnelRows.filter(
        (p: any) => !["manager", "admin", "supervisor"].includes(p.user_access_level)
      );
    }

    // Müsaitlik verilerini çek — hedef haftaya göre filtrele
    const personnelIds = personnelRows.map((p: any) => p.id);
    let availabilityRows: any[] = [];
    if (personnelIds.length > 0) {
      const placeholders = personnelIds.map(() => '?').join(',');
      availabilityRows = db.prepare(
        `SELECT * FROM availability WHERE personnel_id IN (${placeholders}) AND week_start = ?`
      ).all(...personnelIds, week_start);
    }

    // Onaylı izin taleplerini çek — bu haftaya düşen günleri hard "unavailable" olarak blokla
    let approvedLeaveRows: any[] = [];
    if (personnelIds.length > 0) {
      try {
        const weekEndDate = new Date(week_start + 'T00:00:00Z');
        weekEndDate.setDate(weekEndDate.getDate() + 6);
        const week_end = weekEndDate.toISOString().split('T')[0];
        const leavePlaceholders = personnelIds.map(() => '?').join(',');
        approvedLeaveRows = db.prepare(
          `SELECT personnel_id, start_date, end_date
           FROM leave_requests
           WHERE personnel_id IN (${leavePlaceholders})
             AND status = 'approved'
             AND start_date <= ? AND end_date >= ?`
        ).all(...personnelIds, week_end, week_start) as any[];
      } catch { /* leave_requests tablosu yoksa atla */ }
    }

    db.close();

    // prevScores: DB'deki değerleri kullan (client'tan override almıyoruz)
    const prevScores: Record<string, number> = {};
    for (const p of personnelRows) {
      prevScores[p.id] = p.prev_score ?? 0;
    }

    // Verileri formatla
    const personnelData = personnelRows.map((p: any) => {
      // role_levels: { "barista": "primary", "kasa": "secondary" }
      // Herhangi bir değer "primary" ise personel primary kabul edilir
      let role_level = "secondary";
      try {
        const rls = JSON.parse(p.role_levels || "{}");
        if (Object.values(rls).includes("primary")) role_level = "primary";
      } catch { /* ignore */ }

      return {
        id: p.id,
        name: p.name,
        skills: JSON.parse(p.roles || "[]"),
        prev_score: prevScores[p.id] ?? 0,
        employment_type: p.employment_type || "full_time",
        max_weekly_hours: p.max_weekly_hours ?? 45,
        min_weekly_hours: p.min_weekly_hours ?? 0,
        branch_ids: JSON.parse(p.assigned_location_ids || "[]"),
        org_id: p.org_id,
        role_level,
      };
    });

    const parseAvail = (val: any) => {
      if (!val) return "available";
      if (typeof val === 'string' && val.startsWith("{")) {
        try { return JSON.parse(val); } catch(e) { return "available"; }
      }
      return val;
    };

    const availabilityData: Record<string, any> = {};
    for (const av of availabilityRows) {
      availabilityData[av.personnel_id] = {
        0: parseAvail(av.day_0),
        1: parseAvail(av.day_1),
        2: parseAvail(av.day_2),
        3: parseAvail(av.day_3),
        4: parseAvail(av.day_4),
        5: parseAvail(av.day_5),
        6: parseAvail(av.day_6),
      };
    }

    // Haftalık sabit izin günlerini hard "unavailable" olarak işaretle
    for (const p of personnelRows) {
      if (p.weekly_off_day !== null && p.weekly_off_day !== undefined) {
        const d = Number(p.weekly_off_day);
        if (d >= 0 && d <= 6) {
          if (!availabilityData[p.id]) availabilityData[p.id] = {};
          availabilityData[p.id][d] = 'unavailable';
        }
      }
    }

    // Onaylı izin günlerini hard "unavailable" olarak üst yaz
    const wsDate = new Date(week_start + 'T00:00:00Z');
    for (const leave of approvedLeaveRows) {
      const pid = leave.personnel_id;
      const leaveStart = new Date(leave.start_date + 'T00:00:00Z');
      const leaveEnd   = new Date(leave.end_date   + 'T00:00:00Z');
      if (!availabilityData[pid]) availabilityData[pid] = {};
      for (let d = 0; d < 7; d++) {
        const dayDate = new Date(wsDate);
        dayDate.setDate(wsDate.getDate() + d);
        if (dayDate >= leaveStart && dayDate <= leaveEnd) {
          availabilityData[pid][d] = 'unavailable';
        }
      }
    }

    // Bölge kotalarını parse et; yoksa boş gönder (engine global defaultlara düşer)
    let zoneQuotasPayload: Record<string, number> = {};
    if (locationRow?.zone_quotas) {
      try {
        const parsed = JSON.parse(locationRow.zone_quotas);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          zoneQuotasPayload = parsed;
        }
      } catch { /* parse hatası → boş bırak */ }
    }

    // Kapasite matrisini parse et — demand-based scheduling
    let demandMatrixPayload: Record<string, Record<string, number>> = {};
    if (locationRow?.demand_matrix) {
      try {
        const parsed = JSON.parse(locationRow.demand_matrix);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          demandMatrixPayload = parsed;
        }
      } catch { /* parse hatası → boş bırak */ }
    }

    // Kural toggle'ları — locations.rules'dan oku
    let ensureSeniorPerShift = false;
    let maxConsecutiveDays = 6;
    let noNightToMorning = false;
    let preferredNotMultiplier = 1.5;
    let clopeningMinRestHours = 13;
    if (locationRow?.rules) {
      try {
        const parsedRules = JSON.parse(locationRow.rules);
        ensureSeniorPerShift = !!parsedRules?.ensure_senior_per_shift;
        if (typeof parsedRules?.max_consecutive_days === 'number') {
          maxConsecutiveDays = parsedRules.max_consecutive_days;
        }
        noNightToMorning = !!parsedRules?.no_night_to_morning;
        if (typeof parsedRules?.preferred_not_multiplier === 'number') {
          preferredNotMultiplier = parsedRules.preferred_not_multiplier;
        }
        if (typeof parsedRules?.clopening_min_rest_hours === 'number') {
          clopeningMinRestHours = parsedRules.clopening_min_rest_hours;
        }
      } catch { /* ignore */ }
    }

    const payload = {
      prevScores,
      branchId,
      orgId,
      week_start,
      personnel:               personnelData,
      availability:            availabilityData,
      shifts:                  shiftsPayload,
      zone_quotas:             zoneQuotasPayload,
      demand_matrix:           demandMatrixPayload,
      ensure_senior_per_shift: ensureSeniorPerShift,
      max_consecutive_days:    maxConsecutiveDays,
      no_night_to_morning:     noNightToMorning,
      preferred_not_multiplier: preferredNotMultiplier,
      rules: {
        max_weekly_hours: 45,
        min_rest_hours:   11,
        clopening_min_rest_hours: clopeningMinRestHours,
      },
    };

    const stdout = await runEngine(payload);

    // stdout'ta yalnızca son satır JSON — debug satırlarını atla
    const jsonLine = stdout.trim().split("\n").filter((l) => l.startsWith("{")).at(-1) ?? stdout;
    const data = JSON.parse(jsonLine);
    
    // Python motorundan dönen veriyi UI için eşle
    if (data.personnel) {
      data.personnel = data.personnel.map((p: any) => ({
        ...p,
        roles: p.skills || []
      }));
    }
    
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
