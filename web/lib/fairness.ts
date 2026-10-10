/**
 * Adalet Puanı — TEK formül (2026-10-10 yeniden kurulum, kullanıcı onayı).
 *
 * Birim: 1 puan = sıradan bir vardiyada 1 saat çalışmak. Bütün ekler bu saatin üstüne YÜZDE olarak eklenir,
 * böylece her ek vardiyanın uzunluğuyla orantılıdır. Basamaklar İş Kanunu'na dayanır: zor %50 (m.41 fazla
 * çalışma zammı), çok zor %100 (m.47 bayram çalışması). Ekip anketi ara değerleri verir (ortanca 5 = %0, üstündeki
 * her puan %20).
 *
 *   puan     = saat × (1 + vardiya zorluğu% + gün% + tercih etmem%)
 *              + (boş vardiyayı aldıysa saat × hero%) + (izin gününde çağrıldıysa saat × force%)
 *              + (başka şubedeyse yol süresi dk ÷ 60)
 *   gün%     = haftanın günü, resmi tatil, işletmenin özel günü arasından EN YÜKSEĞİ (aynı günü anlatırlar)
 *   tercih etmem kişiye özeldir, takvimle yarışmaz: ayrıca eklenir.
 *   Yayından sonra saati değişen: kaydırılan saat kadar puan olayı (score_adjustments, changeCompensationHours).
 *   kümülatif = son N haftanın toplamı + puan olayları; kişinin sistemde olmadığı ve onaylı izinli olduğu günler
 *               ekibin o haftaki ortalamasıyla doldurulur (lib/scoring).
 *   Karşılaştırma kişinin haftalık süresine oranlanır (fairnessWeight): yarı zamanlı kendi süresiyle ölçülür.
 * Gece ek puan almaz, zorluğu vardiya tanımından gelir. Clopening puanı etkilemez.
 */

import { isNightTime } from "@/lib/legal";
import { getHolidaysForDate } from "@/lib/holidays";

export interface ShiftDef {
  id: string;
  name: string;
  /** Vardiya zorluğu eki (%): 0 sıradan, 50 zor, 100 çok zor; anketten ara değer gelebilir */
  difficulty_pct?: number;
  /** Eski zorluk (1-10). difficulty_pct yoksa çevrilir: 7 ve üstü zor (%50), altı sıradan */
  base_points?: number;
  start: string;         // "HH:MM"
  end: string;           // "HH:MM"
  is_night?: boolean;
}

/** Zorluk basamakları (Ayarlar seçicisi ve kurulum). */
export const DIFFICULTY_LEVELS = [
  { label: "Sıradan", pct: 0 },
  { label: "Zor", pct: 50 },
  { label: "Çok zor", pct: 100 },
] as const;

const pctNum = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(200, Math.max(0, v)) : d);

/** Vardiya tanımının zorluk eki (%). */
export function shiftDifficultyPct(def: { difficulty_pct?: unknown; base_points?: unknown } | null | undefined): number {
  if (!def) return 0;
  if (typeof def.difficulty_pct === "number" && Number.isFinite(def.difficulty_pct)) return pctNum(def.difficulty_pct, 0);
  return Number(def.base_points ?? 5) >= 7 ? 50 : 0;
}

/** Zorluk ekinin adı: "Sıradan", "Zor", "Çok zor" ya da anketten gelen ara değer "%60". */
export function difficultyLabel(pct: number): string {
  const lvl = DIFFICULTY_LEVELS.find(l => l.pct === pct);
  return lvl ? lvl.label : `%${pct}`;
}

/**
 * İşletmenin kendi belirlediği ek puanlı gün (örn. yerel festival, yılbaşı gecesi). `pct` vardiyanın yüzdesi.
 * shift_ids boşsa günün bütün vardiyaları, doluysa sadece o vardiyalar ek alır (2026-10-08).
 * repeat: "monthly_day" her ay aynı gün (ay kısaysa son gün), "monthly_last" her ayın son günü; tarih başlangıçtır.
 * `points` eski düz puandır (8 saatlik vardiya üzerinden yüzdeye çevrilir).
 */
export type SpecialDateRepeat = "none" | "monthly_day" | "monthly_last";
export interface SpecialDatePoints { date: string; name: string; pct?: number; points?: number; shift_ids?: string[]; repeat?: SpecialDateRepeat }

