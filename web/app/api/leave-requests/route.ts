/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leaveRequests } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Database from "better-sqlite3";
import pathMod from "path";
import { requireAuth } from "@/lib/auth";

// GET: Personelin izin taleplerini listele (veya location'daki tüm personelin)
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const personnel_id = searchParams.get("personnel_id");
  const location_id = searchParams.get("location_id");

  // Employee yalnızca kendi taleplerini görebilir
  if (auth.role === "employee" && personnel_id && auth.personnel_id !== personnel_id) {
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  }

  if (personnel_id) {
    const rows = await db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.personnel_id, personnel_id))
      .orderBy(desc(leaveRequests.created_at));
    return NextResponse.json(rows);
  }

  if (location_id) {
    const dbRaw = new Database(pathMod.join(process.cwd(), "optishift.db"));
    try {
      const rows = dbRaw.prepare(`
        SELECT lr.*, p.name as personnel_name FROM leave_requests lr
        JOIN personnel p ON p.id = lr.personnel_id
        WHERE p.primary_location_id = ?
        ORDER BY lr.created_at DESC
      `).all(location_id);
      dbRaw.close();
      return NextResponse.json(rows);
    } catch (err: any) {
      dbRaw.close();
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
    const dbRaw2 = new Database(pathMod.join(process.cwd(), "optishift.db"));
    try {
      const personnelRow = dbRaw2.prepare("SELECT primary_location_id FROM personnel WHERE id = ?").get(personnel_id) as any;
      if (personnelRow?.primary_location_id) {
        const locRow = dbRaw2.prepare("SELECT leave_policy FROM locations WHERE id = ?").get(personnelRow.primary_location_id) as any;
        if (locRow?.leave_policy) {
          let policy: any = {};
          try { policy = JSON.parse(locRow.leave_policy); } catch { /* geçersiz JSON → atla */ }

          // Mazeret zorunluluğu
          if (policy.require_reason && !note?.trim()) {
            dbRaw2.close();
            return NextResponse.json({ error: "Bu lokasyonda izin talebi için mazeret zorunludur." }, { status: 422 });
          }

          // Çoklu gün yasağı
          if (!policy.allow_multi_day && start_date !== end_date) {
            dbRaw2.close();
            return NextResponse.json({ error: "Bu lokasyonda birden fazla gün izin talep edilemez." }, { status: 422 });
          }

          // Maksimum gün kontrolü
          if (policy.allow_multi_day && policy.max_days_per_request) {
            const start = new Date(start_date);
            const end = new Date(end_date);
            const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
            if (dayCount > policy.max_days_per_request) {
              dbRaw2.close();
              return NextResponse.json(
                { error: `Bu lokasyonda tek bir talep için en fazla ${policy.max_days_per_request} gün izin alınabilir.` },
                { status: 422 }
              );
            }
          }
        }
      }
    } finally {
      dbRaw2.close();
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
      const dbRaw = new Database(pathMod.join(process.cwd(), "optishift.db"));
      try {
        const managers = dbRaw.prepare(`
          SELECT personnel_id FROM users
          WHERE location_id = ? AND role IN ('manager', 'admin') AND personnel_id IS NOT NULL
        `).all(auth.location_id) as any[];

        const personnelRow = dbRaw.prepare(`SELECT name FROM personnel WHERE id = ?`).get(personnel_id) as any;
        const pName = personnelRow?.name ?? "Personel";

        for (const mgr of managers) {
          dbRaw.prepare(`
            INSERT INTO notifications (personnel_id, type, title, message, is_read, created_at)
            VALUES (?, 'leave_request', ?, ?, 0, ?)
          `).run(mgr.personnel_id, "Yeni İzin Talebi", `${pName}: ${type} — ${start_date}${end_date !== start_date ? ` - ${end_date}` : ""}`, now);
        }
      } finally {
        dbRaw.close();
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
