/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/auth";

async function loadOwnedPersonnel(db: ReturnType<typeof getDB>, auth: any, id: string) {
  const existing = await db.prepare(
    "SELECT id, primary_location_id, assigned_location_ids FROM personnel WHERE id = ? AND org_id = ?"
  ).get(id, auth.org_id) as any;
  if (!existing) return null;
  if (auth.role === "manager" && auth.location_id && existing.primary_location_id !== auth.location_id) return null;
  return existing;
}

// POST: PIN atar/değiştirir — aynı şubede aynı PIN'i kullanan başka personel varsa reddedilir
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!["manager", "admin", "supervisor"].includes(auth.role)) {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { pin } = body;
  if (!pin || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "4 haneli PIN zorunlu" }, { status: 400 });
  }

  const db = getDB();
  try {
    const existing = await loadOwnedPersonnel(db, auth, id);
    if (!existing) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

    const candidates = await db.prepare(
      `SELECT id, kiosk_pin FROM personnel
       WHERE org_id = ? AND id != ? AND kiosk_pin IS NOT NULL
         AND (primary_location_id = ? OR assigned_location_ids LIKE ?)`
    ).all(auth.org_id, id, existing.primary_location_id, `%"${existing.primary_location_id}"%`) as any[];
    for (const c of candidates) {
      if (await bcrypt.compare(pin, c.kiosk_pin)) {
        return NextResponse.json({ error: "Bu PIN aynı şubede başka bir personel tarafından kullanılıyor" }, { status: 409 });
      }
    }

    const hash = await bcrypt.hash(pin, 10);
    await db.prepare("UPDATE personnel SET kiosk_pin = ?, kiosk_pin_set_at = ? WHERE id = ?")
      .run(hash, Math.floor(Date.now() / 1000), id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: PIN'i kaldırır (kiosk erişimi kapanır)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!["manager", "admin", "supervisor"].includes(auth.role)) {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const { id } = await params;
  const db = getDB();
  try {
    const existing = await loadOwnedPersonnel(db, auth, id);
    if (!existing) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

    await db.prepare("UPDATE personnel SET kiosk_pin = NULL, kiosk_pin_set_at = NULL WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
