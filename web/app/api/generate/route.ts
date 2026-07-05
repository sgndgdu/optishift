/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { db as drizzleDb, departments as departmentsTable } from "@/lib/db";
import { eq } from "drizzle-orm";
import { logPlatformEvent } from "@/lib/platform-logger";
import { recomputeYtdOvertime, upsertPendingOvertime } from "@/lib/overtime";

// Railway'de çalışan FastAPI engine servisinin URL'i
const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:8000";
const ENGINE_TIMEOUT_MS = 55_000;

async function callEngine(payload: unknown): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENGINE_TIMEOUT_MS);

  try {
    const res = await fetch(`${ENGINE_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // FastAPI hataları {"detail": "..."} şeklinde gelir — kullanıcıya ham JSON göstermek yerine mesajı ayıkla
      let message = text || `Engine HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed?.detail === "string") message = parsed.detail;
      } catch {
        /* JSON değilse ham metni kullan */
      }
      throw new Error(message);
    }
    return await res.json();
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(
        "Optimizasyon motoru ilk çağrıda başlatılıyor olabilir (soğuk başlangıç) ya da personel sayısı/kısıtlamalar çok fazla. Lütfen birkaç saniye içinde tekrar deneyin."
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const branchId: string | undefined = body.locationId ?? body.location_id;
  if (!branchId) {
    return NextResponse.json(
      { error: "locationId (veya location_id) zorunlu" },
      { status: 400 }
    );
  }

  const week_start: string = (() => {
    if (body.week_start && /^\d{4}-\d{2}-\d{2}$/.test(body.week_start))
      return body.week_start;
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    now.setDate(now.getDate() + diff);
    return now.toISOString().split("T")[0];
  })();

  try {
    const db = getDB();

    // Location'ı DB'den çek ve org'a ait olduğunu doğrula
    const locationRow = (await db
      .prepare(`SELECT * FROM locations WHERE id = $1 AND org_id = $2`)
      .get(branchId, auth.org_id)) as any;
    if (!locationRow) {
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
            id: String(d.id ?? d.name ?? ""),
            name: String(d.name ?? "Vardiya"),
            start: String(d.start ?? "08:00"),
            end: String(d.end ?? "16:00"),
            base_points: Number(d.base_points ?? 5),
          }));
        }
      } catch {
        /* parse hatası → varsayılan shifts kullan */
      }
    }

    // Ekipleri çek (fabrika modülü)
    let crewRows: any[] = [];
    try {
      crewRows = (await db
        .prepare(
          `SELECT * FROM crews WHERE location_id = $1 AND org_id = $2`
        )
        .all(branchId, auth.org_id)) as any[];
    } catch {
      /* crews tablosu yoksa atla */
    }
    void crewRows; // kullanılmayabilir, ileride eklenebilir

    // Departmanları çek (departman bazlı kapasite matrisi için).
    // /api/departments (frontend'in kullandığı, kanıtlanmış çalışan yol) ile aynı
    // Drizzle sorgusu kullanılıyor — buradaki raw SQL uyumluluk katmanı üzerinden
    // sessizce yutulan bir hata departmanlı lokasyonlarda departmentRows'un boş
    // dönmesine ve locations.demand_matrix'in (hayalet talep) tekrar motora
    // gönderilmesine yol açıyordu.
    let departmentRows: any[] = [];
    try {
      departmentRows = await drizzleDb
        .select()
        .from(departmentsTable)
        .where(eq(departmentsTable.location_id, branchId));
    } catch (err) {
      console.error("[/api/generate] departments sorgusu başarısız:", err);
    }

    // Rotasyon şablonunu parse et
    let rotationTemplate: any = null;
    if (locationRow?.rotation_template) {
      try {
        rotationTemplate = JSON.parse(locationRow.rotation_template);
      } catch {
        /* ignore */
      }
    }

    // Aktif personeli çek
    let personnelRows = (await db
      .prepare(
        `SELECT * FROM personnel WHERE assigned_location_ids LIKE $1 AND status = 'active'`
      )
      .all(`%"${branchId}"%`)) as any[];

    // Müdür/admin varsayılan olarak otomatik planlamaya dahil edilmez
    let includeManagersInSchedule = false;
    if (locationRow?.rules) {
      try {
        includeManagersInSchedule = !!JSON.parse(locationRow.rules)
          ?.include_managers_in_schedule;
      } catch {
        /* ignore */
      }
    }
    if (!includeManagersInSchedule) {
      personnelRows = personnelRows.filter(
        (p: any) =>
          !["manager", "admin", "supervisor"].includes(p.user_access_level)
      );
    }

    // Müsaitlik verilerini çek
    const personnelIds = personnelRows.map((p: any) => p.id);
    let availabilityRows: any[] = [];
    if (personnelIds.length > 0) {
      const placeholders = personnelIds.map((_: any, i: number) => `$${i + 1}`).join(",");
      availabilityRows = (await db
        .prepare(
          `SELECT * FROM availability WHERE personnel_id IN (${placeholders}) AND week_start = $${personnelIds.length + 1}`
        )
        .all(...personnelIds, week_start)) as any[];
    }

    // Onaylı izin taleplerini çek
    let approvedLeaveRows: any[] = [];
    if (personnelIds.length > 0) {
      try {
        const weekEndDate = new Date(week_start + "T00:00:00Z");
        weekEndDate.setDate(weekEndDate.getDate() + 6);
        const week_end = weekEndDate.toISOString().split("T")[0];
        const placeholders = personnelIds.map((_: any, i: number) => `$${i + 1}`).join(",");
        approvedLeaveRows = (await db
          .prepare(
            `SELECT personnel_id, start_date, end_date
             FROM leave_requests
             WHERE personnel_id IN (${placeholders})
               AND status = 'approved'
               AND start_date <= $${personnelIds.length + 1}
               AND end_date >= $${personnelIds.length + 2}`
          )
          .all(...personnelIds, week_end, week_start)) as any[];
      } catch {
        /* leave_requests tablosu yoksa atla */
      }
    }

    // prevScores
    const prevScores: Record<string, number> = {};
    for (const p of personnelRows) {
      prevScores[p.id] = p.prev_score ?? 0;
    }

    // YTD mesai önbelleğini tazele (yıl devrilmesi dahil) — motor YTD hard cap'i
    // taze değerle kursun diye bayat personnel cache'ine güvenilmez
    let ytdFresh: Record<string, number> = {};
    try {
      ytdFresh = await recomputeYtdOvertime(auth.org_id, personnelRows.map((p: any) => p.id));
    } catch (e) {
      console.error("[generate] YTD mesai recompute hatası:", e);
    }

    // Personel verisini formatla
    const personnelData = personnelRows.map((p: any) => {
      let role_level = "secondary";
      try {
        const rls = JSON.parse(p.role_levels || "{}");
        if (Object.values(rls).includes("primary")) role_level = "primary";
      } catch {
        /* ignore */
      }
      return {
        id: p.id,
        name: p.name,
        skills: JSON.parse(p.roles || "[]"),
        department_id: p.department_id ?? null,
        prev_score: prevScores[p.id] ?? 0,
        cumulative_burden: prevScores[p.id] ?? 0,
        employment_type: p.employment_type || "full_time",
        max_weekly_hours: p.max_weekly_hours ?? 45,
        min_weekly_hours: p.min_weekly_hours ?? 0,
        branch_ids: JSON.parse(p.assigned_location_ids || "[]"),
        org_id: p.org_id,
        role_level,
        crew_id: p.crew_id ?? null,
        ytd_overtime_hours: ytdFresh[p.id] ?? p.ytd_overtime_hours ?? 0,
      };
    });

    const parseAvail = (val: any) => {
      if (!val) return "available";
      if (typeof val === "string" && val.startsWith("{")) {
        try {
          return JSON.parse(val);
        } catch {
          return "available";
        }
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

    // Haftalık sabit izin günleri
    for (const p of personnelRows) {
      if (p.weekly_off_day !== null && p.weekly_off_day !== undefined) {
        const d = Number(p.weekly_off_day);
        if (d >= 0 && d <= 6) {
          if (!availabilityData[p.id]) availabilityData[p.id] = {};
          availabilityData[p.id][d] = "unavailable";
        }
      }
    }

    // Onaylı izin günleri
    const wsDate = new Date(week_start + "T00:00:00Z");
    for (const leave of approvedLeaveRows) {
      const pid = leave.personnel_id;
      const leaveStart = new Date(leave.start_date + "T00:00:00Z");
      const leaveEnd = new Date(leave.end_date + "T00:00:00Z");
      if (!availabilityData[pid]) availabilityData[pid] = {};
      for (let d = 0; d < 7; d++) {
        const dayDate = new Date(wsDate);
        dayDate.setDate(wsDate.getDate() + d);
        if (dayDate >= leaveStart && dayDate <= leaveEnd) {
          availabilityData[pid][d] = "unavailable";
        }
      }
    }

    // Bölge kotaları
    let zoneQuotasPayload: Record<string, number> = {};
    if (locationRow?.zone_quotas) {
      try {
        const parsed = JSON.parse(locationRow.zone_quotas);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          zoneQuotasPayload = parsed;
        }
      } catch {
        /* parse hatası */
      }
    }

    // Kapasite matrisi (departmansız lokasyonlar / eski format).
    // Lokasyonda departman satırları varsa bu alan motora GÖNDERİLMEZ — talep artık
    // departments.demand_matrix üzerinden yönetiliyor (bkz. CLAUDE.md §3.B). Aksi halde
    // departmanlar eklenmeden önce girilmiş eski/artık veri, kullanıcının schedule
    // sayfasında hiç görmediği "hayalet" bir exact_coverage kısıtı olarak motora gidip
    // gereksiz INFEASIBLE sonuçlarına yol açıyordu.
    // hasDepartments: departmentRows sorgusu (geçici bir sebeple) boş dönerse bile,
    // personelin department_id'si varsa yine de departmanlı say — flat matrisi
    // yanlışlıkla tekrar göndermeyi engelleyen ikinci bir güvenlik katmanı.
    const hasDepartments =
      departmentRows.length > 0 || personnelData.some((p) => !!p.department_id);
    let demandMatrixPayload: Record<string, Record<string, number>> = {};
    if (locationRow?.demand_matrix && !hasDepartments) {
      try {
        const parsed = JSON.parse(locationRow.demand_matrix);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          demandMatrixPayload = parsed;
        }
      } catch {
        /* parse hatası */
      }
    }

    // Departman bazlı kapasite matrisi — schedule sayfası departmanlı lokasyonlarda
    // talebi buraya (departments.demand_matrix) kaydediyor, motora burada aktarılır.
    const departmentDemandMatrixPayload: Record<string, Record<string, Record<string, number>>> = {};
    const departmentNamesPayload: Record<string, string> = {};
    for (const dept of departmentRows) {
      departmentNamesPayload[dept.id] = dept.name ?? dept.id;
      if (!dept?.demand_matrix) continue;
      try {
        const parsed = JSON.parse(dept.demand_matrix);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
          departmentDemandMatrixPayload[dept.id] = parsed;
        }
      } catch {
        /* parse hatası */
      }
    }

    // Kural toggle'ları
    let ensureSeniorPerShift = false;
    let maxConsecutiveDays = 6;
    let noNightToMorning = false;
    let preferredNotMultiplier = 1.5;
    let clopeningMinRestHours = 13;
    let overtimeThresholdHours = 45.0;
    let maxYtdOvertimeHours = 270.0;
    let overtimeFairDistribution = true;
    let crewSameShiftHard = false;
    let weekendMultiplierEnabled = true;
    let nightMultiplierEnabled = true;
    let preferredNotEnabled = true;
    let clopeningEnabled = true;
    let weekendMultiplier = 1.2;
    let nightMultiplier = 1.3;
    if (locationRow?.rules) {
      try {
        const pr = JSON.parse(locationRow.rules);
        ensureSeniorPerShift = !!pr?.ensure_senior_per_shift;
        if (typeof pr?.max_consecutive_days === "number")
          maxConsecutiveDays = pr.max_consecutive_days;
        noNightToMorning = !!pr?.no_night_to_morning;
        if (typeof pr?.preferred_not_multiplier === "number")
          preferredNotMultiplier = pr.preferred_not_multiplier;
        if (typeof pr?.clopening_min_rest_hours === "number")
          clopeningMinRestHours = pr.clopening_min_rest_hours;
        if (typeof pr?.overtime_threshold_hours === "number")
          overtimeThresholdHours = pr.overtime_threshold_hours;
        if (typeof pr?.max_ytd_overtime_hours === "number")
          maxYtdOvertimeHours = pr.max_ytd_overtime_hours;
        if (typeof pr?.overtime_fair_distribution === "boolean")
          overtimeFairDistribution = pr.overtime_fair_distribution;
        if (typeof pr?.crew_same_shift_hard === "boolean")
          crewSameShiftHard = pr.crew_same_shift_hard;
        if (typeof pr?.weekend_multiplier_enabled === "boolean")
          weekendMultiplierEnabled = pr.weekend_multiplier_enabled;
        if (typeof pr?.night_multiplier_enabled === "boolean")
          nightMultiplierEnabled = pr.night_multiplier_enabled;
        if (typeof pr?.preferred_not_enabled === "boolean")
          preferredNotEnabled = pr.preferred_not_enabled;
        if (typeof pr?.clopening_enabled === "boolean")
          clopeningEnabled = pr.clopening_enabled;
        if (typeof pr?.weekend_multiplier === "number")
          weekendMultiplier = pr.weekend_multiplier;
        if (typeof pr?.night_multiplier === "number")
          nightMultiplier = pr.night_multiplier;
      } catch {
        /* ignore */
      }
    }

    // Rotasyon şablonu
    const crewRotation: Record<string, string> = {};
    if (rotationTemplate?.enabled && rotationTemplate?.pattern && week_start) {
      const refDate = new Date(
        rotationTemplate.reference_week + "T00:00:00Z"
      );
      const curDate = new Date(week_start + "T00:00:00Z");
      const weeksElapsed = Math.floor(
        (curDate.getTime() - refDate.getTime()) / (7 * 24 * 3600 * 1000)
      );
      const cycleWeeks = rotationTemplate.cycle_weeks || 1;
      const weekOffset = ((weeksElapsed % cycleWeeks) + cycleWeeks) % cycleWeeks;
      for (const [crewId, shiftPattern] of Object.entries(
        rotationTemplate.pattern as Record<string, string[]>
      )) {
        if (Array.isArray(shiftPattern) && shiftPattern[weekOffset] != null) {
          crewRotation[crewId] = shiftPattern[weekOffset];
        }
      }
    }

    // Personel→ekip haritası
    const personnelCrews: Record<string, string> = {};
    for (const p of personnelData) {
      if ((p as any).crew_id)
        personnelCrews[(p as any).id] = (p as any).crew_id;
    }

    const enginePayload = {
      prevScores,
      branchId,
      orgId,
      week_start,
      personnel: personnelData,
      availability: availabilityData,
      shifts: shiftsPayload,
      zone_quotas: zoneQuotasPayload,
      demand_matrix: demandMatrixPayload,
      department_demand_matrix: departmentDemandMatrixPayload,
      department_names: departmentNamesPayload,
      ensure_senior_per_shift: ensureSeniorPerShift,
      max_consecutive_days: maxConsecutiveDays,
      no_night_to_morning: noNightToMorning,
      preferred_not_multiplier: preferredNotMultiplier,
      crew_rotation: crewRotation,
      personnel_crews: personnelCrews,
      crew_same_shift_hard: crewSameShiftHard,
      rules: {
        max_weekly_hours: 45,
        min_rest_hours: 11,
        clopening_min_rest_hours: clopeningMinRestHours,
        overtime_threshold_hours: overtimeThresholdHours,
        max_ytd_overtime_hours: maxYtdOvertimeHours,
        overtime_fair_distribution: overtimeFairDistribution,
        weekend_multiplier_enabled: weekendMultiplierEnabled,
        night_multiplier_enabled: nightMultiplierEnabled,
        preferred_not_enabled: preferredNotEnabled,
        clopening_enabled: clopeningEnabled,
        weekend_multiplier: weekendMultiplier,
        night_multiplier: nightMultiplier,
      },
    };

    // FastAPI engine'e HTTP isteği gönder
    const orToolsStart = Date.now();
    const data = await callEngine(enginePayload);
    const orToolsLatency = Date.now() - orToolsStart;

    // OR-Tools çağrısını logla (fire-and-forget)
    const orgRow = (await db.prepare(`SELECT name FROM organizations WHERE id = $1`).get(auth.org_id)) as any;
    logPlatformEvent("or_tools_call", auth.org_id, orgRow?.name ?? null, {
      location_id: branchId,
      week_start,
      personnel_count: personnelData.length,
      latency_ms: orToolsLatency,
    });

    // Python motorundan dönen veriyi UI için eşle
    if (data.personnel) {
      data.personnel = data.personnel.map((p: any) => ({
        ...p,
        roles: p.skills || [],
      }));
    }

    // Motor fazla mesai özeti döndürdüyse overtime_records'a upsert et.
    // Hafta başına tek kayıt: re-generate çift kayıt/çift YTD saymaz; müdürün
    // karara bağladığı kayıtlar ezilmez. Nihai otorite yayın anındaki derive'dır.
    if (Array.isArray(data.overtime_summary) && data.overtime_summary.length > 0) {
      for (const ot of data.overtime_summary) {
        try {
          await upsertPendingOvertime({
            orgId: auth.org_id,
            locationId: branchId,
            personnelId: ot.personnelId,
            personnelName: ot.name ?? null,
            weekStart: week_start,
            scheduledHours: ot.scheduled_hours ?? 0,
            overtimeHours: ot.overtime_hours ?? 0,
            note: "OR-Tools taslağından otomatik hesaplandı",
          });
        } catch (e) {
          console.error("[generate] overtime upsert hatası:", e);
        }
      }
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
