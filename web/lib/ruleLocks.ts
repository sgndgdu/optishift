/**
 * Müdür için kilitli şube ayarları: TEK KAYNAK.
 * Bu alanları sadece işletme sahibi (admin) ve bölge müdürü (supervisor) değiştirir;
 * müdür görür ama değiştiremez. Sunucu (PATCH /api/locations) müdürün gönderdiği
 * değerleri yok sayar, Ayarlar ekranı alanları kilitli gösterir.
 * Ayrıca: personel saatlik ücreti (/api/personnel) ve personeli pasife alma da müdüre kapalı.
 */
export type LockCategory = "budget" | "rules" | "features";

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

export const ALL_LOCKED_RULE_KEYS: readonly string[] = Object.values(LOCKED_RULE_KEYS).flat();

/** Bu rol kilitli alanları değiştirebilir mi? */
export function canEditLockedSettings(role: string | null | undefined): boolean {
  return role === "admin" || role === "supervisor";
}

export const LOCK_NOTE = "Bu ayarı işletme sahibi veya bölge müdürü değiştirir.";

/**
 * Müdürün gönderdiği kurallarda kilitli alanları mevcut değerlerle değiştirir:
 * mevcutta varsa eski değer, yoksa anahtar hiç yazılmaz (varsayılan geçerli kalır).
 */
export function applyRuleLocks(current: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...incoming };
  for (const k of ALL_LOCKED_RULE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(current, k)) out[k] = current[k];
    else delete out[k];
  }
  return out;
}
