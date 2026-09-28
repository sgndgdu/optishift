import { describe, it, expect } from "vitest";
import { computeReliability, isUnreliable, reliabilityNote, type ReliabilityRow } from "@/lib/reliability";

// Pzt 2026-09-21 08:00 TR = 05:00 UTC
const at = (ws: string, day: number, hhmm: string) => {
  const [y, m, d] = ws.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return Math.floor((Date.UTC(y, m - 1, d + day, h, mi) - 3 * 3600_000) / 1000);
};
const row = (pid: string, day: number, checkIn: string | null): ReliabilityRow => ({
  personnel_id: pid, week_start: "2026-09-21", day, start_time: "08:00", end_time: "16:00",
  check_in_at: checkIn ? at("2026-09-21", day, checkIn) : null,
});
const NOW = Date.UTC(2026, 8, 28, 12); // bir hafta sonra

describe("güvenilirlik", () => {
  it("gelmeme ve geç kalmayı sayar, 10 dk tolerans", () => {
    const r = computeReliability([
      row("ali", 0, "08:05"), row("ali", 1, "08:25"), row("ali", 2, null), row("ali", 3, null), row("ali", 4, "07:55"),
    ], NOW);
    expect(r.ali).toEqual({ shifts: 5, missed: 2, late: 1, score: 1 - 2.5 / 5 });
    expect(reliabilityNote(r.ali)).toBe("Son 8 haftada 2 kez gelmedi, 1 kez geç kaldı");
    expect(isUnreliable(r.ali)).toBe(true);
  });

  it("şube giriş hiç kullanmıyorsa veri yok (kimse gelmedi sayılmaz)", () => {
    expect(computeReliability([row("ali", 0, null), row("ali", 1, null), row("ali", 2, null), row("ali", 3, null)], NOW)).toEqual({});
  });

  it("giriş ara sıra kullanılıyorsa (yarıdan az) değerlendirme yapılmaz", () => {
    expect(computeReliability([row("ali", 0, "08:00"), row("ali", 1, null), row("ali", 2, null), row("ali", 3, null), row("ali", 4, null)], NOW)).toEqual({});
  });

  it("henüz bitmemiş vardiya ve az vardiyalı kişi değerlendirilmez", () => {
    const r = computeReliability([
      row("ayse", 0, "08:00"), row("ayse", 1, "08:00"), row("ayse", 2, "08:00"),
      { ...row("can", 0, "08:00"), week_start: "2026-09-28" }, // gelecekte biter
    ], NOW);
    expect(r).toEqual({});
  });
});
