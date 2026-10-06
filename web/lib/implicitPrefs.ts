/**
 * Örtük tercih öğrenme: kişinin girmediği ama davranışından belli olan tercihleri.
 *  - Uygunluk geçmişi: son haftalarda bir haftanın gününü çoğunlukla "gelemem" ya da
 *    "tercih etmem" işaretlemiş (en az 3 hafta ve girdiği haftaların yarısı) → o gün kaçınılır.
 *    Bu hafta uygunluk girdiyse ondan öğrenilmez (açık tercih her zaman önce gelir).
 *  - Takas geçmişi: aynı gün + vardiyayı en az 2 kez başkasıyla değiştirmiş → o kombinasyondan kaçınılır.
 * Motor bunları esnek (açık tercihten zayıf) ceza olarak kullanır. Saf; DB okuması çağıranda.
 */

export const PREF_WEEKS = 12;
const MIN_DAY_WEEKS = 3;
const MIN_SWAPS = 2;
const DAY_NAMES = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

export interface AvailHistoryRow { personnel_id: string; week_start: string; [dayKey: string]: unknown }
export interface SwapHistoryRow { personnel_id: string; day: number; shift_id: string }

export interface ImplicitAvoid {
  day: number;
  /** null: günün tamamı */
  shiftId: string | null;
  /** kanıt sayısı (hafta ya da takas) */
  count: number;
  note: string;
}

const statusOf = (raw: unknown): string => {
  if (typeof raw !== "string") return "available";
  if (raw.startsWith("{")) { try { return JSON.parse(raw)?.status ?? "available"; } catch { return "available"; } }
  return raw;
};

export function learnImplicitPrefs(
  avail: AvailHistoryRow[],
  swaps: SwapHistoryRow[],
  opts: { enteredThisWeek: Set<string>; shiftNames?: Record<string, string> },
): Record<string, ImplicitAvoid[]> {
  const out: Record<string, ImplicitAvoid[]> = {};

  // Uygunluk geçmişi
  const weeksBy: Record<string, number> = {};
  const neg: Record<string, number[]> = {};
  for (const r of avail) {
    weeksBy[r.personnel_id] = (weeksBy[r.personnel_id] ?? 0) + 1;
    const arr = (neg[r.personnel_id] ??= Array(7).fill(0));
    for (let d = 0; d < 7; d++) {
      const st = statusOf(r[`day_${d}`]);
      if (st === "unavailable" || st === "preferred_not") arr[d]++;
    }
  }
  for (const [pid, arr] of Object.entries(neg)) {
    if (opts.enteredThisWeek.has(pid)) continue;
    arr.forEach((n, d) => {
      if (n >= MIN_DAY_WEEKS && n >= weeksBy[pid] / 2) {
        (out[pid] ??= []).push({ day: d, shiftId: null, count: n, note: `Genelde ${DAY_NAMES[d]} günlerini istemiyor (son haftalarda ${n} kez)` });
      }
    });
  }

  // Takas geçmişi
  const sw: Record<string, number> = {};
  for (const s of swaps) {
    const k = `${s.personnel_id}|${s.day}|${s.shift_id}`;
    sw[k] = (sw[k] ?? 0) + 1;
  }
  for (const [k, n] of Object.entries(sw)) {
    if (n < MIN_SWAPS) continue;
    const [pid, day, shiftId] = k.split("|");
    const d = Number(day);
    if ((out[pid] ?? []).some(a => a.day === d && a.shiftId === null)) continue; // gün zaten kaçınılıyor
    const name = opts.shiftNames?.[shiftId] ?? "bu vardiya";
    (out[pid] ??= []).push({ day: d, shiftId, count: n, note: `${DAY_NAMES[d]} ${name} vardiyasını ${n} kez başkasıyla değiştirmiş` });
  }
  return out;
}
