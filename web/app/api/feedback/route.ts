import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { logPlatformEvent } from "@/lib/platform-logger";

/**
 * "Yakında" özellikler için ilgi ve görüş (ör. bahşiş dağıtımı, kullanıcı kararı 2026-10-05).
 * Ayrı tablo yok: platform_events'e "feature_interest" olarak yazılır, God Mode işletme sayfasında görünür.
 * Body: { feature: string, answer: "want" | "no", note?: string }
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const feature = String(body.feature ?? "").slice(0, 40);
  const answer = body.answer === "no" ? "no" : "want";
  const note = String(body.note ?? "").trim().slice(0, 1000);
  if (!feature) return NextResponse.json({ error: "feature zorunlu" }, { status: 400 });
  let orgName: string | null = null;
  try { orgName = ((await getDB().prepare("SELECT name FROM organizations WHERE id = ?").get(auth.org_id)) as { name?: string } | null)?.name ?? null; } catch { /* ad olmadan da yazılır */ }
  await logPlatformEvent("feature_interest", auth.org_id, orgName, {
    feature, answer, note, role: auth.role, user: auth.name, user_id: auth.id,
  });
  return NextResponse.json({ ok: true });
}
