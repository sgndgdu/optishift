/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  if (!location_id) return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    const rows = await db.prepare(
      `SELECT c.*, COUNT(p.id) as member_count
       FROM crews c
       LEFT JOIN personnel p ON p.crew_id = c.id AND p.status = 'active'
       WHERE c.location_id = ? AND c.org_id = ?
       GROUP BY c.id
       ORDER BY c.name`
    ).all(location_id, auth.org_id);
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { location_id, name, color, shift_preference } = body;
  if (!location_id || !name?.trim()) {
    return NextResponse.json({ error: "location_id ve name zorunlu" }, { status: 400 });
  }

  const db = getDB();
  try {
    const loc = await db.prepare(`SELECT id FROM locations WHERE id = ? AND org_id = ?`).get(location_id, auth.org_id);
    if (!loc) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

    const id = randomUUID();
    await db.prepare(
      `INSERT INTO crews (id, org_id, location_id, name, color, shift_preference, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, auth.org_id, location_id, name.trim(), color ?? "#6366f1", shift_preference ?? null, Math.floor(Date.now() / 1000));

    return NextResponse.json({ id, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { id, name, color, shift_preference } = body;
  if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    const existing = await db.prepare(`SELECT id FROM crews WHERE id = ? AND org_id = ?`).get(id, auth.org_id);
    if (!existing) return NextResponse.json({ error: "Ekip bulunamadı" }, { status: 404 });

    const updates: string[] = [];
    const params: unknown[] = [];
    if (name !== undefined) { updates.push("name = ?"); params.push(name.trim()); }
    if (color !== undefined) { updates.push("color = ?"); params.push(color); }
    if (shift_preference !== undefined) { updates.push("shift_preference = ?"); params.push(shift_preference || null); }

    if (updates.length) {
      params.push(id);
      await db.prepare(`UPDATE crews SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    }
    return NextResponse.json({ success: true });
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
    const existing = await db.prepare(`SELECT id FROM crews WHERE id = ? AND org_id = ?`).get(id, auth.org_id);
    if (!existing) return NextResponse.json({ error: "Ekip bulunamadı" }, { status: 404 });

    await db.prepare(`UPDATE personnel SET crew_id = NULL WHERE crew_id = ?`).run(id);
    await db.prepare(`DELETE FROM crews WHERE id = ?`).run(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
