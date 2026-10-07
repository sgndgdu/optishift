import { describe, it, expect } from "vitest";
import { previousOccurrence, specialDaysInRange } from "@/lib/specialDays";

describe("specialDaysInRange", () => {
  it("Cumhuriyet Bayramı haftası: arife yarım gün, bayram resmî tatil", () => {
    const d = specialDaysInRange("2026-10-26", "2026-11-01", "retail");
    expect(d.map(x => [x.date, x.kind, x.name])).toEqual([
      ["2026-10-28", "half_holiday", "Cumhuriyet Bayramı arifesi"],
      ["2026-10-29", "holiday", "Cumhuriyet Bayramı"],
    ]);
    expect(d[1].note).toContain("m.47");
  });
  it("Kurban Bayramı arifesi ve okul tatili", () => {
    const d = specialDaysInRange("2026-05-25", "2026-05-31", "hospitality");
    expect(d.find(x => x.kind === "half_holiday")?.date).toBe("2026-05-26");
    expect(d.filter(x => x.kind === "holiday")).toHaveLength(4);
  });
  it("Ramazan ayı ve mart ara tatili", () => {
    const d = specialDaysInRange("2026-03-16", "2026-03-22", "hospitality");
    expect(d.some(x => x.kind === "ramadan" && x.note.includes("İftar"))).toBe(true);
    expect(d.some(x => x.kind === "school_break")).toBe(true);
  });
  it("ticari gün sadece ilgili sektöre yazılır", () => {
    expect(specialDaysInRange("2026-05-04", "2026-05-10", "hospitality").map(x => x.name)).toContain("Anneler Günü");
    expect(specialDaysInRange("2026-05-04", "2026-05-10", "manufacturing").map(x => x.name)).not.toContain("Anneler Günü");
    expect(specialDaysInRange("2026-11-23", "2026-11-29", "retail").find(x => x.name.startsWith("Kasım indirim"))?.date).toBe("2026-11-27");
  });
  it("sıradan hafta boş", () => {
    expect(specialDaysInRange("2026-10-12", "2026-10-18", "retail")).toEqual([]);
  });
});

describe("previousOccurrence", () => {
  it("bir önceki aynı gün", () => {
    const [arife, bayram] = specialDaysInRange("2026-10-26", "2026-11-01", "retail");
    expect(previousOccurrence(bayram)).toBe("2025-10-29");
    expect(previousOccurrence(arife)).toBe("2025-10-28");
    const kurban = specialDaysInRange("2026-05-26", "2026-05-27", "retail");
    expect(previousOccurrence(kurban.find(x => x.kind === "half_holiday")!)).toBe("2025-06-05");
    expect(previousOccurrence(kurban.find(x => x.kind === "holiday")!)).toBe("2025-06-06");
  });
});
