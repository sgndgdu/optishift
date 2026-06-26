/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";


// GET /api/schedule/edit-requests?location_id=X&week_start=Y  → müdür: aktif talep durumu
// GET /api/schedule/edit-requests?org_id=X                    → supervisor: tüm pending talepler
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const week_start  = searchParams.get("week_start");
  const org_id_param = searchParams.get("org_id");

  const db = getDB();
  try {
    // Supervisor/admin: tüm org'un pending talepleri
    if (org_id_param) {
      if (auth.role !== "supervisor" && auth.role !== "admin") {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      if (org_id_param !== auth.org_id) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      const rows = await db.prepare(`
        SELECT * FROM schedule_edit_requests
        WHERE org_id = ? AND status = 'pending'
        ORDER BY created_at DESC
      `).all(auth.org_id) as any[];
      return NextResponse.json(rows);
    }

    // Müdür: belirli hafta için son talep
    if (!location_id || !week_start) {
      return NextResponse.json({ error: "location_id ve week_start gerekli" }, { status: 400 });
    }
    const row = await db.prepare(`
      SELECT * FROM schedule_edit_requests
      WHERE org_id = ? AND location_id = ? AND week_start = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(auth.org_id, location_id, week_start) as any;
    return NextResponse.json(row ?? null);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/schedule/edit-requests
// Müdür düzenleme onayı talep eder
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role !== "manager" && auth.role !== "admin") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const body = await req.json();
  const { location_id, week_start } = body;

  if (!location_id || !week_start) {
    return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });
  }

  const db = getDB();
  try {
    // Zaten bekleyen talep var mı?
    const existing = await db.prepare(`
      SELECT id, status FROM schedule_edit_requests
      WHERE org_id = ? AND location_id = ? AND week_start = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(auth.org_id, location_id, week_start) as any;

    if (existing?.status === "pending") {
      return NextResponse.json({ id: existing.id, status: "pending", already_exists: true });
    }

    // Yeni talep oluştur
    const result = await db.prepare(`
      INSERT INTO schedule_edit_requests (org_id, location_id, week_start, requested_by, requested_by_name, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(auth.org_id, location_id, week_start, auth.id, auth.name ?? "Yönetici", Math.floor(Date.now() / 1000));

    const requestId = result.lastInsertRowid;

    // Org'un supervisor/admin kullanıcılarını bul ve bildirim göster (personnel_id varsa)
    // Supervisor'lar için in-app bildirim → bu endpoint olmadığından dashboard polling yeterli
    // Ek olarak: org admini için notifications tablosuna personnel_id varsa ekle
    const supervisors = await db.prepare(`
      SELECT u.id, u.name, u.personnel_id FROM users u
      WHERE u.org_id = ? AND u.role IN ('supervisor', 'admin')
    `).all(auth.org_id) as any[];

    const locRow = await db.prepare(`SELECT name FROM locations WHERE id = ?`).get(location_id) as any;
    const locName = locRow?.name ?? location_id;

    for (const sup of supervisors) {
      if (sup.personnel_id) {
        await db.prepare(`
          INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
          VALUES (?, 'alert', ?, ?, ?, 0, ?)
        `).run(
          sup.personnel_id,
          "Vardiya Düzenleme Onayı Gerekiyor",
          `${auth.name ?? "Yönetici"} — ${locName} (${week_start} haftası) için yayınlanmış planı düzenlemek istiyor.`,
          "/supervisor",
          Math.floor(Date.now() / 1000),
        );
      }
    }
    return NextResponse.json({ id: requestId, status: "pending" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/schedule/edit-requests
// "completed" → manager/admin (publish sonrası temizlik)
// "approved" / "rejected" → supervisor/admin
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { id, status, note } = body;

  if (!id || !["approved", "rejected", "completed"].includes(status)) {
    return NextResponse.json({ error: "id ve geçerli status gerekli" }, { status: 400 });
  }

  const db = getDB();
  try {
    // "completed" — manager veya admin publish sonrası talep kapatır
    if (status === "completed") {
      if (auth.role !== "manager" && auth.role !== "admin") {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      const req2 = await db.prepare(`SELECT org_id FROM schedule_edit_requests WHERE id = ?`).get(id) as any;
      if (!req2 || req2.org_id !== auth.org_id) {
        return NextResponse.json({ error: "Talep bulunamadı" }, { status: 404 });
      }
      await db.prepare(`UPDATE schedule_edit_requests SET status = 'completed' WHERE id = ?`).run(id);
      return NextResponse.json({ success: true, status: "completed" });
    }

    // "approved" / "rejected" — sadece supervisor/admin
    if (auth.role !== "supervisor" && auth.role !== "admin") {
      return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
    }

    const request = await db.prepare(`
      SELECT * FROM schedule_edit_requests WHERE id = ? AND org_id = ?
    `).get(id, auth.org_id) as any;

    if (!request) {
      return NextResponse.json({ error: "Talep bulunamadı" }, { status: 404 });
    }
    if (request.status !== "pending") {
      return NextResponse.json({ error: "Talep zaten işlenmiş" }, { status: 409 });
    }

    await db.prepare(`
      UPDATE schedule_edit_requests
      SET status = ?, reviewed_by = ?, reviewed_by_name = ?, reviewed_at = ?, note = ?
      WHERE id = ?
    `).run(status, auth.id, auth.name ?? "Supervisor", Math.floor(Date.now() / 1000), note ?? null, id);
    return NextResponse.json({ success: true, status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
