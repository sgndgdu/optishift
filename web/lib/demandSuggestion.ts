/**
 * Personel İhtiyacı tablosu önerisi (Haftayı Oluştur 1. adım).
 *
 * Boş tablo, ilk kullanımdaki en büyük sorundu: müdür "kaç kişi" sorusuna cevap vermeden
 * plan istiyor. Burada koddan bir öneri çıkar, müdür tek tıkla uygular ya da düzeltir:
 *  - geçmiş (en az 2 yayınlanmış hafta) varsa: aynı vardiya × gündeki ortalama (lib/forecast)
 *  - yoksa başlangıç önerisi: açık her gün, her vardiyaya 1 kişi
 *  - kapalı günler 0; toplam, ekibin gerçekten karşılayabileceği sayıya indirilir
 *    (kişi günde en fazla 1 vardiya, haftada haftalık saat sınırı kadar vardiya)
 * Saf fonksiyon: DB ve tarih hesabı çağıran tarafta (app/api/demand-suggestion).
 */

export type DemandMatrix = Record<string, Record<number, number>>;

export interface SuggestionInput {
  shiftDefs: { id: string; name: string; start: string; end: string }[];
  /** computeForecast çıktısı: {shiftDefId → {gün → ortalama kişi}} */
  history: DemandMatrix;
  /** Ortalamaya giren yayınlanmış hafta sayısı */
  historyWeeks: number;
  closedDays: number[];
  personnelCount: number;
  maxWeeklyHours: number;
  /** Haftadaki resmî tatiller (0=Pzt) */
  holidays: { day: number; name: string }[];
}

export interface DemandSuggestion {
  matrix: DemandMatrix;
  source: "history" | "starter";
  notes: string[];
}

const DAY_NAMES = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const MIN_HISTORY_WEEKS = 2;

const toMinutes = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };

/** Vardiyanın saatleri diğer vardiyaların birleşimiyle tamamen kapsanıyor mu (ör. 11:30-18:30, 07-15 + 15-23 arasında)? */
function isCoveredByOthers(def: { start: string; end: string }, others: { start: string; end: string }[]): boolean {
  const span = (x: { start: string; end: string }) => {
    const a = toMinutes(x.start); let b = toMinutes(x.end);
    if (b <= a) b += 1440;
    return [a, b] as const;
  };
  const [a, b] = span(def);
  const ivs = others.map(span).sort((x, y) => x[0] - y[0]);
  let reach = a;
  for (const [s, e] of ivs) {
    if (s > reach) break;
    reach = Math.max(reach, e);
    if (reach >= b) return true;
  }
  return false;
}

function shiftHours(start: string, end: string): number {
  const s = toMinutes(start);
  let e = toMinutes(end);
  if (e <= s) e += 1440;
  return (e - s) / 60;
}

export function suggestDemand(input: SuggestionInput): DemandSuggestion {
  const { shiftDefs, history, historyWeeks, personnelCount, maxWeeklyHours } = input;
  const closed = new Set(input.closedDays);
  const notes: string[] = [];
  const hasHistory = historyWeeks >= MIN_HISTORY_WEEKS && Object.values(history).some(r => Object.values(r).some(n => n > 0));
  const source: DemandSuggestion["source"] = hasHistory ? "history" : "starter";

  const matrix: DemandMatrix = {};
  const newShifts: string[] = [];
  for (const def of shiftDefs) {
    const row = history[def.id];
    const rowHasHistory = hasHistory && !!row && Object.values(row).some(n => n > 0);
    if (hasHistory && !rowHasHistory) newShifts.push(def.name);
    matrix[def.id] = {};
    for (let d = 0; d < 7; d++) {
      matrix[def.id][d] = closed.has(d) ? 0 : rowHasHistory ? Math.max(0, Math.round(row[d] ?? 0)) : 1;
    }
  }
  if (newShifts.length) notes.push(`${newShifts.join(", ")} için geçmiş yok, her güne 1 kişi önerildi.`);

  // Kapasite: kişi günde en fazla 1 vardiya
  let reduced = false;
  const cells = () => shiftDefs.flatMap(def => Array.from({ length: 7 }, (_, d) => ({ id: def.id, d })));
  // Ekip yetmezse önce saatleri başka vardiyalarca zaten kapsanan vardiyadan kesilir
  // (açılış/kapanış boş kalmasın), kesintiler günlere yayılır.
  const redundant = new Set(shiftDefs.filter(d => isCoveredByOthers(d, shiftDefs.filter(o => o.id !== d.id))).map(d => d.id));
  const daySum = (d: number) => shiftDefs.reduce((t, def) => t + matrix[def.id][d], 0);
  const dec = (list: { id: string; d: number }[]) => {
    const rank = (c: { id: string; d: number }) => [matrix[c.id][c.d], redundant.has(c.id) ? 1 : 0, daySum(c.d), c.d];
    let best: { id: string; d: number } | null = null;
    for (const c of list) {
      if (matrix[c.id][c.d] <= 0) continue;
      if (!best) { best = c; continue; }
      const [x, y] = [rank(c), rank(best)];
      const i = x.findIndex((v, k) => v !== y[k]);
      if (i >= 0 && x[i] > y[i]) best = c;
    }
    if (best) { matrix[best.id][best.d]--; reduced = true; }
    return !!best;
  };
  for (let d = 0; d < 7; d++) {
    const dayCells = shiftDefs.map(def => ({ id: def.id, d }));
    while (dayCells.reduce((s, c) => s + matrix[c.id][c.d], 0) > personnelCount && dec(dayCells)) { /* azalt */ }
  }

  // Kapasite: haftalık saat sınırı (ortalama vardiya süresine göre kişi başı vardiya, en fazla 6 gün)
  const avgHours = shiftDefs.length ? shiftDefs.reduce((s, d) => s + shiftHours(d.start, d.end), 0) / shiftDefs.length : 8;
  const perPerson = Math.min(6, Math.max(1, Math.floor(maxWeeklyHours / Math.max(avgHours, 1))));
  const weeklyCap = personnelCount * perPerson;
  const total = () => cells().reduce((s, c) => s + matrix[c.id][c.d], 0);
  while (total() > weeklyCap && dec(cells())) { /* azalt */ }

  if (personnelCount === 0) {
    notes.push("Henüz personel yok: önce ekibinizi ekleyin, öneri ekibe göre güncellenir.");
  } else if (reduced) {
    notes.push(`Ekibiniz (${personnelCount} kişi) haftada en fazla ${weeklyCap} vardiya karşılayabilir; öneri buna göre azaltıldı.`);
  }

  for (const h of input.holidays) {
    if (closed.has(h.day)) continue;
    notes.push(`${DAY_NAMES[h.day]} resmî tatil (${h.name}): öneri normal güne göre, gerekirse değiştirin.`);
  }

  return { matrix, source, notes };
}
