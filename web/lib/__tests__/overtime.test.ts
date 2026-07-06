import { describe, it, expect } from "vitest";
import { shiftMinutes, round1, decideOvertimeUpsert, type ExistingOvertimeRow } from "../overtime";

describe("shiftMinutes", () => {
  it("normal gündüz vardiyasında doğru dakika hesaplar", () => {
    expect(shiftMinutes("09:00", "17:00")).toBe(480);
    expect(shiftMinutes("08:30", "12:45")).toBe(255);
  });

  it("gece yarısını aşan vardiyada +1440 düzeltmesi uygular", () => {
    // Ege Metal gece vardiyası: 22:00–05:30 = 7,5 saat = 450 dk
    expect(shiftMinutes("22:00", "05:30")).toBe(450);
  });

  it("tam gece yarısında biten vardiyayı doğru hesaplar", () => {
    expect(shiftMinutes("16:00", "00:00")).toBe(480);
  });
});

describe("round1", () => {
  it("bir ondalık basamağa yuvarlar", () => {
    expect(round1(7.549)).toBe(7.5);
    expect(round1(7.55)).toBe(7.6);
    expect(round1(0)).toBe(0);
  });
});

describe("decideOvertimeUpsert", () => {
  it("karara bağlanmış kayıt varsa dokunmaz (skip_decided) ve fazla pending'leri temizler", () => {
    const existing: ExistingOvertimeRow[] = [
      { id: 1, status: "approved", overtime_hours: 5 },
      { id: 2, status: "pending", overtime_hours: 3 },
    ];
    const action = decideOvertimeUpsert(existing, 4);
    expect(action).toEqual({ type: "skip_decided", extraPendingIdsToDelete: [2] });
  });

  it("hiç pending yokken overtimeHours<=0 ise skip_zero", () => {
    const action = decideOvertimeUpsert([], 0);
    expect(action).toEqual({ type: "skip_zero" });
  });

  it("pending varken overtimeHours<=0 olursa hepsini siler (delete)", () => {
    const existing: ExistingOvertimeRow[] = [
      { id: 1, status: "pending", overtime_hours: 2 },
    ];
    const action = decideOvertimeUpsert(existing, 0);
    expect(action).toEqual({ type: "delete", ids: [1] });
  });

  it("hiç kayıt yokken pozitif saat -> insert", () => {
    const action = decideOvertimeUpsert([], 6.234);
    expect(action).toEqual({ type: "insert", newHours: 6.2 });
  });

  it("tek pending kayıt varken saat değişmezse hoursChanged false", () => {
    const existing: ExistingOvertimeRow[] = [
      { id: 5, status: "pending", overtime_hours: 3 },
    ];
    const action = decideOvertimeUpsert(existing, 3);
    expect(action).toEqual({
      type: "update",
      keepId: 5,
      extraIdsToDelete: [],
      hoursChanged: false,
      newHours: 3,
    });
  });

  it("tek pending kayıt varken saat değişirse hoursChanged true (personel onayı sıfırlanmalı)", () => {
    const existing: ExistingOvertimeRow[] = [
      { id: 5, status: "pending", overtime_hours: 3 },
    ];
    const action = decideOvertimeUpsert(existing, 4.5);
    expect(action).toEqual({
      type: "update",
      keepId: 5,
      extraIdsToDelete: [],
      hoursChanged: true,
      newHours: 4.5,
    });
  });

  it("birden fazla pending varsa ilkini korur, geri kalanını silmeye işaretler", () => {
    const existing: ExistingOvertimeRow[] = [
      { id: 10, status: "pending", overtime_hours: 2 },
      { id: 11, status: "pending", overtime_hours: 2 },
      { id: 12, status: "pending", overtime_hours: 2 },
    ];
    const action = decideOvertimeUpsert(existing, 5);
    expect(action).toEqual({
      type: "update",
      keepId: 10,
      extraIdsToDelete: [11, 12],
      hoursChanged: true,
      newHours: 5,
    });
  });
});
