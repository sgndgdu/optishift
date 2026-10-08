/**
 * Ekip anketi: vardiya zorluğu (2026-10-08, kullanıcı isteği). Saf kurallar (tarayıcı ve sunucu ortak).
 * Veritabanı tarafı lib/fairnessSurveyDb.ts.
 *
 * Ekip son haftalarda çalıştığı vardiyaları ve günleri 1-10 arası puanlar. Sonuç ortanca değerdir (bir iki kişinin
 * uç cevabı sonucu değiştirmez). Hesap sahibi sonucu Ayarlar › Adalet Puanı'nda görür ve isterse uygular.
 * Manipülasyon önlemleri: ortanca, sadece çalışılan vardiya/gün, en az SURVEY_MIN_RESPONSES cevap gelmeden sonuç yok,
 * cevaplar kişiyle birlikte hiçbir yerde gösterilmez, ekip bölünmüşse uyarı, uygulanan değer ekibe açık.
 */

/**
 * Sonucun gösterilmesi için gereken en az cevap. Daha az cevapta kimin ne dediği tahmin edilebilir
 * (anonim anketlerde yaygın kullanılan alt sınır). Anket kapandığında da bu sayının altındaysa sonuç gösterilmez.
 */
export const SURVEY_MIN_RESPONSES = 3;

/** Kişinin puanlayabilmesi için vardiyada çalışmış olması gereken süre: Adalet Puanı'nın baktığı süre, en az 4 hafta. */
export function eligibilityWeeks(fairnessWindowWeeks: number | undefined): number {
  return Math.max(4, Math.round(fairnessWindowWeeks ?? 4));
}

export const FAIRNESS_OPTIONS = ["Hiç adil değil", "Pek adil değil", "Kararsızım", "Çoğunlukla adil", "Tamamen adil"] as const;
export const UNFAIR_OPTIONS = [
  { value: "no", label: "Hayır" },
  { value: "partly", label: "Bazen" },
  { value: "yes", label: "Evet" },
] as const;
export type UnfairAnswer = (typeof UNFAIR_OPTIONS)[number]["value"];

/** Planlamada değişmesini istedikleri (birden çok seçilir). Puanı etkilemez, hesap sahibine yol gösterir. */
export const WISH_OPTIONS = [
  "Zor vardiyalar daha eşit dağıtılsın",
  "Hafta sonları daha eşit dağıtılsın",
  "Plan daha erken yayınlansın",
  "Yayından sonra plan daha az değişsin",
  "Kapanıştan sonra sabah vardiyası verilmesin",
  "Vardiya değiştirmek daha kolay olsun",
  "Tercih etmediğim günlere daha az yazılayım",
] as const;

const COMMON_REASONS = ["Yoğun iş", "Ayakta uzun süre", "Az kişiyle çalışma", "Geç saatte eve dönüş", "Erken kalkmak"];

/** Vardiyayı zorlaştıran nedenler: işletme türüne (ve alt türüne) göre. Araştırma: claude.ai/artifact/GTrLCBSkpLJyHr32cBbKNw */
const SECTOR_REASONS: Record<string, string[]> = {
  hospitality: ["Yoğun servis saati", "Kapanış temizliği", "Kasa kapatma", "Mutfak sıcağı", "Zor müşteri"],
  hotel: ["Giriş ve çıkış yoğunluğu", "Gece tek başına resepsiyon", "Temizlenecek oda sayısı", "Etkinlik ve davet", "Misafir şikâyeti"],
  retail: ["Kasa yoğunluğu", "Sayım", "Mal kabul ve ağır koli", "Reyon düzenleme", "Kapanış işleri", "Hırsızlık riski"],
  manufacturing: ["Gece çalışması", "Ağır kaldırma", "Gürültü ve sıcak", "Makine arızası", "Hat hızı", "Vardiya devri"],
  logistics: ["Ağır yük", "Soğuk depo", "Uzun sürüş", "Yükleme saati baskısı", "Dar teslim süresi"],
  healthcare: ["Hasta yoğunluğu", "Gece az personel", "Acil durumlar", "Duygusal yük"],
  security: ["Gece çalışması", "Yalnız çalışma", "Hava koşulları", "Risk ve tehdit"],
  callcenter: ["Çağrı yoğunluğu", "Zor müşteri", "Kısa mola", "Uzun süre ekran başında", "Hedef baskısı"],
};

