import { NextRequest, NextResponse } from "next/server";
import { verifyToken, SESSION_COOKIE } from "./lib/auth";
import { verifyGodToken } from "./lib/god-auth";

// Bu path'ler JWT doğrulaması gerektirmez.
const PUBLIC_API_PATHS = [
  "/api/auth/login",
  "/api/register",
  "/api/webhook",
  "/api/god/auth/login",  // God Mode login herkese açık
  "/api/cron/",  // Vercel Cron — kendi CRON_SECRET kontrolüyle korunur, JWT gerekmez
  "/api/auth/google/start",              // Google OAuth başlatma — henüz oturum yok
  "/api/auth/google/callback",           // Google'ın geri döndüğü nokta — henüz oturum yok
  "/api/auth/google/complete-registration", // pending_token'ın kendisi doğrulama sağlar
  "/api/auth/forgot-password",           // oturumu olmayan kullanıcı içindir
  "/api/auth/reset-password",            // e-postadaki token'ın kendisi doğrulama sağlar
  // DİKKAT: /api/auth/google/session buraya EKLENMEMELİ — callback'in az önce
  // set ettiği oturum cookie'sini JWT doğrulamasıyla okumak zorunda.
  // DİKKAT: /api/auth/setup da EKLENMEMELİ — GET /api/invite'ın başlattığı
  // oturum cookie'siyle çalışır.
];

// Davet/katılım istekleri: henüz oturum yok, token'ın kendisi doğrulama sağlar.
// POST'lar (davet OLUŞTURMA) bilinçli olarak dışarıda — JWT ister.
function isPublicInviteRequest(req: NextRequest): boolean {
  const { pathname } = req.nextUrl;
  // /join sayfası: token doğrula (GET) + kayıt tamamla (PATCH)
  if (pathname === "/api/invites" && (req.method === "GET" || req.method === "PATCH")) return true;
  // /setup sayfası: geçici-şifre davet token'ı → oturum başlat
  if (pathname === "/api/invite" && req.method === "GET") return true;
  return false;
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
  if (isPublicInviteRequest(req)) {
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
