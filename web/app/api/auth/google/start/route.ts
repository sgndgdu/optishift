import { NextRequest, NextResponse } from "next/server";
import { buildGoogleAuthUrl, isGoogleAuthConfigured, signGoogleState, type GoogleAuthIntent } from "@/lib/googleAuth";

// GET /api/auth/google/start?intent=login|register
export async function GET(req: NextRequest) {
  if (!isGoogleAuthConfigured()) {
    return NextResponse.json(
      { error: "Google ile giriş bu ortamda henüz yapılandırılmadı." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const intentParam = searchParams.get("intent");
  const intent: GoogleAuthIntent = intentParam === "register" ? "register" : "login";

  const state = await signGoogleState(intent);
  return NextResponse.redirect(buildGoogleAuthUrl(state));
}
