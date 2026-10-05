/**
 * Kişi bazında yönetim yetkisi: TEK KAYNAK (kullanıcı kararı 2026-10-04).
 * İşletme sahibi (admin) her şeyi yapar. Yöneticinin yetkisi kişinin kendisinde durur:
 * users.permissions (JSON) { perms: Perm[], department_id? } → oturumda AuthUser.access.
 * - perms: yetki verilirken tek tek seçilen maddeler (PERM_LIST). Hiçbiri yoksa kişi sadece görür.
 * - department_id: departman yöneticisi (şef); sadece CHEF_PERMS verilebilir, kapsamı kendi departmanı.
 * Boş alan = tam yetki (geriye uyum). Eski { mode } kayıtları okunurken maddelere çevrilir.
 * Eskiden şube bazlı ikinci bir izin sistemi vardı (locations.rules.manager_permissions); kalktı.
 * Ek özellikleri açıp kapatma sadece işletme sahibinde. Değişiklik kişinin bir sonraki girişinde geçerli.
 */

export type Perm = "prepare" | "publish" | "approvals" | "team" | "plan_settings" | "budget" | "cross_branch" | "delegate";

export const PERM_LIST: { key: Perm; label: string; description: string }[] = [
  { key: "prepare", label: "Planı hazırlama", description: "Vardiya planını ve ihtiyaç tablosunu hazırlar." },
  { key: "publish", label: "Planı yayınlama", description: "Planı ekibe yayınlar, yayınlanmış planı değiştirir." },
  { key: "approvals", label: "Onaylar", description: "İzin, takas, fazla mesai ve saat düzeltme taleplerini onaylar." },
  { key: "team", label: "Ekip", description: "Kişi ekler, çıkarır, kişi kartını ve belgeleri düzenler." },
  { key: "plan_settings", label: "Plan ayarları", description: "Vardiya saatleri, çalışma kuralları, açık vardiya ve Adalet Puanı." },
  { key: "budget", label: "Ücret ve bütçe", description: "Ücretler, bütçe, bahşiş ve puantaj." },
  { key: "cross_branch", label: "Başka şubeden kişi", description: "Çalışanı başka şubelerde de çalıştırır, şube rotasyonu belirler." },
  { key: "delegate", label: "Başkasına yetki verme", description: "Kendi kapsamında başkasını sorumlu yapar, en fazla kendi yetkilerini verir." },
];

export const ALL_PERMS: Perm[] = PERM_LIST.map(p => p.key);
/** Departman yöneticisine verilebilen maddeler (diğerleri şube geneli işlerdir). */
export const CHEF_PERMS: Perm[] = ["prepare", "publish", "team"];

export interface UserAccess {
  perms: Perm[];
  department_id?: string | null;
}

/** Yayınlayan hazırlar da: listeyi tutarlı hale getirir, şefte şube geneli maddeleri atar. */
function cleanPerms(list: Perm[], chef: boolean): Perm[] {
  const set = new Set(list.filter(p => ALL_PERMS.includes(p)));
  if (set.has("publish")) set.add("prepare");
  return ALL_PERMS.filter(p => set.has(p) && (!chef || CHEF_PERMS.includes(p)));
}

/** Eski kayıt ({ mode }) → maddeler. */
function permsFromMode(mode: unknown, chef: boolean): Perm[] {
  if (mode === "view") return [];
  if (mode === "prepare" || (mode === undefined && chef)) return ALL_PERMS.filter(p => p !== "publish" && p !== "delegate");
  return ALL_PERMS;
}

/** users.permissions (metin ya da nesne) → UserAccess; boş/bozuk ise null (= tam yetki). */
export function parseAccess(raw: unknown): UserAccess | null {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const department_id = typeof o.department_id === "string" && o.department_id ? o.department_id : null;
    const list = Array.isArray(o.perms) ? (o.perms as Perm[]) : permsFromMode(o.mode, !!department_id);
    return { perms: cleanPerms(list, !!department_id), department_id };
  } catch { return null; }
}

