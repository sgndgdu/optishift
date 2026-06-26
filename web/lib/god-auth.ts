import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const GOD_COOKIE = "optishift_god_session";

function getGodSecret(): Uint8Array {
  const secret = process.env.GOD_MODE_JWT_SECRET ?? "god-mode-dev-secret-change-in-production";
  return new TextEncoder().encode(secret);
}

export async function signGodToken(): Promise<string> {
  return new SignJWT({ god: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("4h")
    .sign(getGodSecret());
}

export async function verifyGodToken(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(GOD_COOKIE)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, getGodSecret());
    return true;
  } catch {
    return false;
  }
}

export function setGodCookie(res: NextResponse, token: string): void {
  res.cookies.set(GOD_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 4, // 4 saat
    path: "/",
  });
}

export function clearGodCookie(res: NextResponse): void {
  res.cookies.set(GOD_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
  });
}

/** API route'larında kullan — yetkisizse 403 döner */
export async function requireGodAuth(req: NextRequest): Promise<NextResponse | null> {
  const ok = await verifyGodToken(req);
  if (!ok) {
    return NextResponse.json({ error: "God Mode yetkisi gerekli" }, { status: 403 });
  }
  return null;
}
