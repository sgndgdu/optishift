/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import {
  RP_NAME,
  WEBAUTHN_CHALLENGE_COOKIE,
  getRpID,
  signWebauthnChallenge,
} from "@/lib/webauthn";

// Bu cihazda biyometrik giriş kaydı için options üretir — kullanıcı zaten
// şifreyle giriş yapmış olmalı (requireAuth).
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const existing = (await db
      .prepare(`SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = ?`)
      .all(auth.id)) as any[];

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: getRpID(),
      userID: new TextEncoder().encode(auth.id),
      userName: auth.name,
      userDisplayName: auth.name,
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({
        id: c.credential_id,
        transports: c.transports ? JSON.parse(c.transports) : undefined,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
        authenticatorAttachment: "platform",
      },
    });

    const token = await signWebauthnChallenge(options.challenge, auth.id);
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
    console.error("[webauthn/register-options]", err);
    return NextResponse.json({ error: "Biyometrik kayıt başlatılamadı" }, { status: 500 });
  }
}
