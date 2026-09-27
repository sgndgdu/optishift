/**
 * Vardiya şablonu kısayolları. TEK KAYNAK artık lib/templates (Sektörel Şablon Motoru);
 * bu dosya eski çağıranlar (Hızlı Kurulum, ilk kurulum) için ince bir uyumluluk katmanıdır.
 *
 * Anahtar biçimleri:
 *   "manufacturing"            → sektörün ilk alt türü
 *   "manufacturing:two-shift"  → belirli alt tür
 *   "cafe", "factory"...       → eski anahtarlar (LEGACY_SECTOR_MAP)
 */
import type { ShiftDefinition } from "./types";
import { INDUSTRIES, LEGACY_SECTOR_MAP, getIndustry, getVariant } from "./templates/registry";

export interface SectorPreset {
  key: string;
  label: string;
  /** Sektöre uygun hazır vardiya şablonları */
  shiftDefs: ShiftDefinition[];
  /** Sektöre uygun departman önerileri */
  depts: string[];
}

/** Her sektör için bir kısayol (ilk alt tür). */
export const SECTOR_PRESETS: SectorPreset[] = INDUSTRIES.map(ind => {
  const v = ind.variants[0];
  return { key: ind.key, label: ind.label, shiftDefs: v.shifts, depts: v.departments ?? [] };
});

export function getSectorPreset(key: string): SectorPreset {
  const [indKey, variantKey] = key.includes(":") ? key.split(":") : [key, undefined];
  const legacy = LEGACY_SECTOR_MAP[key];
  const industry = getIndustry(legacy?.industry ?? indKey) ?? INDUSTRIES[0];
  const variant = getVariant(industry, legacy?.variant ?? variantKey);
  return {
    key,
    label: variant.label,
    shiftDefs: variant.shifts.map(s => ({ ...s })),
    depts: variant.departments ?? [],
  };
}
