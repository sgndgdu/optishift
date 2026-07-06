import { describe, it, expect } from "vitest";
import { addDays, windowStart, normalizeAvailCell } from "../scoring";

describe("addDays", () => {
  it("gün ekler", () => {
    expect(addDays("2026-07-06", 1)).toBe("2026-07-07");
    expect(addDays("2026-07-06", 7)).toBe("2026-07-13");
  });

  it("ay sınırını doğru geçer", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
  });

  it("yıl sınırını doğru geçer (yıl devri riski)", () => {
    expect(addDays("2026-12-29", 7)).toBe("2027-01-05");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("negatif gün ile geriye gider", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("windowStart", () => {
  it("8 haftalık pencerede 7 hafta geriye gider (asOfWeek dahil 8 hafta)", () => {
    // 2026-07-06 Pazartesi, 8 hafta geriye = 7*7=49 gün önce
    expect(windowStart("2026-07-06", 8)).toBe(addDays("2026-07-06", -49));
  });

  it("1 haftalık pencerede kendisini döner", () => {
    expect(windowStart("2026-07-06", 1)).toBe("2026-07-06");
  });

  it("yıl sınırını aşan pencerede doğru tarihe düşer", () => {
    expect(windowStart("2027-01-05", 8)).toBe(addDays("2027-01-05", -49));
  });
});

describe("normalizeAvailCell", () => {
  it("düz string değerleri olduğu gibi döner", () => {
    expect(normalizeAvailCell("preferred_not")).toBe("preferred_not");
    expect(normalizeAvailCell("unavailable")).toBe("unavailable");
  });

  it("JSON string'den status alanını çıkarır", () => {
    expect(normalizeAvailCell('{"status":"preferred_not","range":"09:00-17:00"}')).toBe("preferred_not");
  });

  it("bozuk JSON veya status alanı yoksa available döner", () => {
    expect(normalizeAvailCell("{broken")).toBe("available");
    expect(normalizeAvailCell("{}")).toBe("available");
  });

  it("string olmayan değerlerde available döner", () => {
    expect(normalizeAvailCell(null)).toBe("available");
    expect(normalizeAvailCell(undefined)).toBe("available");
    expect(normalizeAvailCell(42)).toBe("available");
  });
});
