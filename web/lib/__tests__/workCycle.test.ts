import { describe, it, expect } from "vitest";
import { WORK_CYCLES, distributeOffsets, weekStates } from "@/lib/workCycle";

describe("çalışma döngüsü", () => {
  it("4-4: kaydırmaya göre hafta durumu ve sonraki haftaya devam", () => {
    const cfg = { pattern: "4-4", anchor: "2026-09-28", offsets: { a: 0, b: 4 } };
    expect(weekStates(cfg, "a", "2026-09-28")).toEqual(["W", "W", "W", "W", "O", "O", "O"]);
    expect(weekStates(cfg, "b", "2026-09-28")).toEqual(["O", "O", "O", "O", "W", "W", "W"]);
    // sonraki hafta: a'nın döngüsü 8 gün, Pazartesi 8. gün (O) sonra baştan
    expect(weekStates(cfg, "a", "2026-10-05")).toEqual(["O", "W", "W", "W", "W", "O", "O"]);
  });

  it("çapadan önceki haftalar da doğru (negatif mod)", () => {
    const cfg = { pattern: "12-36", anchor: "2026-09-28", offsets: { a: 0 } };
    expect(weekStates(cfg, "a", "2026-09-21")).toEqual(["O", "W", "O", "W", "O", "W", "O"]);
  });

  it("deseni ya da kaydırması olmayan kişi için null", () => {
    expect(weekStates({ pattern: "4-4", anchor: "2026-09-28", offsets: {} }, "x", "2026-09-28")).toBeNull();
    expect(weekStates(null, "x", "2026-09-28")).toBeNull();
  });

  it("eşit dağıtım: 8 kişi 4-4 → her gün 4 kişi çalışır", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const cfg = { pattern: "4-4", anchor: "2026-09-28", offsets: distributeOffsets(ids, "4-4") };
    for (let d = 0; d < 7; d++) {
      expect(ids.filter(id => weekStates(cfg, id, "2026-09-28")![d] === "W").length).toBe(4);
    }
  });

  it("tüm desenler hafta tatiline uyar: 7 günlük her pencerede en az 1 boş gün", () => {
    for (const [key, p] of Object.entries(WORK_CYCLES)) {
      const days = [...p.days, ...p.days, ...p.days];
      for (let i = 0; i + 7 <= days.length; i++) {
        expect(days.slice(i, i + 7).includes("O"), key).toBe(true);
      }
    }
  });
});
