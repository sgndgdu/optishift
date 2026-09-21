/**
 * Adalet motoru — additive rewrite (2026-09-20).
 *
 * Formüller:
 *   puan        = saat × (base_points/5) + (zor_vardiya_mi ? hard_shift_points : 0)
 *                 + (kahraman_mi ? hero_bonus_points : 0) + (zorunlu_atama_mi ? force_bonus_points : 0)
 *   zor_vardiya_mi = (hafta_sonu AND hard_shift_weekend) OR (gece AND hard_shift_night)
 *                    OR (sarı_gün AND hard_shift_preferred_not)   — OR'lanır, asla iki kez eklenmez
 *   kümülatif   = Σ(son N hafta puanı) + Σ(o pencerede score_adjustments.points)   — decay YOK, düz toplam
 *   takım_sırası= puana göre artan sıralama → percentile (0-100, yüksek=az yüklü)
 *
 * Clopening artık puanı hiç etkilemez — sadece yayın öncesi kural ihlali uyarısında
 * kullanılan ayrı bir mekanizmadır (rules.clopening_min_rest_hours).
 */

export interface ShiftDef {
  id: string;
  name: string;
  base_points: number;   // vardiya zorluğu (1–10) — saat ile çarpılır (base/5), zaten var olan alan
  start: string;         // "HH:MM"
  end: string;           // "HH:MM"
  is_night?: boolean;
}

export interface Rules {
  // Zor vardiya tanımı — tek puan, üç kapsam bayrağı
  hard_shift_points?: number;          // varsayılan 4, 0 = kapalı
  hard_shift_weekend?: boolean;        // varsayılan true
  hard_shift_night?: boolean;          // varsayılan true
  hard_shift_preferred_not?: boolean;  // varsayılan true
  // Bonuslar — düz puan, 0 = kapalı
  hero_bonus_points?: number;          // varsayılan 6
  force_bonus_points?: number;         // varsayılan 5
  // Sadece yayın öncesi kural ihlali uyarısı için (puanı etkilemez)
  clopening_min_rest_hours?: number;   // varsayılan 13
  // Kümülatif pencere
  fairness_window_weeks?: number;      // varsayılan 4
}

export interface AssignmentInput {
  personnel_id: string;
  day: number;           // 0=Pzt … 6=Paz
  shift_id: string;      // shift_definitions id'si
  start_time: string;    // "HH:MM"
  end_time: string;      // "HH:MM"
  is_hero?: boolean;
  hero_points?: number;  // open_shift bazlı override (os.hero_bonus_multiplier — artık düz puan tutar)
  force_points?: number; // kabul edilmiş zorunlu atama bonusu (force_bonus_multiplier — artık düz puan tutar)
}

export interface AvailabilityInput {
  personnel_id: string;
  /** day_0 … day_6 değerleri */
  [key: string]: string;
}

