/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";

// Deneme süresi (lib/plans TRIAL_DAYS ya da kampanya kodu) dolan işletmeleri
// 'expired' olarak işaretler. Ücretsiz paket olmadığı için pakete dokunulmaz;
// erişim kısıtı ödeme sistemi kurulunca eklenecek. Ödeyen aboneler
// (subscription_status='active') etkilenmez.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }
  }

  const db = getDB();
  const now = Math.floor(Date.now() / 1000);

  const expired = await db.prepare(`
    SELECT id, name FROM organizations
    WHERE subscription_status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at < ?
  `).all(now) as any[];

  for (const org of expired) {
    await db.prepare(`
      UPDATE organizations SET subscription_status = 'expired' WHERE id = ?
    `).run(org.id);
  }

  return NextResponse.json({ expired: expired.length, orgs: expired.map((o) => o.name) });
}
