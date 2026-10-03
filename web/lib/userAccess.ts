/**
 * Kişi bazında yönetim yetkisi: TEK KAYNAK.
 * users.permissions (JSON) → oturumda AuthUser.access. Boş = bugünkü gibi tam yetki (geriye uyum).
 * - mode "view":    her şeyi görür, hiçbir şeyi değiştirmez (proxy yazma isteklerini keser)
 * - mode "prepare": planı hazırlar ama yayınlayamaz
 * - mode "publish": hazırlar ve yayınlar (varsayılan)
 * - department_id:  departman şefi; sadece o departmanı görür/planlar, her zaman "prepare"
 * İşletme sahibi (admin) her zaman tam yetkilidir. Değişiklik kişinin bir sonraki girişinde geçerli olur.
 */

export type AccessMode = "view" | "prepare" | "publish";

export interface UserAccess {
  mode: AccessMode;
  department_id?: string | null;
}

const MODES: AccessMode[] = ["view", "prepare", "publish"];

/** users.permissions (metin ya da nesne) → UserAccess; boş/bozuk ise null (= tam yetki). */
export function parseAccess(raw: unknown): UserAccess | null {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const department_id = typeof o.department_id === "string" && o.department_id ? o.department_id : null;
    const mode = MODES.includes(o.mode as AccessMode) ? (o.mode as AccessMode) : "publish";
    // Departman şefi planı yayınlayamaz, müdüre onaya gönderir
    return { mode: department_id && mode === "publish" ? "prepare" : mode, department_id };
  } catch { return null; }
}

/** Kaydetmeden önce doğrula; tam yetki (publish, departmansız) için null döner (alan boş kalır). */
export function normalizeAccess(raw: unknown): string | null {
  const a = parseAccess(raw);
  if (!a || (a.mode === "publish" && !a.department_id)) return null;
  return JSON.stringify(a.department_id ? { mode: a.mode, department_id: a.department_id } : { mode: a.mode });
}

type WithAccess = { role?: string | null; access?: UserAccess | null };

export function accessMode(user: WithAccess | null | undefined): AccessMode {
  if (!user || user.role === "admin") return "publish";
  return user.access?.mode ?? "publish";
}

export const isViewOnly = (user: WithAccess | null | undefined) => accessMode(user) === "view";
export const canPublishPlan = (user: WithAccess | null | undefined) => accessMode(user) === "publish";

/** Departman şefinin departmanı; değilse null. */
export function departmentScope(user: WithAccess | null | undefined): string | null {
  if (!user || user.role === "admin") return null;
  return user.access?.department_id ?? null;
}

export const ACCESS_MODE_LABELS: Record<AccessMode, string> = {
  view: "Sadece görür",
  prepare: "Planı hazırlar",
  publish: "Hazırlar ve yayınlar",
};

export const VIEW_ONLY_ERROR = "Bu hesap sadece görüntüleme yetkisine sahip.";

/**
 * Departman şefinin yapamayacağı yazma işlemleri (proxy tek yerden keser): şube ayarları ve diğer
 * departmanlar, onaylar (izin, takas, düzenleme, mesai şube yöneticisinde), açık vardiya ve dönem işleri.
 * Kendi departmanının ihtiyaç tablosu (PATCH /api/departments) route'ta ayrıca kontrol edilir.
 */
const CHEF_BLOCKED: { prefix: string; methods: string[] }[] = [
  { prefix: "/api/locations", methods: ["POST", "PATCH", "DELETE"] },
  { prefix: "/api/organizations", methods: ["POST", "PATCH", "DELETE"] },
  { prefix: "/api/departments", methods: ["POST", "DELETE"] },
  { prefix: "/api/leave-requests", methods: ["PATCH"] },
  { prefix: "/api/swap-requests", methods: ["PATCH"] },
  { prefix: "/api/shift-edit-requests", methods: ["PATCH"] },
  { prefix: "/api/overtime", methods: ["PATCH"] },
  { prefix: "/api/schedule/edit-requests", methods: ["PATCH"] },
  { prefix: "/api/open-shifts", methods: ["POST", "PATCH", "DELETE"] },
  { prefix: "/api/crews", methods: ["POST", "PATCH", "DELETE"] },
  { prefix: "/api/personnel-conflicts", methods: ["POST", "PATCH", "DELETE"] },
  { prefix: "/api/payroll-periods", methods: ["POST", "PATCH", "DELETE"] },
  { prefix: "/api/score-adjustments", methods: ["POST", "PATCH", "DELETE"] },
  { prefix: "/api/autopilot", methods: ["POST", "PATCH", "DELETE"] },
  { prefix: "/api/self-signup", methods: ["PATCH"] },
];

export function isChefBlocked(user: WithAccess | null | undefined, method: string, path: string): boolean {
  if (!departmentScope(user)) return false;
  return CHEF_BLOCKED.some(r => path.startsWith(r.prefix) && r.methods.includes(method));
}

export const CHEF_BLOCKED_ERROR = "Bu işlem şube yöneticisine ait. Departman şefi sadece kendi departmanının planını ve ekibini yönetir.";
