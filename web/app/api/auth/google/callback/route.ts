import { NextRequest, NextResponse } from "next/server";
import { setCookie } from "@/lib/auth";
import { exchangeGoogleCode, verifyGoogleState } from "@/lib/googleAuth";
import { finishGoogleSignIn } from "@/lib/googleSignIn";

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(appUrl(`/login?google_error=denied`));
  }
  if (!code || !state) {
    return NextResponse.redirect(appUrl(`/login?google_error=invalid_request`));
  }

  const stateResult = await verifyGoogleState(state);
  if (!stateResult) {
    return NextResponse.redirect(appUrl(`/login?google_error=invalid_state`));
  }

  let profile;
  try {
    profile = await exchangeGoogleCode(code);
  } catch (err) {
    console.error("Google OAuth exchange error:", err);
    return NextResponse.redirect(appUrl(`/login?google_error=exchange_failed`));
  }

  const result = await finishGoogleSignIn(profile, stateResult);
  const res = NextResponse.redirect(appUrl(result.path));
  if (result.token) setCookie(res, result.token);
  return res;
}
