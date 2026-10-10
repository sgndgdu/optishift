import { describe, it, expect } from "vitest";
import { computeCompLeaveBalance, isCompLeaveType, COMP_LEAVE_TYPE } from "../compLeave";

const ev = (date: string) => ({ date, start_time: "09:00", end_time: "17:00", days: 1 });

describe("denkleştirme izni", () => {
  it("kazanılan − kullanılan − bekleyen", () => {
    const b = computeCompLeaveBalance(
      [ev("2026-10-04"), ev("2026-10-11"), ev("2026-10-18")],
      [{ start_date: "2026-10-14", end_date: "2026-10-14", status: "approved" }, { start_date: "2026-10-21", end_date: "2026-10-21", status: "pending" }],
    );
    expect(b).toMatchObject({ earned: 3, used: 1, pending: 1, available: 1 });
  });

  it("hafta tatili izinden sayılmaz, kalan eksiye düşmez", () => {
    // 2026-10-17 Cumartesi - 2026-10-18 Pazar; sabit izin günü yoksa Pazar sayılmaz
    const b = computeCompLeaveBalance([ev("2026-10-04")], [{ start_date: "2026-10-17", end_date: "2026-10-18", status: "approved" }, { start_date: "2026-10-20", end_date: "2026-10-20", status: "approved" }]);
    expect(b.used).toBe(2);
    expect(b.available).toBe(0);
  });

  it("tür adı", () => {
    expect(isCompLeaveType(COMP_LEAVE_TYPE)).toBe(true);
    expect(isCompLeaveType("Yıllık İzin")).toBe(false);
  });
});
