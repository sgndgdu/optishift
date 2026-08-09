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
    const rows = await db.prepare(
      `SELECT pc.*, pa.name as personnel_a_name, pb.name as personnel_b_name
       FROM personnel_conflicts pc
       JOIN personnel pa ON pa.id = pc.personnel_id_a
       JOIN personnel pb ON pb.id = pc.personnel_id_b
       WHERE pc.location_id = ? AND pc.org_id = ?
       ORDER BY pc.created_at DESC`
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
  const { location_id, personnel_id_a, personnel_id_b, note } = body;
  if (!location_id || !personnel_id_a || !personnel_id_b) {
    return NextResponse.json({ error: "location_id, personnel_id_a ve personnel_id_b zorunlu" }, { status: 400 });
  }
  if (personnel_id_a === personnel_id_b) {
    return NextResponse.json({ error: "Bir personel kendisiyle çakışamaz" }, { status: 400 });
  }

  const db = getDB();
  try {
    const loc = await db.prepare(`SELECT id FROM locations WHERE id = ? AND org_id = ?`).get(location_id, auth.org_id);
    if (!loc) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

    const existing = await db.prepare(
      `SELECT id FROM personnel_conflicts
       WHERE location_id = ? AND org_id = ?
       AND ((personnel_id_a = ? AND personnel_id_b = ?) OR (personnel_id_a = ? AND personnel_id_b = ?))`
    ).get(location_id, auth.org_id, personnel_id_a, personnel_id_b, personnel_id_b, personnel_id_a);
    if (existing) return NextResponse.json({ error: "Bu çift zaten kayıtlı" }, { status: 409 });

    const result = await db.prepare(
      `INSERT INTO personnel_conflicts (org_id, location_id, personnel_id_a, personnel_id_b, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
    ).get(auth.org_id, location_id, personnel_id_a, personnel_id_b, note ?? null, Math.floor(Date.now() / 1000)) as any;

    return NextResponse.json({ id: result.id, success: true });
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
    const existing = await db.prepare(`SELECT id FROM personnel_conflicts WHERE id = ? AND org_id = ?`).get(id, auth.org_id);
    if (!existing) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });

    await db.prepare(`DELETE FROM personnel_conflicts WHERE id = ?`).run(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
