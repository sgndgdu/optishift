/**
 * Google ile Giriş — OAuth 2.0 Authorization Code akışı (manuel, next-auth
 * gibi ekstra bir framework olmadan mevcut JWT/cookie oturum modeline uyumlu).
 *
 * Kurulum: Google Cloud Console → APIs & Services → Credentials → OAuth 2.0
 * Client ID (Web application). Yetkili yönlendirme URI'si:
 *   {NEXT_PUBLIC_APP_URL}/api/auth/google/callback
 * Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXT_PUBLIC_APP_URL
 */
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

const STATE_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "optishift-dev-secret-change-in-production"
);
const PENDING_SECRET = STATE_SECRET;

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!_jwks) _jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  return _jwks;
}

function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function isGoogleAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export type GoogleAuthIntent = "login" | "register";

/** CSRF korumalı, kısa ömürlü state token'ı — intent'i (login|register) taşır. */
export async function signGoogleState(intent: GoogleAuthIntent): Promise<string> {
  return new SignJWT({ intent })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(STATE_SECRET);
}

export async function verifyGoogleState(state: string): Promise<{ intent: GoogleAuthIntent } | null> {
  try {
    const { payload } = await jwtVerify(state, STATE_SECRET);
    const intent = payload.intent as string;
    if (intent !== "login" && intent !== "register") return null;
    return { intent };
  } catch {
    return null;
  }
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleProfile {
  googleId: string; // ID token'ın "sub" claim'i
  email: string;
  emailVerified: boolean;
  name: string;
}

/** Authorization code'u değiştirir, id_token'ı doğrular, profili döner. */
export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google token değişimi başarısız: ${text || res.status}`);
  }

  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("Google yanıtında id_token yok");

  const { payload } = await jwtVerify(data.id_token, getJwks(), {
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  if (!payload.iss || !GOOGLE_ISSUERS.includes(payload.iss)) {
    throw new Error("Google id_token issuer doğrulanamadı");
  }
  if (!payload.sub || typeof payload.email !== "string") {
    throw new Error("Google id_token beklenen alanları içermiyor");
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" ? payload.name : payload.email,
  };
}

export interface PendingGoogleProfile {
  googleId: string;
  email: string;
  name: string;
}

/**
 * /register sayfasının org_name adımını tamamlaması için kısa ömürlü, imzalı
 * profil taşıyıcı — Google'a bağlı hiçbir hesap bulunamadığında callback bunu
 * üretir, /api/auth/google/complete-registration bunu doğrulayıp org kurar.
 */
export async function signPendingGoogleProfile(profile: PendingGoogleProfile): Promise<string> {
  return new SignJWT({ ...profile })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(PENDING_SECRET);
}

export async function verifyPendingGoogleProfile(token: string): Promise<PendingGoogleProfile | null> {
  try {
    const { payload } = await jwtVerify(token, PENDING_SECRET);
    if (typeof payload.googleId !== "string" || typeof payload.email !== "string") return null;
    return {
      googleId: payload.googleId,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : payload.email,
    };
  } catch {
    return null;
  }
}