export function surveyReasons(industry?: string | null, variant?: string | null): string[] {
  const sector = (variant && SECTOR_REASONS[variant]) || (industry && SECTOR_REASONS[industry]) || [];
  return [...new Set([...sector, ...COMMON_REASONS])];
}

export interface SurveyShift { id: string; name: string; start: string; end: string; base_points: number }

export interface SurveyAnswers {
  shifts: Record<string, { rating: number; reasons: string[] }>;
  days: (number | null)[];          // 7 gün, Pzt=0; çalışmadığı gün null
  fairness: number | null;          // 1-5 (FAIRNESS_OPTIONS)
  unfair: UnfairAnswer | null;      // son haftalarda planda kendine haksızlık yapıldığını hissetti mi
  wishes: string[];
  comment: string;
}

const clampRating = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
};

/**
 * İstemciden gelen cevabı doğrular: sadece kişinin çalıştığı vardiya ve günler, geçerli seçenekler.
 * Puanlanacak bir şey kalmazsa null.
 */
export function sanitizeAnswers(raw: unknown, allowed: { shiftIds: Set<string>; days: Set<number>; reasons: string[] }): SurveyAnswers | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const shifts: SurveyAnswers["shifts"] = {};
  const rawShifts = (r.shifts && typeof r.shifts === "object" ? r.shifts : {}) as Record<string, unknown>;
  for (const [id, v] of Object.entries(rawShifts)) {
    if (!allowed.shiftIds.has(id)) continue;
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const rating = clampRating(o.rating);
    if (rating === null) continue;
    const reasons = Array.isArray(o.reasons) ? [...new Set(o.reasons.map(String))].filter(x => allowed.reasons.includes(x)) : [];
    shifts[id] = { rating, reasons };
  }
  const rawDays = Array.isArray(r.days) ? r.days : [];
  const days = Array.from({ length: 7 }, (_, d) => (allowed.days.has(d) ? clampRating(rawDays[d]) : null));
  const f = Math.round(Number(r.fairness));
  const fairness = Number.isFinite(f) && f >= 1 && f <= 5 ? f : null;
  const unfair = UNFAIR_OPTIONS.some(o => o.value === r.unfair) ? (r.unfair as UnfairAnswer) : null;
  const wishes = Array.isArray(r.wishes) ? [...new Set(r.wishes.map(String))].filter(w => (WISH_OPTIONS as readonly string[]).includes(w)) : [];
  const comment = typeof r.comment === "string" ? r.comment.trim().slice(0, 500) : "";
  const hasAnything = Object.keys(shifts).length > 0 || days.some(d => d !== null) || fairness !== null || unfair !== null || wishes.length > 0 || !!comment;
  return hasAnything ? { shifts, days, fairness, unfair, wishes, comment } : null;
}

// ─── Sonuç ──────────────────────────────────────────────────────────────────

/** Ortanca: sıralanmış cevapların ortasındaki değer (çift sayıda ortadaki ikisinin ortalaması, yukarı yuvarlanır). */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(m);
}

export type Agreement = "agree" | "mixed" | "split";

/**
 * Ekip ne kadar hemfikir: cevapların ortadaki yarısının yayıldığı aralık (çeyrekler arası fark).
 * 2 ve altı hemfikir, 3 farklı görüşler, 4 ve üstü bölünmüş (ekip iki gruba ayrılmış olabilir).
 */
export function agreement(values: number[]): Agreement {
  if (values.length < 2) return "agree";
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
  const spread = q(0.75) - q(0.25);
  return spread <= 2 ? "agree" : spread === 3 ? "mixed" : "split";
}

export const AGREEMENT_LABEL: Record<Agreement, string> = { agree: "hemfikir", mixed: "farklı görüşler", split: "bölünmüş" };

/**
 * Günün zorluk puanından (1-10) önerilen zor gün ek puanı: 5 normal gün sayılır, 5'in üstündeki her puan 1 ek puan.
 * Örnek: ekip Cumartesi'ye 9 dediyse +4 (eski varsayılan hafta sonu puanı).
 */
