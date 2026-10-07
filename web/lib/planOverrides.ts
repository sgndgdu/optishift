/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Cümleyle plan değiştirme (lib/ai/planInstruct) sonucu motora giden ek kısıtlar: TEK KAYNAK.
 * generatePlan `body.overrides` ile alır ve motor girdisine uygular. İstemciden geldiği için burada da sınırlanır:
 * bilinmeyen kişi/vardiya motor tarafında da yok sayılır.
 *  - day_off: kişi o günlerde çalışmaz (kesin)
 *  - hours: kişi o günlerde sadece bu saat aralığına sığan vardiyaya yazılır (kesin, motorun uygunluk aralığı)
 *  - work: kişi o gün o vardiyada çalışır (korunan hücre gibi)
 *  - max_hours: kişinin bu haftaki üst sınırı
 *  - not_together: iki kişi aynı vardiyaya yazılmaz (kişi çakışması)
 *  - demand: bir vardiyanın o günlerdeki kişi sayısı (departmanlı şubede departmanın tablosu)
 */
export type PlanOverride =
  | { type: "day_off"; personnel_id: string; days: number[] }
  | { type: "hours"; personnel_id: string; days: number[]; start: string; end: string }
  | { type: "work"; personnel_id: string; day: number; shift_id: string }
  | { type: "max_hours"; personnel_id: string; hours: number }
  | { type: "not_together"; personnel_id: string; other_id: string }
  | { type: "demand"; shift_id: string; days: number[]; count: number; department_id?: string | null };

const MAX_OVERRIDES = 20;
const HHMM = /^([01]?\d|2\d|3[0-5]):[0-5]\d$/; // bitiş ertesi güne taşabilir ("26:00")
const days = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))] : []);

export function sanitizeOverrides(raw: unknown): PlanOverride[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanOverride[] = [];
  for (const o of raw.slice(0, MAX_OVERRIDES)) {
    if (!o || typeof o !== "object") continue;
    const a = o as Record<string, unknown>;
    const pid = typeof a.personnel_id === "string" ? a.personnel_id : "";
    switch (a.type) {
      case "day_off": if (pid && days(a.days).length) out.push({ type: "day_off", personnel_id: pid, days: days(a.days) }); break;
      case "hours":
        if (pid && days(a.days).length && typeof a.start === "string" && typeof a.end === "string" && HHMM.test(a.start) && HHMM.test(a.end))
          out.push({ type: "hours", personnel_id: pid, days: days(a.days), start: a.start, end: a.end });
        break;
      case "work": {
        const d = Number(a.day);
        if (pid && Number.isInteger(d) && d >= 0 && d <= 6 && typeof a.shift_id === "string") out.push({ type: "work", personnel_id: pid, day: d, shift_id: a.shift_id });
        break;
      }
      case "max_hours": {
        const h = Math.round(Number(a.hours));
        if (pid && h >= 0 && h <= 66) out.push({ type: "max_hours", personnel_id: pid, hours: h });
        break;
      }
      case "not_together":
        if (pid && typeof a.other_id === "string" && a.other_id && a.other_id !== pid) out.push({ type: "not_together", personnel_id: pid, other_id: a.other_id });
        break;
      case "demand": {
        const c = Math.round(Number(a.count));
        if (typeof a.shift_id === "string" && days(a.days).length && c >= 0 && c <= 50)
          out.push({ type: "demand", shift_id: a.shift_id, days: days(a.days), count: c, department_id: typeof a.department_id === "string" ? a.department_id : null });
        break;
      }
    }
  }
  return out;
}

/** Motor girdisine uygular (yerinde değiştirir) */
export function applyOverrides(overrides: PlanOverride[], t: {
  availability: Record<string, any>;
  fixed: any[];
  personnel: any[];
  conflictPairs: [string, string][];
  demand: Record<string, Record<string, number>>;
  deptDemand: Record<string, Record<string, Record<string, number>>>;
  shifts: any[];
}): void {
  const shiftIds = new Set(t.shifts.map(s => String(s.id)));
  for (const o of overrides) {
    if (o.type === "day_off") {
      t.availability[o.personnel_id] ??= {};
      for (const d of o.days) t.availability[o.personnel_id][d] = "unavailable";
      // Aynı güne korunan hücre varsa sorumlunun son isteği geçerli: hücre bırakılır
      for (let i = t.fixed.length - 1; i >= 0; i--) if (t.fixed[i].personnel_id === o.personnel_id && o.days.includes(t.fixed[i].day)) t.fixed.splice(i, 1);
    } else if (o.type === "hours") {
      t.availability[o.personnel_id] ??= {};
      for (const d of o.days) {
        const cur = t.availability[o.personnel_id][d];
        if (cur === "unavailable") continue;
        t.availability[o.personnel_id][d] = { status: "available", start: o.start, end: o.end };
      }
    } else if (o.type === "work") {
      if (!shiftIds.has(o.shift_id)) continue;
      for (let i = t.fixed.length - 1; i >= 0; i--) if (t.fixed[i].personnel_id === o.personnel_id && t.fixed[i].day === o.day) t.fixed.splice(i, 1);
      const def = t.shifts.find(s => String(s.id) === o.shift_id);
      t.fixed.push({ personnel_id: o.personnel_id, day: o.day, shift_id: o.shift_id, start_time: def?.start, end_time: def?.end });
      if (t.availability[o.personnel_id]?.[o.day] === "unavailable") delete t.availability[o.personnel_id][o.day];
    } else if (o.type === "max_hours") {
      const p = t.personnel.find(x => x.id === o.personnel_id);
      if (p) p.max_weekly_hours = Math.min(Number(p.max_weekly_hours ?? 66), o.hours);
    } else if (o.type === "not_together") {
      t.conflictPairs.push([o.personnel_id, o.other_id]);
    } else if (o.type === "demand") {
      if (!shiftIds.has(o.shift_id)) continue;
      const target = o.department_id && t.deptDemand[o.department_id] ? t.deptDemand[o.department_id] : t.demand;
      target[o.shift_id] ??= {};
      for (const d of o.days) target[o.shift_id][String(d)] = o.count;
    }
  }
}
