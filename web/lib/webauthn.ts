/**
 * Biyometrik giriş (WebAuthn/passkey) — Face ID/Touch ID/parmak izi.
 * Registration ve authentication arasındaki challenge, google auth'taki
 * "signed state token" deseniyle aynı: kısa ömürlü imzalı JWT, httpOnly cookie'de
 * taşınır (ayrı bir DB tablosu gerekmez — bkz. lib/googleAuth.ts).
 */
import { SignJWT, jwtVerify } from "jose";

const CHALLENGE_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "optishift-dev-secret-change-in-production"
);

export const WEBAUTHN_CHALLENGE_COOKIE = "optishift_webauthn_challenge";
export const RP_NAME = "OptiShift";

export function getRpID(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    return new URL(base).hostname;
  } catch {
    return "localhost";
  }
}

export function getOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** userId sadece registration akışında dolu — login akışında henüz kullanıcı bilinmiyor (discoverable credential). */
export async function signWebauthnChallenge(challenge: string, userId?: string): Promise<string> {
  return new SignJWT({ challenge, userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(CHALLENGE_SECRET);
}

export async function verifyWebauthnChallenge(
  token: string
): Promise<{ challenge: string; userId?: string } | null> {
  try {
    const { payload } = await jwtVerify(token, CHALLENGE_SECRET);
    if (typeof payload.challenge !== "string") return null;
    return {
      challenge: payload.challenge,
      userId: typeof payload.userId === "string" ? payload.userId : undefined,
    };
  } catch {
    return null;
  }
}

/** User-Agent'tan kaba bir cihaz adı türetir — kayıtlı cihazlar listesinde gösterilir. */
export function deviceNameFromUserAgent(ua: string | null): string {
  if (!ua) return "Bilinmeyen cihaz";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android cihaz";
  if (/Windows/.test(ua)) return "Windows PC";
  return "Cihaz";
}
