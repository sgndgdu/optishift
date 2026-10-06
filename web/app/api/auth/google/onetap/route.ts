import { NextRequest, NextResponse } from "next/server";
import { setCookie } from "@/lib/auth";
import { isGoogleAuthConfigured, signGoogleState, verifyGoogleIdToken, verifyGoogleState } from "@/lib/googleAuth";
import { finishGoogleSignIn } from "@/lib/googleSignIn";

// Tek dokunuşla giriş (Google'ın sağ üstte çıkan "... olarak devam et" kartı).
// GET: istemci kimliği + tek kullanımlık nonce (imzalı, 10 dk). POST: kartın verdiği id_token.
// Karar yönlendirmeli girişle aynı (lib/googleSignIn), sayfa yönlenmesi istemcide yapılır.
export async function GET() {
  if (!isGoogleAuthConfigured()) return NextResponse.json({ enabled: false });
  return NextResponse.json({
    enabled: true,
    client_id: process.env.GOOGLE_CLIENT_ID,
    nonce: await signGoogleState("login"),
  });
}

export async function POST(req: NextRequest) {
  if (!isGoogleAuthConfigured()) {
    return NextResponse.json({ error: "Google ile giriş kapalı" }, { status: 503 });
  }
  try {
    const { credential } = await req.json();
    if (typeof credential !== "string") {
      return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
    }
    const { profile, nonce } = await verifyGoogleIdToken(credential);
    const stateResult = nonce ? await verifyGoogleState(nonce) : null;
    if (!stateResult || stateResult.intent !== "login") {
      return NextResponse.json({ redirect: "/login?google_error=invalid_state" });
    }
    const result = await finishGoogleSignIn(profile, stateResult);
    const res = NextResponse.json({ redirect: result.path });
    if (result.token) setCookie(res, result.token);
    return res;
  } catch (err) {
    console.error("Google one tap error:", err);
    return NextResponse.json({ redirect: "/login?google_error=exchange_failed" });
  }
}
