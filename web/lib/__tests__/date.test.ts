import { describe, it, expect } from "vitest";
import { addDays, businessNow, businessToday, businessWallTime, dayIndexOf, weekStartOf } from "@/lib/date";

// Sunucu UTC çalışır; Türkiye UTC+3. Tüm anlar UTC olarak verilir.
describe("businessNow (Europe/Istanbul)", () => {
  it("TR gece yarısını geçince yeni günü verir, UTC hâlâ önceki günde olsa bile", () => {
    // 2026-09-27 Pazar 22:30 UTC = 2026-09-28 Pazartesi 01:30 TR
    const at = new Date(Date.UTC(2026, 8, 27, 22, 30));
    expect(businessNow(at)).toEqual({ date: "2026-09-28", dayIdx: 0, weekStart: "2026-09-28" });
  });

  it("TR 03:00 öncesi: önceki haftaya düşmez", () => {
    // 2026-09-27 Pazar 21:00 UTC = 2026-09-28 Pazartesi 00:00 TR
    const at = new Date(Date.UTC(2026, 8, 27, 21, 0));
    expect(businessNow(at).weekStart).toBe("2026-09-28");
    // bir dakika önce hâlâ Pazar, önceki hafta
    const before = new Date(Date.UTC(2026, 8, 27, 20, 59));
    expect(businessNow(before)).toEqual({ date: "2026-09-27", dayIdx: 6, weekStart: "2026-09-21" });
  });

  it("gündüz UTC ile aynı günü verir", () => {
    const at = new Date(Date.UTC(2026, 8, 30, 12, 0)); // Çarşamba
    expect(businessToday(at)).toBe("2026-09-30");
    expect(businessNow(at).dayIdx).toBe(2);
  });

  it("yıl sonu geçişi", () => {
    const at = new Date(Date.UTC(2026, 11, 31, 22, 0)); // TR 2027-01-01 01:00 Cuma
    expect(businessNow(at)).toEqual({ date: "2027-01-01", dayIdx: 4, weekStart: "2026-12-28" });
  });
});

describe("takvim yardımcıları", () => {
  it("addDays ay ve yıl sınırını aşar", () => {
    expect(addDays("2026-09-28", 7)).toBe("2026-10-05");
    expect(addDays("2026-01-02", -5)).toBe("2025-12-28");
  });
  it("dayIndexOf Pazartesi = 0, Pazar = 6", () => {
    expect(dayIndexOf("2026-09-28")).toBe(0);
    expect(dayIndexOf("2026-10-04")).toBe(6);
  });
  it("weekStartOf", () => {
    expect(weekStartOf("2026-10-04")).toBe("2026-09-28");
    expect(weekStartOf("2026-09-28")).toBe("2026-09-28");
  });
});

describe("businessWallTime", () => {
  it("TR 18:00 = 15:00 UTC", () => {
    expect(businessWallTime("2026-09-28", "18:00").toISOString()).toBe("2026-09-28T15:00:00.000Z");
  });
  it("TR 01:00 önceki UTC gününe düşer", () => {
    expect(businessWallTime("2026-09-28", "01:00").toISOString()).toBe("2026-09-27T22:00:00.000Z");
  });
});
