/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { requireAuth } from "@/lib/auth";

const DB_PATH = path.join(process.cwd(), "optishift.db");

// GET:
// ?personnel_id=...   → personelin kendi talepleri
// ?location_id=...    → müdürün görüntülemesi için
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const personnel_id = searchParams.get("personnel_id");
  const location_id  = searchParams.get("location_id");
  const org_id       = auth.org_id;

  const db = new Database(DB_PATH);
  try {
    let rows: any[];

    if (personnel_id) {
      // Employee can only see their own requests
      if (auth.role === "employee" && auth.personnel_id !== personnel_id) {
        db.close();
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = db.prepare(`
        SELECT er.*, sa.day, sa.week_start, sa.start_time, sa.end_time
        FROM shift_edit_requests er
        LEFT JOIN shift_assignments sa ON er.shift_id = sa.id
        WHERE er.org_id = ? AND er.personnel_id = ?
        ORDER BY er.created_at DESC
      `).all(org_id, personnel_id);
    } else if (location_id) {
      if (auth.role === "employee") {
        db.close();
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      rows = db.prepare(`
        SELECT er.*, sa.day, sa.week_start, sa.start_time, sa.end_time, sa.location_id as shift_location_id
        FROM shift_edit_requests er
        LEFT JOIN shift_assignments sa ON er.shift_id = sa.id
        WHERE er.org_id = ? AND sa.location_id = ?
        ORDER BY er.created_at DESC
      `).all(org_id, location_id);
    } else {
      db.close();
      return NextResponse.json({ error: "personnel_id veya location_id zorunlu" }, { status: 400 });
    }

    db.close();
    return NextResponse.json(rows);
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Yeni vardiya düzenleme talebi (personel)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = new Database(DB_PATH);
  try {
    const { personnel_id, personnel_name, shift_id, reason } = await req.json();
    const org_id = auth.org_id;

    if (!personnel_id || !shift_id || !reason?.trim()) {
      db.close();
      return NextResponse.json({ error: "Zorunlu alanlar eksik" }, { status: 400 });
    }

    // Employee can only submit for themselves
    if (auth.role === "employee" && auth.personnel_id !== personnel_id) {
      db.close();
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    const now = Math.floor(Date.now() / 1000);
    const result = db.prepare(`
      INSERT INTO shift_edit_requests (org_id, personnel_id, personnel_name, shift_id, reason, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(org_id, personnel_id, personnel_name ?? null, shift_id, reason.trim(), now);

    db.close();
    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Durum güncelleme
// Müdür: { id, status: 'approved' | 'rejected', manager_note? }
// Personel: { id, status: 'cancelled' } — sadece kendi 'pending' talebini iptal edebilir
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = new Database(DB_PATH);
  try {
    const { id, status, manager_note } = await req.json();

    if (!id || !status) {
      db.close();
      return NextResponse.json({ error: "id ve status zorunlu" }, { status: 400 });
    }

    const existing = db.prepare(
      `SELECT * FROM shift_edit_requests WHERE id = ? AND org_id = ?`
    ).get(id, auth.org_id) as any;

    if (!existing) {
      db.close();
      return NextResponse.json({ error: "Talep bulunamadı" }, { status: 404 });
    }

    // Personel sadece kendi pending talebini iptal edebilir
    if (status === "cancelled") {
      if (auth.role !== "employee" && !["manager", "admin", "supervisor"].includes(auth.role ?? "")) {
        db.close();
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      if (auth.role === "employee" && auth.personnel_id !== existing.personnel_id) {
        db.close();
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      if (existing.status !== "pending") {
        db.close();
        return NextResponse.json({ error: "Sadece bekleyen talepler iptal edilebilir" }, { status: 409 });
      }
      db.prepare(`UPDATE shift_edit_requests SET status = 'cancelled' WHERE id = ?`).run(id);
      db.close();
      return NextResponse.json({ success: true });
    }

    // Manager onay/ret
    if (!["approved", "rejected"].includes(status)) {
      db.close();
      return NextResponse.json({ error: "Geçersiz durum" }, { status: 400 });
    }
    if (auth.role === "employee") {
      db.close();
      return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
    }

    db.prepare(`UPDATE shift_edit_requests SET status = ?, manager_note = ? WHERE id = ?`)
      .run(status, manager_note ?? null, id);

    db.close();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
