// lib/notifications.ts
// SMS, E-posta ve Web Push bildirim wrapper'ları.
// SMS/E-posta mock; Web Push gerçek VAPID ile çalışır.

import { getDB } from "@/lib/db/client";
import webpush from "web-push";


if (process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@optishift.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

/**
 * Belirli bir personelin tüm push subscription'larına bildirim gönderir.
 * Geçersiz subscription'ları otomatik siler.
 */
export async function sendPushToPersonnel(
  personnelId: string,
  orgId: string,
  payload: { title: string; body: string; url?: string },
) {
  if (!process.env.VAPID_PRIVATE_KEY) return;

  const db = getDB();
  let subs: any[] = [];
  try {
    subs = await db.prepare(
      "SELECT * FROM push_subscriptions WHERE personnel_id = ? AND org_id = ?"
    ).all(personnelId, orgId) as any[];
  } finally {
  }

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: payload.title, body: payload.body, url: payload.url ?? "/portal" }),
        );
      } catch {
        // Geçersiz / süresi dolmuş subscription'ı sil
        const db2 = getDB();
        await db2.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(sub.endpoint);
      }
    })
  );
}

export async function sendSMS(phone: string, message: string) {
  // Twilio / Netgsm SDK integration here
  console.log(`\n===========================================`);
  console.log(`📱 [SMS GÖNDERİLDİ - TWILIO MOCK]`);
  console.log(`Alıcı: ${phone}`);
  console.log(`Mesaj: ${message}`);
  console.log(`===========================================\n`);
  
  return { success: true, messageId: `sms_${Date.now()}` };
}

export async function sendEmail(to: string, subject: string, body: string) {
  // SendGrid / AWS SES SDK integration here
  console.log(`\n===========================================`);
  console.log(`📧 [E-POSTA GÖNDERİLDİ - SENDGRID MOCK]`);
  console.log(`Alıcı: ${to}`);
  console.log(`Konu: ${subject}`);
  console.log(`İçerik: ${body}`);
  console.log(`===========================================\n`);
  
  return { success: true, messageId: `email_${Date.now()}` };
}
