/**
 * Şube bazlı özellik aç/kapa bayraklarının TEK KAYNAĞI (`locations.rules.*`).
 *
 * Eskiden her sayfa kendi kontrolünü yazıyordu: varsayılan açık özellikler
 * `!== false`, varsayılan kapalı (ileri seviye) özellikler `=== true` ile
 * okunuyordu ve hangisinin hangisi olduğu Sidebar'daki `requireTrue` gibi
 * bayraklarla ayrıca tekrar ediliyordu. Artık menü, ana sayfa, vardiya planı
 * ve personel formu aynı tablodan okur; kapalı bir özelliğin menüsü, ikonu
 * ve sütunu hiçbir ekranda görünmez.
 *
 * Sadece okuma tarafıdır: değerler Ayarlar sayfasından `rules` JSON'una yazılır,
 * API tarafındaki kontroller olduğu gibi kalır.
 */

/** Anahtar yoksa geçerli olan değer. true = varsayılan açık, false = varsayılan kapalı. */
export const MODULE_DEFAULTS = {
  // Temel özellikler (varsayılan açık, müdür kapatabilir)
  chat_enabled:                    true,
  leave_requests_enabled:          true,
  open_shifts_enabled:             true,
  swap_requests_enabled:           true,
  edit_requests_enabled:           true,
  availability_collection_enabled: true,
  night_legal_warning_enabled:     true,
  // Ek özellikler (varsayılan kapalı, müdür açar). 2026-10-05: küçük işletmede ekranları kalabalıklaştırdığı için
  // fazla mesai takibi, birlikte çalışamaz ve devir-teslim notu da kapalı başlar (açıkça açılmış şubeler etkilenmez).
  overtime_tracking_enabled:       false,
  personnel_conflicts_enabled:     false,
  handover_notes_enabled:          false,
  compliance_tracking_enabled:     false,
  task_management_enabled:         false,
  tip_pooling_enabled:             false,
  kiosk_mode_enabled:              false,
  forecasting_enabled:             false,
  handover_log_enabled:            false,
  fatigue_radar_enabled:           false,
  consecutive_night_weeks_enabled: false,
  checkin_required:                false,
} as const;

export type ModuleKey = keyof typeof MODULE_DEFAULTS;

/**
 * "Yakında" özellikler: şubede açık kaydı kalmış olsa da hiçbir ekranda görünmez.
 * Bahşiş dağıtımı (kullanıcı kararı 2026-10-05): bahşiş herkese eşit dağılmıyor; Ayarlar › Özellikler'de
 * işletmeye nasıl dağıttığı soruluyor, cevaplara göre yapılacak.
 */
export const COMING_SOON = new Set<ModuleKey>(["tip_pooling_enabled"]);

/**
 * Kaldırılan özellikler (kullanıcı kararı 2026-10-10: vardiya giriş/çıkışı kullanılmıyor): eski kayıtlı
 * değer ne olursa olsun kapalı. Ortak tablet, girişe bağlı zorunlu okumalı devir defteri, giriş takibi.
 */
export const REMOVED = new Set<ModuleKey>(["kiosk_mode_enabled", "handover_log_enabled", "checkin_required"]);

/** `locations.rules` bazen JSON string, bazen nesne olarak gelir. */
export function parseRules(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try { return (JSON.parse(raw) as Record<string, unknown>) ?? {}; } catch { return {}; }
  }
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

/** Özellik bu şubede açık mı? `rules` nesne ya da JSON string olabilir. */
export function isModuleOn(rules: unknown, key: ModuleKey): boolean {
  if (COMING_SOON.has(key) || REMOVED.has(key)) return false;
  const value = parseRules(rules)[key];
  return MODULE_DEFAULTS[key] ? value !== false : value === true;
}
