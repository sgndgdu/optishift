/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// GET: Mesai kayıtlarını listele
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const week_start  = searchParams.get("week_start");
  const status      = searchParams.get("status");

  const db = getDB();
  try {
    let query = `SELECT o.*, p.name as personnel_name
                 FROM overtime_records o
                 LEFT JOIN personnel p ON p.id = o.personnel_id
                 WHERE o.org_id = ?`;
    const params: unknown[] = [auth.org_id];

    if (location_id) { query += ` AND o.location_id = ?`; params.push(location_id); }
    if (week_start)  { query += ` AND o.week_start = ?`;  params.push(week_start);  }
    if (status)      { query += ` AND o.status = ?`;      params.push(status);      }
    query += ` ORDER BY o.created_at DESC`;

    const rows = await db.prepare(query).all(...params);
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Yeni mesai kaydı oluştur (genellikle /api/generate sonrası otomatik)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { location_id, personnel_id, week_start, scheduled_hours, overtime_hours, note } = body;
  if (!location_id || !personnel_id || !week_start || scheduled_hours == null || overtime_hours == null) {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }

  const db = getDB();
  try {
    const loc = await db.prepare(`SELECT id FROM locations WHERE id = ? AND org_id = ?`).get(location_id, auth.org_id);
    if (!loc) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

    const p = await db.prepare(`SELECT name FROM personnel WHERE id = ? AND org_id = ?`).get(personnel_id, auth.org_id) as { name: string } | undefined;
    if (!p) return NextResponse.json({ error: "Personel bulunamadı" }, { status: 404 });

    const result = await db.prepare(
      `INSERT INTO overtime_records (org_id, location_id, personnel_id, personnel_name, week_start, scheduled_hours, overtime_hours, status, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).run(auth.org_id, location_id, personnel_id, p.name, week_start, scheduled_hours, overtime_hours, note ?? null, Math.floor(Date.now() / 1000));

    return NextResponse.json({ id: result.lastInsertRowid, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Mesai onay / red + ytd_overtime_hours güncelleme
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { id, status, note } = body;
  if (!id || !status) return NextResponse.json({ error: "id ve status zorunlu" }, { status: 400 });
  if (!["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Geçersiz status" }, { status: 400 });
  }

  const db = getDB();
  try {
    const record = await db.prepare(
      `SELECT * FROM overtime_records WHERE id = ? AND org_id = ?`
    ).get(id, auth.org_id) as { personnel_id: string; overtime_hours: number; status: string } | undefined;
    if (!record) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    if (record.status !== "pending") {
      return NextResponse.json({ error: "Bu kayıt zaten işleme alınmış" }, { status: 409 });
    }

    await db.prepare(
      `UPDATE overtime_records SET status = ?, approved_by = ?, approved_at = ?, note = COALESCE(?, note) WHERE id = ?`
    ).run(status, auth.id, Math.floor(Date.now() / 1000), note ?? null, id);

    // Onaylanırsa ytd_overtime_hours artır
    if (status === "approved") {
      await db.prepare(
        `UPDATE personnel SET ytd_overtime_hours = COALESCE(ytd_overtime_hours, 0) + ? WHERE id = ?`
      ).run(record.overtime_hours, record.personnel_id);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
