import { NextRequest, NextResponse } from "next/server";
import { verifyToken, SESSION_COOKIE } from "./lib/auth";
import { verifyGodToken } from "./lib/god-auth";
import { CHEF_BLOCKED_ERROR, EMPLOYEE_VIEW_HEADER, isChefBlocked, isViewOnly, missingPerm, permError, VIEW_ONLY_ERROR } from "./lib/userAccess";

// Bu path'ler JWT doğrulaması gerektirmez.
const PUBLIC_API_PATHS = [
  "/api/auth/login",
  "/api/register",
  "/api/webhook",
  "/api/promo/validate",  // register sayfası canlı kod doğrulaması — henüz oturum yok
  "/api/god/auth/login",  // God Mode login herkese açık
  "/api/cron/",  // Vercel Cron — kendi CRON_SECRET kontrolüyle korunur, JWT gerekmez
  "/api/auth/google/start",              // Google OAuth başlatma — henüz oturum yok
  "/api/auth/google/callback",           // Google'ın geri döndüğü nokta — henüz oturum yok
  "/api/auth/google/onetap",             // tek dokunuşla giriş — Google imzalı id_token + imzalı nonce kendi doğrulamasını sağlar
  "/api/auth/google/complete-registration", // pending_token'ın kendisi doğrulama sağlar
  "/api/auth/forgot-password",           // oturumu olmayan kullanıcı içindir
  "/api/auth/reset-password",            // e-postadaki token'ın kendisi doğrulama sağlar
  "/api/kiosk/",                         // ortak tablet — requireAuth kullanmaz, PIN kendi kimlik doğrulamasını sağlar (bkz. lib/kiosk-auth.ts)
  // DİKKAT: /api/auth/google/session buraya EKLENMEMELİ — callback'in az önce
  // set ettiği oturum cookie'sini JWT doğrulamasıyla okumak zorunda.
  // DİKKAT: /api/auth/setup da EKLENMEMELİ — GET /api/invite'ın başlattığı
  // oturum cookie'siyle çalışır.
];

// /setup sayfası: geçici-şifre davet token'ı → oturum başlatır, henüz oturum yok.
// POST /api/invite (davet linki OLUŞTURMA) bilinçli olarak dışarıda — JWT ister.
function isPublicInviteRequest(req: NextRequest): boolean {
  return req.nextUrl.pathname === "/api/invite" && req.method === "GET";
}

// Kalıcı personel kendi-kendine-kayıt linki: token'ın kendisi kimlik doğrulamasını
// sağlar (GET doğrular, POST kaydı tamamlar). DİKKAT: PATCH (link oluşturma/kapatma)
// buraya EKLENMEMELİ — sadece requireAuth ile manager/admin/supervisor yapabilmeli,
// yoksa herkes başka bir organizasyonun linkini kapatıp yenisini üretebilir.
function isPublicSelfSignupRequest(req: NextRequest): boolean {
  return req.nextUrl.pathname === "/api/self-signup" && (req.method === "GET" || req.method === "POST");
}

const SPOOFABLE_AUTH_HEADERS = [
  "x-auth-user-id",
  "x-auth-org-id",
  "x-auth-role",
  "x-auth-location-id",
  "x-auth-personnel-id",
  "x-auth-name",
  "x-auth-managed-locations",
  "x-auth-access",
  EMPLOYEE_VIEW_HEADER,
];

// İstemcinin bu header'ları doğrudan göndermesini engeller — route handler'lar bu
// header'lara güvenerek yetki kararı aldığı için, doğrulanmamış bir istekte asla
// istemciden gelen değerlerle geçmemeli.
// "Sadece görür" yetkili hesabın yine de yapabileceği yazma işlemleri: kendi hesabı, mesajlaşma,
// bildirimler ve soru soran asistan (kayıt değiştirmez).
const VIEW_ONLY_WRITE_PATHS = ["/api/auth/", "/api/messages", "/api/chat", "/api/notifications", "/api/push", "/api/copilot/chat",
  "/api/schedule/publications"]; // arşivden plan okuma (POST ile)

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
  if (isPublicSelfSignupRequest(req)) {
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

  // Çalışan görünümü (lib/userAccess EMPLOYEE_VIEW_HEADER): vardiyaya giren yönetici portaldan kendi işlerini yapar.
  // Sadece yetki düşürür: rol employee olur, maddeler ve bölge kapsamı düşer. Şube, kişinin kapsamındaysa alınır.
  const viewLoc = req.headers.get(EMPLOYEE_VIEW_HEADER);
  if (viewLoc !== null && user.role !== "employee" && user.personnel_id) {
    const inScope = user.role === "admin"
      || (user.role === "manager" && viewLoc === user.location_id)
      || (user.role === "supervisor" && (!user.managed_location_ids?.length || user.managed_location_ids.includes(viewLoc)));
    user.role = "employee";
    user.location_id = inScope && viewLoc ? viewLoc : user.location_id;
    user.managed_location_ids = null;
    user.access = null;
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
  if (user.managed_location_ids?.length) headers.set("x-auth-managed-locations", JSON.stringify(user.managed_location_ids));
  if (user.access) headers.set("x-auth-access", JSON.stringify(user.access));

  // Kişi bazında yetki (lib/userAccess): hiçbir maddesi olmayan ("sadece görür") hesabın yazma isteklerini tek yerde kes
  if (isViewOnly(user) && !["GET", "HEAD", "OPTIONS"].includes(req.method)
      && !VIEW_ONLY_WRITE_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.json({ error: VIEW_ONLY_ERROR }, { status: 403 });
  }
  if (isChefBlocked(user, req.method, pathname)) {
    return NextResponse.json({ error: CHEF_BLOCKED_ERROR }, { status: 403 });
  }
  // Yöneticinin seçilmiş yetki maddeleri (lib/userAccess PERM_ROUTES): eksik maddede yazma kesilir
  const missing = missingPerm(user, req.method, pathname);
  if (missing) return NextResponse.json({ error: permError(missing) }, { status: 403 });

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
