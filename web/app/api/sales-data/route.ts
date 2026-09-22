/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  if (!location_id) return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    const loc = await db.prepare(`SELECT id FROM locations WHERE id = ? AND org_id = ?`).get(location_id, auth.org_id);
    if (!loc) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

    const rows = await db.prepare(
      `SELECT * FROM location_sales_data WHERE location_id = ? ORDER BY date DESC LIMIT 90`
    ).all(location_id);
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: yeni gün girer, aynı tarih için kayıt varsa üzerine yazar (upsert)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { location_id, date, revenue, footfall } = body;
  if (!location_id || !date) return NextResponse.json({ error: "location_id ve date zorunlu" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date YYYY-MM-DD formatında olmalı" }, { status: 400 });
  if (revenue == null && footfall == null) return NextResponse.json({ error: "revenue veya footfall zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    const loc = await db.prepare(`SELECT id FROM locations WHERE id = ? AND org_id = ?`).get(location_id, auth.org_id);
    if (!loc) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

    const existing = await db.prepare(
      `SELECT id FROM location_sales_data WHERE location_id = ? AND date = ?`
    ).get(location_id, date) as any;

    if (existing) {
      await db.prepare(`UPDATE location_sales_data SET revenue = ?, footfall = ? WHERE id = ?`)
        .run(revenue ?? null, footfall ?? null, existing.id);
      return NextResponse.json({ success: true, id: existing.id, updated: true });
    }

    const result = await db.prepare(
      `INSERT INTO location_sales_data (org_id, location_id, date, revenue, footfall, created_at)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
    ).get(auth.org_id, location_id, date, revenue ?? null, footfall ?? null, Math.floor(Date.now() / 1000)) as any;

    return NextResponse.json({ success: true, id: result.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    const existing = await db.prepare(
      `SELECT lsd.id FROM location_sales_data lsd WHERE lsd.id = ? AND lsd.org_id = ?`
    ).get(id, auth.org_id);
    if (!existing) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });

    await db.prepare(`DELETE FROM location_sales_data WHERE id = ?`).run(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
