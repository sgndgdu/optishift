import { describe, it, expect } from "vitest";
import { isNightTime } from "@/lib/legal";

describe("gece vardiyası tek kural (saatten)", () => {
  it("gece sayılanlar", () => {
    expect(isNightTime("22:00", "06:00")).toBe(true);   // 22:00 sonrası başlar
    expect(isNightTime("20:00", "03:30")).toBe(true);   // gece yarısını geçer
    expect(isNightTime("00:00", "08:00")).toBe(true);   // çoğu 00-06 arasında
    expect(isNightTime("08:00", "08:00")).toBe(true);   // 24 saat nöbet
  });
  it("gece sayılmayanlar", () => {
    expect(isNightTime("16:00", "00:00")).toBe(false);
    expect(isNightTime("08:00", "16:00")).toBe(false);
    expect(isNightTime("04:30", "12:30")).toBe(false);  // fırın: çoğu gündüz
  });
});