export interface BurdenBreakdown {
  personnel_id: string;
  total_hours: number;
  raw_score: number;        // burden_score ile aynı — additive modelde ayrı bir "modifier'sız" değer yok, call site uyumluluğu için tutulur
  burden_score: number;     // toplam puan (additive)
  weekend_shifts: number;
  night_shifts: number;
  pref_not_shifts: number;
  clopening_count: number;  // bilgi amaçlı — puanı etkilemez
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

/**
 * Bir atamanın vardiya tanımını çözer: önce id ile, bulunamazsa (örn. eski
 * kayıtlarda kalan "custom" sentineli) saat eşleşmesiyle (±10 dk, gece geçişi
 * dahil). Hâlâ yoksa null — gerçekten özel saatli bir atamadır.
 * Tek kaynak: schedule sayfası, /api/shifts ve arşiv görünümü de bunu kullanır.
 */
export function resolveShiftDef<T extends { id: string; start: string; end: string }>(
  shiftId: string | null | undefined,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  defs: T[],
): T | null {
  if (shiftId) {
    const byId = defs.find(d => d.id === shiftId);
    if (byId) return byId;
  }
  if (!startTime || !endTime) return null;
  const s = toMin(startTime);
  let e = toMin(endTime);
  if (e <= s) e += 1440;
  for (const d of defs) {
    const ds = toMin(d.start);
    let de = toMin(d.end);
    if (de <= ds) de += 1440;
    if (Math.abs(s - ds) <= 10 && Math.abs(e - de) <= 10) return d;
  }
  return null;
}

/**
 * İki ardışık gün arasındaki dinlenme, clopening eşiğinin altında mı — SADECE
 * bilgi amaçlı sayaç ve yayın-öncesi kural ihlali uyarısı için. Puana girmez.
 */
export function isClopeningGap(prevDayEndTime: string, startTime: string, rules: Rules): boolean {
  const clOpenMinRest = (rules.clopening_min_rest_hours ?? 13) * 60;
  const legalMinRest = 11 * 60;
  const gap = restGapMin(prevDayEndTime, startTime);
  return gap >= legalMinRest && gap < clOpenMinRest;
}

// ─── Ana Hesaplama ────────────────────────────────────────────────────────────

export interface AssignmentPointsInput {
  day: number;                  // 0=Pzt … 6=Paz
  start_time: string;           // "HH:MM"
  end_time: string;             // "HH:MM"
  base_points: number;          // vardiya zorluğu (1–10)
  is_night?: boolean;
  is_pref_not?: boolean;        // o gün sarı (preferred_not) işaretli mi
  is_hero?: boolean;
  hero_points?: number;         // open_shift bazlı override
  force_points?: number;        // kabul edilmiş zorunlu atama bonusu
}

export interface AssignmentPoints {
  hours: number;
  points: number; // toplam puan
  flags: { weekend: boolean; night: boolean; prefNot: boolean; hard: boolean; hero: boolean; force: boolean };
}

/**
 * TEK vardiyanın puanı — resmi formülün çekirdeği. calcWeeklyPoints ve
 * schedule sayfasının canlı hücre hesabı aynı fonksiyonu kullanır.
 * "Zor vardiya" bayrakları (hafta sonu/gece/sarı gün) OR'lanır — bir vardiya
 * birden fazla kategoriye girse bile hard_shift_points SADECE BİR KEZ eklenir.
 */
export function calcAssignmentPoints(input: AssignmentPointsInput, rules: Rules): AssignmentPoints {
  const hardShiftPoints = rules.hard_shift_points ?? 4;
  const heroBonusPoints = input.hero_points ?? rules.hero_bonus_points ?? 6;
  const forceBonusPoints = input.force_points ?? rules.force_bonus_points ?? 5;

  const hours = durationHours(input.start_time, input.end_time);
  const base = hours * (input.base_points / 5);

  const isWeekend = (input.day === 5 || input.day === 6) && rules.hard_shift_weekend !== false;
  const isNight = (input.is_night ?? false) && rules.hard_shift_night !== false;
  const isPrefNot = (input.is_pref_not ?? false) && rules.hard_shift_preferred_not !== false;
  const isHard = isWeekend || isNight || isPrefNot;
  const isHero = input.is_hero ?? false;
  const isForce = typeof input.force_points === "number" && input.force_points > 0;

  const points = base
    + (isHard ? hardShiftPoints : 0)
    + (isHero ? heroBonusPoints : 0)
    + (isForce ? forceBonusPoints : 0);

  return {
    hours,
    points,
    flags: { weekend: isWeekend, night: isNight, prefNot: isPrefNot, hard: isHard, hero: isHero, force: isForce },
  };
}

/**
 * Bir haftanın tüm atamaları için kişi bazlı puan breakdown döner.
 */
export function calcWeeklyPoints(
  assignments: AssignmentInput[],
  shiftDefs: ShiftDef[],
  availability: AvailabilityInput[],
  rules: Rules,
): BurdenBreakdown[] {
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
    // Günlük atama haritası: day → assignment (clopening bilgi sayacı için)
    const byDay: Record<number, AssignmentInput> = {};
    for (const a of pAssignments) byDay[a.day] = a;

    let totalHours = 0;
    let totalPoints = 0;
    let weekendShifts = 0;
    let nightShifts = 0;
    let prefNotShifts = 0;
    let clOpenCount = 0;
    let heroCount = 0;

    for (const a of pAssignments) {
      const def = defById[a.shift_id] ?? resolveShiftDef(null, a.start_time, a.end_time, shiftDefs);
      const prev = byDay[a.day - 1];

      const result = calcAssignmentPoints({
        day: a.day,
        start_time: a.start_time,
        end_time: a.end_time,
        base_points: def?.base_points ?? 5,
        is_night: def?.is_night ?? false,
        is_pref_not: avail[`day_${a.day}`] === "preferred_not",
        is_hero: a.is_hero ?? false,
        hero_points: a.hero_points,
        force_points: a.force_points,
      }, rules);

      totalHours += result.hours;
      totalPoints += result.points;
      if (result.flags.weekend) weekendShifts++;
      if (result.flags.night) nightShifts++;
      if (result.flags.prefNot) prefNotShifts++;
      if (result.flags.hero) heroCount++;
      // Clopening: sadece bilgi amaçlı sayaç, puanı etkilemez
      if (prev && isClopeningGap(prev.end_time, a.start_time, rules)) clOpenCount++;
    }

    return {
      personnel_id: pid,
      total_hours: Math.round(totalHours * 10) / 10,
      raw_score: Math.round(totalPoints * 10) / 10,
      burden_score: Math.round(totalPoints * 10) / 10,
      weekend_shifts: weekendShifts,
      night_shifts: nightShifts,
      pref_not_shifts: prefNotShifts,
      clopening_count: clOpenCount,
      hero_count: heroCount,
    };
  });
}