export interface Rules {
  // Zor günler (%), 0 = zor sayılmaz
  hard_day_pct?: number[];             // 7 eleman, 0=Pzt … 6=Paz
  holiday_pct?: number;                // resmi tatil ve bayram, varsayılan 100 (İş K. m.47)
  pref_not_pct?: number;               // kişinin "tercih etmem" dediği gün, varsayılan 50
  special_date_points?: SpecialDatePoints[];
  // Ek puan verilen durumlar: her biri açılıp kapanır
  hero_bonus_enabled?: boolean;        // boş kalan vardiyayı alan; varsayılan açık
  hero_bonus_pct?: number;             // vardiyanın yüzdesi, varsayılan 50
  force_bonus_enabled?: boolean;       // izin gününde çalışmaya çağrılan; varsayılan açık
  force_bonus_pct?: number;            // vardiyanın yüzdesi, varsayılan 100
  away_shift_enabled?: boolean;        // başka şubede çalışılan vardiya; varsayılan kapalı
  away_travel_minutes?: number;        // yol süresi (dk), puan = dk ÷ 60
  change_compensation_enabled?: boolean; // yayından sonra saati değişen: kaydırılan saat kadar; varsayılan açık
  force_comp_leave_enabled?: boolean;  // izin gününde çağrılıp gelene 1 gün denkleştirme izni (lib/compLeave), puandan ayrı
  // Eski düz puanlar (sadece okunur; yeni alan yoksa çevrilir)
  hard_day_points?: number[];
  holiday_points?: number;
  pref_not_points?: number;
  away_shift_points?: number;
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
  is_hero?: boolean;     // kimsenin almadığı ilandan aldı
  is_force?: boolean;    // izin gününde çağrıldı ve kabul etti
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
  raw_score: number;        // burden_score ile aynı, call site uyumluluğu için tutulur
  burden_score: number;     // toplam puan
  weekend_shifts: number;
  night_shifts: number;
  pref_not_shifts: number;
  clopening_count: number;  // bilgi amaçlı, puanı etkilemez
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

/** Vardiyanın brüt süresi (saat), gece geçişi dahil. Adalet Puanı brüt süreyle hesaplanır. */
export function shiftSpanHours(start: string, end: string): number {
  return durationHours(start, end);
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
  dayPct: number[];         // 0=Pzt … 6=Paz
  holidayPct: number;
  prefNotPct: number;
  specialDates: (SpecialDatePoints & { pct: number })[];
}

/** Eski düz puanı yüzdeye çevirir: 8 saatlik vardiya üzerinden, 5'in katına yuvarlanır (4 puan → %50). */
export const legacyPointsToPct = (points: number) => Math.round((points / 8) * 100 / 5) * 5;

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : d);

/** Zor gün ayarlarını tek biçime çevirir. Yeni (%) alanlar yoksa eski düz puanlardan türetilir. */
export function resolveHardDayRules(rules: Rules | null | undefined): HardDayRules {
  const r = rules ?? {};
  let dayPct: number[];
  if (Array.isArray(r.hard_day_pct) && r.hard_day_pct.length === 7) dayPct = r.hard_day_pct.map(v => pctNum(v, 0));
  else if (Array.isArray(r.hard_day_points) && r.hard_day_points.length === 7) dayPct = r.hard_day_points.map(v => legacyPointsToPct(num(v, 0)));
  // Eski tek puan (hard_shift_points) okunmaz: canlı şubeler scripts/migrate_fairness_v2.mjs ile çevrildi; yeni
  // şubede haftanın günleri 0 başlar, değeri ekip anketi ya da hesap sahibi verir (kullanıcı kararı 2026-10-10)
  else dayPct = [0, 0, 0, 0, 0, 0, 0];
  const specialDates = (Array.isArray(r.special_date_points) ? r.special_date_points : [])
    .filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date))
    .map(x => ({ ...x, pct: typeof x.pct === "number" ? pctNum(x.pct, 0) : legacyPointsToPct(num(x.points, 0)) }))
    .filter(x => x.pct > 0);
  return {
    dayPct,
    holidayPct: pctNum(r.holiday_pct, 100),
    prefNotPct: pctNum(r.pref_not_pct, 50),
    specialDates,
  };
}

