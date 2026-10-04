import { describe, it, expect } from "vitest";
import { branchRoles, customRoles, normalizeRoleLabel } from "@/lib/roles";
import { effectiveWeeklyLimit } from "@/lib/legal";

describe("şube görev listesi (lib/roles)", () => {
  it("işletme türü yoksa sadece şubenin eklediği görevler", () => {
    expect(branchRoles({ custom_roles: ["Pres Operatörü"] })).toEqual({ industry: [], custom: ["Pres Operatörü"], all: ["Pres Operatörü"] });
  });
  it("hazır görevle aynı adlı özel görev tekrar etmez", () => {
    const r = branchRoles({ industry: "manufacturing", custom_roles: ["Kaynakçı", "Pres Operatörü"] });
    expect(r.all.filter(x => x === "Kaynakçı")).toHaveLength(1);
    expect(r.custom).toEqual(["Pres Operatörü"]);
  });
  it("bozuk veri yok sayılır, ad biçimlenir", () => {
    expect(customRoles({ custom_roles: ["", 3, " A "] as unknown as string[] })).toEqual([" A "]);
    expect(normalizeRoleLabel("  Pres   Operatörü ")).toBe("Pres Operatörü");
  });
});

describe("haftalık sınır (lib/legal effectiveWeeklyLimit)", () => {
  it("şube sınırı üst sınırdır, kişinin değeri sadece daha düşükse geçerli", () => {
    expect(effectiveWeeklyLimit(45, 40)).toBe(40);
    expect(effectiveWeeklyLimit(30, 45)).toBe(30);
    expect(effectiveWeeklyLimit(null, 45)).toBe(45);
    expect(effectiveWeeklyLimit(50, 45)).toBe(45);
  });
});
