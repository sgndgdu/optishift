import { describe, it, expect } from "vitest";
import {
  departmentFamily, departmentLabel, departmentRoleNames, hasSubDepartments, leafDepartments, sortDepartments,
} from "@/lib/departments";
import { departmentInScope } from "@/lib/access";

const depts = [
  { id: "bar", name: "Bar" },
  { id: "kat2", name: "Teras", parent_id: "salon" },
  { id: "salon", name: "Salon" },
  { id: "kat1", name: "Bahçe", parent_id: "salon" },
  { id: "mutfak", name: "Mutfak" },
];

describe("alt departmanlar", () => {
  it("aile: departman + alt departmanları", () => {
    expect(departmentFamily(depts, "salon")).toEqual(["salon", "kat2", "kat1"]);
    expect(departmentFamily(depts, "bar")).toEqual(["bar"]);
    expect(departmentFamily(depts, "kat1")).toEqual(["kat1"]);
  });
  it("kişi en alttaki departmana bağlanır", () => {
    expect(hasSubDepartments(depts, "salon")).toBe(true);
    expect(leafDepartments(depts).map(d => d.id)).toEqual(["bar", "kat2", "kat1", "mutfak"]);
  });
  it("ağaç sırası ve etiket", () => {
    expect(sortDepartments(depts).map(d => d.id)).toEqual(["bar", "salon", "kat2", "kat1", "mutfak"]);
    expect(departmentLabel(depts, depts[1])).toBe("Salon › Teras");
    expect(departmentLabel(depts, depts[0])).toBe("Bar");
  });
  it("üst departmanın adı da görev sayılır", () => {
    expect(departmentRoleNames(depts, "kat1")).toEqual(["Bahçe", "Salon"]);
    expect(departmentRoleNames(depts, "bar")).toEqual(["Bar"]);
    expect(departmentRoleNames(depts, null)).toEqual([]);
  });
  it("şef kapsamı dışındaki seçim şefin departmanına düşer", () => {
    expect(departmentInScope(["salon", "kat1", "kat2"], "kat2")).toBe("kat2");
    expect(departmentInScope(["salon", "kat1", "kat2"], "bar")).toBe("salon");
    expect(departmentInScope(null, "bar")).toBe("bar");
  });
});
