/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";

// Kampanya kodu (promo_codes) ile verilen ücretsiz Pro süresi dolan
// organizasyonları 'free' plana düşürür. subscription_status='trialing'
// olan (yani gerçek ödeme yapmamış, sadece kampanyayla Pro'da olan) ve
// trial_ends_at'ı geçmiş org'lar hedeflenir — gerçek ödeyen aboneler
// (subscription_status='active', Stripe webhook'undan gelir) etkilenmez.
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
      UPDATE organizations SET plan = 'free', subscription_status = 'inactive' WHERE id = ?
    `).run(org.id);
  }

  return NextResponse.json({ downgraded: expired.length, orgs: expired.map((o) => o.name) });
}
