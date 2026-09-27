/**
 * Sektör kayıt defteri. Yeni sektör eklemek = industries/ altına bir dosya + buraya bir satır.
 * lib/__tests__/industries.test.ts her profilin iç tutarlılığını (roller↔belgeler, kural
 * anahtarları, vardiya saatleri, öncelik listesi) otomatik doğrular.
 */

import type { IndustryKey, IndustryProfile, IndustryVariant } from "./types";
import { hospitality } from "./industries/hospitality";
import { manufacturing } from "./industries/manufacturing";
import { retail } from "./industries/retail";
import { healthcare } from "./industries/healthcare";
import { security } from "./industries/security";
import { logistics } from "./industries/logistics";
import { callcenter } from "./industries/callcenter";

export const INDUSTRIES: readonly IndustryProfile[] = [
  hospitality, retail, manufacturing, logistics, healthcare, security, callcenter,
];

const BY_KEY = new Map<string, IndustryProfile>(INDUSTRIES.map(i => [i.key, i]));

export function getIndustry(key: string | null | undefined): IndustryProfile | null {
  return key ? BY_KEY.get(key) ?? null : null;
}

export function getVariant(industry: IndustryProfile, variantKey?: string | null): IndustryVariant {
  return industry.variants.find(v => v.key === variantKey) ?? industry.variants[0];
}

/** Şubenin rules nesnesinden (JSON string ya da nesne) seçili sektörü okur. */
export function industryFromRules(rules: unknown): IndustryProfile | null {
  let r: Record<string, unknown> = {};
  if (typeof rules === "string") { try { r = JSON.parse(rules); } catch { r = {}; } }
  else if (rules && typeof rules === "object") r = rules as Record<string, unknown>;
  return getIndustry(typeof r.industry === "string" ? r.industry : null);
}

/**
 * Eski sektör anahtarları (lib/presets.ts, ilk kurulum sihirbazı) → yeni sektör + alt tür.
 * Eski kayıtlar ve bağlantılar kırılmasın diye tutulur.
 */
export const LEGACY_SECTOR_MAP: Record<string, { industry: IndustryKey; variant: string }> = {
  cafe:       { industry: "hospitality",   variant: "cafe" },
  restaurant: { industry: "hospitality",   variant: "restaurant" },
  hotel:      { industry: "hospitality",   variant: "hotel" },
  retail:     { industry: "retail",        variant: "mall" },
  factory:    { industry: "manufacturing", variant: "three-shift" },
};
