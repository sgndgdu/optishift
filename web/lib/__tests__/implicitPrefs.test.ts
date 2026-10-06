import { describe, it, expect } from "vitest";
import { learnImplicitPrefs, type AvailHistoryRow } from "@/lib/implicitPrefs";

const week = (pid: string, ws: string, fri: string): AvailHistoryRow =>
  ({ personnel_id: pid, week_start: ws, day_0: "available", day_4: fri });

describe("örtük tercih", () => {
  it("çoğu hafta Cuma'yı istemeyen kişi için Cuma kaçınılır", () => {
    const rows = [
      week("ali", "2026-08-03", "unavailable"), week("ali", "2026-08-10", "preferred_not"),
      week("ali", "2026-08-17", JSON.stringify({ status: "unavailable" })), week("ali", "2026-08-24", "available"),
    ];
    const r = learnImplicitPrefs(rows, [], { enteredThisWeek: new Set() });
    expect(r.ali).toEqual([{ day: 4, shiftId: null, count: 3, note: "Genelde Cuma günlerini istemiyor (son haftalarda 3 kez)" }]);
  });

  it("bu hafta uygunluk girdiyse öğrenilmiş tercih kullanılmaz; seyrek işaret öğrenilmez", () => {
    const rows = [week("ali", "2026-08-03", "unavailable"), week("ali", "2026-08-10", "unavailable"), week("ali", "2026-08-17", "unavailable")];
    expect(learnImplicitPrefs(rows, [], { enteredThisWeek: new Set(["ali"]) })).toEqual({});
    const sparse = [...rows.slice(0, 2), ...["a", "b", "c"].map(x => week("ali", `2026-07-0${x === "a" ? 1 : x === "b" ? 2 : 3}`, "available"))];
    expect(learnImplicitPrefs(sparse, [], { enteredThisWeek: new Set() })).toEqual({});
  });

  it("aynı gün ve vardiyayı 2 kez başkasıyla değiştiren kişi", () => {
    const r = learnImplicitPrefs([], [
      { personnel_id: "can", day: 5, shift_id: "s-kapanis" }, { personnel_id: "can", day: 5, shift_id: "s-kapanis" },
      { personnel_id: "can", day: 1, shift_id: "s-acilis" },
    ], { enteredThisWeek: new Set(), shiftNames: { "s-kapanis": "Kapanış" } });
    expect(r.can).toEqual([{ day: 5, shiftId: "s-kapanis", count: 2, note: "Cumartesi Kapanış vardiyasını 2 kez başkasıyla değiştirmiş" }]);
  });
});
