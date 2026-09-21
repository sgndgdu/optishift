/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sendPushToPersonnel } from "@/lib/notifications";

// POST: Personel acil durum bildirimi gönderir — kendi şubesindeki tüm
// müdür/admin/süpervizörlere anında bildirim + push gider.
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.personnel_id || !auth.location_id) {
    return NextResponse.json({ error: "Konum bilgisi bulunamadı" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const message: string = (body.message ?? "").trim();

  const db = getDB();
  try {
    const person = await db.prepare(`SELECT name FROM personnel WHERE id = ?`).get(auth.personnel_id) as any;
    const senderName = person?.name ?? "Personel";
    const title = `🚨 Acil Durum · ${senderName}`;
    const finalMessage = message || `${senderName} acil bir durum bildirdi. Lütfen en kısa sürede iletişime geçin.`;
    const now = Math.floor(Date.now() / 1000);

    const recipients = await db.prepare(`
      SELECT DISTINCT personnel_id FROM users
      WHERE location_id = ? AND role IN ('manager', 'admin', 'supervisor') AND personnel_id IS NOT NULL
    `).all(auth.location_id) as any[];

    if (recipients.length === 0) {
      return NextResponse.json({ error: "Bu şubede bildirim alacak bir yönetici bulunamadı" }, { status: 404 });
    }

    for (const r of recipients) {
      await db.prepare(`
        INSERT INTO notifications (personnel_id, type, title, message, is_read, created_at)
        VALUES (?, 'emergency', ?, ?, false, ?)
      `).run(r.personnel_id, title, finalMessage, now);

      await sendPushToPersonnel(r.personnel_id, auth.org_id, {
        title,
        body: finalMessage,
        url: "/dashboard",
      });
    }

    return NextResponse.json({ success: true, notified: recipients.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
