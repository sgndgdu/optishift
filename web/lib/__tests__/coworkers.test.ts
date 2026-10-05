import { describe, it, expect } from "vitest";
import { coworkersOf, type TeamShift } from "@/lib/coworkers";

const t = (id: string, name: string, o: Partial<TeamShift> = {}): TeamShift =>
  ({ personnel_id: id, personnel_name: name, location_id: "a", day: 1, start_time: "16:00", end_time: "00:00", department_name: "Salon", ...o });

describe("coworkersOf", () => {
  const mine = { day: 1, location_id: "a", start_time: "16:00", end_time: "00:00", department_name: "Salon" };
  it("aynı gün, şube ve departmanda saati çakışanlar; ben hariç", () => {
    const team = [t("me", "Ben Kim"), t("1", "Ali Can"), t("2", "Ayşe Su", { department_name: "Mutfak" }),
      t("3", "Veli Er", { day: 2 }), t("4", "Can Ak", { location_id: "b" }), t("5", "Ece Tan", { start_time: "08:00", end_time: "16:00" })];
    expect(coworkersOf(mine, team, "me")).toEqual(["Ali"]);
  });
  it("departmanda kimse yoksa şube geneli", () => {
    expect(coworkersOf(mine, [t("2", "Ayşe Su", { department_name: "Mutfak" })], "me")).toEqual(["Ayşe"]);
  });
  it("gece yarısını geçen vardiya sabah vardiyasıyla çakışmaz", () => {
    expect(coworkersOf(mine, [t("5", "Ece Tan", { start_time: "00:00", end_time: "08:00" })], "me")).toEqual([]);
  });
});
