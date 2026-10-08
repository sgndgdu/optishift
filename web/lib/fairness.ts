/**
 * Adalet motoru — additive rewrite (2026-09-20).
 *
 * Formüller:
 *   puan        = saat × (base_points/5) + zor_gün_puanı
 *                 + (kahraman_mi ? hero_bonus_points : 0) + (zorunlu_atama_mi ? force_bonus_points : 0)
 *                 + (başka_şubede_mi ? away_shift_points : 0)   — 2026-10-08
 *   zor_gün_puanı = max(haftanın günü puanı, resmi tatil puanı, işletmenin özel günü puanı, tercih etmem puanı)
 *                   — her biri ayrı ayarlanır (2026-10-07), birden fazlası geçerliyse EN YÜKSEĞİ yazılır, toplanmaz.
 *                   Eski tek puan + iki bayrak (hard_shift_points/weekend/preferred_not) resolveHardDayRules'ta çevrilir.
 *   Gece vardiyasının zorluğu SADECE vardiya tanımındaki zorluktan (base_points) gelir (2026-10-03,
 *   tek yer kuralı); eski hard_shift_night bayrağı okunmaz.
 *   kümülatif   = Σ(son N hafta puanı) + Σ(o pencerede score_adjustments.points)   — decay YOK, düz toplam
 *   takım_sırası= puana göre artan sıralama → percentile (0-100, yüksek=az yüklü)
 *
 * Clopening artık puanı hiç etkilemez — sadece yayın öncesi kural ihlali uyarısında
 * kullanılan ayrı bir mekanizmadır (rules.clopening_min_rest_hours).
 */

import { isNightTime } from "@/lib/legal";
import { getHolidaysForDate } from "@/lib/holidays";

export interface ShiftDef {
  id: string;
  name: string;
  base_points: number;   // vardiya zorluğu (1–10) — saat ile çarpılır (base/5), zaten var olan alan
  start: string;         // "HH:MM"
  end: string;           // "HH:MM"
  is_night?: boolean;
}

/** İşletmenin kendi belirlediği ek puanlı gün (örn. yerel festival, yılbaşı gecesi) */
export interface SpecialDatePoints { date: string; name: string; points: number }

export interface Rules {
  // Zor günler (2026-10-07): her güne ayrı puan, 0 = zor sayılmaz
  hard_day_points?: number[];          // 7 eleman, 0=Pzt … 6=Paz
  holiday_points?: number;             // resmi tatil ve bayram günleri
  pref_not_points?: number;            // kişinin "tercih etmem" dediği gün
  special_date_points?: SpecialDatePoints[];
  // Eski model (sadece okunur, yeni alanlar yoksa çevrilir)
  hard_shift_points?: number;
  hard_shift_weekend?: boolean;
  hard_shift_preferred_not?: boolean;
  // Bonuslar — düz puan, 0 = kapalı
  hero_bonus_points?: number;          // varsayılan 6
  force_bonus_points?: number;         // varsayılan 5
  away_shift_points?: number;          // başka şubede çalışılan her vardiya (kendi şubesi dışı), varsayılan 3
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
  is_away?: boolean;     // kişinin ana şubesi dışındaki şubede (ödünç, şubeler arası rotasyon, ortak çalışan)
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

// ─── Zor günler ───────────────────────────────────────────────────────────────

export interface HardDayRules {
  dayPoints: number[];      // 0=Pzt … 6=Paz
  holidayPoints: number;
  prefNotPoints: number;
  specialDates: SpecialDatePoints[];
}

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : d);

/** Zor gün ayarlarını tek biçime çevirir. Yeni alanlar yoksa eski tek puan + iki bayrak modelinden türetilir. */
export function resolveHardDayRules(rules: Rules | null | undefined): HardDayRules {
  const r = rules ?? {};
  const legacy = num(r.hard_shift_points, 4);
  const legacyWeekend = r.hard_shift_weekend !== false ? legacy : 0;
  const dayPoints = Array.isArray(r.hard_day_points) && r.hard_day_points.length === 7
    ? r.hard_day_points.map(v => num(v, 0))
    : [0, 0, 0, 0, 0, legacyWeekend, legacyWeekend];
  return {
    dayPoints,
    holidayPoints: num(r.holiday_points, 0),
    prefNotPoints: num(r.pref_not_points, r.hard_shift_preferred_not !== false ? legacy : 0),
    specialDates: Array.isArray(r.special_date_points)
      ? r.special_date_points.filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && num(x.points, 0) > 0)
      : [],
  };
}

export const DAY_NAMES_TR = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

export type HardDayReason = { label: string; points: number };

