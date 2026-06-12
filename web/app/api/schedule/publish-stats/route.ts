/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { requireAuth } from "@/lib/auth";

const DB_PATH = path.join(process.cwd(), "optishift.db");

/**
 * Yayın öncülüğü KPI'ı (OPTI-023): her hafta için programın hafta başlangıcından
 * kaç gün önce yayınlandığını hesaplar. Fair workweek pratiği — 7+ gün ideal.
 *
 * GET ?location_id=L-001            → tek şube, son 8 hafta
 * GET ?location_id=L-001&weeks=12   → tek şube, son 12 hafta
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const weeksLimit = Math.min(Math.max(parseInt(searchParams.get("weeks") || "8", 10) || 8, 1), 52);

  if (!location_id) {
    return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });
  }

  const db = new Database(DB_PATH);
  try {
    const loc = db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
    if (!loc) {
      db.close();
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    const rows = db.prepare(`
      SELECT week_start, MIN(published_at) AS first_published_at
      FROM shift_assignments
      WHERE location_id = ? AND published_at IS NOT NULL
      GROUP BY week_start
      ORDER BY week_start DESC
      LIMIT ?
    `).all(location_id, weeksLimit) as any[];
    db.close();

    const weeks = rows.map((r) => {
      const weekStartMs = new Date(`${r.week_start}T00:00:00`).getTime();
      const leadDays = (weekStartMs / 1000 - r.first_published_at) / 86400;
      return {
        week_start: r.week_start,
        published_at: r.first_published_at,
        lead_days: Math.round(leadDays * 10) / 10, // negatif = hafta başladıktan sonra yayınlanmış
      };
    });

    const avg = weeks.length
      ? Math.round((weeks.reduce((s, w) => s + w.lead_days, 0) / weeks.length) * 10) / 10
      : null;

    return NextResponse.json({ location_id, weeks, avg_lead_days: avg });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
