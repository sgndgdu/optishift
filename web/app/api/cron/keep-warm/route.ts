import { NextRequest, NextResponse } from "next/server";

// Render'ın free tier'ı ~15 dk hareketsizlikten sonra motoru uyutur; ilk istek
// bu yüzden 30+ sn sürüp timeout'a çarpabilir. Bu cron periyodik olarak
// /health'e ping atarak motoru uyanık tutar (bkz. vercel.json crons).
const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:8000";

export async function GET(req: NextRequest) {
  // Vercel Cron, CRON_SECRET tanımlıysa `Authorization: Bearer <secret>` gönderir.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }
  }

  try {
    const res = await fetch(`${ENGINE_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(20_000),
    });
    return NextResponse.json({ ok: res.ok, engineStatus: res.status });
  } catch (err) {
    // Motor uyanma sürecinde olabilir — bu bir hata değil, ping'in amacı zaten bu.
    return NextResponse.json({ ok: false, error: String(err) }, { status: 200 });
  }
}
