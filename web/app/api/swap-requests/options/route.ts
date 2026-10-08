/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { addDays, businessToday, businessWallTime, weekStartOf } from "@/lib/date";
import { effectiveWeeklyLimit } from "@/lib/legal";
import { findAssignmentProblems, type TimedShift } from "@/lib/assignmentCheck";

/**
 * GET /api/swap-requests/options?shift_id=X → takas sihirbazı için seçenekler (çalışan, kendi vardiyası).
 * Vardiyanın şubesindeki, vardiyanın departmanında çalışabilen arkadaşlar ve önümüzdeki 3 haftanın
 * yayınlanmış vardiyaları; her vardiya için takas olursa iki tarafta oluşacak kural sorunları (problems).
 * Sorunlu vardiya seçilemez, hiç uygun vardiyası olmayan kişi listede pasif durur (kullanıcı kararı 2026-10-05:
 * çakışan kişiye talep gönderilemesin). Kontrol POST'taki ile aynı (lib/assignmentCheck), bellekte yapılır.
 */
const toShift = (r: any): TimedShift => ({ week_start: String(r.week_start), day: Number(r.day), start_time: String(r.start_time), end_time: String(r.end_time) });
const dateOf = (r: any) => addDays(String(r.week_start), Number(r.day));
const parseList = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  try { const a = JSON.parse(String(v ?? "[]")); return Array.isArray(a) ? a.map(String) : []; } catch { return []; }
};

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const shiftId = Number(new URL(req.url).searchParams.get("shift_id"));
  if (!shiftId || !auth.personnel_id) return NextResponse.json({ error: "shift_id zorunlu" }, { status: 400 });
  const db = getDB();
  try {
    const mine = await db.prepare(`
      SELECT sa.*, COALESCE(sa.department_id, p.department_id) AS dept, p.department_id AS my_dept, p.assigned_department_ids AS my_depts, p.max_weekly_hours AS my_max
      FROM shift_assignments sa JOIN personnel p ON p.id = sa.personnel_id
      WHERE sa.id = ? AND sa.personnel_id = ? AND p.org_id = ?`).get(shiftId, auth.personnel_id, auth.org_id) as any;
    if (!mine) return NextResponse.json({ error: "Vardiya bulunamadı" }, { status: 404 });

    const loc = await db.prepare(`SELECT rules FROM locations WHERE id = ?`).get(mine.location_id) as any;
    let rules: any = {};
    try { rules = typeof loc?.rules === "string" ? JSON.parse(loc.rules || "{}") : (loc?.rules ?? {}); } catch { rules = {}; }
    const ruleMax = typeof rules.max_weekly_hours === "number" ? rules.max_weekly_hours : 45;
    const balancing = typeof rules.balancing_period_weeks === "number" ? rules.balancing_period_weeks : 1;
    const minRest = typeof rules.min_rest_hours === "number" ? rules.min_rest_hours : 11;
    const personRules = (max: unknown) => {
      const personMax = effectiveWeeklyLimit(max as any, ruleMax);
      return { maxWeeklyHours: balancing >= 2 && personMax >= ruleMax ? 66 : personMax, minRestHours: minRest };
    };

    // Benim departmanlarım (aldığım vardiyanın departmanında çalışabilmeliyim)
    const myDepts = new Set([mine.my_dept, ...parseList(mine.my_depts)].filter(Boolean));
    const mates = (await db.prepare(`
      SELECT id, name, department_id, assigned_department_ids, max_weekly_hours, user_access_level FROM personnel
      WHERE org_id = ? AND id <> ? AND status = 'active' AND schedulable IS NOT FALSE
        AND (primary_location_id = ? OR assigned_location_ids LIKE ?)
      ORDER BY name`).all(auth.org_id, auth.personnel_id, mine.location_id, `%"${mine.location_id}"%`) as any[])
      // Sorumlular takas listesinde yok (eskisi gibi); takas ekip üyeleri arasında
      .filter(p => !["manager", "admin", "supervisor"].includes(p.user_access_level))
      // Benim vardiyamın departmanında çalışabilen (ana ya da joker); departmansız şubede herkes
      .filter(p => !mine.dept || p.department_id === mine.dept || parseList(p.assigned_department_ids).includes(mine.dept) || (!p.department_id && parseList(p.assigned_department_ids).length === 0));

    const today = businessToday();
    const weeks = [0, 7, 14].map(n => addDays(weekStartOf(today), n));
    const allWeeks = [addDays(weeks[0], -7), ...weeks, addDays(weeks[2], 7)];
    const ids = [auth.personnel_id, ...mates.map(m => m.id)];
    const rows = ids.length ? await db.prepare(`
      SELECT sa.id, sa.personnel_id, sa.location_id, sa.week_start, sa.day, sa.start_time, sa.end_time, sa.shift_id,
             sa.publication_status, sa.department_id, p.department_id AS owner_dept
      FROM shift_assignments sa JOIN personnel p ON p.id = sa.personnel_id
      WHERE sa.personnel_id IN (${ids.map(() => "?").join(",")}) AND sa.week_start IN (${allWeeks.map(() => "?").join(",")})
        AND COALESCE(sa.kind, 'regular') = 'regular' AND sa.status != 'swapped' AND sa.status != 'absent'
        AND sa.start_time IS NOT NULL AND sa.end_time IS NOT NULL`).all(...ids, ...allWeeks) as any[] : [];
    const byPerson: Record<string, any[]> = {};
    for (const r of rows) (byPerson[r.personnel_id] ??= []).push(r);

    // İlanda ya da başka bir takasta bekleyen vardiyalar seçilemez
    const busyRows = await db.prepare(`
      SELECT source_assignment_id AS id FROM open_shifts WHERE org_id = ? AND status IN ('open','loan_pending') AND source_assignment_id IS NOT NULL
      UNION SELECT requester_shift_id FROM shift_swap_requests WHERE org_id = ? AND status IN ('pending','peer_accepted')
      UNION SELECT target_shift_id FROM shift_swap_requests WHERE org_id = ? AND status IN ('pending','peer_accepted')`).all(auth.org_id, auth.org_id, auth.org_id) as any[];
    const busy = new Set(busyRows.map(r => Number(r.id)));

    // "Gelemem" işaretli günler (aldığı vardiyanın gününde)
    const avRows = await db.prepare(`SELECT * FROM availability WHERE personnel_id IN (${ids.map(() => "?").join(",")}) AND week_start IN (${weeks.map(() => "?").join(",")})`).all(...ids, ...weeks) as any[];
    const unavailable = (pid: string, s: any) => {
      const av = avRows.find(a => a.personnel_id === pid && String(a.week_start) === String(s.week_start));
      const raw = av?.[`day_${s.day}`];
      const st = typeof raw === "string" && raw.startsWith("{") ? (() => { try { return JSON.parse(raw)?.status; } catch { return raw; } })() : raw;
      return st === "unavailable";
    };
    const myAfter = (byPerson[auth.personnel_id] ?? []).filter(r => Number(r.id) !== shiftId);
    const myRules = personRules(mine.my_max);
    const mineShift = toShift(mine);

    const result = mates.map(m => {
      const theirs = byPerson[m.id] ?? [];
      const theirRules = personRules(m.max_weekly_hours);
      const shifts = theirs
        .filter(t => t.location_id === mine.location_id && (!t.publication_status || t.publication_status === "published")
          && dateOf(t) >= today && weeks.includes(String(t.week_start))
          && (dateOf(t) > today || businessWallTime(today, String(t.start_time)).getTime() > Date.now()))
        .sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || String(a.start_time).localeCompare(String(b.start_time)))
        .map(t => {
          const problems: string[] = [];
          if (busy.has(Number(t.id))) problems.push("Bu vardiya ilanda ya da başka bir vardiya değiştirme isteğinde");
          const tDept = t.department_id ?? t.owner_dept;
          if (tDept && myDepts.size > 0 && !myDepts.has(tDept)) problems.push("Bu vardiya sizin departmanınızda değil");
          if (dateOf(t) === dateOf(mine) && t.start_time === mine.start_time && t.end_time === mine.end_time) problems.push("Sizinkiyle aynı vardiya");
          if (problems.length === 0) {
            const tShift = toShift(t);
            const forMe = findAssignmentProblems([...myAfter.map(toShift), tShift], [tShift], myRules);
            const forThem = findAssignmentProblems([...theirs.filter(x => Number(x.id) !== Number(t.id)).map(toShift), mineShift], [mineShift], theirRules);
            problems.push(...forMe.map(x => `Siz: ${x}`), ...forThem.map(x => `${m.name.split(" ")[0]}: ${x}`));
            if (unavailable(auth.personnel_id!, t)) problems.push("Bu günü uygunlukta \"Gelemem\" olarak işaretlemişsiniz");
            if (unavailable(m.id, mine)) problems.push(`${m.name.split(" ")[0]} sizin vardiyanızın olduğu günü "Gelemem" olarak işaretlemiş`);
          }
          return { id: t.id, week_start: t.week_start, day: Number(t.day), start_time: t.start_time, end_time: t.end_time, shift_id: t.shift_id, problems };
        });
      return { id: m.id, name: m.name, shifts, ok_count: shifts.filter(s => s.problems.length === 0).length };
    });
    // Uygun vardiyası olanlar önce
    result.sort((a, b) => Number(b.ok_count > 0) - Number(a.ok_count > 0) || a.name.localeCompare(b.name, "tr"));
    return NextResponse.json({ mates: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

