/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { notifyBranchManagers } from "@/lib/managerNotifications";

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
    const senderName = person?.name ?? "Bir ekip üyesi";
    const title = `🚨 Acil Durum · ${senderName}`;
    const finalMessage = message || `${senderName} acil bir durum bildirdi. Lütfen en kısa sürede iletişime geçin.`;

    // Şubenin bütün sorumluları (hesaba bağlı bildirim + telefon bildirimi, lib/managerNotifications)
    const notified = await notifyBranchManagers(db, auth.org_id, auth.location_id ?? "", null, {
      type: "emergency", title, message: finalMessage, link: "/dashboard",
    });
    if (notified === 0) {
      return NextResponse.json({ error: "Bu şubede bildirim alacak bir sorumlu bulunamadı" }, { status: 404 });
    }
    return NextResponse.json({ success: true, notified });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