/**
 * Bir günün (kişiden bağımsız) zor gün puanı ve gerekçeleri. `date` verilmezse sadece haftanın günü bakılır.
 * Gerekçeler puana göre büyükten küçüğe; yazılan puan ilkinin puanıdır.
 */
export function dayHardReasons(day: number, date: string | undefined, hr: HardDayRules): HardDayReason[] {
  const out: HardDayReason[] = [];
  if (hr.dayPoints[day] > 0) out.push({ label: DAY_NAMES_TR[day], points: hr.dayPoints[day] });
  if (date) {
    const hol = getHolidaysForDate(date)[0];
    if (hol && hr.holidayPoints > 0) out.push({ label: hol.name, points: hr.holidayPoints });
    for (const s of hr.specialDates) if (s.date === date) out.push({ label: s.name || "Özel gün", points: s.points });
  }
  return out.sort((a, b) => b.points - a.points);
}

/** Haftanın 7 günü için kişiden bağımsız zor gün puanı (motora bu gönderilir). */
export function weekDayExtraPoints(weekStart: string, rules: Rules | null | undefined): number[] {
  const hr = resolveHardDayRules(rules);
  return Array.from({ length: 7 }, (_, d) => dayHardReasons(d, isoAddDays(weekStart, d), hr)[0]?.points ?? 0);
}

// Hafta henüz bilinmiyorsa (sayfanın ilk çizimi weekStart = "") tarih yok, sadece haftanın günü bakılır
function isoAddDays(iso: string, n: number): string | undefined {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return Number.isNaN(t.getTime()) ? undefined : t.toISOString().slice(0, 10);
}

// ─── Ana Hesaplama ────────────────────────────────────────────────────────────

export interface AssignmentPointsInput {
  day: number;                  // 0=Pzt … 6=Paz
  start_time: string;           // "HH:MM"
  end_time: string;             // "HH:MM"
  base_points: number;          // vardiya zorluğu (1–10)
  date?: string;                // "YYYY-MM-DD" — resmi tatil ve özel gün için (yoksa sadece haftanın günü)
  is_night?: boolean;
  is_pref_not?: boolean;        // o gün sarı (preferred_not) işaretli mi
  is_hero?: boolean;
  hero_points?: number;         // open_shift bazlı override
  force_points?: number;        // kabul edilmiş zorunlu atama bonusu
  is_away?: boolean;            // ana şubesi dışında çalışılan vardiya: rules.away_shift_points
}

export interface AssignmentPoints {
  hours: number;
  points: number; // toplam puan
  flags: { weekend: boolean; night: boolean; prefNot: boolean; hard: boolean; hero: boolean; force: boolean; away: boolean };
  /** Zor gün gerekçeleri (büyükten küçüğe); yazılan ek puan `hardPoints` */
  hardReasons: HardDayReason[];
  hardPoints: number;
}

/**
 * TEK vardiyanın puanı — resmi formülün çekirdeği. calcWeeklyPoints ve
 * schedule sayfasının canlı hücre hesabı aynı fonksiyonu kullanır.
 * Zor gün puanı: haftanın günü, resmi tatil, özel gün ve "tercih etmem" ayrı ayrı puanlanır;
 * birden fazlası geçerliyse EN YÜKSEĞİ yazılır (toplanmaz).
 */
