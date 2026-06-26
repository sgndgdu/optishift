/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";


// GET: ?location_id=...&weeks=8
// Döner: { personnel_id: [{ week_start, burden_score, total_hours, ... }] }
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const weeks = Math.min(parseInt(searchParams.get("weeks") ?? "8", 10), 52);

  if (!location_id) {
    return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });
  }

  const db = getDB();
  try {
    const loc = await db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
    if (!loc) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    const rows = await db.prepare(`
      SELECT
        personnel_id, personnel_name, week_start,
        burden_score, total_hours, raw_score,
        weekend_shifts, night_shifts, pref_not_shifts, clopening_count,
        cumulative_burden, fairness_z_score,
        hero_count, no_show_count,
        score
      FROM score_history
      WHERE org_id = ? AND location_id = ?
      ORDER BY week_start ASC
    `).all(auth.org_id, location_id) as any[];

    const byPerson: Record<string, any[]> = {};
    for (const row of rows) {
      if (!byPerson[row.personnel_id]) byPerson[row.personnel_id] = [];
      byPerson[row.personnel_id].push(row);
    }

    const result: Record<string, any[]> = {};
    for (const [pid, entries] of Object.entries(byPerson)) {
      result[pid] = entries.slice(-weeks);
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
