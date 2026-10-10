import { describe, it, expect } from "vitest";
import { agreement, aggregateSurvey, median, pctFromRating, sanitizeAnswers, SURVEY_MIN_RESPONSES, type SurveyAnswers } from "../fairnessSurvey";
import { describeFairnessChanges } from "../fairnessChanges";
import { findManualLoadFlags, MANUAL_LOAD_WEEKS, type WeekManualLoad } from "../manualLoad";

const shifts = [
  { id: "a", name: "Açılış", start: "07:00", end: "15:00", difficulty_pct: 0 },
  { id: "k", name: "Kapanış", start: "15:00", end: "23:00", difficulty_pct: 0 },
  { id: "g", name: "Gece", start: "23:00", end: "07:00", difficulty_pct: 50 },
];
const ans = (k: number, extra: Partial<SurveyAnswers> = {}): SurveyAnswers => ({
  shifts: { k: { rating: k, reasons: ["Kasa kapatma"] } }, days: [null, null, null, null, null, 9, null],
  fairness: 4, unfair: "no", wishes: [], comment: "", ...extra,
});

describe("ekip anketi", () => {
  it("ortanca uç cevaplardan etkilenmez", () => {
    expect(median([7, 7, 7, 10, 10])).toBe(7);
    expect(median([1, 7, 7, 7])).toBe(7);
    expect(median([6, 7])).toBe(7);
    expect(median([])).toBeNull();
  });
  it("hemfikir / bölünmüş", () => {
    expect(agreement([6, 7, 7, 8])).toBe("agree");
    expect(agreement([2, 2, 9, 9])).toBe("split");
  });
  it("ekibin cevabı yüzdeye: 5 sıradan, üstündeki her puan %20 (10 = bayram kadar %100)", () => {
    expect(pctFromRating(10)).toBe(100);
    expect(pctFromRating(8)).toBe(60);
    expect(pctFromRating(5)).toBe(0);
    expect(pctFromRating(3)).toBe(0);
  });
  it("sadece çalıştığı vardiya ve gün kaydedilir, geçersiz neden atılır", () => {
    const clean = sanitizeAnswers(
      { shifts: { k: { rating: 8, reasons: ["Kasa kapatma", "Uydurma"] }, g: { rating: 2, reasons: [] } }, days: [5, 5, 5, 5, 5, 9, 9], fairness: 9, unfair: "evet", comment: " not " },
      { shiftIds: new Set(["k"]), days: new Set([5]), reasons: ["Kasa kapatma"] },
    )!;
    expect(Object.keys(clean.shifts)).toEqual(["k"]);
    expect(clean.shifts.k.reasons).toEqual(["Kasa kapatma"]);
    expect(clean.days).toEqual([null, null, null, null, null, 9, null]);
    expect(clean.fairness).toBeNull();
    expect(clean.unfair).toBeNull();
    expect(clean.comment).toBe("not");
    expect(sanitizeAnswers({}, { shiftIds: new Set(), days: new Set(), reasons: [] })).toBeNull();
  });
  it("en az cevap gelmeden sonuç yok", () => {
    const r = aggregateSurvey(shifts, [0, 0, 0, 0, 0, 4, 4], Array.from({ length: SURVEY_MIN_RESPONSES - 1 }, () => ans(7)));
    expect(r.enough).toBe(false);
    expect(r.shifts).toEqual([]);
  });
  it("sonuç: ortanca, gizli vardiya, gün önerisi, adalet algısı", () => {
    const r = aggregateSurvey(shifts, [0, 0, 0, 0, 0, 4, 4], [ans(7), ans(7), ans(10, { unfair: "yes", fairness: 2 }), ans(6, { comment: "Kapanış çok yorucu" })]);
    expect(r.enough).toBe(true);
    const k = r.shifts.find(s => s.id === "k")!;
    expect(k.median).toBe(7);
    expect(k.suggested).toBe(40);
    expect(k.reasons[0]).toEqual({ label: "Kasa kapatma", count: 4 });
    // Kimse puanlamadığı vardiyada değer yok
    expect(r.shifts.find(s => s.id === "g")!.median).toBeNull();
    expect(r.days[5]).toMatchObject({ median: 9, suggested: 80 });
    expect(r.fairness).toMatchObject({ count: 4, positive: 3 });
    expect(r.unfair.yes).toBe(1);
    expect(r.comments).toEqual(["Kapanış çok yorucu"]);
  });
});

describe("Adalet Puanı kural değişikliği kaydı", () => {
  it("vardiya zorluğu, gün ve ek puan değişikliği okunur", () => {
    const lines = describeFairnessChanges(
      { hard_day_pct: [0, 0, 0, 0, 0, 50, 50] }, { hard_day_pct: [0, 0, 0, 0, 0, 60, 50], hero_bonus_enabled: false, force_comp_leave_enabled: true },
      [{ id: "k", name: "Kapanış", base_points: 5 }], [{ id: "k", name: "Kapanış", base_points: 5, difficulty_pct: 50 }],
    );
    expect(lines).toContain("Kapanış vardiyasının zorluğu Sıradan → Zor");
    expect(lines).toContain("Cumartesi eki %50 → %60");
    expect(lines).toContain("Boş kalan vardiyayı alan eki: vardiyanın %50'i → kapalı");
    expect(lines).toContain("İzin gününde çağrılana denkleştirme izni: kapalı → açık");
    expect(describeFairnessChanges({}, {}, [], [])).toEqual([]);
  });
});

describe("elle yapılan değişiklikler", () => {
  const week = (ws: string, delta: Record<string, number>): WeekManualLoad => ({
    week_start: ws, avg_shift_points: 8,
    people: Object.fromEntries(Object.entries(delta).map(([k, d]) => [k, { engine: 40, published: 40 + d, delta: d }])),
  });
  it(`${MANUAL_LOAD_WEEKS} hafta üst üste aynı yönde ve en az bir vardiya kadar olursa işaretlenir`, () => {
    const flags = findManualLoadFlags([
      week("2026-09-21", { ali: 9, ayse: -10, can: 9 }),
      week("2026-09-28", { ali: 8, ayse: -8, can: 0 }),
      week("2026-10-05", { ali: 12, ayse: -9, can: 9 }),
    ]);
    expect(flags.map(f => [f.personnel_id, f.direction])).toEqual([["ali", "more"], ["ayse", "less"]]);
    expect(findManualLoadFlags([week("2026-10-05", { ali: 20 })])).toEqual([]);
  });
});
