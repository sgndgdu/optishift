/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sendSMS, sendEmail, sendPushToPersonnel } from "@/lib/notifications";
import {
  calcWeeklyBurden,
  calcCumulativeRolling,
  calcFairnessZ,
  type ShiftDef,
  type Rules,
  type AssignmentInput,
  type AvailabilityInput,
} from "@/lib/fairness";


export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const body = await req.json();
    const { location_id, week_start } = body;

    if (!location_id || !week_start) {
      return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });
    }

    const loc = await db.prepare("SELECT id, shift_definitions, rules FROM locations WHERE id = ? AND org_id = ?")
      .get(location_id, auth.org_id) as any;
    if (!loc) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    const shiftDefs: ShiftDef[] = loc.shift_definitions
      ? (typeof loc.shift_definitions === "string" ? JSON.parse(loc.shift_definitions) : loc.shift_definitions)
      : [];
    const rules: Rules = loc.rules
      ? (typeof loc.rules === "string" ? JSON.parse(loc.rules) : loc.rules)
      : {};

    // ── 1. Bu haftanın atamaları ─────────────────────────────────────────────
    const weekRows = await db.prepare(`
      SELECT sa.personnel_id, sa.day, sa.shift_id, sa.start_time, sa.end_time
      FROM shift_assignments sa
      WHERE sa.location_id = ? AND sa.week_start = ?
        AND sa.start_time IS NOT NULL AND sa.end_time IS NOT NULL
    `).all(location_id, week_start) as any[];

    // Kahraman bonuslu atamaları bul (open_shifts'ten claim edilenler)
    const heroShiftIds = new Set<number>(
      (await db.prepare(`
        SELECT sa.id FROM shift_assignments sa
        JOIN open_shifts os ON os.location_id = sa.location_id AND os.date = ?
        WHERE os.status = 'claimed' AND os.claimed_by = sa.personnel_id
          AND sa.week_start = ?
      `).all(week_start.slice(0, 10), week_start) as any[]).map((r: any) => r.id)
    );

    const assignments: AssignmentInput[] = weekRows.map((r: any) => ({
      personnel_id: r.personnel_id,
      day: r.day,
      shift_id: r.shift_id,
      start_time: r.start_time,
      end_time: r.end_time,
      is_hero: heroShiftIds.has(r.id),
    }));

    // ── 2. Müsaitlik bilgileri ────────────────────────────────────────────────
    const personnelIds = [...new Set(assignments.map(a => a.personnel_id))];
    const availRows: AvailabilityInput[] = personnelIds.length
      ? (await db.prepare(`
          SELECT personnel_id, day_0, day_1, day_2, day_3, day_4, day_5, day_6
          FROM availability
          WHERE personnel_id IN (${personnelIds.map(() => "?").join(",")}) AND week_start = ?
        `).all(...personnelIds, week_start) as any[])
      : [];

    // ── 3. Bu haftanın burden breakdown'ı ────────────────────────────────────
    const weeklyBreakdowns = calcWeeklyBurden(assignments, shiftDefs, availRows, rules);

    // ── 4. Her personel için rolling cumulative burden hesapla ────────────────
    const alreadyScored = await db.prepare(
      `SELECT 1 FROM score_history WHERE location_id = ? AND week_start = ? LIMIT 1`
    ).get(location_id, week_start);

    if (!alreadyScored) {
      const cumulativeByPid: Record<string, number> = {};

      for (const breakdown of weeklyBreakdowns) {
        const pid = breakdown.personnel_id;

        // Son 7 haftanın geçmişi (bu hafta hariç)
        const history = await db.prepare(`
          SELECT week_start, burden_score
          FROM score_history
          WHERE personnel_id = ? AND location_id = ? AND week_start < ?
          ORDER BY week_start DESC
          LIMIT 7
        `).all(pid, location_id, week_start) as any[];

        const cumulative = calcCumulativeRolling(
          history.map((h: any) => ({ week_start: h.week_start, burden_score: h.burden_score ?? h.score ?? 0 })).reverse(),
          breakdown.burden_score,
        );
        cumulativeByPid[pid] = cumulative;
      }

      // ── 5. Fairness z-score (tüm takım için aynı anda) ───────────────────
      const zScores = calcFairnessZ(cumulativeByPid);

      // ── 6. score_history + personnel güncelle ─────────────────────────────
      const insertHistory = await db.prepare(`
        INSERT INTO score_history (
          org_id, location_id, personnel_id, personnel_name, week_start,
          score, total_hours, raw_score, burden_score,
          weekend_shifts, night_shifts, pref_not_shifts, clopening_count,
          cumulative_burden, fairness_z_score, hero_count, no_show_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING
      `);

      const updatePersonnel = await db.prepare(`
        UPDATE personnel SET prev_score = ?, fairness_z_score = ? WHERE id = ?
      `);

      const personnelNames: Record<string, string> = {};
      for (const row of await db.prepare(`SELECT id, name, hero_count, no_show_count FROM personnel WHERE org_id = ?`).all(auth.org_id) as any[]) {
        personnelNames[row.id] = row.name;
      }

      for (const bd of weeklyBreakdowns) {
        const pid = bd.personnel_id;
        const cumulative = cumulativeByPid[pid] ?? bd.burden_score;
        const z = zScores[pid] ?? 0;
        const pRow = await db.prepare(`SELECT hero_count, no_show_count FROM personnel WHERE id = ?`).get(pid) as any;

        await insertHistory.run(
          auth.org_id, location_id, pid, personnelNames[pid] ?? pid, week_start,
          bd.burden_score, // score alanı (eski uyumluluk)
          bd.total_hours, bd.raw_score, bd.burden_score,
          bd.weekend_shifts, bd.night_shifts, bd.pref_not_shifts, bd.clopening_count,
          cumulative, z,
          pRow?.hero_count ?? 0, pRow?.no_show_count ?? 0,
        );

        await updatePersonnel.run(cumulative, z, pid);
      }
    }

    // ── 7. Bildirimler ────────────────────────────────────────────────────────
    const activePersonnel = await db.prepare(`
      SELECT * FROM personnel WHERE assigned_location_ids LIKE ? AND status = 'active'
    `).all(`%"${location_id}"%`) as any[];

    let sentCount = 0;
    for (const p of activePersonnel) {
      await db.prepare(`
        INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
        VALUES (?, 'schedule', ?, ?, '/portal/calendar', 0, ?)
      `).run(
        p.id,
        "Vardiya Programı Yayınlandı 📅",
        `${week_start} haftası için vardiya programı hazır. Takvimini kontrol et!`,
        Math.floor(Date.now() / 1000),
      );
      if (p.phone)  await sendSMS(p.phone, `Merhaba ${p.name}, ${week_start} haftası vardiya programın yayınlandı.`);
      if (p.email)  await sendEmail(p.email, "Yeni Vardiya Programı Yayınlandı", `Merhaba ${p.name},\n\n${week_start} haftası için vardiya programın sisteme yüklendi.`);
      await sendPushToPersonnel(p.id, auth.org_id, {
        title: "Vardiya Programın Yayınlandı 📅",
        body: `${week_start} haftası programın hazır. Kontrol et!`,
        url: "/portal/calendar",
      });
      sentCount++;
    }

    // ── 8. Yayın kaydı — revision takibi + snapshot ──────────────────────────
    const prevPub = await db.prepare(
      `SELECT MAX(revision) as max_rev FROM schedule_publications WHERE org_id = ? AND location_id = ? AND week_start = ?`
    ).get(auth.org_id, location_id, week_start) as any;
    const revision = prevPub?.max_rev != null ? prevPub.max_rev + 1 : 0;

    // Snapshot: atamalar + personel + departman bilgileri
    const locInfo = await db.prepare(`SELECT name FROM locations WHERE id = ?`).get(location_id) as any;
    const personnelRows2 = await db.prepare(
      `SELECT id, name, department_id FROM personnel WHERE org_id = ? AND assigned_location_ids LIKE ?`
    ).all(auth.org_id, `%"${location_id}"%`) as any[];
    const deptInfo = await db.prepare(`SELECT id, name FROM departments WHERE location_id = ?`).all(location_id) as any[];
    const pubAssignments = await db.prepare(
      `SELECT personnel_id, day, start_time, end_time, shift_id, points
       FROM shift_assignments WHERE location_id = ? AND week_start = ? AND publication_status = 'published'`
    ).all(location_id, week_start) as any[];

    const deptMap: Record<string, string> = {};
    for (const d of deptInfo) deptMap[d.id] = d.name;
    const personnelMap: Record<string, { name: string; dept_id: string }> = {};
    for (const p of personnelRows2) personnelMap[p.id] = { name: p.name, dept_id: p.department_id };

    const snapshot = JSON.stringify({
      locationName: locInfo?.name ?? "",
      shiftDefs,
      departments: deptInfo,
      assignments: pubAssignments.map((a: any) => ({
        personnelId: a.personnel_id,
        personnelName: personnelMap[a.personnel_id]?.name ?? a.personnel_id,
        departmentId: personnelMap[a.personnel_id]?.dept_id ?? null,
        departmentName: deptMap[personnelMap[a.personnel_id]?.dept_id ?? ""] ?? "Diğer",
        day: a.day,
        startTime: a.start_time,
        endTime: a.end_time,
        shiftId: a.shift_id,
        points: a.points,
      })),
    });

    await db.prepare(
      `INSERT INTO schedule_publications (org_id, location_id, week_start, revision, published_by, published_by_name, published_at, snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(auth.org_id, location_id, week_start, revision, auth.id, auth.name ?? "Yönetici", Math.floor(Date.now() / 1000), snapshot);
    return NextResponse.json({ success: true, message: `${sentCount} personele bildirim gönderildi.`, revision });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
