/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { WEBAUTHN_CHALLENGE_COOKIE, getRpID, signWebauthnChallenge } from "@/lib/webauthn";

// Kullanıcı adı istemiyoruz — resident/discoverable credential sayesinde
// tarayıcı bu cihazda kayıtlı OptiShift passkey'lerini kendi seçtiriyor;
// kimlik login-verify'da credential_id üzerinden DB'den çözülüyor.
export async function POST() {
  try {
    const options = await generateAuthenticationOptions({
      rpID: getRpID(),
      userVerification: "preferred",
    });

    const token = await signWebauthnChallenge(options.challenge);
    const res = NextResponse.json(options);
    res.cookies.set(WEBAUTHN_CHALLENGE_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 120,
      path: "/",
    });
    return res;
  } catch (err: any) {
    console.error("[webauthn/login-options]", err);
    return NextResponse.json({ error: "Biyometrik giriş başlatılamadı" }, { status: 500 });
  }
}
