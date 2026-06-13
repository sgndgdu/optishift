/**
 * Adalet motoru — sıfırdan yeniden yazım.
 *
 * Formüller:
 *   burden      = difficulty × duration_h × [weekend×1.2] × [night×1.3] × [pref_not×mult] × [hero×1.5] × [clopening×1.2]
 *   cumulative  = Σ(i=0..7) weekly_burden[week-i] × 0.85^i   (rolling decay)
 *   fairness_z  = (team_avg - person_cumulative) / team_stddev
 */

export interface ShiftDef {
  id: string;
  name: string;
  base_points: number;   // difficulty weight (1–10)
  start: string;         // "HH:MM"
  end: string;           // "HH:MM"
  is_night?: boolean;
}

export interface Rules {
  weekend_multiplier?: number;       // varsayılan 1.2
  night_multiplier?: number;         // varsayılan 1.3
  preferred_not_multiplier?: number; // varsayılan 1.5
  clopening_multiplier?: number;     // varsayılan 1.2
  hero_multiplier?: number;          // varsayılan 1.5
  clopening_min_rest_hours?: number; // varsayılan 13
}

export interface AssignmentInput {
  personnel_id: string;
  day: number;           // 0=Pzt … 6=Paz
  shift_id: string;      // shift_definitions id'si
  start_time: string;    // "HH:MM"
  end_time: string;      // "HH:MM"
  is_hero?: boolean;
}

export interface AvailabilityInput {
  personnel_id: string;
  /** day_0 … day_6 değerleri */
  [key: string]: string;
}

export interface BurdenBreakdown {
  personnel_id: string;
  total_hours: number;
  raw_score: number;        // difficulty × hours, modifier yok
  burden_score: number;     // modifier'lı
  weekend_shifts: number;
  night_shifts: number;
  pref_not_shifts: number;
  clopening_count: number;
  hero_count: number;
}

export interface ScoreHistoryEntry {
  week_start: string;
  burden_score: number;
}

// ─── Yardımcı ────────────────────────────────────────────────────────────────

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function durationHours(start: string, end: string): number {
  let endMin = toMin(end);
  const startMin = toMin(start);
  if (endMin <= startMin) endMin += 1440; // gece geçişi
  return (endMin - startMin) / 60;
}

function restGapMin(end1: string, start2: string): number {
  return toMin(start2) + 1440 - toMin(end1);
}

// ─── Ana Hesaplama ────────────────────────────────────────────────────────────

/**
 * Bir haftanın tüm atamaları için kişi bazlı burden breakdown döner.
 */
