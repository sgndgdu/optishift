/**
 * Plan Asistanı: haftanın durumu (saf, DB'ye dokunmaz).
 *
 * Bir şubenin bir haftasını tek bir nesnede toplar: kim kaç saat, kaç gece, kaç
 * hafta sonu çalışıyor, en kısa dinlenmesi ne, izinli/uygun olmadığı günde ataması
 * var mı, hangi gün ve vardiyada personel ihtiyacı ya da zorunlu rol eksik.
 *
 * Kural kontrolleri (checks.ts: yayın öncesi pencere ve Plan Asistanı aynı listeyi kullanır),
 * içgörüler (insights.ts) ve hazır sorular (questions.ts) bu nesneyi okur.
 * İleride dil modeli eklendiğinde aynı nesne bağlam olarak verilecek, hazır sorular
 * da araç olarak tanımlanacak: tek doğruluk kaynağı burası.
 */

import type { ShiftDefinition } from "@/lib/types";
import { addDays } from "@/lib/date";
import { effectiveWeeklyLimit, isNightTime, longestWeeklyRestHours, netWorkMinutes } from "@/lib/legal";

export type DayState = "available" | "partial" | "preferred_not" | "unavailable";

export interface CopilotInput {
  weekStart: string;
  /** Bugün (YYYY-MM-DD, iş saat dilimi). Verilirse geçmiş günler kapsama uyarılarına girmez. */
  today?: string;
  shiftDefs: ShiftDefinition[];
  /** {shiftDefId: {"0".."6": kişi}}; departman tabloları toplanmış olarak gelir. Boşsa ihtiyaç bilinmiyor. */
  demand: Record<string, Record<string, number>>;
  rules: {
    maxWeeklyHours: number;
    minRestHours: number;
    maxConsecutiveDays: number;
    /** Bu saatin altındaki ardışık gün geçişi "kapanıştan açılışa" sayılır (yasal sınırın üstünde olsa da). */
    clopeningMinRestHours: number;
    /** Denkleştirme dönemi (hafta). 2 ve üstünde tam zamanlı personel tek haftada 66 saate kadar çalışabilir. */
    balancingPeriodWeeks: number;
    nightLegalWarning: boolean;
    availabilityCollection: boolean;
    /** Haftanın 7 günü için zor gün eki % (lib/fairness weekDayExtraPct). Yoksa hafta sonu zor sayılır. */
    hardDayPoints?: number[];
  };
  /** Şubenin aktif personeli (atanmamış olanlar dahil). */
  personnel: {
    id: string; name: string; roles: string[]; score: number;
    /** Kişiye özel haftalık sınır (yarı zamanlı vb.); yoksa şube kuralı. */
    maxWeeklyHours?: number | null;
    /** Gece çalışma engeli: pregnant | nursing | under18 | medical */
    nightRestriction?: string | null;
  }[];
  assignments: {
    personnel_id: string; day: number; shift_id: string;
    start_time: string | null; end_time: string | null; publication_status: string | null;
    /** İcap nöbeti kapsamaya sayılır, kişinin çalışma saatine/dinlenmesine sayılmaz */
    kind?: "regular" | "on_call";
    /** Kişinin BAŞKA şubedeki vardiyası (şube adı): saate, dinlenmeye ve yorgunluğa sayılır; bu şubenin kapsamasına sayılmaz */
    elsewhere?: string;
  }[];
  /** Onaylı izinler. */
  leaves: { personnel_id: string; start_date: string; end_date: string; type: string }[];
  /** Uygunluk: personel başına 7 gün. Kayıt yoksa tamamen uygun sayılır. */
  availability: Record<string, DayState[]>;
  /** Personelin gün gün girdiği saat aralığı ("26:00" = ertesi gün 02:00); null = tüm gün. */
  availabilityWindows?: Record<string, ({ start: string; end: string } | null)[]>;
}

export interface PersonShift { day: number; shiftId: string; shiftName: string; start: string; end: string; hours: number; night: boolean; /** Direksiyon süresi (saat), vardiya tanımından */ driving: number; /** Başka şubedeki vardiya (şube adı) */ elsewhere?: string }

