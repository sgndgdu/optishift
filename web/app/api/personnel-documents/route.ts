/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const db = getDB();

  // ?location_id=&attention=1 → şubedeki süresi dolmuş ya da 30 gün içinde dolacak belgeler
  // (Ana Sayfa "Bekleyen İşler" sertifika maddesi). Sadece okuma, işletmeyle sınırlı.
  const attentionLoc = searchParams.get("attention") === "1" ? searchParams.get("location_id") : null;
  if (attentionLoc) {
    if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    try {
      const rows = await db.prepare(
        `SELECT pd.personnel_id, p.name, pd.doc_type, pd.expiry_date,
                CASE WHEN pd.expiry_date < ? THEN 'expired' ELSE 'expiring' END AS status
         FROM personnel_documents pd
         JOIN personnel p ON p.id = pd.personnel_id
         WHERE pd.org_id = ? AND pd.expiry_date <= ?
           AND (p.primary_location_id = ? OR p.assigned_location_ids LIKE ?)
           -- Yenilenmiş belge: aynı türün daha geç biten kaydı varsa eskisi sayılmaz
           AND NOT EXISTS (SELECT 1 FROM personnel_documents n
                           WHERE n.personnel_id = pd.personnel_id AND n.doc_type = pd.doc_type
                             AND n.expiry_date > pd.expiry_date)
         ORDER BY pd.expiry_date ASC`
      ).all(today, auth.org_id, soon, attentionLoc, `%"${attentionLoc}"%`);
      return NextResponse.json(rows);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  const personnel_id = searchParams.get("personnel_id");
  if (!personnel_id) return NextResponse.json({ error: "personnel_id zorunlu" }, { status: 400 });

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
