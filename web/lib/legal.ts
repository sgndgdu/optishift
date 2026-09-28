/**
 * İş Kanunu sınırları, tek kaynak (vardiya düzenleyici, yayın kontrolü, Plan Asistanı).
 * Motorun kesin kuralları ayrıca engine/optishift_engine.py'de.
 */

/** m.63: günlük çalışma süresi 11 saati aşamaz (mola çalışma süresine dahil değildir). */
export const DAILY_MAX_NET_HOURS = 11;

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
export function netWorkHours(grossHours: number): number {
  return Math.max(0, grossHours - legalBreakHours(grossHours));
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
