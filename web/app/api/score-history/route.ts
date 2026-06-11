/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { requireAuth } from "@/lib/auth";

const DB_PATH = path.join(process.cwd(), "optishift.db");

// GET: ?location_id=...&weeks=8
// Döner: { personnel_id: [{week_start, score, hero_count, no_show_count}] }
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const weeks       = Math.min(parseInt(searchParams.get("weeks") ?? "12", 10), 52);

  if (!location_id) {
    return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });
  }

  const db = new Database(DB_PATH);
  try {
    // Lokasyonun bu org'a ait olduğunu doğrula
    const loc = db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
    if (!loc) {
      db.close();
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    const rows = db.prepare(`
      SELECT personnel_id, personnel_name, week_start, score, hero_count, no_show_count
      FROM score_history
      WHERE org_id = ? AND location_id = ?
      ORDER BY week_start ASC
    `).all(auth.org_id, location_id) as any[];

    db.close();

    // Group by personnel_id, keep last N weeks
    const byPerson: Record<string, any[]> = {};
    for (const row of rows) {
      if (!byPerson[row.personnel_id]) byPerson[row.personnel_id] = [];
      byPerson[row.personnel_id].push(row);
    }

    // Trim to last `weeks` weeks per person
    const result: Record<string, any[]> = {};
    for (const [pid, entries] of Object.entries(byPerson)) {
      result[pid] = entries.slice(-weeks);
    }

    return NextResponse.json(result);
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
