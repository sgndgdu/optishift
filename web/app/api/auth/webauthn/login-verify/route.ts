/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { getDB } from "@/lib/db/client";
import { setCookie, signToken } from "@/lib/auth";
import { WEBAUTHN_CHALLENGE_COOKIE, getOrigin, getRpID, verifyWebauthnChallenge } from "@/lib/webauthn";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const ATTEMPT_LIMIT = 10;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const ipCheck = checkRateLimit(`webauthn:ip:${clientIp}`, ATTEMPT_LIMIT, WINDOW_MS);
  if (!ipCheck.allowed) {
    return NextResponse.json(
      { error: "Çok fazla deneme. Lütfen biraz sonra tekrar deneyin." },
      { status: 429, headers: { "Retry-After": String(ipCheck.retryAfterSec) } }
    );
  }

  const challengeToken = req.cookies.get(WEBAUTHN_CHALLENGE_COOKIE)?.value;
  const challengeData = challengeToken ? await verifyWebauthnChallenge(challengeToken) : null;
  if (!challengeData) {
    return NextResponse.json({ error: "Giriş oturumu süresi doldu, tekrar deneyin" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const db = getDB();
  try {
    const cred = (await db
      .prepare(`SELECT * FROM webauthn_credentials WHERE credential_id = ?`)
      .get(body.id)) as any;
    if (!cred) {
      return NextResponse.json({ error: "Bu cihaz tanınmıyor, şifreyle giriş yapın" }, { status: 401 });
    }

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: getOrigin(),
      expectedRPID: getRpID(),
      credential: {
        id: cred.credential_id,
        publicKey: new Uint8Array(Buffer.from(cred.public_key, "base64")),
        counter: Number(cred.counter),
        transports: cred.transports ? JSON.parse(cred.transports) : undefined,
      },
    });

    if (!verification.verified) {
      return NextResponse.json({ error: "Doğrulama başarısız" }, { status: 401 });
    }

    const user = (await db.prepare(`SELECT * FROM users WHERE id = ?`).get(cred.user_id)) as any;
    if (!user) return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 401 });

    if (user.approval_status === "pending") {
      return NextResponse.json({ error: "Hesabınız henüz onaylanmadı. Lütfen yöneticinizle iletişime geçin." }, { status: 403 });
    }
    if (user.approval_status === "rejected") {
      return NextResponse.json({ error: "Hesabınız reddedildi. Lütfen yöneticinizle iletişime geçin." }, { status: 403 });
    }

    const now = Math.floor(Date.now() / 1000);
    await db
      .prepare(`UPDATE webauthn_credentials SET counter = ?, last_used_at = ? WHERE credential_id = ?`)
      .run(verification.authenticationInfo.newCounter, now, cred.credential_id);
    db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).run(now, user.id).catch(() => {});

    const userData = {
      id: user.id,
      personnel_id: user.personnel_id ?? null,
      username: user.username,
      email: user.email,
      role: user.role,
      org_id: user.org_id,
      location_id: user.location_id ?? null,
      department_id: user.department_id ?? null,
      name: user.name,
      is_temp_password: !!user.is_temp_password,
    };

    const token = await signToken({
      id: user.id,
      org_id: user.org_id,
      role: user.role,
      location_id: user.location_id ?? null,
      personnel_id: user.personnel_id ?? null,
      name: user.name,
    });

    const res = NextResponse.json(userData);
    setCookie(res, token);
    res.cookies.set(WEBAUTHN_CHALLENGE_COOKIE, "", { maxAge: 0, path: "/" });
    return res;
  } catch (err: any) {
    console.error("[webauthn/login-verify]", err);
    return NextResponse.json({ error: "Giriş başarısız" }, { status: 500 });
  }
}