export interface PersonWeek {
  id: string;
  name: string;
  roles: string[];
  /** Bu kişi için geçerli haftalık üst sınır (kişiye özel sınır ve denkleştirme dahil). */
  maxHours: number;
  /** Aynı gün hem bu şubede hem başka şubede vardiyası olan günler */
  elsewhereSameDay: { day: number; branch: string }[];
  nightRestriction: string | null;
  /** Uygunluk girmiş mi? */
  hasAvailability: boolean;
  /** Birikimli adalet puanının şube ortalamasına oranı (1 = ortalama). */
  loadRatio: number;
  shifts: PersonShift[];
  hours: number;
  nights: number;
  weekendShifts: number;
  /** Zor vardiya: gece ya da hafta sonu (ikisi birden tek sayılır). */
  hardShifts: number;
  /** Hafta içindeki en uzun ardışık çalışma günü. */
  longestStreak: number;
  /** Ardışık iki vardiya arasındaki en kısa dinlenme (saat); tek vardiyada null. */
  minRestHours: number | null;
  /** Ardışık vardiyalar arası dinlenmeler (günü geçen geçişler). */
  restGaps: { fromDay: number; toDay: number; hours: number }[];
  /** En uzun üst üste gece sayısı. */
  nightStreak: number;
  /** Haftanın en uzun kesintisiz dinlenmesi (saat), İş K. m.46 için. */
  longestRestHours: number;
  /** İzinli olduğu günde atama. */
  onLeaveDays: number[];
  /** "Uygun değilim" dediği günde atama. */
  unavailableDays: number[];
  /** "Tercih etmem" dediği günde atama. */
  preferredNotDays: number[];
  /** Girdiği saat aralığının dışına taşan vardiya: "Uygun" gün (kesin) ve "Esnek" gün (yumuşak) ayrı. */
  outsideWindowDays: number[];
  outsideWindowFlexibleDays: number[];
  /** Haftada izinli olduğu günler (atama olsun olmasın). */
  leaveDays: number[];
  /** Çalışmadığı, izinli ya da uygun değil olmadığı günler. */
  freeDays: number[];
}

export interface ShiftCoverage {
  day: number;
  shiftId: string;
  shiftName: string;
  assigned: number;
  /** null: bu vardiya/gün için ihtiyaç girilmemiş. */
  demand: number | null;
  missingSkills: { skill: string; need: number; have: number }[];
  /** Gün geçti: eksik kişi / rol uyarısı verilmez (artık değiştirilemez). */
  past?: boolean;
}

