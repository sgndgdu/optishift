/**
 * Yasal Kısıt Dağıtımı + Akıllı Varsayılanlar.
 *
 * Seçilen sektör ve alt türden yeni bir şubenin `locations` alanlarını üretir:
 * vardiya tanımları, çalışma saatleri, kurallar (motorun ceza ağırlıkları dahil),
 * açılacak özellikler ve görev şablonları. Katman sırası:
 *   genel güvenli taban  <  sektör kuralları  <  alt tür kuralları  <  özellik anahtarları
 * Sonuç tek bir `rules` nesnesidir; Ayarlar sayfası aynı anahtarları okuyup düzenler.
 */

import type { ShiftDefinition } from "@/lib/types";
import type { IndustryProfile, IndustryRules, IndustryVariant } from "./types";
import { getIndustry, getVariant } from "./registry";

const titleCaseTr = (s: string) =>
  s.split(/([\s-])/).map(w => (w.trim() && w !== "-" ? w.charAt(0).toLocaleUpperCase("tr-TR") + w.slice(1) : w)).join("");

/** Hiç sektör seçilmemiş şubeyle aynı güvenli taban (ilk kurulumun eski varsayılanları). */
export const BASE_RULES: Partial<IndustryRules> = {
  max_weekly_hours: 45,
  min_rest_hours: 11,
};

export interface IndustryDefaults {
  industry: IndustryProfile;
  variant: IndustryVariant;
  shift_definitions: ShiftDefinition[];
  operating_hours: Record<string, { isOpen: boolean; open: string; close: string }>;
  rules: Record<string, unknown>;
  task_templates: Record<string, string[]>;
}

/**
 * Vardiyaların kapsadığı en erken başlangıç / en geç bitiş. Gece yarısını geçen vardiya varsa:
 * sabaha kadar (neredeyse) kesintisiz sürüyorsa (fabrika, hastane) tüm gün; geceyi geçip açılıştan
 * çok önce bitiyorsa (restoran 16:00-00:00, açılış 10:00) açılıştan gece yarısına kadar (Test 3 #14).
 */
export function operatingWindow(shifts: ShiftDefinition[]): { open: string; close: string } {
  if (!shifts.length) return { open: "09:00", close: "22:00" };
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  let open = 24 * 60, close = 0, overnightEnd = -1;
  for (const s of shifts) {
    const a = toMin(s.start), b = toMin(s.end);
    open = Math.min(open, a);
    if (b <= a) overnightEnd = Math.max(overnightEnd, b); else close = Math.max(close, b);
  }
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  if (overnightEnd < 0) return { open: fmt(open), close: fmt(close) };
  // Gece vardiyası sabah açılışa 2 saatten yakın bitiyorsa (fabrika 22:00-05:30, açılış 06:00) kesintisiz
  return open - overnightEnd <= 120 ? { open: "00:00", close: "23:59" } : { open: fmt(open), close: "23:59" };
}

/** Sektör + alt tür → yeni şube alanları. Bilinmeyen sektörde null döner (çağıran eski davranışa düşer). */
export function buildIndustryDefaults(industryKey: string, variantKey?: string | null): IndustryDefaults | null {
  const industry = getIndustry(industryKey);
  if (!industry) return null;
  const variant = getVariant(industry, variantKey);

  const shift_definitions = variant.shifts.map(s => ({ ...s }));
  // İcap evden beklenir: işyerinin açık saatlerini genişletmez
  const win = operatingWindow(shift_definitions.filter(s => !s.on_call));
  const operating_hours: IndustryDefaults["operating_hours"] = {};
  for (let d = 0; d < 7; d++) operating_hours[d] = { isOpen: true, ...win };

  const rules: Record<string, unknown> = {
    ...BASE_RULES,
    ...industry.rules,
    ...(variant.rules ?? {}),
    ...industry.modules,
    industry: industry.key,
    industry_variant: variant.key,
  };

  return { industry, variant, shift_definitions, operating_hours, rules, task_templates: { ...(industry.taskTemplates ?? {}) } };
}

/**
 * Sihirbaz özet ekranı için: bu sektör seçilince hangi özellikler açılıyor.
 * Sadece varsayılanı KAPALI olup sektörün açtıkları listelenir (açık olanlar zaten açık).
 */
export function enabledHighlights(industry: IndustryProfile): string[] {
  const LABELS: Record<string, string> = {
    tip_pooling_enabled: "Bahşiş Havuzu",
    task_management_enabled: "Görev Listeleri",
    handover_log_enabled: `Dijital ${titleCaseTr(industry.nudges.terms.handover)} Defteri`,
    fatigue_radar_enabled: "Kaza Risk Radarı",
    compliance_tracking_enabled: "Belge ve Sertifika Takibi",
    kiosk_mode_enabled: "Ortak Tablet",
    forecasting_enabled: "Yoğunluk Tahmini",
  };
  return Object.entries(industry.modules)
    .filter(([k, on]) => on && LABELS[k])
    .map(([k]) => LABELS[k]);
}
