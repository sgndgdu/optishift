import { NextRequest, NextResponse } from "next/server";
import { verifyToken, SESSION_COOKIE } from "./lib/auth";

// Bu path'ler JWT doğrulaması gerektirmez.
const PUBLIC_API_PATHS = [
  "/api/auth/login",
  "/api/register",
  "/api/webhook",
];

// /api/invites GET isteği: join token sayfası için herkese açık
function isPublicInvitesGet(req: NextRequest): boolean {
  return (
    req.nextUrl.pathname.startsWith("/api/invites") && req.method === "GET"
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Sadece /api/* route'larını koru
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // Herkese açık endpoint'ler
  if (PUBLIC_API_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (isPublicInvitesGet(req)) return NextResponse.next();

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
  const headers = new Headers(req.headers);
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
