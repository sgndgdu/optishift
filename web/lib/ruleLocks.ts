/**
 * Şube ayarlarında (locations.rules) kim neyi değiştirir: TEK KAYNAK.
 * Yetki kişinin kendisinde (lib/userAccess, kullanıcı kararı 2026-10-04); burada sadece ayar anahtarlarının
 * hangi maddeye bağlı olduğu durur:
 * - budget: "Ücretler ve maliyet"
 * - features: ek özellikleri açıp kapatma, sadece işletme sahibi
 * - prepare: plan hazırlarken yazılan alanlar (çağrı tahmini)
 * - geri kalan her anahtar: "Plan ayarları"
 * İzni olmayan yöneticinin gönderdiği değer sunucuda yok sayılır (mevcut değer korunur).
 * Eski şube bazlı izin anahtarı (manager_permissions) artık okunmaz ve kimse yazamaz.
 */
import { hasPerm, type Perm, type UserAccess } from "@/lib/userAccess";

export type LockCategory = "budget" | "rules" | "features";

export const LOCKED_RULE_KEYS: Record<"budget" | "features", readonly string[]> = {
  // Ücret ve bütçe
  budget: ["weekly_labor_budget_try"],
  // Ek özellikleri açma/kapama
  features: [
    "chat_enabled", "open_shifts_enabled", "handover_notes_enabled", "handover_log_enabled",
    "personnel_conflicts_enabled", "fatigue_radar_enabled", "compliance_tracking_enabled", "forecasting_enabled",
    "task_management_enabled", "kiosk_mode_enabled", "overtime_tracking_enabled", "tip_pooling_enabled",
  ],
};

/** Plan hazırlarken yazılan ayarlar (Vardiya Planı'ndaki tahmin formu). */
export const PREPARE_RULE_KEYS: readonly string[] = ["call_forecast"];

/** Eski şube bazlı izin anahtarı: korunur, kimse yazamaz. */
const LEGACY_KEY = "manager_permissions";

type Viewer = { role?: string | null; access?: UserAccess | null };

/** Ayar anahtarını değiştirmek için gereken madde; null = sadece işletme sahibi. */
export function ruleKeyPerm(key: string): Perm | null {
  if (LOCKED_RULE_KEYS.features.includes(key)) return null;
  if (LOCKED_RULE_KEYS.budget.includes(key)) return "budget";
  if (PREPARE_RULE_KEYS.includes(key)) return "prepare";
  return "plan_settings";
}

/** Ayarlar ekranındaki alan grubu bu kişi için kilitli mi. */
export function isCategoryLocked(viewer: Viewer, cat: LockCategory): boolean {
  if (viewer.role === "admin") return false;
  if (cat === "features") return true;
  return !hasPerm(viewer, cat === "budget" ? "budget" : "plan_settings");
}

/**
 * Yöneticinin gönderdiği kurallarda yetkisi olmayan anahtarları mevcut değerlerle değiştirir:
 * mevcutta varsa eski değer, yoksa anahtar yazılmaz. İşletme sahibine uygulanmaz.
 */
export function applyRuleLocks(current: Record<string, unknown>, incoming: Record<string, unknown>, viewer: Viewer): Record<string, unknown> {
  if (viewer.role === "admin") return incoming;
  const out: Record<string, unknown> = { ...incoming };
  const keep = (k: string) => {
    if (Object.prototype.hasOwnProperty.call(current, k)) out[k] = current[k];
    else delete out[k];
  };
  for (const k of new Set([...Object.keys(current), ...Object.keys(incoming)])) {
    if (k === LEGACY_KEY) { keep(k); continue; }
    const perm = ruleKeyPerm(k);
    if (!perm || !hasPerm(viewer, perm)) keep(k);
  }
  return out;
}

export const LOCK_NOTE = "Bu ayarı değiştirme yetkiniz yok. Hesap sahibi verebilir.";
