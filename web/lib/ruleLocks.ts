/**
 * Müdür izinleri: TEK KAYNAK.
 * Patron (admin) ve bölge müdürü (supervisor) her şube için müdürün hangi alanları
 * değiştirebileceğini seçer: locations.rules.manager_permissions. Varsayılan: hepsine izin.
 * İzin kapalıysa müdür alanı görür ama değiştiremez; sunucu (PATCH /api/locations,
 * /api/personnel, lib/access) müdürün gönderdiği değeri yok sayar / reddeder.
 * manager_permissions'ın kendisini müdür hiçbir zaman değiştiremez.
 */
export type LockCategory = "budget" | "rules" | "features";
export type ManagerPermission = LockCategory | "personnel_delete" | "publish_edit";
export type ManagerPermissions = Record<ManagerPermission, boolean>;

export const MANAGER_PERMISSION_LIST: { key: ManagerPermission; label: string; description: string }[] = [
  { key: "budget", label: "Ücret ve bütçe", description: "Personelin saatlik ücreti, haftalık işçilik ve fazla mesai bütçesi." },
  { key: "rules", label: "Çalışma kuralları", description: "Haftalık saat sınırı, dinlenme, ardışık gün, fazla mesai sınırları, Adalet Puanı ağırlıkları." },
  { key: "features", label: "Ek özellikler", description: "Mesajlaşma, açık vardiya, bahşiş, ortak tablet gibi modülleri açıp kapatma." },
  { key: "personnel_delete", label: "Personel silme", description: "Personeli pasife alma ve hesabını silme." },
  { key: "publish_edit", label: "Yayınlanmış planı onaysız değiştirme", description: "Kapalıysa yayınlanmış haftayı düzenlemek için işletme sahibinin onayı gerekir." },
];

export const LOCKED_RULE_KEYS: Record<LockCategory, readonly string[]> = {
  // Ücret ve bütçe
  budget: ["weekly_labor_budget_try", "weekly_overtime_budget_hours"],
  // Çalışma kuralları: yasal sınırlar, fazla mesai, Adalet Puanı ağırlıkları
  rules: [
    "max_weekly_hours", "min_rest_hours", "max_consecutive_days", "balancing_period_weeks", "max_on_call_per_week",
    "no_night_to_morning", "consecutive_night_weeks_enabled", "night_legal_warning_enabled",
    "clopening_enabled", "clopening_min_rest_hours", "clopening_penalty_weight",
    "overtime_threshold_hours", "max_ytd_overtime_hours", "overtime_fair_distribution",
    "hard_shift_points", "hard_shift_weekend", "hard_shift_night", "hard_shift_preferred_not",
    "hero_bonus_points", "force_bonus_points", "change_compensation_enabled", "change_compensation_points",
    "fairness_window_weeks",
  ],
  // Ek özellikleri açma/kapama
  features: [
    "chat_enabled", "open_shifts_enabled", "shift_bidding_enabled", "handover_log_enabled",
    "personnel_conflicts_enabled", "fatigue_radar_enabled", "compliance_tracking_enabled", "forecasting_enabled",
    "task_management_enabled", "kiosk_mode_enabled", "overtime_tracking_enabled", "tip_pooling_enabled",
  ],
};

export const PERMISSIONS_RULE_KEY = "manager_permissions";

/** Şube kurallarından müdür izinleri (eksik anahtar = izinli). */
export function managerPermissions(rules: unknown): ManagerPermissions {
  const raw = (rules && typeof rules === "object" ? (rules as Record<string, unknown>)[PERMISSIONS_RULE_KEY] : null) as Record<string, unknown> | null;
  const out = {} as ManagerPermissions;
  for (const p of MANAGER_PERMISSION_LIST) out[p.key] = raw?.[p.key] !== false;
  return out;
}

/** Patron ve bölge müdürü her şeyi yapar ve izinleri belirler. */
export function isOwnerRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "supervisor";
}

/** Bu kullanıcı bu şubede bu izne sahip mi? */
export function hasManagerPermission(role: string | null | undefined, rules: unknown, perm: ManagerPermission): boolean {
  if (isOwnerRole(role)) return true;
  if (role !== "manager") return false;
  return managerPermissions(rules)[perm];
}

export const LOCK_NOTE = "Bu ayarı işletme sahibi değiştirir.";

/**
 * Müdürün gönderdiği kurallarda izni olmayan alanları ve izin ayarının kendisini
 * mevcut değerlerle değiştirir: mevcutta varsa eski değer, yoksa anahtar yazılmaz.
 */
export function applyRuleLocks(current: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const perms = managerPermissions(current);
  const out: Record<string, unknown> = { ...incoming };
  const keep = (k: string) => {
    if (Object.prototype.hasOwnProperty.call(current, k)) out[k] = current[k];
    else delete out[k];
  };
  keep(PERMISSIONS_RULE_KEY);
  for (const cat of Object.keys(LOCKED_RULE_KEYS) as LockCategory[]) {
    if (perms[cat]) continue;
    for (const k of LOCKED_RULE_KEYS[cat]) keep(k);
  }
  return out;
}
