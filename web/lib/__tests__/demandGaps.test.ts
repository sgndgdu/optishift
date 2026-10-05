import { describe, it, expect } from "vitest";
import { demandGapDays, fillAllRows } from "@/lib/demandGaps";

describe("yarım dolu ihtiyaç tablosu (lib/demandGaps)", () => {
  it("boş tabloda boşluk yok sayılır (tamamen boş ayrı uyarılır)", () => {
    expect(demandGapDays({})).toEqual([]);
    expect(demandGapDays({ a: { 0: 0 } })).toEqual([]);
  });
  it("sadece Pazartesi doluysa diğer günler boşluk; kapalı ve geçmiş gün atlanır", () => {
    const m = { a: { 0: 1 }, b: { 0: 1 } };
    expect(demandGapDays(m)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(demandGapDays(m, [6, 1])).toEqual([2, 3, 4, 5]);
  });
  it("bir vardiyası dolu gün boşluk sayılmaz", () => {
    expect(demandGapDays({ a: { 0: 1, 1: 0 }, b: { 1: 2 } })).toEqual([2, 3, 4, 5, 6]);
  });
  it("tüm satırlar ilk sayıyla doldurulur, atlanacak gün boş kalır", () => {
    const f = fillAllRows({ a: { 0: 2, 3: 1 }, b: {} }, [6]);
    expect(f.a).toEqual({ 0: 2, 1: 2, 2: 2, 3: 1, 4: 2, 5: 2, 6: 0 });
    expect(f.b).toEqual({ 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 });
  });
});
