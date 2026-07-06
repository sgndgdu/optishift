import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

// Lazy: build sırasında (Next.js "collecting page data" adımı route dosyalarını
// import eder) JWT_SECRET henüz mevcut olmayabilir — secret sadece gerçekten
// sign/verify çağrıldığında (runtime'da) çözülür, import anında değil.
let _jwtSecret: Uint8Array | null = null;
function getJwtSecret(): Uint8Array {
  if (_jwtSecret) return _jwtSecret;
  const secret = process.env.JWT_SECRET;
  if (secret) {
    _jwtSecret = new TextEncoder().encode(secret);
    return _jwtSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET ortam değişkeni prod'da zorunludur — oturum güvenliği için tanımlanmadan uygulama başlatılamaz."
    );
  }
  _jwtSecret = new TextEncoder().encode("optishift-dev-secret-change-in-production");
  return _jwtSecret;
}

export const SESSION_COOKIE = "optishift_session";

export interface AuthUser {
  id: string;
  org_id: string;
  role: string;
  location_id: string | null;
  personnel_id: string | null;
  name: string;
}

export async function signToken(user: AuthUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as AuthUser;
  } catch {
    return null;
  }
}

// Middleware tarafından set edilen header'lardan user okur.
export function getAuthUser(req: NextRequest): AuthUser | null {
  const id = req.headers.get("x-auth-user-id");
  if (!id) return null;
  return {
    id,
    org_id: req.headers.get("x-auth-org-id") ?? "",
    role: req.headers.get("x-auth-role") ?? "",
    location_id: req.headers.get("x-auth-location-id") ?? null,
    personnel_id: req.headers.get("x-auth-personnel-id") ?? null,
    name: decodeURIComponent(req.headers.get("x-auth-name") ?? ""),
  };
}

// Route handler'larda kullan: user yoksa 401 döner, varsa user döner.
export function requireAuth(req: NextRequest): AuthUser | NextResponse {
  const user = getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Oturum açmanız gerekiyor" },
      { status: 401 }
    );
  }
  return user;
}

export function setCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 gün
    path: "/",
  });
}

export function clearCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
  });
}
