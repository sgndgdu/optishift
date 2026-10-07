/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";


// POST: Yeni push subscription kaydet (veya mevcut olanı güncelle)
// Ekip üyesi: { personnel_id, subscription }. Yönetim paneli (sorumlu, hesap sahibi): { scope: "user", subscription }
// hesaba bağlanır (push_subscriptions.user_id), çalışan kaydı gerekmez. Aynı cihaz son kaydedilen hesaba gider.
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const { personnel_id, subscription, scope } = await req.json();
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });
    }

    if (scope === "user") {
      if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      await db.prepare(`
        INSERT INTO push_subscriptions (user_id, personnel_id, org_id, endpoint, p256dh, auth)
        VALUES (?, NULL, ?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET
          user_id = excluded.user_id, personnel_id = NULL, org_id = excluded.org_id,
          p256dh = excluded.p256dh, auth = excluded.auth
      `).run(auth.id, auth.org_id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth);
      return NextResponse.json({ success: true });
    }

    if (!personnel_id) return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });
    // Personel bu org'a ait mi?
    const person = await db.prepare("SELECT id FROM personnel WHERE id = ? AND org_id = ?").get(personnel_id, auth.org_id);
    if (!person) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    // Endpoint zaten varsa güncelle, yoksa ekle
    await db.prepare(`
      INSERT INTO push_subscriptions (personnel_id, org_id, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        personnel_id = excluded.personnel_id, user_id = NULL,
        p256dh = excluded.p256dh,
        auth = excluded.auth
    `).run(personnel_id, auth.org_id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Aboneliği kaldır (çıkış yaparken)
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "endpoint zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND org_id = ?").run(endpoint, auth.org_id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
