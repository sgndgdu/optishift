/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET /api/copilot/week?location_id=&week_start=
 *
 * Plan Asistanı: haftanın durumu + kurallı içgörüler. Dil modeli kullanmaz, ücretsizdir.
 * Hazır soruların cevapları istemcide aynı saf fonksiyonlarla (lib/copilot) hesaplanır.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDB } from "@/lib/db/client";
import { db as drizzleDb, departments as departmentsTable } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { addDays } from "@/lib/date";
import { buildInsights, buildWeekSnapshot, type DayState } from "@/lib/copilot";

const parse = <T,>(v: unknown, fallback: T): T => {
  if (v == null) return fallback;
  if (typeof v !== "string") return v as T;
  try { return JSON.parse(v) as T; } catch { return fallback; }
};

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("location_id");
  const weekStart = searchParams.get("week_start");
  if (!locationId || !weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: "location_id ve week_start zorunlu" }, { status: 400 });
  }

  const db = getDB();
  try {
    const loc = await db.prepare(
      `SELECT id, shift_definitions, demand_matrix, rules FROM locations WHERE id = ? AND org_id = ?`
    ).get(locationId, auth.org_id) as any;
    if (!loc) return NextResponse.json({ error: "Şube bulunamadı" }, { status: 404 });

    const rules = parse<Record<string, any>>(loc.rules, {});

    // Personel ihtiyacı: departman varsa departman tabloları toplanır, yoksa şubenin tablosu (bkz. /api/generate)
    const depts = await drizzleDb.select({ demand_matrix: departmentsTable.demand_matrix })
      .from(departmentsTable).where(eq(departmentsTable.location_id, locationId));
    const demand: Record<string, Record<string, number>> = {};
    const matrices = depts.length > 0
      ? depts.map(d => parse<Record<string, Record<string, number>>>(d.demand_matrix, {}))
      : [parse<Record<string, Record<string, number>>>(loc.demand_matrix, {})];
    for (const m of matrices) {
      for (const [shiftId, row] of Object.entries(m ?? {})) {
        for (const [day, n] of Object.entries(row ?? {})) {
          demand[shiftId] ??= {};
          demand[shiftId][day] = (demand[shiftId][day] ?? 0) + (Number(n) || 0);
        }
      }
    }

    const personnel = await db.prepare(
      `SELECT id, name, roles, prev_score FROM personnel
       WHERE org_id = ? AND status = 'active' AND (primary_location_id = ? OR assigned_location_ids LIKE ?)`
    ).all(auth.org_id, locationId, `%"${locationId}"%`) as any[];
    const pids = personnel.map(p => p.id);

    const assignments = await db.prepare(
      `SELECT personnel_id, day, shift_id, start_time, end_time, publication_status
       FROM shift_assignments WHERE location_id = ? AND week_start = ?`
    ).all(locationId, weekStart) as any[];

    const weekEnd = addDays(weekStart, 6);
    const leaves = pids.length === 0 ? [] : (await db.prepare(
      `SELECT personnel_id, start_date, end_date, type FROM leave_requests
       WHERE status = 'approved' AND start_date <= ? AND end_date >= ?`
    ).all(weekEnd, weekStart) as any[]).filter(l => pids.includes(l.personnel_id));

    const availRows = pids.length === 0 ? [] : (await db.prepare(
      `SELECT * FROM availability WHERE week_start = ?`
    ).all(weekStart) as any[]).filter(r => pids.includes(r.personnel_id));
    const availability: Record<string, DayState[]> = {};
    for (const r of availRows) {
      availability[r.personnel_id] = [0, 1, 2, 3, 4, 5, 6].map(d => (r[`day_${d}`] ?? "available") as DayState);
    }

    const snapshot = buildWeekSnapshot({
      weekStart,
      shiftDefs: parse(loc.shift_definitions, []),
      demand,
      rules: {
        maxWeeklyHours: typeof rules.max_weekly_hours === "number" ? rules.max_weekly_hours : 45,
        minRestHours: typeof rules.min_rest_hours === "number" ? rules.min_rest_hours : 11,
        maxConsecutiveDays: typeof rules.max_consecutive_days === "number" ? rules.max_consecutive_days : 6,
      },
      personnel: personnel.map(p => ({ id: p.id, name: p.name, roles: parse<string[]>(p.roles, []), score: Number(p.prev_score) || 0 })),
      assignments: assignments.map(a => ({ ...a, day: Number(a.day) })),
      leaves,
      availability,
    });

    return NextResponse.json({ snapshot, insights: buildInsights(snapshot) });
  } catch (err: any) {
    console.error("[/api/copilot/week]", err);
    return NextResponse.json({ error: "Plan Asistanı yüklenemedi" }, { status: 500 });
  }
}
