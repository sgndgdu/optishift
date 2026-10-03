import { describe, it, expect } from "vitest";
import { findAssignmentProblems, type TimedShift } from "@/lib/assignmentCheck";

const W = "2026-10-05";
const s = (day: number, start: string, end: string, week_start = W): TimedShift => ({ week_start, day, start_time: start, end_time: end });
const rules = { maxWeeklyHours: 45, minRestHours: 11 };

describe("findAssignmentProblems", () => {
  it("aynı gün açılış + kapanış: 0 saat dinlenme yakalanır", () => {
    const add = s(2, "15:00", "23:00");
    const out = findAssignmentProblems([s(2, "07:00", "15:00"), add], [add], rules);
    expect(out.some(x => x.includes("0 saat dinlenme"))).toBe(true);
  });

  it("gece kapanışı → ertesi sabah açılış 8 saat dinlenme yakalanır", () => {
    const add = s(4, "15:00", "23:00");
    const out = findAssignmentProblems([add, s(5, "07:00", "15:00")], [add], rules);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("8 saat dinlenme");
  });

  it("çakışan vardiyalar", () => {
    const add = s(1, "12:00", "20:00");
    expect(findAssignmentProblems([s(1, "08:00", "16:00"), add], [add], rules)[0]).toContain("çakışıyor");
  });

  it("haftalık sınır aşımı", () => {
    const base = [0, 1, 2, 3, 4].map(d => s(d, "09:00", "18:00")); // 45 saat
    const add = s(5, "10:00", "12:00");
    const out = findAssignmentProblems([...base, add], [add], rules);
    expect(out.some(x => x.includes("47 saate"))).toBe(true);
  });

  it("hafta sınırını geçen dinlenme (Pazar gece → sonraki Pazartesi sabah)", () => {
    const add = s(6, "16:00", "00:00");
    const out = findAssignmentProblems([add, s(0, "06:00", "14:00", "2026-10-12")], [add], rules);
    expect(out[0]).toContain("6 saat dinlenme");
  });

  it("eski sorunlar yeni değişikliğe yazılmaz, uygun değişiklik temiz", () => {
    const add = s(3, "09:00", "17:00");
    const out = findAssignmentProblems([s(0, "07:00", "15:00"), s(0, "15:00", "23:00"), add], [add], rules);
    expect(out).toEqual([]);
  });
});
