"use client";

import { useEffect } from "react";

/**
 * Global oturum bekçisi: herhangi bir /api/* çağrısı 401 dönerse oturum
 * (optishift_session cookie'si) düşmüş demektir — localStorage'daki kullanıcı
 * kalıntısını temizler ve /login'e yönlendirir.
 *
 * Neden gerekli: kimlik iki yerde yaşıyor — JWT cookie (7 gün) API'leri
 * yetkilendirir, localStorage ise UI'ı "girişli" gösterir. Cookie süresi
 * dolunca localStorage kaldığı için sayfalar sonsuz "Yükleniyor…"da
 * takılıyordu (2026-07-05 hatası).
 */

// Bu sayfalardayken yönlendirme yapılmaz (login döngüsü olmasın)
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/join",
  "/setup",
  "/forgot-password",
  "/reset-password",
  "/pricing",
  "/admin", // God Mode kendi oturumunu (optishift_god_session) kendisi yönetir
  "/supervisor/login",
];

// 401'i normal akışın parçası olan endpoint'ler — yönlendirme tetiklemez
const EXCLUDED_API = [
  "/api/auth/",
  "/api/god/",
  "/api/register",
  "/api/invite",
  "/api/webhook",
];

let redirecting = false;

const USER_KEYS = ["optishift_manager_user", "optishift_portal_user", "optishift_supervisor_user"];

// Ekranın gösterdiği hesap (localStorage) ile oturumdaki hesap (cookie) aynı mı? Aynı tarayıcıda
// başka sekmede başka hesaba girilince cookie değişir, ekran eski hesabın adını gösterip yeni hesabın
// verisini çekiyordu (sahip adıyla tek şube görünüyordu, 2026-10-10).
async function checkSameAccount(origFetch: typeof fetch) {
  if (redirecting) return;
  const cur = window.location.pathname;
  if (PUBLIC_PREFIXES.some(p => cur === p || cur.startsWith(p + "/"))) return;
  const shownIds = new Set<string>();
  for (const k of USER_KEYS) {
    try {
      const u = JSON.parse(localStorage.getItem(k) ?? "null");
      if (u?.id) shownIds.add(String(u.id));
    } catch { /* yok say */ }
  }
  if (shownIds.size === 0) return;
  try {
    const res = await origFetch("/api/auth/account", { cache: "no-store" });
    if (!res.ok) return;
    const me = await res.json();
    if (!me?.id || shownIds.has(String(me.id)) || redirecting) return;
    redirecting = true;
    USER_KEYS.forEach(k => localStorage.removeItem(k));
    window.location.href = "/login?switched=1";
  } catch { /* ağ hatası: bir sonraki denemede bakılır */ }
}

export default function SessionGuard() {
  useEffect(() => {
    const w = window as Window & { __optishiftFetchPatched?: boolean };
    if (w.__optishiftFetchPatched) return;
    w.__optishiftFetchPatched = true;

    const origFetch = window.fetch.bind(window);
    void checkSameAccount(origFetch);
    // Sekmeye dönülünce ve başka sekme hesap değiştirince yeniden bakılır
    const onVisible = () => { if (document.visibilityState === "visible") void checkSameAccount(origFetch); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", e => { if (e.key && USER_KEYS.includes(e.key)) void checkSameAccount(origFetch); });
    window.fetch = async (input, init) => {
      const res = await origFetch(input, init);
      try {
        const raw =
          typeof input === "string" ? input
          : input instanceof Request ? input.url
          : String(input);
        const path = raw.startsWith("http") ? new URL(raw).pathname : raw.split("?")[0];

        if (
          res.status === 401 &&
          path.startsWith("/api/") &&
          !EXCLUDED_API.some(p => path.startsWith(p)) &&
          !redirecting
        ) {
          const cur = window.location.pathname;
          const onPublicPage = PUBLIC_PREFIXES.some(p => cur === p || cur.startsWith(p + "/"));
          if (!onPublicPage) {
            redirecting = true;
            localStorage.removeItem("optishift_manager_user");
            localStorage.removeItem("optishift_portal_user");
            localStorage.removeItem("optishift_supervisor_user");
            window.location.href = "/login?expired=1";
          }
        }
      } catch {
        // Bekçi mantığı hiçbir koşulda isteğin kendisini bozmamalı
      }
      return res;
    };
  }, []);

  return null;
}