export function calcAssignmentPoints(input: AssignmentPointsInput, rules: Rules): AssignmentPoints {
  const hr = resolveHardDayRules(rules);
  const heroBonusPoints = input.hero_points ?? rules.hero_bonus_points ?? 6;
  const forceBonusPoints = input.force_points ?? rules.force_bonus_points ?? 5;
  const awayPoints = rules.away_shift_points ?? 3;

  const hours = durationHours(input.start_time, input.end_time);
  const base = hours * (input.base_points / 5);

  const reasons = dayHardReasons(input.day, input.date, hr);
  const isPrefNot = (input.is_pref_not ?? false) && hr.prefNotPoints > 0;
  if (isPrefNot) reasons.push({ label: "Tercih etmem günü", points: hr.prefNotPoints });
  reasons.sort((a, b) => b.points - a.points);
  const hardPoints = reasons[0]?.points ?? 0;

  const isWeekend = (input.day === 5 || input.day === 6) && hr.dayPoints[input.day] > 0;
  // Gece bayrağı bilgi içindir; puana zorluk (base_points) üzerinden yansır
  const isNight = input.is_night ?? false;
  const isHard = hardPoints > 0;
  const isHero = input.is_hero ?? false;
  const isForce = typeof input.force_points === "number" && input.force_points > 0;
  const isAway = (input.is_away ?? false) && awayPoints > 0;

  const points = base
    + hardPoints
    + (isHero ? heroBonusPoints : 0)
    + (isForce ? forceBonusPoints : 0)
    + (isAway ? awayPoints : 0);

  return {
    hours,
    points,
    flags: { weekend: isWeekend, night: isNight, prefNot: isPrefNot, hard: isHard, hero: isHero, force: isForce, away: isAway },
    hardReasons: reasons,
    hardPoints,
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
  weekStart?: string,
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
        date: weekStart ? isoAddDays(weekStart, a.day) : undefined,
        start_time: a.start_time,
        end_time: a.end_time,
        base_points: def?.base_points ?? 5,
        is_night: isNightTime(a.start_time, a.end_time),
        is_pref_not: avail[`day_${a.day}`] === "preferred_not",
        is_hero: a.is_hero ?? false,
        hero_points: a.hero_points,
        force_points: a.force_points,
        is_away: a.is_away ?? false,
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

/** Adalet çubuğu rengi: etiketle aynı ±%20 kuralı (herkes eşitken hepsi mavi, kırmızı değil). */
export function fairnessBarColor(burden: number, teamAvg: number): string {
  if (!(teamAvg > 0)) return "bg-blue-400";
  if (burden < teamAvg * 0.8) return "bg-emerald-500";
  if (burden > teamAvg * 1.2) return "bg-red-400";
  return "bg-blue-400";
}

/**
 * Takım ortalamasına göre yük etiketi (raporda ve personel portalında gösterilen).
 * Sıraya değil puan farkına bakar: herkes birbirine yakınsa kimse "çok yüklü" olmaz,
 * eşit puanlı iki kişi aynı etiketi alır. Eşikler rapordaki çubuk rengiyle aynı (±%20).
 */
export function fairnessLabelFromAverage(burden: number, teamAvg: number): { text: string; level: "low" | "ok" | "high" } {
  if (!(teamAvg > 0)) return { text: "Takım ortalamasında", level: "ok" };
  const ratio = burden / teamAvg;
  if (ratio < 0.8) return { text: "Az çalıştı, sıradaki vardiyalar önce ona", level: "low" };
  if (ratio > 1.2) return { text: "Çok çalıştı, daha az vardiya verilmeli", level: "high" };
  if (ratio > 1.05) return { text: "Ortalamanın üstünde çalıştı", level: "ok" };
  return { text: "Takım ortalamasında", level: "ok" };
}

/**
 * Aynı kural, personelin kendisine hitap eden dille (portal). "Yük azaltılmalı" gibi
 * müdüre yönelik cümleler personele gösterilmez.
 */
export function fairnessLabelForEmployee(burden: number, teamAvg: number): { text: string; level: "low" | "ok" | "high" } {
  const { level } = fairnessLabelFromAverage(burden, teamAvg);
  const ratio = teamAvg > 0 ? burden / teamAvg : 1;
  if (level === "low") return { text: "Ekibe göre daha az çalıştınız", level };
  if (level === "high") return { text: "Son haftalarda ekibe göre fazla çalıştınız", level };
  return { text: ratio > 1.05 ? "Ortalamanın biraz üstünde" : "Ekip ortalamasında", level };
}

/**
 * Percentile'ı kullanıcıya anlamlı Türkçe metne dönüştürür.
 * percentile: 0-100, yüksek = takımda az yüklü.
 */
export function fairnessLabel(percentile: number): { text: string; level: "low" | "ok" | "high" } {
  if (percentile >= 75) return { text: "Az çalıştı, sıradaki vardiyalar önce ona", level: "low" };
  if (percentile >= 40) return { text: "Takım ortalamasında", level: "ok" };
  if (percentile >= 20) return { text: "Ortalamanın üstünde çalıştı", level: "ok" };
  return { text: "Çok çalıştı, daha az vardiya verilmeli", level: "high" };
}

/**
 * Adalet Puanı'nın yanındaki açıklama (kullanıcı kararı 2026-10-04: sayı kalır, yanına anlamı yazılır):
 * "ortalamanın %12 üstü" / "%8 altı" / "ekip ortalamasında" (±%5 içinde).
 */
export function scoreVsAverageText(score: number, teamAvg: number): string {
  if (!(teamAvg > 0)) return "ekip ortalamasında";
  const pct = Math.round(((score - teamAvg) / teamAvg) * 100);
  if (Math.abs(pct) < 5) return "ekip ortalamasında";
  return pct > 0 ? `ortalamanın %${pct} üstü` : `ortalamanın %${-pct} altı`;
}

/** Puanı Türkçe biçimde yazar (331,6). */
export function formatScore(score: number): string {
  return (Math.round(score * 10) / 10).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
}