/**
 * Düz toplam kümülatif puan — decay YOK, sabit pencere.
 * history: kronolojik sırada (en eski önce), son eleman bu haftayı içermez.
 * currentWeekPoints: bu haftanın puanı.
 * adjustmentsByWeek: { week_start → Σ score_adjustments.points }.
 */
export function calcCumulativeWindow(
  history: ScoreHistoryEntry[],
  currentWeekPoints: number,
  windowWeeks = 4,
  adjustmentsByWeek?: Record<string, number>,
  currentWeekStart?: string,
): number {
  // Sondan al (en yeni önce), pencere kadar
  const recent = [...history].reverse().slice(0, Math.max(0, windowWeeks - 1));
  const adjFor = (week: string | undefined) =>
    week && adjustmentsByWeek ? (adjustmentsByWeek[week] ?? 0) : 0;

  let cumulative = currentWeekPoints + adjFor(currentWeekStart);
  for (const h of recent) {
    cumulative += h.burden_score + adjFor(h.week_start);
  }
  return Math.round(cumulative * 100) / 100;
}

export interface FairnessRank {
  rank: number;      // 1 = en az yüklü
  teamSize: number;
  percentile: number; // 0-100, yüksek = az yüklü
}

/**
 * Takım içi sıralama — puana göre artan, deterministik tie-break (personnel_id).
 * personPoints: { personnel_id → cumulative_points }
 */
export function calcFairnessRank(
  personPoints: Record<string, number>,
): Record<string, FairnessRank> {
  const entries = Object.entries(personPoints);
  const teamSize = entries.length;
  if (teamSize === 0) return {};

  const sorted = [...entries].sort(([idA, a], [idB, b]) => a - b || idA.localeCompare(idB));

  const result: Record<string, FairnessRank> = {};
  sorted.forEach(([pid], i) => {
    const rank = i + 1;
    result[pid] = {
      rank,
      teamSize,
      percentile: teamSize > 1 ? Math.round(((teamSize - rank) / (teamSize - 1)) * 100) : 100,
    };
  });
  return result;
}

/**
 * Percentile'ı kullanıcıya anlamlı Türkçe metne dönüştürür.
 * percentile: 0-100, yüksek = takımda az yüklü.
 */
export function fairnessLabel(percentile: number): { text: string; level: "low" | "ok" | "high" } {
  if (percentile >= 75) return { text: "Az yüklü, sıra sende", level: "low" };
  if (percentile >= 40) return { text: "Takım ortalamasında", level: "ok" };
  if (percentile >= 20) return { text: "Ortalamanın üstü yük", level: "ok" };
  return { text: "Çok yüklü, yük azaltılmalı", level: "high" };
}
