import { describe, it, expect } from "vitest";
import { suggestDemand, type SuggestionInput } from "@/lib/demandSuggestion";

const defs = [
  { id: "acilis", name: "Açılış", start: "07:00", end: "15:00" },
  { id: "yogun", name: "Yoğun Saat", start: "11:30", end: "18:30" },
  { id: "kapanis", name: "Kapanış", start: "15:00", end: "23:00" },
];
const base = (): SuggestionInput => ({
  shiftDefs: defs, history: {}, historyWeeks: 0, closedDays: [], personnelCount: 6, maxWeeklyHours: 45, holidays: [],
});
const total = (m: Record<string, Record<number, number>>) =>
  Object.values(m).reduce((s, r) => s + Object.values(r).reduce((a, b) => a + b, 0), 0);

describe("ihtiyaç tablosu önerisi", () => {
  it("geçmiş yoksa açık her gün her vardiyaya 1 kişi, kapalı gün 0", () => {
    const r = suggestDemand({ ...base(), closedDays: [6] });
    expect(r.source).toBe("starter");
    expect(r.matrix.acilis[0]).toBe(1);
    expect(r.matrix.kapanis[6]).toBe(0);
    expect(total(r.matrix)).toBe(18);
  });

  it("en az 2 haftalık geçmiş varsa ortalamayı kullanır, geçmişi olmayan vardiyaya 1 önerir", () => {
    const r = suggestDemand({
      ...base(), historyWeeks: 4,
      history: { acilis: { 0: 2, 5: 3 }, yogun: { 0: 1.6 } },
    });
    expect(r.source).toBe("history");
    expect(r.matrix.acilis[5]).toBe(3);
    expect(r.matrix.acilis[1]).toBe(0); // geçmişte o gün kimse yoktu
    expect(r.matrix.yogun[0]).toBe(2);
    expect(r.matrix.kapanis[3]).toBe(1);
    expect(r.notes[0]).toContain("Kapanış için geçmiş yok");
  });

  it("tek hafta geçmiş yetersiz sayılır", () => {
    expect(suggestDemand({ ...base(), historyWeeks: 1, history: { acilis: { 0: 4 } } }).source).toBe("starter");
  });

  it("ekibin karşılayabileceğinden fazlasını önermez", () => {
    // 2 kişi: günde en fazla 2; ortalama vardiya mola düşülünce ~7 saat, haftada 2 × floor(45/7)=6 → 12 vardiya
    const r = suggestDemand({ ...base(), personnelCount: 2 });
    expect(total(r.matrix)).toBe(12);
    for (let d = 0; d < 7; d++) expect(defs.reduce((s, def) => s + r.matrix[def.id][d], 0)).toBeLessThanOrEqual(2);
    expect(r.notes.some(n => n.includes("en fazla 12 vardiya"))).toBe(true);
  });

  it("ekip yetmezse önce açılış/kapanış arasında kalan vardiyadan keser, açılışı boş bırakmaz", () => {
    const r = suggestDemand({ ...base(), personnelCount: 4, closedDays: [6] }); // 18 istek, kapasite 20: kesinti yok
    expect(Object.values(r.matrix.acilis).slice(0, 6).every(n => n === 1)).toBe(true);
    const tight = suggestDemand({ ...base(), personnelCount: 3 }); // 21 istek, kapasite 18
    for (let d = 0; d < 7; d++) expect(tight.matrix.acilis[d] + tight.matrix.kapanis[d]).toBeGreaterThanOrEqual(1);
    expect(Object.values(tight.matrix.yogun).reduce((a, b) => a + b, 0)).toBe(4); // 3 kesinti Yoğun Saat'ten
  });

  it("resmî tatil not olarak düşülür, kapalı günse düşülmez", () => {
    const r = suggestDemand({ ...base(), closedDays: [6], holidays: [{ day: 3, name: "Cumhuriyet Bayramı" }, { day: 6, name: "X" }] });
    expect(r.notes).toEqual(["Perşembe resmî tatil (Cumhuriyet Bayramı): öneri normal güne göre, gerekirse değiştirin."]);
  });
});
