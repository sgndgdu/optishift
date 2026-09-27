import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:8000";

// GET /api/engine/warm — planlama motorunu önceden uyandırır.
// Motorun barındığı Render ücretsiz katmanı ~15 dk boşta kalınca uyur ve ilk istek
// ~25-30 sn gecikir. Vardiya Planı açılınca bu uç arka planda çağrılır; müdür
// "Haftayı Oluştur" sihirbazının adımlarındayken motor ısınır. Yanıt beklenmez:
// kısa zaman aşımıyla kesilse bile gelen istek Render'da uyanmayı başlatır.
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const started = Date.now();
  try {
    const res = await fetch(`${ENGINE_URL}/health`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return NextResponse.json({ warm: res.ok, ms: Date.now() - started });
  } catch {
    // Zaman aşımı = motor uyanıyordu; uyanma yine de başladı
    return NextResponse.json({ warm: false, ms: Date.now() - started });
  }
}
