/* eslint-disable @typescript-eslint/no-explicit-any */
import { leaveTypeLabel } from "@/lib/leave";
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leaveRequests } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { managerOutsideBranch, canActOnPersonnel } from "@/lib/access";

// GET: Personelin izin taleplerini listele (veya location'daki tüm personelin)
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const personnel_id = searchParams.get("personnel_id");
  const location_id = searchParams.get("location_id");
  if (managerOutsideBranch(auth, location_id)) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

  // Employee yalnızca kendi taleplerini görebilir (şube listesi yöneticiler içindir)
  if (auth.role === "employee" && (location_id || (personnel_id && auth.personnel_id !== personnel_id))) {
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  }

  if (personnel_id) {
    // Kişi isteği yapanın işletmesinde olmalı
    const own = await getDB().prepare("SELECT 1 FROM personnel WHERE id = ? AND org_id = ?").get(personnel_id, auth.org_id);
    if (!own) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    const rows = await db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.personnel_id, personnel_id))
      .orderBy(desc(leaveRequests.created_at));
    return NextResponse.json(rows);
  }

  if (location_id) {
    const rawDb = getDB();
    try {
      const rows = await rawDb.prepare(`
        SELECT lr.*, p.name as personnel_name FROM leave_requests lr
        JOIN personnel p ON p.id = lr.personnel_id
        WHERE p.primary_location_id = ? AND p.org_id = ?
        ORDER BY lr.created_at DESC
      `).all(location_id, auth.org_id);
      return NextResponse.json(rows);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "personnel_id veya location_id zorunlu" }, { status: 400 });
}

// POST: Yeni izin talebi oluştur
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { personnel_id, type, start_date, end_date, days, note } = body;

    if (!personnel_id || !type || !start_date || !end_date) {
      return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
    }

    // Employee sadece kendi adına talep oluşturabilir
    if (auth.role === "employee" && auth.personnel_id !== personnel_id) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    // İzin politikası doğrulaması — personelin bulunduğu lokasyonun politikası esas alınır
    const rawDb = getDB();
    const personnelRow = await rawDb.prepare("SELECT primary_location_id FROM personnel WHERE id = ?").get(personnel_id) as any;
    if (personnelRow?.primary_location_id) {
      const locRow = await rawDb.prepare("SELECT leave_policy, rules FROM locations WHERE id = ?").get(personnelRow.primary_location_id) as any;

      // İzin sistemi bu lokasyonda kapatılmışsa talep oluşturulamaz (rules.leave_requests_enabled)
      if (locRow?.rules) {
        let rules: any = {};
        try { rules = JSON.parse(locRow.rules); } catch { /* geçersiz JSON → atla */ }
        if (rules.leave_requests_enabled === false) {
          return NextResponse.json({ error: "Bu şubede izin talep sistemi kapalı." }, { status: 422 });
        }
      }

      // İzin kuralları (mazeret zorunlu / tek gün / gün sınırı) 2026-10-04'te kaldırıldı: ayarlar sayfası
      // kayıtta farkında olmadan "sadece tek gün" yazıyordu. Çok günlü izin serbest, açıklama isteğe bağlı.
    }

    const now = Math.floor(Date.now() / 1000);
    const [result] = await db
      .insert(leaveRequests)
      .values({
        personnel_id,
        type,
        start_date,
        end_date,
        days: days ?? 0,
        note: note ?? "",
        status: "pending",
        created_at: now,
      })
      .returning();

    // Müdüre bildirim gönder
    if (auth.location_id) {
      const managers = await rawDb.prepare(`
        SELECT personnel_id FROM users
        WHERE location_id = ? AND role IN ('manager', 'admin') AND personnel_id IS NOT NULL
      `).all(auth.location_id) as any[];

      const pRow = await rawDb.prepare(`SELECT name FROM personnel WHERE id = ?`).get(personnel_id) as any;
      const pName = pRow?.name ?? "Personel";

      for (const mgr of managers) {
        await rawDb.prepare(`
          INSERT INTO notifications (personnel_id, type, title, message, is_read, created_at)
          VALUES (?, 'leave_request', ?, ?, false, ?)
        `).run(mgr.personnel_id, "Yeni İzin Talebi", `${pName}: ${leaveTypeLabel(type)} · ${start_date}${end_date !== start_date ? ` - ${end_date}` : ""}`, now);
      }
    }

    return NextResponse.json({ success: true, id: result.id });
  } catch (err) {
    console.error("Leave request POST error:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// PATCH: Personel kendi pending talebini iptal eder
// Body: { id, action: 'cancel' }
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id, action } = await req.json();

    if (!id || action !== "cancel") {
      return NextResponse.json({ error: "id ve action:'cancel' zorunlu" }, { status: 400 });
    }

    const [existing] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Talep bulunamadı" }, { status: 404 });
    }
    // Talep isteği yapanın işletmesinde (müdürse kendi şubesinde) olmalı
    if (!(await canActOnPersonnel(getDB(), auth, existing.personnel_id))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

    if (auth.role === "employee" && auth.personnel_id !== existing.personnel_id) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    if (existing.status !== "pending") {
      return NextResponse.json({ error: "Sadece bekleyen talepler iptal edilebilir" }, { status: 409 });
    }

    await db.update(leaveRequests).set({ status: "cancelled" }).where(eq(leaveRequests.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Leave request PATCH error:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
