import { NextRequest, NextResponse } from "next/server";
import { signGodToken, setGodCookie } from "@/lib/god-auth";

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    const godPassword = process.env.GOD_MODE_PASSWORD;
    if (!godPassword) {
      return NextResponse.json({ error: "God Mode yapılandırılmamış" }, { status: 503 });
    }

    if (!password || password !== godPassword) {
      return NextResponse.json({ error: "Hatalı şifre" }, { status: 401 });
    }

    const token = await signGodToken();
    const res = NextResponse.json({ ok: true });
    setGodCookie(res, token);
    return res;
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
