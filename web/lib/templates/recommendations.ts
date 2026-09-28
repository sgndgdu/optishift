/**
 * Önerilen zorunlu roller (IndustryVariant.skillRecommendations) için tek tık uygulama.
 *
 * Motor zorunlu yetkinliği KESİN kural olarak uygular ve eşleşmeyi birebir metinle
 * yapar (engine/optishift_engine.py): o role sahip kimse yoksa vardiya hiç açılamaz.
 * Bu yüzden öneri ancak yeterli sayıda kişide rol işaretliyken uygulanabilir.
 */

import type { ShiftDefinition } from "@/lib/types";
import type { IndustryProfile } from "./types";
import { getVariant } from "./registry";
import { normalizeLabel } from "./skills";

export type RecommendationStatus =
  /** Kimsede (ya da yeterli kişide) rol yok: uygulanırsa vardiya açılamaz. */
  | "no-holders"
  /** Uygulanabilir ama rol sahibi az: izin günlerinde vardiya açılamayabilir. */
  | "thin"
  | "ready";

export interface PendingRecommendation {
  shiftId: string;
  shiftName: string;
  skill: string;
  count: number;
  reason: string;
  holders: number;
  status: RecommendationStatus;
}

/**
 * Şubenin mevcut vardiyalarına henüz uygulanmamış öneriler.
 * Vardiyası silinmiş/yeniden adlandırılmış (id eşleşmeyen) öneriler atlanır.
 * @param personnelRoles  şubedeki aktif personelin rol listeleri
 */
export function pendingSkillRecommendations(
  industry: IndustryProfile, variantKey: string | null | undefined,
  shifts: ShiftDefinition[], personnelRoles: string[][],
): PendingRecommendation[] {
  const recs = getVariant(industry, variantKey).skillRecommendations ?? [];
  const out: PendingRecommendation[] = [];
  for (const r of recs) {
    const shift = shifts.find(s => s.id === r.shiftId);
    if (!shift) continue;
    const already = (shift.required_skills ?? []).some(rs => normalizeLabel(rs.skill) === normalizeLabel(r.skill));
    if (already) continue;
    // Motor birebir eşleştirir; burada da aynı kural
    const holders = personnelRoles.filter(roles => roles.includes(r.skill)).length;
    // Rol sahibi haftada en fazla ~5-6 gün çalışır; 7 günü kapatmak için en az iki katı gerekir
    const status: RecommendationStatus = holders < r.count ? "no-holders" : holders < r.count * 2 ? "thin" : "ready";
    out.push({ shiftId: r.shiftId, shiftName: shift.name, skill: r.skill, count: r.count, reason: r.reason, holders, status });
  }
  return out;
}

/** Öneriyi vardiya tanımlarına ekler (yeni dizi döner; diğer vardiyalar aynı kalır). */
export function applySkillRecommendation(
  shifts: ShiftDefinition[], rec: { shiftId: string; skill: string; count: number },
): ShiftDefinition[] {
  return shifts.map(s => s.id !== rec.shiftId ? s : {
    ...s,
    required_skills: [
      ...(s.required_skills ?? []).filter(rs => normalizeLabel(rs.skill) !== normalizeLabel(rec.skill)),
      { skill: rec.skill, count: rec.count },
    ],
  });
}
