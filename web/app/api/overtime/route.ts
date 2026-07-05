/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { recomputeYtdOvertime, upsertPendingOvertime } from "@/lib/overtime";

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

    // Hafta başına tek kayıt kuralı: pending varsa günceller, karar verilmişse dokunmaz
    const result = await upsertPendingOvertime({
      orgId: auth.org_id,
      locationId: location_id,
      personnelId: personnel_id,
      personnelName: p.name,
      weekStart: week_start,
      scheduledHours: scheduled_hours,
      overtimeHours: overtime_hours,
      note: note ?? null,
    });
    if (result === "skipped_decided") {
      return NextResponse.json(
        { error: "Bu hafta için zaten karara bağlanmış bir mesai kaydı var. Önce onu geri alın." },
        { status: 409 },
      );
    }
    if (result === "skipped_zero" || result === "deleted") {
      return NextResponse.json({ error: "Mesai saati 0'dan büyük olmalı" }, { status: 400 });
    }

    return NextResponse.json({ success: true, result });
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
  const { id, status, note, action } = body;
  if (!id || (!status && !action)) return NextResponse.json({ error: "id ve status (veya action) zorunlu" }, { status: 400 });
  if (status && !["approved", "rejected", "pending"].includes(status)) {
    return NextResponse.json({ error: "Geçersiz status" }, { status: 400 });
  }

  const db = getDB();
  try {
    const record = await db.prepare(
      `SELECT * FROM overtime_records WHERE id = ? AND org_id = ?`
    ).get(id, auth.org_id) as { personnel_id: string; overtime_hours: number; status: string; compensation_type?: string; comp_time_used_at?: number } | undefined;
    if (!record) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });

    // Serbest zaman kullandırma işareti (onaylı + time_off kayıtlar için)
    if (action === "comp_time_used" || action === "comp_time_unused") {
      if (record.status !== "approved" || record.compensation_type !== "time_off") {
        return NextResponse.json({ error: "Sadece onaylı serbest zaman kayıtları işaretlenebilir" }, { status: 409 });
      }
      await db.prepare(
        `UPDATE overtime_records SET comp_time_used_at = ? WHERE id = ?`
      ).run(action === "comp_time_used" ? Math.floor(Date.now() / 1000) : null, id);
      return NextResponse.json({ success: true });
    }

    if (status === "pending") {
      // Geri alma: karara bağlanmış kayıt yeniden beklemeye döner
      if (record.status === "pending") {
        return NextResponse.json({ error: "Kayıt zaten beklemede" }, { status: 409 });
      }
      await db.prepare(
        `UPDATE overtime_records SET status = 'pending', approved_by = NULL, approved_at = NULL WHERE id = ?`
      ).run(id);
    } else {
      if (record.status !== "pending") {
        return NextResponse.json({ error: "Bu kayıt zaten işleme alınmış" }, { status: 409 });
      }
      await db.prepare(
        `UPDATE overtime_records SET status = ?, approved_by = ?, approved_at = ?, note = COALESCE(?, note) WHERE id = ?`
      ).run(status, auth.id, Math.floor(Date.now() / 1000), note ?? null, id);

      await db.prepare(`
        INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
        VALUES (?, 'overtime', ?, ?, '/portal/requests', false, ?)
      `).run(
        record.personnel_id,
        status === "approved" ? "Fazla Mesai Onaylandı ✓" : "Fazla Mesai Reddedildi",
        status === "approved"
          ? `${record.overtime_hours} saatlik fazla mesain müdürün tarafından onaylandı.`
          : `${record.overtime_hours} saatlik fazla mesai kaydın onaylanmadı.`,
        Math.floor(Date.now() / 1000),
      );
    }

    // YTD önbelleği tek yazar üzerinden deterministik tazelenir (+= yok)
    await recomputeYtdOvertime(auth.org_id, [record.personnel_id]);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
