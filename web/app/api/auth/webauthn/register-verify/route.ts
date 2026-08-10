/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import {
  WEBAUTHN_CHALLENGE_COOKIE,
  deviceNameFromUserAgent,
  getOrigin,
  getRpID,
  verifyWebauthnChallenge,
} from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const challengeToken = req.cookies.get(WEBAUTHN_CHALLENGE_COOKIE)?.value;
  const challengeData = challengeToken ? await verifyWebauthnChallenge(challengeToken) : null;
  if (!challengeData || challengeData.userId !== auth.id) {
    return NextResponse.json({ error: "Kayıt oturumu süresi doldu, tekrar deneyin" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  try {
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: getOrigin(),
      expectedRPID: getRpID(),
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Doğrulama başarısız" }, { status: 400 });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const db = getDB();
    await db
      .prepare(
        `INSERT INTO webauthn_credentials
          (user_id, credential_id, public_key, counter, device_type, backed_up, transports, device_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        auth.id,
        credential.id,
        Buffer.from(credential.publicKey).toString("base64"),
        credential.counter,
        credentialDeviceType,
        credentialBackedUp,
        credential.transports ? JSON.stringify(credential.transports) : null,
        deviceNameFromUserAgent(req.headers.get("user-agent"))
      );

    const res = NextResponse.json({ success: true });
    res.cookies.set(WEBAUTHN_CHALLENGE_COOKIE, "", { maxAge: 0, path: "/" });
    return res;
  } catch (err: any) {
    console.error("[webauthn/register-verify]", err);
    return NextResponse.json({ error: "Biyometrik kayıt tamamlanamadı" }, { status: 500 });
  }
}
