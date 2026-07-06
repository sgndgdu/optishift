import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { signGodToken, setGodCookie } from "@/lib/god-auth";
import { checkRateLimit, resetRateLimit, getClientIp } from "@/lib/rate-limit";

const GOD_ATTEMPT_LIMIT = 5;
const GOD_WINDOW_MS = 15 * 60 * 1000;

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    const godPassword = process.env.GOD_MODE_PASSWORD;
    if (!godPassword) {
      return NextResponse.json({ error: "God Mode yapılandırılmamış" }, { status: 503 });
    }

    const rateKey = `god-login:${getClientIp(req)}`;
    const rate = checkRateLimit(rateKey, GOD_ATTEMPT_LIMIT, GOD_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: `Çok fazla başarısız deneme. Lütfen ${Math.ceil(rate.retryAfterSec / 60)} dakika sonra tekrar deneyin.`,
        },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
      );
    }

    if (!password || !safeCompare(password, godPassword)) {
      return NextResponse.json({ error: "Hatalı şifre" }, { status: 401 });
    }

    resetRateLimit(rateKey);
    const token = await signGodToken();
    const res = NextResponse.json({ ok: true });
    setGodCookie(res, token);
    return res;
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
