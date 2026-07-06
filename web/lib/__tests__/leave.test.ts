import { describe, it, expect } from "vitest";
import { entitledDaysForServiceYear, countLeaveDays, seniorityYears, computeLeaveBalance, isAnnualLeaveType } from "../leave";

describe("entitledDaysForServiceYear (İş K. m.53)", () => {
  it("1 yıldan az → 0", () => expect(entitledDaysForServiceYear(0)).toBe(0));
  it("1-5 yıl → 14", () => {
    expect(entitledDaysForServiceYear(1)).toBe(14);
    expect(entitledDaysForServiceYear(5)).toBe(14);
  });
  it("5+ yıl → 20", () => expect(entitledDaysForServiceYear(6)).toBe(20));
  it("15+ yıl → 26", () => expect(entitledDaysForServiceYear(15)).toBe(26));
  it("18 yaş altı min 20", () => expect(entitledDaysForServiceYear(1, true)).toBe(20));
});

describe("countLeaveDays (m.56 — hafta tatili düşülür)", () => {
  // 2026-07-06 Pazartesi … 2026-07-12 Pazar
  it("tam hafta, Pazar tatil → 6 gün", () => {
    expect(countLeaveDays("2026-07-06", "2026-07-12", null)).toBe(6);
  });
  it("tam hafta, sabit izin günü Çarşamba (2) → 6 gün", () => {
    expect(countLeaveDays("2026-07-06", "2026-07-12", 2)).toBe(6);
  });
  it("tek gün, tatile denk → 0", () => {
    expect(countLeaveDays("2026-07-12", "2026-07-12", null)).toBe(0);
  });
  it("ters aralık → 0", () => {
    expect(countLeaveDays("2026-07-12", "2026-07-06", null)).toBe(0);
  });
});

describe("seniorityYears", () => {
  const today = new Date("2026-07-06T00:00:00Z");
  it("yıldönümü geçti → tam yıl", () => expect(seniorityYears("2020-03-15", today)).toBe(6));
  it("yıldönümü gelmedi → bir eksik", () => expect(seniorityYears("2020-09-01", today)).toBe(5));
  it("1 yıldan az → 0", () => expect(seniorityYears("2026-01-01", today)).toBe(0));
});

describe("computeLeaveBalance", () => {
  const today = new Date("2026-07-06T00:00:00Z");

  it("sabit mod: yıllık hak − bu yılın kullanımı", () => {
    const b = computeLeaveBalance({
      autoEntitlement: false, fixedAnnualDays: 14, today,
      approvedAnnualLeaves: [
        { start_date: "2026-02-02", end_date: "2026-02-06" }, // Pzt-Cum = 5 gün
        { start_date: "2025-08-04", end_date: "2025-08-08" }, // geçen yıl — sayılmaz
      ],
    });
    expect(b.mode).toBe("fixed");
    expect(b.usedDays).toBe(5);
    expect(b.remaining).toBe(9);
  });

  it("kıdem modu: kümülatif hak − tüm kullanım (devir otomatik)", () => {
    // 2019-06-01 giriş → 2026-07-06 itibarıyla 7 tam yıl: 14×5 + 20×2 = 110
    const b = computeLeaveBalance({
      autoEntitlement: true, fixedAnnualDays: 14, hireDate: "2019-06-01", today,
      approvedAnnualLeaves: [{ start_date: "2024-07-01", end_date: "2024-07-12" }], // 11 gün (1 Pazar düşer)
    });
    expect(b.mode).toBe("seniority");
    expect(b.seniorityYears).toBe(7);
    expect(b.entitledTotal).toBe(110);
    expect(b.usedDays).toBe(11);
    expect(b.remaining).toBe(99);
    expect(b.nextAccrualDate).toBe("2027-06-01");
  });

  it("kıdem modu, 1 yıl dolmadı → hak 0", () => {
    const b = computeLeaveBalance({
      autoEntitlement: true, fixedAnnualDays: 14, hireDate: "2026-02-01", today,
      approvedAnnualLeaves: [],
    });
    expect(b.entitledTotal).toBe(0);
    expect(b.remaining).toBe(0);
  });

  it("elle düzeltme günü eklenir", () => {
    const b = computeLeaveBalance({
      autoEntitlement: false, fixedAnnualDays: 14, adjustmentDays: 3, today,
      approvedAnnualLeaves: [],
    });
    expect(b.remaining).toBe(17);
  });
});

describe("isAnnualLeaveType", () => {
  it("Türkçe etiket ve kod değeri", () => {
    expect(isAnnualLeaveType("Yıllık İzin")).toBe(true);
    expect(isAnnualLeaveType("annual")).toBe(true);
    expect(isAnnualLeaveType("Hastalık / Rapor")).toBe(false);
    expect(isAnnualLeaveType(null)).toBe(false);
  });
});
