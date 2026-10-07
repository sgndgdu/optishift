import { describe, it, expect } from "vitest";
import { monthLabel, monthRange, nextMonth, prevMonth } from "@/lib/months";
import { highlights, type MonthlyGain } from "@/lib/monthlyGain";

describe("ay yardımcıları", () => {
  it("ay aralığı, önceki/sonraki ay, ad", () => {
    expect(monthRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(monthRange("2028-02").end).toBe("2028-02-29");
    expect(prevMonth("2026-01")).toBe("2025-12");
    expect(nextMonth("2026-12")).toBe("2027-01");
    expect(monthLabel("2026-09")).toBe("Eylül 2026");
  });
});

const base: MonthlyGain = {
  month: "2026-09", label: "Eylül 2026", partial: false,
  plans: { published: 4, generated: 0, estHours: 0 },
  absences: { total: 0, filled: 0, unfilled: 0 },
  requests: { leaveApproved: 0, leaveRejected: 0, swapsDecided: 0 },
  compliance: { shifts: 0, problems: 0, examples: [] },
  work: { hours: 0, prevHours: 0 }, overtime: null, highlights: [],
};

describe("highlights", () => {
  it("sıfır olan konuyu yazmaz", () => {
    expect(highlights(base)).toEqual(["4 haftanın planı yayınlandı."]);
  });
  it("otomatik plan tahmini ve kural sonucu", () => {
    const h = highlights({ ...base, plans: { published: 4, generated: 3, estHours: 2.5 }, compliance: { shifts: 120, problems: 0, examples: [] } });
    expect(h[0]).toBe("3 haftanın planı otomatik hazırlandı. Bu, elle planlamaya göre yaklaşık 2,5 saat demek (tahmin).");
    expect(h[1]).toBe("Yayınlanan 120 vardiyanın hiçbirinde dinlenme ya da haftalık saat sınırı aşılmadı.");
  });
  it("fazla mesai değişimi yönüyle yazılır", () => {
    expect(highlights({ ...base, plans: { published: 0, generated: 0, estHours: 0 }, overtime: { hours: 6, prevHours: 10, cost: null, prevCost: null } }))
      .toEqual(["Fazla mesai bir önceki aya göre 4 saat azaldı (6 saat)."]);
  });
  it("süren ayı önceki tam ayla karşılaştırmaz", () => {
    expect(highlights({ ...base, partial: true, plans: { published: 0, generated: 0, estHours: 0 }, overtime: { hours: 6, prevHours: 10, cost: null, prevCost: null } }))
      .toEqual(["Bu ay şu ana kadar 6 saat fazla mesai yazıldı."]);
  });
});
