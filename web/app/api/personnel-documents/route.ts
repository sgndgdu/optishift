/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const personnel_id = searchParams.get("personnel_id");
  if (!personnel_id) return NextResponse.json({ error: "personnel_id zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    const rows = await db.prepare(
      `SELECT * FROM personnel_documents WHERE personnel_id = ? AND org_id = ? ORDER BY expiry_date ASC`
    ).all(personnel_id, auth.org_id);
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
  const { personnel_id, doc_type, expiry_date, note } = body;
  if (!personnel_id || !doc_type || !expiry_date) {
    return NextResponse.json({ error: "personnel_id, doc_type ve expiry_date zorunlu" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry_date)) {
    return NextResponse.json({ error: "expiry_date YYYY-MM-DD formatında olmalı" }, { status: 400 });
  }

  const db = getDB();
  try {
    const person = await db.prepare(`SELECT id FROM personnel WHERE id = ? AND org_id = ?`).get(personnel_id, auth.org_id);
    if (!person) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

    const result = await db.prepare(
      `INSERT INTO personnel_documents (org_id, personnel_id, doc_type, expiry_date, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
    ).get(auth.org_id, personnel_id, doc_type, expiry_date, note ?? null, Math.floor(Date.now() / 1000)) as any;

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
    const existing = await db.prepare(`SELECT id FROM personnel_documents WHERE id = ? AND org_id = ?`).get(id, auth.org_id);
    if (!existing) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });

    await db.prepare(`DELETE FROM personnel_documents WHERE id = ?`).run(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
