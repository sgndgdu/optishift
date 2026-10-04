/**
 * Yöneticinin çalışan görünümü (tarayıcı tarafı): vardiyaya giren yönetici kendi vardiyalarını ve taleplerini
 * çalışan ekranından (portal) yönetir. Sunucu tarafı proxy'de (lib/userAccess EMPLOYEE_VIEW_HEADER): istekler
 * çalışan olarak karşılanır, yetki sadece düşer. Ayrı bir "yöneticinin vardiyaları" sayfası yok (tek yer: portal).
 */
import { EMPLOYEE_VIEW_HEADER } from "@/lib/userAccess";

const PORTAL_KEY = "optishift_portal_user";

type SessionUser = { role?: string; personnel_id?: string | null; location_id?: string | null; [k: string]: unknown };

/** Yönetim panelinden portala geçiş: portal oturum kaydı kişinin kendi şubesiyle yazılır. */
export function openEmployeeView(user: SessionUser, branchId: string) {
  localStorage.setItem(PORTAL_KEY, JSON.stringify({ ...user, location_id: branchId }));
}

/** Portaldaki kişi aslında yönetici mi (çalışan görünümünde). */
export const isEmployeeView = (user: SessionUser | null | undefined) => !!user && user.role !== "employee";

/** Portaldan yönetim paneline dönüş adresi. */
export function managementHome(): string {
  try {
    if (localStorage.getItem("optishift_manager_user")) return "/dashboard";
    if (localStorage.getItem("optishift_supervisor_user")) return "/supervisor";
  } catch { /* yok say */ }
  return "/login";
}

/**
 * Portal açıkken uygulamanın /api isteklerine çalışan görünümü başlığını ekler; geri alma fonksiyonu döner.
 * Sadece yönetici için kurulur (çalışanın isteği zaten çalışan olarak karşılanır).
 */
export function installEmployeeView(branchId: string | null | undefined): () => void {
  const original = window.fetch;
  const patched: typeof fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const sameOriginApi = url.startsWith("/api/") || url.startsWith(`${window.location.origin}/api/`);
    if (!sameOriginApi) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(EMPLOYEE_VIEW_HEADER, branchId ?? "");
    return original(input, { ...init, headers });
  };
  window.fetch = patched;
  return () => { if (window.fetch === patched) window.fetch = original; };
}