export interface WeekSnapshot {
  weekStart: string;
  status: "empty" | "draft" | "published";
  rules: CopilotInput["rules"];
  hasDemand: boolean;
  people: PersonWeek[];
  coverage: ShiftCoverage[];
  totalShifts: number;
  totalHours: number;
  /** Vardiyası olan kişilerin ortalama saati. */
  avgHours: number;
  /** Tüm aktif personelin ortalama zor vardiya sayısı (adalet karşılaştırması için). */
  avgHard: number;
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Başlangıç/bitiş dakikası; gece yarısını geçen vardiyada bitiş ertesi güne taşar. */
export function shiftSpan(start: string, end: string): { startMin: number; endMin: number } {
  const s = toMin(start);
  let e = toMin(end);
  if (e <= s) e += 1440;
  return { startMin: s, endMin: e };
}

/** Kaza Risk Radarı'yla aynı tanım: 22:00 ve sonrası başlayan ya da ertesi güne taşan vardiya. */
function isNight(def: ShiftDefinition | undefined, start: string, end: string): boolean {
  void def;
  return isNightTime(start, end);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildWeekSnapshot(input: CopilotInput): WeekSnapshot {
  const defById = new Map(input.shiftDefs.map(d => [d.id, d]));
  const dates = Array.from({ length: 7 }, (_, d) => addDays(input.weekStart, d));
  const avgScore = input.personnel.length
    ? input.personnel.reduce((s, p) => s + p.score, 0) / input.personnel.length
    : 0;

  const leaveDaysOf = (pid: string) => {
    const days = new Set<number>();
    for (const l of input.leaves) {
      if (l.personnel_id !== pid) continue;
      dates.forEach((date, d) => { if (l.start_date <= date && date <= l.end_date) days.add(d); });
    }
    return days;
  };

  const people: PersonWeek[] = input.personnel.map(p => {
    const shifts: PersonShift[] = input.assignments
      .filter(a => a.personnel_id === p.id && a.kind !== "on_call")
      .map(a => {
        const def = defById.get(a.shift_id);
        const start = a.start_time || def?.start || "09:00";
        const end = a.end_time || def?.end || "17:00";
        const { startMin, endMin } = shiftSpan(start, end);
        return {
          day: a.day, shiftId: a.shift_id, shiftName: a.elsewhere ?? def?.name ?? "Özel", start, end, driving: def?.driving_hours ?? 0,
          // Çalışma süresi: mola düşülmüş (lib/legal, tanımdaki mola ya da yasal asgari)
          hours: netWorkMinutes(endMin - startMin, def && def.start === start && def.end === end ? def.break_minutes : undefined) / 60, night: isNight(def, start, end), ...(a.elsewhere ? { elsewhere: a.elsewhere } : {}),
        };
      })
      .sort((a, b) => a.day - b.day || toMin(a.start) - toMin(b.start));

    // Dinlenme: sıradaki vardiyanın başlangıcı ile öncekinin bitişi arası
    let minRest: number | null = null;
    const restGaps: PersonWeek["restGaps"] = [];
    for (let i = 1; i < shifts.length; i++) {
      const prev = shifts[i - 1], cur = shifts[i];
      const prevEnd = prev.day * 1440 + shiftSpan(prev.start, prev.end).endMin;
      const curStart = cur.day * 1440 + toMin(cur.start);
      const rest = (curStart - prevEnd) / 60;
      if (minRest === null || rest < minRest) minRest = rest;
      restGaps.push({ fromDay: prev.day, toDay: cur.day, hours: round1(rest) });
    }

    let nightStreak = 0, nightRun = 0;
    const nightDays = new Set(shifts.filter(s => s.night).map(s => s.day));
    for (let d = 0; d < 7; d++) { nightRun = nightDays.has(d) ? nightRun + 1 : 0; nightStreak = Math.max(nightStreak, nightRun); }

    // Denkleştirme açıkken tam zamanlı personel tek haftada yasal 66 saate kadar esneyebilir
    const personMax = effectiveWeeklyLimit(p.maxWeeklyHours, input.rules.maxWeeklyHours);
    const maxHours = input.rules.balancingPeriodWeeks >= 2 && personMax >= input.rules.maxWeeklyHours ? 66 : personMax;

    // İzin/uygunluk kontrolleri bu şubedeki günlere bakar (başka şubedeki vardiya o şubenin işi)
    const workDays = new Set(shifts.filter(s => !s.elsewhere).map(s => s.day));
    let longest = 0, run = 0;
    for (let d = 0; d < 7; d++) { run = workDays.has(d) ? run + 1 : 0; longest = Math.max(longest, run); }

    const leave = leaveDaysOf(p.id);
    const avail = input.availability[p.id] ?? [];
    const windows = input.availabilityWindows?.[p.id] ?? [];
    // Motorla aynı kural: vardiya [başlangıç, bitiş] aralığın içinde kalmalı
    const outsideOn = (status: DayState) => shifts
      .filter(x => (avail[x.day] ?? "available") === status && windows[x.day] && !leave.has(x.day))
      .filter(x => {
        const w = windows[x.day]!;
        const span = shiftSpan(x.start, x.end);
        return span.startMin < toMin(w.start) || span.endMin > toMin(w.end);
      })
      .map(x => x.day).sort((a, b) => a - b);
    const daysWhere = (pred: (d: number) => boolean) => [...workDays].filter(pred).sort((a, b) => a - b);

    return {
      id: p.id, name: p.name, roles: p.roles,
      maxHours,
      // Aynı gün hem bu şubede hem başka şubede vardiya (paylaşılan personel çakışması)
      elsewhereSameDay: shifts.filter(x => x.elsewhere && shifts.some(y => !y.elsewhere && y.day === x.day)).map(x => ({ day: x.day, branch: x.elsewhere! })),
      nightRestriction: p.nightRestriction ?? null,
      hasAvailability: !!input.availability[p.id],
      loadRatio: avgScore > 0 ? p.score / avgScore : 1,
      shifts,
      hours: round1(shifts.reduce((s, x) => s + x.hours, 0)),
      nights: shifts.filter(s => s.night).length,
      weekendShifts: shifts.filter(s => s.day >= 5).length,
      hardShifts: shifts.filter(s => s.night || (input.rules.hardDayPoints ? input.rules.hardDayPoints[s.day] > 0 : s.day >= 5)).length,
      longestStreak: longest,
      minRestHours: minRest === null ? null : round1(minRest),
      restGaps,
      nightStreak,
      longestRestHours: round1(longestWeeklyRestHours(shifts.map(x => {
        const span = shiftSpan(x.start, x.end);
        return { start: x.day * 1440 + span.startMin, end: x.day * 1440 + span.endMin };
      }))),
      onLeaveDays: daysWhere(d => leave.has(d)),
      // Onaylı izin günü "izinli" olarak ayrıca raporlanır; aynı günü "Gelemem" diye ikinci kez sayma
      unavailableDays: daysWhere(d => avail[d] === "unavailable" && !leave.has(d)),
      preferredNotDays: daysWhere(d => avail[d] === "preferred_not"),
      outsideWindowDays: outsideOn("available"),
      outsideWindowFlexibleDays: outsideOn("preferred_not"),
      leaveDays: [...leave].sort((a, b) => a - b),
      freeDays: [0, 1, 2, 3, 4, 5, 6].filter(d => !workDays.has(d) && !leave.has(d) && avail[d] !== "unavailable"),
    };
  });

  // Kapsama: tanımlı her vardiya × gün
  const personById = new Map(people.map(p => [p.id, p]));
  const hasDemand = Object.values(input.demand).some(row => Object.values(row).some(n => n > 0));
  const coverage: ShiftCoverage[] = [];
  for (const def of input.shiftDefs) {
    for (let d = 0; d < 7; d++) {
      const here = input.assignments.filter(a => a.shift_id === def.id && a.day === d);
      const demandVal = input.demand[def.id]?.[String(d)];
      const missingSkills = here.length === 0 ? [] : (def.required_skills ?? [])
        .map(rs => ({
          skill: rs.skill, need: rs.count,
          have: here.filter(a => personById.get(a.personnel_id)?.roles.includes(rs.skill)).length,
        }))
        .filter(x => x.have < x.need);
      coverage.push({
        day: d, shiftId: def.id, shiftName: def.name, assigned: here.length,
        demand: hasDemand ? (demandVal ?? 0) : null, missingSkills,
        past: !!input.today && dates[d] < input.today,
      });
    }
  }

  // Başka şubedeki vardiyalar bu şubenin plan durumunu ve vardiya sayısını etkilemez
  const local = input.assignments.filter(a => !a.elsewhere);
  const statuses = local.map(a => a.publication_status ?? "published");
  const status: WeekSnapshot["status"] = local.length === 0
    ? "empty" : statuses.includes("published") ? "published" : "draft";

  const staffed = people.length || 1;
  const working = people.filter(p => p.shifts.length > 0);
  return {
    weekStart: input.weekStart,
    status,
    rules: input.rules,
    hasDemand,
    people,
    coverage,
    totalShifts: local.length,
    totalHours: round1(people.reduce((s, p) => s + p.hours, 0)),
    avgHours: round1(working.reduce((s, p) => s + p.hours, 0) / (working.length || 1)),
    avgHard: people.reduce((s, p) => s + p.hardShifts, 0) / staffed,
  };
}