export function calcWeeklyBurden(
  assignments: AssignmentInput[],
  shiftDefs: ShiftDef[],
  availability: AvailabilityInput[],
  rules: Rules,
): BurdenBreakdown[] {
  const weekendMult   = rules.weekend_multiplier       ?? 1.2;
  const nightMult     = rules.night_multiplier         ?? 1.3;
  const prefNotMult   = rules.preferred_not_multiplier ?? 1.5;
  const clOpenMult    = rules.clopening_multiplier     ?? 1.2;
  const heroMult      = rules.hero_multiplier          ?? 1.5;
  const clOpenMinRest = (rules.clopening_min_rest_hours ?? 13) * 60;
  const legalMinRest  = 11 * 60;

  const defById = Object.fromEntries(shiftDefs.map(d => [d.id, d]));
  const availById = Object.fromEntries(availability.map(a => [a.personnel_id, a]));

  // Kişi başı atamaları grupla
  const byPerson: Record<string, AssignmentInput[]> = {};
  for (const a of assignments) {
    if (!byPerson[a.personnel_id]) byPerson[a.personnel_id] = [];
    byPerson[a.personnel_id].push(a);
  }

  return Object.entries(byPerson).map(([pid, pAssignments]) => {
    const avail = availById[pid] ?? {};
    // Günlük atama haritası: day → assignment (clopening tespiti için)
    const byDay: Record<number, AssignmentInput> = {};
    for (const a of pAssignments) byDay[a.day] = a;

    let totalHours     = 0;
    let rawScore       = 0;
    let burdenScore    = 0;
    let weekendShifts  = 0;
    let nightShifts    = 0;
    let prefNotShifts  = 0;
    let clOpenCount    = 0;
    let heroCount      = 0;

    for (const a of pAssignments) {
      const def = defById[a.shift_id];
      const difficulty = def?.base_points ?? 5;
      const hours = durationHours(a.start_time, a.end_time);
      const isWeekend = a.day === 5 || a.day === 6;
      const isNight = def?.is_night ?? false;
      const isPrefNot = avail[`day_${a.day}`] === "preferred_not";
      const isHero = a.is_hero ?? false;

      // Clopening: bir önceki günün bitiş saatiyle bu günün başlangıcı arasındaki dinlenme
      const prev = byDay[a.day - 1];
      const isClopening = prev
        ? (() => {
            const gap = restGapMin(prev.end_time, a.start_time);
            return gap >= legalMinRest && gap < clOpenMinRest;
          })()
        : false;

      totalHours += hours;
      const raw = difficulty * hours;
      rawScore += raw;

      let burden = raw;
      if (isWeekend)  { burden *= weekendMult;  weekendShifts++; }
      if (isNight)    { burden *= nightMult;     nightShifts++; }
      if (isPrefNot)  { burden *= prefNotMult;   prefNotShifts++; }
      if (isClopening){ burden *= clOpenMult;    clOpenCount++; }
      if (isHero)     { burden *= heroMult;      heroCount++; }

      burdenScore += burden;
    }

    return {
      personnel_id:  pid,
      total_hours:   Math.round(totalHours * 10) / 10,
      raw_score:     Math.round(rawScore * 10) / 10,
      burden_score:  Math.round(burdenScore * 10) / 10,
      weekend_shifts: weekendShifts,
      night_shifts:   nightShifts,
      pref_not_shifts: prefNotShifts,
      clopening_count: clOpenCount,
      hero_count:     heroCount,
    };
  });
}

/**
 * Rolling decay kümülatif burden hesabı.
 * history: kronolojik sırada (en eski önce), son eleman bu haftayı içermez.
 * currentWeekBurden: bu haftanın burden_score'u (index 0 = en yeni).
 */
export function calcCumulativeRolling(
  history: ScoreHistoryEntry[],
  currentWeekBurden: number,
  decayFactor = 0.85,
  windowWeeks = 8,
): number {
  // Sondan al (en yeni önce), window kadar
  const recent = [...history].reverse().slice(0, windowWeeks - 1);
  let cumulative = currentWeekBurden; // i=0 → × 0.85^0 = 1
  for (let i = 0; i < recent.length; i++) {
    cumulative += recent[i].burden_score * Math.pow(decayFactor, i + 1);
  }
  return Math.round(cumulative * 100) / 100;
}

/**
 * Tüm takım için fairness z-score hesabı.
 * personBurdens: { personnel_id → cumulative_burden }
 * Döner: { personnel_id → z_score }
 *   pozitif = az yüklü (takım ortalamasının altında)
 *   negatif = çok yüklü
 */
export function calcFairnessZ(
  personBurdens: Record<string, number>,
): Record<string, number> {
  const values = Object.values(personBurdens);
  if (values.length === 0) return {};

  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);

  const result: Record<string, number> = {};
  for (const [pid, burden] of Object.entries(personBurdens)) {
    result[pid] = stddev > 0
      ? Math.round(((avg - burden) / stddev) * 100) / 100
      : 0;
  }
  return result;
}

/**
 * Z-score'u kullanıcıya anlamlı Türkçe metne dönüştürür.
 */
export function fairnessLabel(z: number): { text: string; level: "low" | "ok" | "high" } {
  if (z > 1.0)  return { text: "Az yüklü — sıra sende",          level: "low" };
  if (z > 0.3)  return { text: "Ortalamanın biraz altında",       level: "ok" };
  if (z > -0.3) return { text: "Takım ortalamasında",             level: "ok" };
  if (z > -1.0) return { text: "Ortalamanın biraz üstünde",       level: "ok" };
  return         { text: "Çok yüklü — yük azaltılmalı",           level: "high" };
}
