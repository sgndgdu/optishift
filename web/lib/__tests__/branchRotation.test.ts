import { describe, it, expect } from "vitest";
import { parseBranchRotation, plannedInBranch, rotationBranchForWeek } from "@/lib/branchRotation";

const rot = { every_weeks: 2, order: ["A", "B"], anchor: "2026-10-05" };

describe("şubeler arası rotasyon", () => {
  it("her 2 haftada bir sıradaki şube", () => {
    expect(rotationBranchForWeek(rot, "2026-10-05")).toBe("A");
    expect(rotationBranchForWeek(rot, "2026-10-12")).toBe("A");
    expect(rotationBranchForWeek(rot, "2026-10-19")).toBe("B");
    expect(rotationBranchForWeek(rot, "2026-11-02")).toBe("A");
    expect(rotationBranchForWeek(rot, "2026-09-28")).toBe("B"); // başlangıçtan önce de döngü
  });
  it("rotasyonu olmayan her şubede planlanabilir, olan sadece sırası gelende", () => {
    expect(plannedInBranch(null, "A", "2026-10-19")).toBe(true);
    expect(plannedInBranch(JSON.stringify(rot), "A", "2026-10-19")).toBe(false);
    expect(plannedInBranch(JSON.stringify(rot), "B", "2026-10-19")).toBe(true);
  });
  it("eksik ya da bozuk veri rotasyon sayılmaz", () => {
    expect(parseBranchRotation({ every_weeks: 1, order: ["A"], anchor: "2026-10-05" })).toBeNull();
    expect(parseBranchRotation("{bozuk")).toBeNull();
  });
});
