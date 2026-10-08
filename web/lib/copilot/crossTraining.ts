/**
 * Çapraz eğitim önerisi: vardiyaların zorunlu kıldığı bir rolü (required_skills) taşıyan
 * kişi sayısı haftalık ihtiyaca göre azsa rol "darboğaz"dır; eğitilirse en çok fayda
 * sağlayacak kişiler önerilir (rolü yok, az yüklü, o vardiyada zaten çalışıyor).
 * Saf; Plan Asistanı'na bilgi maddesi olarak eklenir.
 */

import type { ShiftDefinition } from "@/lib/types";
import type { Insight } from "./checks";
import type { WeekSnapshot } from "./snapshot";

/** Talep, rolü taşıyanların haftalık kapasitesinin bu oranını geçince darboğaz */
const PRESSURE = 0.8;
const DAYS_PER_PERSON = 5;

export interface Bottleneck {
  role: string;
  needShifts: number;
  holders: number;
  capacity: number;
  gaps: number;
  trainees: string[];
}

export function findBottlenecks(snap: WeekSnapshot, shiftDefs: ShiftDefinition[]): Bottleneck[] {
  const roles = new Map<string, { need: number; shiftIds: Set<string> }>();
  for (const def of shiftDefs) {
    for (const rs of def.required_skills ?? []) {
      if (!rs.skill || rs.count <= 0) continue;
      const r = roles.get(rs.skill) ?? { need: 0, shiftIds: new Set<string>() };
      // Vardiyanın açık olduğu günler: ihtiyaç girildiyse > 0 olan günler, yoksa plandaki dolu günler (en az 5)
      const days = snap.coverage.filter(c => c.shiftId === def.id && ((c.demand ?? 0) > 0 || (c.demand == null && c.assigned > 0))).length;
      r.need += rs.count * (days || (snap.hasDemand ? 0 : DAYS_PER_PERSON));
      r.shiftIds.add(def.id);
      roles.set(rs.skill, r);
    }
  }
  const out: Bottleneck[] = [];
  for (const [role, r] of roles) {
    if (r.need === 0) continue;
    const holders = snap.people.filter(p => p.roles.includes(role));
    const capacity = holders.length * DAYS_PER_PERSON;
    const gaps = snap.coverage.filter(c => c.missingSkills.some(m => m.skill === role)).length;
    if (r.need <= capacity * PRESSURE && gaps === 0) continue;
    const trainees = snap.people
      .filter(p => !p.roles.includes(role))
      .map(p => ({ p, onShift: p.shifts.filter(x => r.shiftIds.has(x.shiftId)).length }))
      .sort((a, b) => (b.onShift - a.onShift) || (a.p.loadRatio - b.p.loadRatio))
      .map(x => x.p.name);
    out.push({ role, needShifts: r.need, holders: holders.length, capacity, gaps, trainees });
  }
  return out.sort((a, b) => (b.gaps - a.gaps) || (b.needShifts / Math.max(1, b.capacity) - a.needShifts / Math.max(1, a.capacity)));
}

export function crossTrainingInsight(snap: WeekSnapshot, shiftDefs: ShiftDefinition[]): Insight | null {
  const list = findBottlenecks(snap, shiftDefs);
  if (!list.length) return null;
  return {
    id: "cross-training",
    severity: "info",
    title: list.length === 1 ? `"${list[0].role}" görevini yapabilen kişi az` : `${list.length} görevi yapabilen kişi az`,
    lines: list.map(b =>
      `${b.role}: haftada ${b.needShifts} vardiyada gerekiyor, ${b.holders} kişide var` +
      (b.gaps ? `; bu hafta ${b.gaps} vardiyada eksik` : "") +
      (b.trainees.length ? `. Bu görev için eğitilebilecek kişiler: ${b.trainees.join(", ")}` : "")),
  };
}
