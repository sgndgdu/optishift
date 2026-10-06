import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { buildGoogleAuthUrl, isGoogleAuthConfigured, signGoogleState, type GoogleAuthIntent } from "@/lib/googleAuth";

// GET /api/auth/google/start?intent=login|register|link|join[&token=kayıt bağlantısı]
// link: davet bağlantısıyla açılmış oturumdaki hesaba Gmail bağlanır (şifre belirlemek yerine)
export async function GET(req: NextRequest) {
  if (!isGoogleAuthConfigured()) {
    return NextResponse.json(
      { error: "Google ile giriş bu ortamda henüz yapılandırılmadı." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const intentParam = searchParams.get("intent");
  if (intentParam === "link") {
    const auth = getAuthUser(req);
    if (!auth) return NextResponse.redirect(new URL("/login", req.url));
    return NextResponse.redirect(buildGoogleAuthUrl(await signGoogleState("link", { userId: auth.id })));
  }
  if (intentParam === "join") {
    const signupToken = searchParams.get("token");
    if (!signupToken) return NextResponse.redirect(new URL("/login", req.url));
    return NextResponse.redirect(buildGoogleAuthUrl(await signGoogleState("join", { signupToken })));
  }
  const intent: GoogleAuthIntent = intentParam === "register" ? "register" : "login";

  const state = await signGoogleState(intent);
  return NextResponse.redirect(buildGoogleAuthUrl(state));
}