/** Kaydetmeden önce doğrula; tam yetki (her madde, departmansız) için null döner (alan boş kalır). */
export function normalizeAccess(raw: unknown): string | null {
  const a = parseAccess(raw);
  if (!a || (!a.department_id && a.perms.length === ALL_PERMS.length)) return null;
  return JSON.stringify(a.department_id ? { perms: a.perms, department_id: a.department_id } : { perms: a.perms });
}

type WithAccess = { role?: string | null; access?: UserAccess | null };

/** Bu kişinin yetki maddeleri: sahip hepsi, çalışan hiçbiri, yönetici kendi listesi (boş alan = hepsi). */
export function userPerms(user: WithAccess | null | undefined): Perm[] {
  if (!user || user.role === "admin") return ALL_PERMS;
  if (user.role !== "manager" && user.role !== "supervisor") return [];
  return user.access ? user.access.perms : ALL_PERMS;
}

export const hasPerm = (user: WithAccess | null | undefined, perm: Perm): boolean => userPerms(user).includes(perm);

/** Hiçbir maddesi olmayan yönetici: her şeyi görür, hiçbir şeyi değiştirmez (proxy yazmaları keser). */
export const isViewOnly = (user: WithAccess | null | undefined) =>
  (user?.role === "manager" || user?.role === "supervisor") && userPerms(user).length === 0;
export const canPublishPlan = (user: WithAccess | null | undefined) => hasPerm(user, "publish");

/** Departman şefinin departmanı; değilse null. */
export function departmentScope(user: WithAccess | null | undefined): string | null {
  if (!user || user.role === "admin") return null;
  return user.access?.department_id ?? null;
}

/** Bu kişi başkasına yetki verebilir mi (sahip ya da "Başkasına yetki verme" maddesi). */
export const canDelegate = (user: WithAccess | null | undefined) => hasPerm(user, "delegate");

/** Yetki verenin verebileceği maddeler: en fazla kendi maddeleri. */
export function grantablePerms(granter: WithAccess | null | undefined): Perm[] {
  return userPerms(granter);
}

/** İstenen maddeleri verenin yetkisiyle sınırlar. */
export function capPerms(wanted: Perm[], granter: WithAccess | null | undefined): Perm[] {
  const can = grantablePerms(granter);
  return wanted.filter(p => can.includes(p));
}

/**
 * Hesap kademesi: işletme sahibi 4 > bölge müdürü (birden çok şube) 3 > şube müdürü 2 > şef 1 > çalışan 0.
 * Kimse kendi kademesindeki ya da üstündeki hesabı yönetemez; yönetici hesabını yönetmek için
 * ayrıca "Başkasına yetki verme" gerekir (lib/access canManageAccount).
 */
export function accountLevel(role: string | null | undefined, access: UserAccess | null | undefined): number {
  if (role === "admin") return 4;
  if (role === "supervisor") return 3;
  if (role === "manager") return access?.department_id ? 1 : 2;
  return 0;
}

/** Menüde yetkiye bağlı sayfalar: yetkisi olmayana sayfa hiç gösterilmez (Sidebar, MobileTabBar). */
export const PAGE_PERMS: Record<string, Perm> = { "/requests": "approvals", "/tip-pools": "budget" };
export const canSeePage = (user: WithAccess | null | undefined, href: string) => !PAGE_PERMS[href] || hasPerm(user, PAGE_PERMS[href]);

/**
 * Çalışan görünümü: vardiyaya giren yönetici kendi vardiyalarını çalışan ekranından (portal) görür ve talep açar.
 * Portal bu başlığı (değeri: kişinin şubesi) gönderir; proxy isteği ÇALIŞAN olarak karşılar (yetki sadece düşer):
 * rol employee, yetki maddeleri ve bölge kapsamı yok, sadece kendi kaydı. Kişi kaydı (personnel_id) yoksa yok sayılır.
 */
export const EMPLOYEE_VIEW_HEADER = "x-optishift-employee-view";

