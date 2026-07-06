import { NextRequest, NextResponse } from "next/server";
import { verifyToken, SESSION_COOKIE } from "./lib/auth";
import { verifyGodToken } from "./lib/god-auth";

// Bu path'ler JWT doğrulaması gerektirmez.
const PUBLIC_API_PATHS = [
  "/api/auth/login",
  "/api/register",
  "/api/webhook",
  "/api/god/auth/login",  // God Mode login herkese açık
];

// /api/invites GET isteği: join token sayfası için herkese açık
function isPublicInvitesGet(req: NextRequest): boolean {
  return (
    req.nextUrl.pathname.startsWith("/api/invites") && req.method === "GET"
  );
}

const SPOOFABLE_AUTH_HEADERS = [
  "x-auth-user-id",
  "x-auth-org-id",
  "x-auth-role",
  "x-auth-location-id",
  "x-auth-personnel-id",
  "x-auth-name",
];

// İstemcinin bu header'ları doğrudan göndermesini engeller — route handler'lar bu
// header'lara güvenerek yetki kararı aldığı için, doğrulanmamış bir istekte asla
// istemciden gelen değerlerle geçmemeli.
function stripSpoofableHeaders(req: NextRequest): Headers {
  const headers = new Headers(req.headers);
  for (const h of SPOOFABLE_AUTH_HEADERS) headers.delete(h);
  return headers;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Sadece /api/* route'larını koru
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // Herkese açık endpoint'ler — yine de istemciden gelen sahte auth header'ları temizlenir
  if (PUBLIC_API_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next({ request: { headers: stripSpoofableHeaders(req) } });
  }
  if (isPublicInvitesGet(req)) {
    return NextResponse.next({ request: { headers: stripSpoofableHeaders(req) } });
  }

  // God Mode API'leri — ayrı cookie ile korunur
  // Banner GET herkese açık (tüm layout'lar okur); diğer metodlar ve tüm /api/god/* god auth gerektirir
  if (pathname.startsWith("/api/god/")) {
    const isBannersGet = pathname === "/api/god/banners" && req.method === "GET";
    if (!isBannersGet) {
      const ok = await verifyGodToken(req);
      if (!ok) {
        return NextResponse.json(
          { error: "God Mode yetkisi gerekli" },
          { status: 403 }
        );
      }
    }
    return NextResponse.next({ request: { headers: stripSpoofableHeaders(req) } });
  }

  // JWT doğrulama
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json(
      { error: "Oturum açmanız gerekiyor" },
      { status: 401 }
    );
  }

  const user = await verifyToken(token);
  if (!user) {
    return NextResponse.json(
      { error: "Geçersiz veya süresi dolmuş oturum" },
      { status: 401 }
    );
  }

  // Doğrulanmış kullanıcı bilgisini route handler'a header üzerinden ilet.
  // HTTP header'lar ASCII-only; Türkçe karakterleri encodeURIComponent ile encode et.
  const headers = stripSpoofableHeaders(req);
  headers.set("x-auth-user-id", user.id);
  headers.set("x-auth-org-id", user.org_id);
  headers.set("x-auth-role", user.role);
  if (user.location_id) headers.set("x-auth-location-id", user.location_id);
  if (user.personnel_id) headers.set("x-auth-personnel-id", user.personnel_id);
  if (user.name) headers.set("x-auth-name", encodeURIComponent(user.name));

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