export function dayPointsFromRating(rating: number): number {
  return Math.max(0, rating - 5);
}

export interface ShiftResult {
  id: string; name: string; start: string; end: string;
  current: number; median: number | null; count: number; agreement: Agreement; dist: number[];
  reasons: { label: string; count: number }[];
}
export interface DayResult { day: number; current: number; median: number | null; suggested: number | null; count: number; agreement: Agreement }
export interface SurveyResults {
  responses: number;
  enough: boolean;
  shifts: ShiftResult[];
  days: DayResult[];
  fairness: { count: number; dist: number[]; positive: number };
  unfair: { count: number; yes: number; partly: number; no: number };
  wishes: { label: string; count: number }[];
  comments: string[];
}

/**
 * Cevapları toplar. Cevap sayısı SURVEY_MIN_RESPONSES'ın altındaysa `enough: false` ve ayrıntı boş döner.
 * Yorumların sırası karıştırılır (gönderilme sırasından kimin yazdığı anlaşılmasın).
 */
export function aggregateSurvey(shifts: SurveyShift[], currentDayPoints: number[], answers: SurveyAnswers[], seed = 1): SurveyResults {
  const n = answers.length;
  const empty: SurveyResults = {
    responses: n, enough: false, shifts: [], days: [],
    fairness: { count: 0, dist: [0, 0, 0, 0, 0], positive: 0 }, unfair: { count: 0, yes: 0, partly: 0, no: 0 }, wishes: [], comments: [],
  };
  if (n < SURVEY_MIN_RESPONSES) return empty;

  const shiftResults: ShiftResult[] = shifts.map(sh => {
    const given = answers.map(a => a.shifts[sh.id]).filter(Boolean);
    const ratings = given.map(g => g.rating);
    const dist = Array.from({ length: 10 }, (_, i) => ratings.filter(r => r === i + 1).length);
    const reasonCount = new Map<string, number>();
    for (const g of given) for (const x of g.reasons) reasonCount.set(x, (reasonCount.get(x) ?? 0) + 1);
    // Az kişinin puanladığı vardiyada (ör. tek gececi) kimin ne dediği belli olur: değer gösterilmez
    const shown = ratings.length >= SURVEY_MIN_RESPONSES;
    return {
      id: sh.id, name: sh.name, start: sh.start, end: sh.end, current: sh.base_points,
      median: shown ? median(ratings) : null, count: ratings.length, agreement: shown ? agreement(ratings) : "agree",
      dist: shown ? dist : [],
      reasons: shown ? [...reasonCount.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count) : [],
    };
  });

  const dayResults: DayResult[] = Array.from({ length: 7 }, (_, d) => {
    const ratings = answers.map(a => a.days[d]).filter((v): v is number => typeof v === "number");
    const shown = ratings.length >= SURVEY_MIN_RESPONSES;
    const m = shown ? median(ratings) : null;
    return { day: d, current: currentDayPoints[d] ?? 0, median: m, suggested: m === null ? null : dayPointsFromRating(m), count: ratings.length, agreement: shown ? agreement(ratings) : "agree" };
  });

  const fair = answers.map(a => a.fairness).filter((v): v is number => typeof v === "number");
  const unfair = answers.map(a => a.unfair).filter(Boolean);
  const wishCount = new Map<string, number>();
  for (const a of answers) for (const w of a.wishes) wishCount.set(w, (wishCount.get(w) ?? 0) + 1);

  return {
    responses: n,
    enough: true,
    shifts: shiftResults,
    days: dayResults,
    fairness: {
      count: fair.length,
      dist: [1, 2, 3, 4, 5].map(v => fair.filter(f => f === v).length),
      positive: fair.filter(f => f >= 4).length,
    },
    unfair: { count: unfair.length, yes: unfair.filter(u => u === "yes").length, partly: unfair.filter(u => u === "partly").length, no: unfair.filter(u => u === "no").length },
    wishes: [...wishCount.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    comments: shuffle(answers.map(a => a.comment).filter(Boolean), seed),
  };
}

function shuffle<T>(list: T[], seed: number): T[] {
  const out = [...list];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