export const VIEW_ONLY_ERROR = "Bu hesap sadece görüntüleme yetkisine sahip.";

/**
 * Yazma isteği → gereken madde: TEK TABLO (proxy uygular, sadece yönetici hesaplarına).
 * Yol eşleşmesi parça bazlıdır: "/api/personnel" "/api/personnel-documents"i kapsamaz.
 * Burada olmayan ayrıntılar route'larda: ücret alanı (budget), şubeler arası alanlar (cross_branch),
 * şube ayarlarındaki alan grupları (lib/ruleLocks), yayın satırı ve yayınlanmış hafta (publish),
 * departman ihtiyaç tablosu (prepare) ve yetki verme (delegate, /api/users).
 */
const W = ["POST", "PUT", "PATCH", "DELETE"];
export const PERM_ROUTES: { path: string; methods: string[]; perm: Perm; exact?: boolean }[] = [
  { path: "/api/generate", methods: W, perm: "prepare" },
  { path: "/api/shifts", methods: W, perm: "prepare" },
  { path: "/api/schedule/shift-proposals", methods: ["POST"], perm: "prepare" },
  { path: "/api/plan-submissions", methods: W, perm: "prepare" },
  { path: "/api/schedule/publish", methods: W, perm: "publish" },
  { path: "/api/schedule/edit-requests", methods: ["PATCH"], perm: "publish" },
  { path: "/api/leave-requests", methods: ["PATCH"], perm: "approvals" },
  { path: "/api/swap-requests", methods: ["PATCH"], perm: "approvals" },
  { path: "/api/shift-edit-requests", methods: ["PATCH"], perm: "approvals" },
  { path: "/api/overtime", methods: ["PATCH"], perm: "approvals", exact: true },
  { path: "/api/personnel", methods: W, perm: "team" },
  { path: "/api/personnel-documents", methods: W, perm: "team" },
  { path: "/api/personnel-conflicts", methods: W, perm: "team" },
  { path: "/api/self-signup", methods: ["PATCH"], perm: "team" },
  { path: "/api/invite", methods: ["POST"], perm: "team" },
  { path: "/api/departments", methods: ["POST", "DELETE"], perm: "plan_settings" },
  { path: "/api/locations/roles", methods: W, perm: "plan_settings" },
  { path: "/api/open-shifts", methods: W, perm: "plan_settings" },
  { path: "/api/score-adjustments", methods: W, perm: "plan_settings" },
  { path: "/api/autopilot", methods: W, perm: "plan_settings" },
  { path: "/api/payroll-periods", methods: W, perm: "budget" },
  { path: "/api/tip-pools", methods: W, perm: "budget" },
];

const pathMatches = (path: string, rule: { path: string; exact?: boolean }) =>
  path === rule.path || (!rule.exact && path.startsWith(rule.path + "/"));

/** Bu yazma isteği için eksik madde (yoksa null). Sahip ve çalışan için her zaman null. */
export function missingPerm(user: WithAccess | null | undefined, method: string, path: string): Perm | null {
  if (user?.role !== "manager" && user?.role !== "supervisor") return null;
  const rule = PERM_ROUTES.find(r => r.methods.includes(method) && pathMatches(path, r));
  return rule && !hasPerm(user, rule.perm) ? rule.perm : null;
}

export const permError = (perm: Perm) =>
  `Bu işlem için "${PERM_LIST.find(p => p.key === perm)?.label}" yetkisi gerekiyor. Hesap sahibi verebilir.`;

/**
 * Departman şefinin hiç yapamayacağı yazma işlemleri (proxy tek yerden keser): şube ayarları, onaylar,
 * açık vardiya ve dönem işleri. Bunlar şube genelidir, şefin maddeleri (CHEF_PERMS) bunları kapsamaz.
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

export const CHEF_BLOCKED_ERROR = "Bu işlem şube sorumlusuna ait. Departman sorumlusu sadece kendi departmanının planını ve ekibini yönetir.";
