/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/shifts/team?week_start=YYYY-MM-DD → çalışanın haftası, çalıştığı TÜM şubelerde (kullanıcı isteği 2026-10-05:
 * "kimle nerede çalışıyorum görmek isterim, birden çok şubede çalışıyorsam da").
 * Döner: { locations: [{ id, name }], shifts: [...yayınlanmış normal vardiyalar, kişi adı, şube, departman ve vardiya adıyla] }.
 * Sadece kişinin atandığı şubeler; ücret, telefon gibi alan yok.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const weekStart = new URL(req.url).searchParams.get("week_start");
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return NextResponse.json({ error: "week_start zorunlu" }, { status: 400 });
  if (!auth.personnel_id) return NextResponse.json({ locations: [], shifts: [] });
  const db = getDB();
  try {
    const me = await db.prepare(`SELECT primary_location_id, assigned_location_ids FROM personnel WHERE id = ? AND org_id = ?`)
      .get(auth.personnel_id, auth.org_id) as any;
    let ids: string[] = [];
    try { ids = JSON.parse(me?.assigned_location_ids || "[]"); } catch { ids = []; }
    if (me?.primary_location_id && !ids.includes(me.primary_location_id)) ids.unshift(me.primary_location_id);
    // Ana şube başta
    ids = [...new Set(ids)].sort((a, b) => Number(b === me?.primary_location_id) - Number(a === me?.primary_location_id));
    if (ids.length === 0) return NextResponse.json({ locations: [], shifts: [] });
    const ph = ids.map(() => "?").join(",");
    const locs = await db.prepare(`SELECT id, name, shift_definitions FROM locations WHERE org_id = ? AND id IN (${ph})`).all(auth.org_id, ...ids) as any[];
    const shiftName: Record<string, Record<string, string>> = {};
    for (const l of locs) {
      let defs: any[] = [];
      try { defs = typeof l.shift_definitions === "string" ? JSON.parse(l.shift_definitions) : (l.shift_definitions ?? []); } catch { defs = []; }
      shiftName[l.id] = Object.fromEntries((Array.isArray(defs) ? defs : []).map((d: any) => [String(d.id), String(d.name ?? "")]));
    }
    const rows = await db.prepare(`
      SELECT sa.id, sa.personnel_id, sa.location_id, sa.week_start, sa.day, sa.shift_id, sa.start_time, sa.end_time,
             p.name AS personnel_name, COALESCE(dp.name, pd.name) AS department_name
      FROM shift_assignments sa
      JOIN personnel p ON p.id = sa.personnel_id
      LEFT JOIN departments dp ON dp.id = sa.department_id
      LEFT JOIN departments pd ON pd.id = p.department_id
      WHERE sa.location_id IN (${ph}) AND sa.week_start = ? AND p.org_id = ?
        AND COALESCE(sa.kind, 'regular') = 'regular'
        AND (sa.publication_status IS NULL OR sa.publication_status = 'published')
      ORDER BY sa.day, sa.start_time, p.name`).all(...ids, weekStart, auth.org_id) as any[];
    const order = new Map(ids.map((id, i) => [id, i]));
    return NextResponse.json({
      locations: locs.map(l => ({ id: l.id, name: l.name })).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
      shifts: rows.map(r => ({
        id: r.id, personnel_id: r.personnel_id, personnel_name: r.personnel_name, location_id: r.location_id,
        day: Number(r.day), start_time: r.start_time, end_time: r.end_time, department_name: r.department_name ?? null,
        shift_name: r.shift_id === "custom" ? "Özel" : (shiftName[r.location_id]?.[String(r.shift_id)] || null),
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
