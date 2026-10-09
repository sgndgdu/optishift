/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tüm Şubeler › Genel Bakış için şube başına TEK BAKIŞ durumu (patron / bölge müdürü):
 * gelecek haftanın planı (published | draft | none), bugün vardiyadaki kişi sayısı ve
 * müdürün kararını bekleyen talep sayısı (izin + takas + saat düzeltme + fazla mesai).
 * 2026-10-09 (Genel Bakış zenginleşti): bu haftanın kalan günlerindeki ve gelecek haftanın eksik kişi sayısı,
 * bugün gelen kişi, kimsenin almadığı ilan, haftalık sınırı aşan kişi, bu haftanın toplam saati,
 * uygulamaya henüz girmeyen ekip üyesi ve bekleyen taleplerin türlere göre dağılımı.
 * Bölge müdürü sadece atandığı şubeleri alır (lib/access scopedLocationIds).
 */
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";
import { requireAuth } from "@/lib/auth";
import { getWeekStart, businessToday } from "@/lib/date";
import { assignmentWorkMinutes } from "@/lib/legal";
import { leafDepartments } from "@/lib/departments";

const J = (raw: unknown, d: any) => { try { return typeof raw === "string" ? JSON.parse(raw) : (raw ?? d); } catch { return d; } };

/** Eksik kişi sayısı: kayıtlı kişi sayısı (departmanlıysa en alttaki departmanlar) − yazılan, fromDay ve sonrası */
function countGaps(loc: any, depts: any[], rows: any[], personDept: Map<string, string | null>, fromDay: number): number {
  const defs = (J(loc.shift_definitions, []) as any[]).filter(d => !d.on_call);
  const leaves = leafDepartments(depts);
  const groups: { id: string | null; matrix: any }[] = leaves.length
    ? leaves.map(d => ({ id: d.id, matrix: J(d.demand_matrix, {}) }))
    : [{ id: null, matrix: J(loc.demand_matrix, {}) }];
  let gaps = 0;
  for (const g of groups) for (const d of defs) for (let day = fromDay; day < 7; day++) {
    const need = Number(g.matrix?.[d.id]?.[day] ?? g.matrix?.[d.id]?.[String(day)] ?? 0) || 0;
    if (!need) continue;
    const here = rows.filter(r => r.day === day && (String(r.shift_id) === String(d.id) || (r.start_time === d.start && r.end_time === d.end))
      && (!leaves.length || (r.department_id ?? personDept.get(r.personnel_id) ?? null) === g.id)).length;
    gaps += Math.max(0, need - here);
  }
  return gaps;
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "admin" && auth.role !== "supervisor") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  const db = getDB();
  try {
    let locs = await db.prepare("SELECT id FROM locations WHERE org_id = ?").all(auth.org_id) as { id: string }[];
    if (auth.role === "supervisor" && auth.managed_location_ids?.length) {
      locs = locs.filter(l => auth.managed_location_ids!.includes(l.id));
    }
    const ids = locs.map(l => l.id);
    if (!ids.length) return NextResponse.json({});
    const ph = ids.map(() => "?").join(",");
    const thisWeek = getWeekStart(0);
    const nextWeek = getWeekStart(1);
    const today = businessToday();
    const todayIdx = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7;

    const nextRows = await db.prepare(`
      SELECT location_id, publication_status, COUNT(*)::int AS n FROM shift_assignments
      WHERE location_id IN (${ph}) AND week_start = ? AND COALESCE(kind, 'regular') = 'regular'
      GROUP BY location_id, publication_status`).all(...ids, nextWeek) as any[];
    const todayRows = await db.prepare(`
      SELECT location_id, COUNT(DISTINCT personnel_id)::int AS n FROM shift_assignments
      WHERE location_id IN (${ph}) AND week_start = ? AND day = ? AND publication_status = 'published'
        AND COALESCE(kind, 'regular') = 'regular'
      GROUP BY location_id`).all(...ids, thisWeek, todayIdx) as any[];
    const pending = await db.prepare(`
      SELECT loc, COUNT(*)::int AS n FROM (
        SELECT p.primary_location_id AS loc FROM leave_requests r JOIN personnel p ON p.id = r.personnel_id
          WHERE r.status = 'pending' AND p.primary_location_id IN (${ph})
        UNION ALL
        SELECT p.primary_location_id FROM shift_swap_requests r JOIN personnel p ON p.id = r.requester_id
          WHERE r.status = 'peer_accepted' AND r.org_id = ? AND p.primary_location_id IN (${ph})
        UNION ALL
        SELECT p.primary_location_id FROM shift_edit_requests r JOIN personnel p ON p.id = r.personnel_id
          WHERE r.status = 'pending' AND r.org_id = ? AND p.primary_location_id IN (${ph})
        UNION ALL
        SELECT location_id FROM overtime_records WHERE status = 'pending' AND org_id = ? AND location_id IN (${ph})
      ) x GROUP BY loc`).all(...ids, auth.org_id, ...ids, auth.org_id, ...ids, auth.org_id, ...ids) as any[];

    const pendingByType = await db.prepare(`
      SELECT loc, kind, COUNT(*)::int AS n FROM (
        SELECT p.primary_location_id AS loc, 'leave' AS kind FROM leave_requests r JOIN personnel p ON p.id = r.personnel_id
          WHERE r.status = 'pending' AND p.primary_location_id IN (${ph})
        UNION ALL
        SELECT p.primary_location_id, 'swap' FROM shift_swap_requests r JOIN personnel p ON p.id = r.requester_id
          WHERE r.status = 'peer_accepted' AND r.org_id = ? AND p.primary_location_id IN (${ph})
        UNION ALL
        SELECT p.primary_location_id, 'edit' FROM shift_edit_requests r JOIN personnel p ON p.id = r.personnel_id
          WHERE r.status = 'pending' AND r.org_id = ? AND p.primary_location_id IN (${ph})
        UNION ALL
        SELECT location_id, 'overtime' FROM overtime_records WHERE status = 'pending' AND org_id = ? AND location_id IN (${ph})
      ) x GROUP BY loc, kind`).all(...ids, auth.org_id, ...ids, auth.org_id, ...ids, auth.org_id, ...ids) as any[];

    // Plan ayrıntısı: eksikler, saatler, sınırı aşanlar
    const locRows = await db.prepare(`SELECT id, shift_definitions, demand_matrix FROM locations WHERE id IN (${ph})`).all(...ids) as any[];
    const deptRows = await db.prepare(`SELECT id, location_id, parent_id, name, demand_matrix FROM departments WHERE location_id IN (${ph})`).all(...ids) as any[];
    const people = await db.prepare(`
      SELECT p.id, p.primary_location_id, p.department_id, p.max_weekly_hours, p.status, u.is_temp_password, u.role AS user_role
      FROM personnel p LEFT JOIN users u ON u.personnel_id = p.id
      WHERE p.org_id = ? AND p.primary_location_id IN (${ph})`).all(auth.org_id, ...ids) as any[];
    const personDept = new Map<string, string | null>(people.map(p => [p.id, p.department_id ?? null]));
    const weekRows = await db.prepare(`
      SELECT location_id, week_start, personnel_id, day, start_time, end_time, shift_id, department_id, check_in_at, publication_status
      FROM shift_assignments WHERE location_id IN (${ph}) AND week_start IN (?, ?) AND COALESCE(kind, 'regular') = 'regular'`).all(...ids, thisWeek, nextWeek) as any[];
    const listings = await db.prepare(`
      SELECT location_id, COUNT(*)::int AS n FROM open_shifts WHERE location_id IN (${ph}) AND status = 'open' AND date >= ?
      GROUP BY location_id`).all(...ids, today) as any[];

    type St = {
      next_week: "published" | "draft" | "none"; today: number; pending: number;
      checked_in: number; gaps_this_week: number; gaps_next_week: number; open_listings: number;
      over_hours: number; week_hours: number; not_joined: number; staff: number;
      pending_by: Record<string, number>;
    };
    const out: Record<string, St> = {};
    for (const id of ids) {
      const nr = nextRows.filter(r => r.location_id === id);
      const published = nr.some(r => r.publication_status === "published" && r.n > 0);
      const draft = nr.some(r => r.publication_status !== "published" && r.n > 0);
      const loc = locRows.find(l => l.id === id);
      const depts = deptRows.filter(d => d.location_id === id);
      const defs = J(loc?.shift_definitions, []) as any[];
      const thisRows = weekRows.filter(r => r.location_id === id && r.week_start === thisWeek);
      const nextRowsFull = weekRows.filter(r => r.location_id === id && r.week_start === nextWeek);
      const hours = new Map<string, number>();
      for (const r of thisRows) hours.set(r.personnel_id, (hours.get(r.personnel_id) ?? 0) + assignmentWorkMinutes(defs, r) / 60);
      const staff = people.filter(p => p.primary_location_id === id && p.status !== "inactive");
      const maxOf = new Map(people.map(p => [p.id, Number(p.max_weekly_hours) || 45]));
      out[id] = {
        next_week: published ? "published" : draft ? "draft" : "none",
        today: todayRows.find(r => r.location_id === id)?.n ?? 0,
        pending: pending.find(r => r.loc === id)?.n ?? 0,
        checked_in: new Set(thisRows.filter(r => r.day === todayIdx && r.check_in_at).map(r => r.personnel_id)).size,
        gaps_this_week: loc && thisRows.length ? countGaps(loc, depts, thisRows, personDept, todayIdx) : 0,
        gaps_next_week: loc && nextRowsFull.length ? countGaps(loc, depts, nextRowsFull, personDept, 0) : 0,
        open_listings: listings.find(r => r.location_id === id)?.n ?? 0,
        over_hours: [...hours].filter(([pid, h]) => h > (maxOf.get(pid) ?? 45) + 0.01).length,
        week_hours: Math.round([...hours.values()].reduce((a, b) => a + b, 0)),
        not_joined: staff.filter(p => p.is_temp_password && (p.user_role ?? "employee") === "employee").length,
        staff: staff.filter(p => (p.user_role ?? "employee") === "employee").length,
        pending_by: Object.fromEntries(pendingByType.filter(r => r.loc === id).map(r => [r.kind, r.n])),
      };
    }
    return NextResponse.json(out);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