/** Ek puan verilen durumların çözülmüş hali (varsayılanlarla). */
export interface BonusRules { heroPct: number; forcePct: number; awayMinutes: number; changeComp: boolean }
export function resolveBonusRules(rules: Rules | null | undefined): BonusRules {
  const r = rules ?? {};
  return {
    heroPct: r.hero_bonus_enabled === false ? 0 : pctNum(r.hero_bonus_pct, 50),
    forcePct: r.force_bonus_enabled === false ? 0 : pctNum(r.force_bonus_pct, 100),
    awayMinutes: r.away_shift_enabled === true
      ? num(r.away_travel_minutes, typeof r.away_shift_points === "number" ? r.away_shift_points * 60 : 0)
      : 0,
    changeComp: r.change_compensation_enabled !== false,
  };
}

export const DAY_NAMES_TR = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

export type HardDayReason = { label: string; pct: number };

/**
 * Bir günün (kişiden bağımsız) zor gün eki ve gerekçeleri. `date` verilmezse sadece haftanın günü bakılır.
 * Gerekçeler büyükten küçüğe; uygulanan ek ilkinin yüzdesidir.
 */
export function dayHardReasons(day: number, date: string | undefined, hr: HardDayRules, shiftId?: string | null): HardDayReason[] {
  const out: HardDayReason[] = [];
  if (hr.dayPct[day] > 0) out.push({ label: DAY_NAMES_TR[day], pct: hr.dayPct[day] });
  if (date) {
    const hol = getHolidaysForDate(date)[0];
    if (hol && hr.holidayPct > 0) out.push({ label: hol.name, pct: hr.holidayPct });
    for (const s of hr.specialDates) {
      if (!specialDateOn(s, date)) continue;
      // Vardiyaya özel gün: vardiya bilinmiyorsa (gün geneli hesap) sayılmaz
      if (s.shift_ids?.length && !(shiftId && s.shift_ids.includes(shiftId))) continue;
      out.push({ label: s.name || "Özel gün", pct: s.pct });
    }
  }
  return out.sort((a, b) => b.pct - a.pct);
}

/** Özel gün bu tarihe denk geliyor mu (tek sefer ya da her ay tekrar). */
export function specialDateOn(s: SpecialDatePoints, date: string): boolean {
  const repeat = s.repeat ?? "none";
  if (repeat === "none") return s.date === date;
  if (date < s.date) return false;
  const [y, m, d] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (repeat === "monthly_last") return d === lastDay;
  const want = Number(s.date.slice(8, 10));
  return d === Math.min(want, lastDay);
}

/** Haftanın 7 günü için kişiden ve vardiyadan bağımsız zor gün eki (%) (motora bu gönderilir). */
export function weekDayExtraPct(weekStart: string, rules: Rules | null | undefined): number[] {
  const hr = resolveHardDayRules(rules);
  return Array.from({ length: 7 }, (_, d) => dayHardReasons(d, isoAddDays(weekStart, d), hr)[0]?.pct ?? 0);
}

/**
 * Sadece belirli vardiyalara ait özel günlerin haftalık eki: { vardiya kimliği → 7 gün (%) }.
 * Değer o vardiyanın o gündeki en yüksek zor gün ekidir (gün geneli dahil). Motora gönderilir.
 */
export function weekShiftExtraPct(weekStart: string, rules: Rules | null | undefined): Record<string, number[]> {
  const hr = resolveHardDayRules(rules);
  const ids = new Set(hr.specialDates.flatMap(s => s.shift_ids ?? []));
  const out: Record<string, number[]> = {};
  for (const id of ids) {
    out[id] = Array.from({ length: 7 }, (_, d) => dayHardReasons(d, isoAddDays(weekStart, d), hr, id)[0]?.pct ?? 0);
  }
  return out;
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
  difficulty_pct: number;       // vardiya zorluğu eki (shiftDifficultyPct)
  date?: string;                // "YYYY-MM-DD", resmi tatil ve özel gün için (yoksa sadece haftanın günü)
  shift_id?: string | null;     // vardiyaya özel günler için (shift_definitions id)
  is_night?: boolean;
  is_pref_not?: boolean;        // o gün "tercih etmem" işaretli mi
  is_hero?: boolean;
  is_force?: boolean;
  is_away?: boolean;
}

