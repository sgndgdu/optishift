/**
 * Çağrı merkezi ihtiyaç hesabı (Erlang C) ve saatlik ihtiyacın vardiyalara dağıtımı.
 * Saf fonksiyonlar; arayüz: Planı Oluştur 1. adım, "Çağrı yoğunluğundan hesapla".
 *
 * Akış: günlük çağrı × saatlik yoğunluk eğrisi → saatlik çağrı → Erlang C ile hizmet
 * seviyesini tutturan en az temsilci → mola/izin payıyla yukarı yuvarla → her saati
 * karşılayan en az vardiya sayısı (açgözlü aralık kaplama) → {vardiya → {gün → kişi}}.
 */

export interface CallForecastInput {
  /** Pzt..Paz günlük beklenen çağrı */
  dailyCalls: number[];
  curve: CurveKey;
  /** Ortalama görüşme + sonrası iş süresi (saniye) */
  ahtSec: number;
  /** Hedef: çağrıların yüzde kaçı */
  slPercent: number;
  /** ... kaç saniyede cevaplansın */
  slSeconds: number;
  /** Mola, eğitim, izin payı (yüzde) */
  shrinkagePercent: number;
}

export type CurveKey = "office" | "flat" | "evening" | "retail";

/** Saat (0-23) ağırlıkları; sadece vardiyaların kapsadığı saatler kullanılır, sonra normalize edilir. */
export const CURVES: Record<CurveKey, { label: string; weights: number[] }> = {
  office: {
    label: "Mesai saatleri (10-12 ve 14-16 tepe)",
    weights: [0, 0, 0, 0, 0, 0, 0, 1, 3, 6, 9, 9, 6, 7, 9, 8, 6, 4, 2, 1, 1, 0, 0, 0],
  },
  flat: { label: "Gün boyu düz", weights: Array(24).fill(1) },
  evening: {
    label: "Akşam yoğun (18-22 tepe)",
    weights: [1, 0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 4, 4, 4, 4, 5, 5, 6, 8, 9, 9, 8, 5, 2],
  },
  retail: {
    label: "Perakende / e-ticaret (öğle ve akşam)",
    weights: [0, 0, 0, 0, 0, 0, 0, 1, 2, 4, 5, 6, 7, 6, 5, 5, 6, 7, 7, 6, 5, 3, 1, 0],
  },
};

/** Erlang C bekleme olasılığı (N temsilci, A erlang trafik). N <= A ise 1. Erlang B özyinelemesi (sayısal kararlı). */
export function erlangC(agents: number, traffic: number): number {
  if (agents <= traffic) return 1;
  let b = 1;
  for (let n = 1; n <= agents; n++) b = (traffic * b) / (n + traffic * b);
  return (agents * b) / (agents - traffic * (1 - b));
}

/** Hizmet seviyesi: çağrının hedef süre içinde cevaplanma olasılığı. */
export function serviceLevel(agents: number, traffic: number, ahtSec: number, targetSec: number): number {
  if (agents <= traffic) return 0;
  return 1 - erlangC(agents, traffic) * Math.exp(-(agents - traffic) * targetSec / ahtSec);
}

/** Saatlik çağrıda hedefi tutturan en az (mola payı eklenmemiş) temsilci. */
export function agentsForHour(callsPerHour: number, ahtSec: number, slPercent: number, slSeconds: number): number {
  if (callsPerHour <= 0 || ahtSec <= 0) return 0;
  const traffic = (callsPerHour * ahtSec) / 3600;
  const target = Math.min(0.999, Math.max(0.01, slPercent / 100));
  let n = Math.max(1, Math.floor(traffic) + 1);
  while (serviceLevel(n, traffic, ahtSec, slSeconds) < target && n < 2000) n++;
  return n;
}

type Span = { id: string; start: number; end: number }; // saat, gece yarısını geçen 24'te kesilir

const toHour = (t: string) => { const [h, m] = t.split(":").map(Number); return h + (m || 0) / 60; };
function spanOf(def: { id: string; start: string; end: string }): Span {
  const s = toHour(def.start);
  let e = toHour(def.end);
  if (e <= s) e = 24; // gece yarısını geçen vardiya bu günün ihtiyacı için 24'te biter
  return { id: def.id, start: s, end: e };
}
const covers = (sp: Span, h: number) => sp.start <= h && h + 1 <= sp.end + 1e-9;

/** Bir günün saatlik ihtiyacını (0-23) en az vardiyayla karşılar: açgözlü aralık kaplama. */
export function coverHours(defs: { id: string; start: string; end: string }[], req: number[]): Record<string, number> {
  const spans = defs.map(spanOf);
  const out: Record<string, number> = Object.fromEntries(defs.map(d => [d.id, 0]));
  const have = Array(24).fill(0);
  for (let h = 0; h < 24; h++) {
    const cands = spans.filter(sp => covers(sp, h));
    if (!cands.length) continue;
    const best = cands.reduce((a, b) => (b.end > a.end ? b : a)); // bu saati kapsayıp en geç biten
    while (have[h] < req[h]) {
      out[best.id]++;
      for (let k = 0; k < 24; k++) if (covers(best, k)) have[k]++;
    }
  }
  return out;
}

export interface CallDemandResult {
  matrix: Record<string, Record<number, number>>;
  /** Gün başına saatlik temsilci ihtiyacı (mola payı dahil) */
  hourly: number[][];
  peak: { day: number; hour: number; agents: number } | null;
}

export function callDemand(defs: { id: string; start: string; end: string }[], input: CallForecastInput): CallDemandResult {
  const spans = defs.map(spanOf);
  const weights = CURVES[input.curve]?.weights ?? CURVES.flat.weights;
  const coveredHours = Array.from({ length: 24 }, (_, h) => spans.some(sp => covers(sp, h)));
  const totalW = weights.reduce((t, w, h) => t + (coveredHours[h] ? w : 0), 0) || 1;
  const shrink = Math.min(0.9, Math.max(0, input.shrinkagePercent / 100));

  const matrix: Record<string, Record<number, number>> = Object.fromEntries(defs.map(d => [d.id, {}]));
  const hourly: number[][] = [];
  let peak: CallDemandResult["peak"] = null;
  for (let day = 0; day < 7; day++) {
    const calls = Math.max(0, input.dailyCalls[day] ?? 0);
    const req = Array.from({ length: 24 }, (_, h) => {
      if (!coveredHours[h] || calls === 0) return 0;
      const base = agentsForHour((calls * weights[h]) / totalW, input.ahtSec, input.slPercent, input.slSeconds);
      return base === 0 ? 0 : Math.ceil(base / (1 - shrink));
    });
    hourly.push(req);
    req.forEach((n, h) => { if (!peak || n > peak.agents) peak = { day, hour: h, agents: n }; });
    const counts = coverHours(defs, req);
    for (const d of defs) matrix[d.id][day] = counts[d.id];
  }
  return { matrix, hourly, peak };
}
