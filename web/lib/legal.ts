/**
 * İş Kanunu sınırları, tek kaynak (vardiya düzenleyici, yayın kontrolü, Plan Asistanı).
 * Motorun kesin kuralları ayrıca engine/optishift_engine.py'de.
 */

/** m.63: günlük çalışma süresi 11 saati aşamaz (mola çalışma süresine dahil değildir). */
export const DAILY_MAX_NET_HOURS = 11;

/** AETR / AB 561/2006 sürüş süreleri (Karayolu Taşıma Yönetmeliği AETR'yi uygular). */
export const DAILY_DRIVING_MAX_HOURS = 9;
export const DAILY_DRIVING_EXTENDED_HOURS = 10; // haftada en fazla 2 kez
export const WEEKLY_DRIVING_MAX_HOURS = 56;

/** m.63 haftalık 45 saat; m.13 kısmi süreli çalışma tam sürenin üçte ikisine kadar (45 × 2/3 = 30). */
export function defaultWeeklyHours(employmentType: string | null | undefined): number {
  return employmentType === "part_time" ? 30 : 45;
}

/** m.46: yedi günlük dönemde en az 24 saat kesintisiz dinlenme (hafta tatili). */
export const WEEKLY_REST_HOURS = 24;

/** m.68: asgari ara dinlenme. 4 saate kadar 15 dk, 4-7,5 saat 30 dk, 7,5 saatten uzun 1 saat. */
export function legalBreakHours(grossHours: number): number {
  if (grossHours <= 0) return 0;
  if (grossHours <= 4) return 0.25;
  if (grossHours <= 7.5) return 0.5;
  return 1;
}

/** Vardiyanın mola düşülmüş net çalışma süresi (saat). */
export function netWorkHours(grossHours: number, definedBreakMin?: number | null): number {
  return netWorkMinutes(grossHours * 60, definedBreakMin) / 60;
}

/**
 * Mola süresi (dakika), TEK KURAL: vardiya tanımında "Mola ne kadar?" girildiyse o, girilmediyse
 * m.68 asgarisi. Mola vardiya süresinin içindedir ve çalışma süresine sayılmaz (haftalık 45 saat,
 * fazla mesai, raporlar, maliyet). Adalet Puanı vardiyanın tamamına göre kalır.
 */
export function breakMinutes(grossMin: number, definedBreakMin?: number | null): number {
  if (grossMin <= 0) return 0;
  const b = typeof definedBreakMin === "number" && Number.isFinite(definedBreakMin) && definedBreakMin >= 0
    ? definedBreakMin
    : legalBreakHours(grossMin / 60) * 60;
  return Math.min(Math.round(b), grossMin);
}

/** Mola düşülmüş çalışma süresi (dakika). */
export function netWorkMinutes(grossMin: number, definedBreakMin?: number | null): number {
  return Math.max(0, grossMin - breakMinutes(grossMin, definedBreakMin));
}

type BreakDef = { id?: string | number; start?: string; end?: string; break_minutes?: number | null; on_call?: boolean };

/** Atamanın bağlı olduğu vardiya tanımındaki mola (dakika); tanım bulunamazsa ya da girilmemişse undefined (yasal asgari). */
export function definedBreakFor(defs: BreakDef[] | null | undefined, a: { shift_id?: string | number | null; start_time?: string | null; end_time?: string | null }): number | undefined {
  if (!Array.isArray(defs) || defs.length === 0) return undefined;
  const def = (a.shift_id != null && defs.find(d => d.id != null && String(d.id) === String(a.shift_id)))
    || defs.find(d => d.start === a.start_time && d.end === a.end_time);
  return def && typeof def.break_minutes === "number" ? def.break_minutes : undefined;
}

/** "HH:MM"-"HH:MM" atamanın net çalışma dakikası (gece geçişi dahil). */
export function assignmentWorkMinutes(defs: BreakDef[] | null | undefined, a: { shift_id?: string | number | null; start_time?: string | null; end_time?: string | null }): number {
  if (!a.start_time || !a.end_time) return 0;
  const [sh, sm] = a.start_time.split(":").map(Number);
  const [eh, em] = a.end_time.split(":").map(Number);
  const s = sh * 60 + sm;
  let e = eh * 60 + em;
  if (e <= s) e += 1440;
  return netWorkMinutes(e - s, definedBreakFor(defs, a));
}

/**
 * Haftanın en uzun kesintisiz dinlenmesi (saat). Vardiyalar hafta başından (Pzt 00:00)
 * dakika cinsinden [başlangıç, bitiş]; gece geçen vardiyada bitiş ertesi güne taşar.
 * Hafta başı ve sonu da dinlenme sayılır (önceki/sonraki hafta bilinmiyor).
 */
export function longestWeeklyRestHours(spans: { start: number; end: number }[]): number {
  if (spans.length === 0) return 7 * 24;
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let best = sorted[0].start;
  let lastEnd = sorted[0].end;
  for (const s of sorted.slice(1)) {
    best = Math.max(best, s.start - lastEnd);
    lastEnd = Math.max(lastEnd, s.end);
  }
  best = Math.max(best, 7 * 1440 - lastEnd);
  return best / 60;
}

/**
 * Kişinin geçerli haftalık sınırı: şubenin sınırı (rules.max_weekly_hours) ÜST sınırdır; kişinin kendi
 * değeri sadece daha düşükse (yarı zamanlı sözleşme gibi) geçerlidir. Motor da aynı kuralı uygular
 * (engine: min(kural, kişi)). Tek kaynak: plan kontrolü, elle atama kontrolü ve aday sıralaması.
 */
export function effectiveWeeklyLimit(personMax: number | null | undefined, ruleMax: number): number {
  return typeof personMax === "number" && personMax > 0 ? Math.min(personMax, ruleMax) : ruleMax;
}

/** locations.shift_definitions (JSON metin ya da dizi) → mola hesabı için tanım listesi. */
export function shiftDefsFrom(raw: unknown): BreakDef[] {
  try {
    const d = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(d) ? d : [];
  } catch { return []; }
}

/** Mola süresinin kısa yazımı: "15 dk", "1 saat", "1,5 saat" */
export function formatBreak(min: number): string {
  if (min <= 0) return "Mola yok";
  if (min < 60) return `${min} dk`;
  return `${(min / 60).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} saat`;
}

/**
 * Gece vardiyası TEK KURAL (2026-10-07, elle "Gece" işareti kaldırıldı): 22:00 ve sonrası başlayan, gece yarısını geçen
 * ya da süresinin yarıdan fazlası 00:00-06:00 arasında olan vardiya. 16:00-24:00 gece sayılmaz.
 * Motor da aynı sonucu kullanır (generatePlan vardiyaya is_night olarak bunu yazar).
 */
export function isNightTime(start?: string | null, end?: string | null): boolean {
  if (!start || !end) return false;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return false;
  const s = sh * 60 + sm;
  let e = eh * 60 + em;
  if (e <= s) e += 1440;
  if (s >= 22 * 60 || e > 24 * 60) return true;
  const early = Math.max(0, Math.min(e, 6 * 60) - s); // 00:00-06:00 ile kesişen dakika (gece yarısını geçmeyen vardiya)
  return early * 2 > e - s;
}

export function isNightDef(d?: { start?: string | null; end?: string | null } | null): boolean {
  return !!d && isNightTime(d.start, d.end);
}
