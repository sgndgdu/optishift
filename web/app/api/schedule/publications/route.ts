/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";


// GET /api/schedule/publications?location_id=X[&week_start=YYYY-MM-DD]
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const week_start  = searchParams.get("week_start");

  if (!location_id) return NextResponse.json({ error: "location_id gerekli" }, { status: 400 });

  const db = getDB();
  try {
    let rows: any[];
    if (week_start) {
      // Belirli hafta için en son revizyonu ve tüm geçmişi döndür
      rows = await db.prepare(
        `SELECT id, week_start, revision, published_by, published_by_name, published_at
         FROM schedule_publications
         WHERE org_id = ? AND location_id = ? AND week_start = ?
         ORDER BY revision ASC`
      ).all(auth.org_id, location_id, week_start) as any[];
    } else {
      // Tüm haftalardaki son revizyonu döndür (archive listesi için)
      rows = await db.prepare(
        `SELECT p.id, p.week_start, p.revision, p.published_by, p.published_by_name, p.published_at
         FROM schedule_publications p
         INNER JOIN (
           SELECT week_start, MAX(revision) as max_rev
           FROM schedule_publications
           WHERE org_id = ? AND location_id = ?
           GROUP BY week_start
         ) latest ON p.week_start = latest.week_start AND p.revision = latest.max_rev
         WHERE p.org_id = ? AND p.location_id = ?
         ORDER BY p.week_start DESC
         LIMIT 52`
      ).all(auth.org_id, location_id, auth.org_id, location_id) as any[];
    }
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/schedule/publications/[id] → snapshot — ayrı route için
// Bu endpoint snapshot'ı döndürür (id parametresiyle)
export async function POST(req: NextRequest) {
  // Snapshot'ı ID'ye göre getir
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });

  const db = getDB();
  try {
    const row = await db.prepare(
      `SELECT * FROM schedule_publications WHERE id = ? AND org_id = ?`
    ).get(id, auth.org_id) as any;
    if (!row) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    return NextResponse.json({ ...row, snapshot: row.snapshot ? JSON.parse(row.snapshot) : null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
