/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";

// Register sayfasının canlı kod doğrulaması için — kimlik bilgisi
// sızdırmaz, sadece geçerli/geçersiz + kaç ay ücretsiz olduğunu döner.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code")?.trim()?.toUpperCase();
  if (!code) return NextResponse.json({ valid: false });

  try {
    const db = getDB();
    const now = Math.floor(Date.now() / 1000);
    const promo = await db.prepare(`SELECT * FROM promo_codes WHERE code = ? AND active = true`).get(code) as any;

    const valid = !!promo
      && (!promo.expires_at || promo.expires_at >= now)
      && (promo.max_uses == null || promo.used_count < promo.max_uses);

    return NextResponse.json(valid ? { valid: true, free_months: promo.free_months, plan: promo.plan } : { valid: false });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
