/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { managerOutsideBranch } from "@/lib/access";


// GET: ?location_id=...&weeks=8[&all_branches=1]
// all_branches=1 (Adalet raporu): bu şubede çalışan kişilerin BÜTÜN şubelerdeki haftaları, hafta başına toplanır.
// Puan kişiye ait olduğu için (lib/scoring recomputeLocationFairness) rapordaki satırlar toplam puanla tutar.
// Döner: { personnel_id: [{ week_start, burden_score, total_hours, ... }] }
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 }); // sorumlu ekranı; ekip üyesi başkalarının kaydını görmez

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const weeks = Math.min(parseInt(searchParams.get("weeks") ?? "8", 10), 52);

  if (!location_id) {
    return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });
  }

  const db = getDB();
  try {
    const loc = await db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
    if (managerOutsideBranch(auth, location_id)) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    if (!loc) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    if (searchParams.get("all_branches") === "1") {
      return NextResponse.json(await allBranchesHistory(db, auth.org_id, location_id, weeks));
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

const SUM_FIELDS = ["burden_score", "total_hours", "raw_score", "score", "weekend_shifts", "night_shifts", "pref_not_shifts", "clopening_count"];

async function allBranchesHistory(db: ReturnType<typeof getDB>, orgId: string, locationId: string, weeks: number) {
  const people = await db.prepare(`
    SELECT id FROM personnel
    WHERE org_id = ? AND (primary_location_id = ? OR assigned_location_ids LIKE ?)
  `).all(orgId, locationId, `%"${locationId}"%`) as any[];
  const pids = people.map(p => p.id);
  if (pids.length === 0) return {};

  const rows = await db.prepare(`
    SELECT
      personnel_id, personnel_name, week_start,
      burden_score, total_hours, raw_score,
      weekend_shifts, night_shifts, pref_not_shifts, clopening_count,
      cumulative_burden, fairness_z_score,
      hero_count, no_show_count,
      score
    FROM score_history
    WHERE org_id = ? AND personnel_id IN (${pids.map(() => "?").join(",")})
    ORDER BY week_start ASC
  `).all(orgId, ...pids) as any[];

  const byPerson: Record<string, any[]> = {};
  for (const row of rows) {
    const list = (byPerson[row.personnel_id] ??= []);
    const same = list.find(x => x.week_start === row.week_start);
    if (!same) { list.push({ ...row }); continue; }
    for (const f of SUM_FIELDS) same[f] = (Number(same[f]) || 0) + (Number(row[f]) || 0);
    same.cumulative_burden = Math.max(Number(same.cumulative_burden) || 0, Number(row.cumulative_burden) || 0);
  }
  const result: Record<string, any[]> = {};
  for (const [pid, entries] of Object.entries(byPerson)) result[pid] = entries.slice(-weeks);
  return result;
}
