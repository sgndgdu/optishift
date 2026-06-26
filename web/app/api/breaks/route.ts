/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";


function getDb() {
  return getDB();
}

// GET: Bugünün mola oturumları
// ?location_id=...&date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const org_id      = auth.org_id;
  const location_id = searchParams.get("location_id");
  const date        = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  if (!location_id) {
    return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });
  }

  const db = getDB();
  try {
    const rows = await db.prepare(`
      SELECT * FROM break_sessions
      WHERE org_id = ? AND location_id = ? AND date = ?
      ORDER BY start_at DESC
    `).all(org_id, location_id, date);
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Mola başlat
// Body: { location_id, personnel_id, personnel_name, date }
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const { location_id, personnel_id, personnel_name, date } = await req.json();
    const org_id = auth.org_id;

    if (!location_id || !personnel_id) {
      return NextResponse.json({ error: "Zorunlu alanlar eksik" }, { status: 400 });
    }

    // Açık mola varsa reddet
    const active = await db.prepare(`
      SELECT id FROM break_sessions
      WHERE org_id = ? AND personnel_id = ? AND date = ? AND end_at IS NULL
    `).get(org_id, personnel_id, date ?? new Date().toISOString().slice(0, 10));

    if (active) {
      return NextResponse.json({ error: "Zaten aktif bir molası var" }, { status: 409 });
    }

    const now = Math.floor(Date.now() / 1000);
    const today = date ?? new Date().toISOString().slice(0, 10);
    const result = await db.prepare(`
      INSERT INTO break_sessions (org_id, location_id, personnel_id, personnel_name, date, start_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(org_id, location_id, personnel_id, personnel_name ?? null, today, now);
    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Mola bitir
// Body: { id }
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

    const session = await db.prepare(
      `SELECT * FROM break_sessions WHERE id = ? AND org_id = ?`
    ).get(id, auth.org_id) as any;

    if (!session || session.end_at) {
      return NextResponse.json({ error: "Oturum bulunamadı veya zaten bitti" }, { status: 400 });
    }

    const now = Math.floor(Date.now() / 1000);
    const duration = Math.round((now - session.start_at) / 60);
    await db.prepare(`UPDATE break_sessions SET end_at = ?, duration_min = ? WHERE id = ?`).run(now, duration, id);
    return NextResponse.json({ success: true, duration_min: duration });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