export interface AssignmentPoints {
  hours: number;
  points: number; // toplam puan
  /** Puanın parçaları: saat, zorluk/gün/tercih ekleri (puan), boş vardiya, izin günü, yol */
  parts: { hours: number; difficulty: number; day: number; prefNot: number; hero: number; force: number; away: number };
  /** Uygulanan yüzdeler */
  pct: { difficulty: number; day: number; prefNot: number; hero: number; force: number };
  flags: { weekend: boolean; night: boolean; prefNot: boolean; hard: boolean; hero: boolean; force: boolean; away: boolean };
  /** Zor gün gerekçeleri (büyükten küçüğe); uygulanan ilkinin yüzdesi */
  hardReasons: HardDayReason[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * TEK vardiyanın puanı, resmi formülün çekirdeği. calcWeeklyPoints, Vardiya Planı'nın canlı hesabı ve
 * açıklamalar aynı fonksiyonu kullanır.
 */
export function calcAssignmentPoints(input: AssignmentPointsInput, rules: Rules): AssignmentPoints {
  const hr = resolveHardDayRules(rules);
  const bonus = resolveBonusRules(rules);
  const hours = durationHours(input.start_time, input.end_time);

  const reasons = dayHardReasons(input.day, input.date, hr, input.shift_id);
  const dayPct = reasons[0]?.pct ?? 0;
  const prefPct = input.is_pref_not && hr.prefNotPct > 0 ? hr.prefNotPct : 0;
  const diffPct = pctNum(input.difficulty_pct, 0);
  const heroPct = input.is_hero ? bonus.heroPct : 0;
  const forcePct = input.is_force ? bonus.forcePct : 0;
  const away = input.is_away ? bonus.awayMinutes / 60 : 0;

  const parts = {
    hours,
    difficulty: hours * diffPct / 100,
    day: hours * dayPct / 100,
    prefNot: hours * prefPct / 100,
    hero: hours * heroPct / 100,
    force: hours * forcePct / 100,
    away,
  };
  const points = parts.hours + parts.difficulty + parts.day + parts.prefNot + parts.hero + parts.force + parts.away;

  return {
    hours,
    points,
    parts,
    pct: { difficulty: diffPct, day: dayPct, prefNot: prefPct, hero: heroPct, force: forcePct },
    flags: {
      weekend: (input.day === 5 || input.day === 6) && hr.dayPct[input.day] > 0,
      night: input.is_night ?? false,
      prefNot: prefPct > 0,
      hard: dayPct > 0 || prefPct > 0,
      hero: heroPct > 0,
      force: forcePct > 0,
      away: away > 0,
    },
    hardReasons: reasons,
  };
}

/**
 * Puanın okunur hesabı: "8 saat + zor vardiya %50 (+4) + Cumartesi %60 (+4,8) = 16,8".
 * Vardiya Planı penceresi ve raporlar aynı cümleyi kullanır.
 */
export function explainAssignmentPoints(p: AssignmentPoints): string {
  const f = formatScore;
  const out = [`${f(p.hours)} saat`];
  if (p.parts.difficulty > 0) out.push(`zorluk %${p.pct.difficulty} (+${f(p.parts.difficulty)})`);
  if (p.parts.day > 0) out.push(`${p.hardReasons[0]?.label ?? "zor gün"} %${p.pct.day} (+${f(p.parts.day)})`);
  if (p.parts.prefNot > 0) out.push(`tercih etmem %${p.pct.prefNot} (+${f(p.parts.prefNot)})`);
  if (p.parts.hero > 0) out.push(`boş vardiyayı aldı %${p.pct.hero} (+${f(p.parts.hero)})`);
  if (p.parts.force > 0) out.push(`izin gününde çağrıldı %${p.pct.force} (+${f(p.parts.force)})`);
  if (p.parts.away > 0) out.push(`başka şube yolu (+${f(p.parts.away)})`);
  return out.length === 1 ? `${out[0]} = ${f(p.points)}` : `${out.join(" + ")} = ${f(p.points)}`;
}

/** Boş kalan vardiyayı alanın alacağı ek puan (ilan kartlarında gösterilir): saat × hero%. */
export function heroBonusPointsFor(start: string, end: string, rules: Rules | null | undefined): number {
  return r1(durationHours(start, end) * resolveBonusRules(rules).heroPct / 100);
}

/**
 * Yayından sonra saati değişen vardiyanın telafisi: kaydırılan saat kadar puan. Eski ve yeni saatlerden
 * örtüşmeyen kısmın büyüğü alınır: 08-16 → 12-20 = 4, 08-16 → 08-18 = 2, 08-16 → 08-14 = 2.
 */
export function changeCompensationHours(oldStart: string, oldEnd: string, newStart: string, newEnd: string): number {
  const span = (s: string, e: string) => { const a = toMin(s); let b = toMin(e); if (b <= a) b += 1440; return [a, b] as const; };
  const [os, oe] = span(oldStart, oldEnd);
  const [ns, ne] = span(newStart, newEnd);
  const overlap = Math.max(0, Math.min(oe, ne) - Math.max(os, ns));
  return r1(Math.max(oe - os - overlap, ne - ns - overlap) / 60);
}

/**
 * Bir haftanın tüm atamaları için kişi bazlı puan dökümü.
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

  const byPerson: Record<string, AssignmentInput[]> = {};
  for (const a of assignments) (byPerson[a.personnel_id] ??= []).push(a);

  return Object.entries(byPerson).map(([pid, pAssignments]) => {
    const avail = availById[pid] ?? {};
    const byDay: Record<number, AssignmentInput> = {};
    for (const a of pAssignments) byDay[a.day] = a;

    let totalHours = 0, totalPoints = 0, weekendShifts = 0, nightShifts = 0, prefNotShifts = 0, clOpenCount = 0, heroCount = 0;

    for (const a of pAssignments) {
      const def = defById[a.shift_id] ?? resolveShiftDef(null, a.start_time, a.end_time, shiftDefs);
      const prev = byDay[a.day - 1];
      const result = calcAssignmentPoints({
        day: a.day,
        date: weekStart ? isoAddDays(weekStart, a.day) : undefined,
        shift_id: def?.id ?? null,
        start_time: a.start_time,
        end_time: a.end_time,
        difficulty_pct: shiftDifficultyPct(def),
        is_night: isNightTime(a.start_time, a.end_time),
        is_pref_not: avail[`day_${a.day}`] === "preferred_not",
        is_hero: a.is_hero ?? false,
        is_force: a.is_force ?? false,
        is_away: a.is_away ?? false,
      }, rules);

      totalHours += result.hours;
      totalPoints += result.points;
      if (result.flags.weekend) weekendShifts++;
      if (result.flags.night) nightShifts++;
      if (result.flags.prefNot) prefNotShifts++;
      if (result.flags.hero) heroCount++;
      if (prev && isClopeningGap(prev.end_time, a.start_time, rules)) clOpenCount++;
    }

    return {
      personnel_id: pid,
      total_hours: r1(totalHours),
      raw_score: r1(totalPoints),
      burden_score: r1(totalPoints),
      weekend_shifts: weekendShifts,
      night_shifts: nightShifts,
      pref_not_shifts: prefNotShifts,
      clopening_count: clOpenCount,
      hero_count: heroCount,
    };
  });
}

/**
 * Karşılaştırma ağırlığı: kişinin haftalık sınırı ÷ şubenin tam süresi (en çok 1). Yarı zamanlı kişi kendi
 * süresiyle ölçülür: 27 saatlik kişi 45 saatlik kişinin %60'ı kadar puanla eşit sayılır. Motor da aynısını kullanır.
 */
export function fairnessWeight(personMaxHours: number | null | undefined, branchMaxHours: number | null | undefined): number {
  const full = Number(branchMaxHours) > 0 ? Number(branchMaxHours) : 45;
  const own = Number(personMaxHours) > 0 ? Number(personMaxHours) : full;
  return Math.min(1, Math.max(0.1, own / full));
}

export interface WindowPerson {
  id: string;
  /** fairnessWeight */
  weight: number;
  /** Kişinin sistemde başladığı gün (YYYY-MM-DD); öncesi ekip ortalamasıyla doldurulur */
  startDate: string | null;
  /** week_start → o haftanın puanı (bütün şubeler) */
  hist: Record<string, number>;
  /** week_start → o haftadaki onaylı izin günü sayısı (0-7) */
  leaveDays: Record<string, number>;
  /** week_start → puan olayları toplamı */
  adjustments?: Record<string, number>;
}

/**
 * Pencere puanı (2026-10-10): kişinin çalışmadığı günler 0 sayılmaz. Sistemde olmadığı (başlamadan önceki) ve onaylı
 * izinli olduğu her gün için ekibin o haftaki günlük ortalaması (kişinin ağırlığıyla) eklenir. Böylece yeni gelen ve
 * izinden dönen kişiye zor vardiyalar yığılmaz. Ortalama o hafta tam çalışan kişilerden hesaplanır.
 * Döner: kişi başı toplam puan (cumulative) ve karşılaştırma puanı (comparable = toplam ÷ ağırlık).
 */
export function calcWindowScores(weeks: string[], people: WindowPerson[]): Record<string, { cumulative: number; comparable: number; filled: number }> {
  const absentDays = (p: WindowPerson, w: string): number => {
    let days = Math.min(7, Math.max(0, p.leaveDays[w] ?? 0));
    if (p.startDate) {
      const before = Math.round((Date.parse(p.startDate) - Date.parse(w)) / 86400000);
      if (before > 0) days = Math.max(days, Math.min(7, before));
    }
    return days;
  };
  const avgByWeek: Record<string, number> = {};
  for (const w of weeks) {
    const full = people.filter(p => absentDays(p, w) === 0);
    avgByWeek[w] = full.length ? full.reduce((t, p) => t + (p.hist[w] ?? 0) / p.weight, 0) / full.length : 0;
  }
  const out: Record<string, { cumulative: number; comparable: number; filled: number }> = {};
  for (const p of people) {
    let total = 0, filled = 0;
    for (const w of weeks) {
      const fill = avgByWeek[w] * p.weight * absentDays(p, w) / 7;
      filled += fill;
      total += (p.hist[w] ?? 0) + fill + (p.adjustments?.[w] ?? 0);
    }
    const cumulative = Math.round(total * 100) / 100;
    out[p.id] = { cumulative, comparable: Math.round((cumulative / p.weight) * 100) / 100, filled: Math.round(filled * 10) / 10 };
  }
  return out;
}

/** Karşılaştırma puanı: kişinin puanı kendi haftalık süresine oranlanır (fairnessWeight). */
export function comparableScore(score: number, personMaxHours?: number | null, branchMaxHours?: number | null): number {
  return score / fairnessWeight(personMaxHours, branchMaxHours);
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

/**
 * Adalet Puanı'nın TEK açıklaması (kullanıcı kararı 2026-10-10: her ekranda aynı cümle).
 * forTeam: ekip üyesine "siz" diliyle.
 */
export function fairnessExplainer(windowWeeks?: number | null, forTeam = false): string {
  const w = Number(windowWeeks) > 0 ? Number(windowWeeks) : 4;
  const unit = "1 puan, sıradan bir vardiyada 1 saat çalışmaktır. Zor vardiya, zor gün ve plansız çalışma bu saate yüzde olarak eklenir.";
  return forTeam
    ? `Adalet Puanı son ${w} haftada ne kadar ve ne kadar zor vardiyalarda çalıştığınızı gösterir. ${unit} Puanı düşük olan sıradaki planda önce vardiya alır, yüksek olan daha az alır. İzinli olduğunuz günler ekibin ortalamasıyla sayılır.`
    : `Adalet Puanı her kişinin son ${w} haftada ne kadar ve ne kadar zor vardiyalarda çalıştığını gösterir. ${unit} Puanı düşük olan sıradaki planda önce vardiya alır, yüksek olan daha az alır. İzinli günler ve işe başlamadan önceki günler ekibin ortalamasıyla sayılır, yarı zamanlı çalışan kendi haftalık süresiyle karşılaştırılır.`;
}

/** "ortalamanın %12 altı" → "Ortalamanın %12 altı" (satır başı) */
export const capitalizeTr = (t: string) => (t ? t.charAt(0).toLocaleUpperCase("tr") + t.slice(1) : t);

/** Puanı Türkçe biçimde yazar (331,6). */
export function formatScore(score: number): string {
  return (Math.round(score * 10) / 10).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
}
