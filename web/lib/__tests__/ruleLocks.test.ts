import { describe, it, expect } from "vitest";
import { applyRuleLocks, hasManagerPermission, managerPermissions, LOCKED_RULE_KEYS } from "@/lib/ruleLocks";

describe("müdür izinleri", () => {
  it("varsayılan: hepsine izin", () => {
    expect(Object.values(managerPermissions({})).every(Boolean)).toBe(true);
    expect(hasManagerPermission("manager", {}, "budget")).toBe(true);
  });
  it("patron/bölge müdürü her zaman, personel hiçbir zaman", () => {
    const rules = { manager_permissions: { budget: false } };
    expect(hasManagerPermission("admin", rules, "budget")).toBe(true);
    expect(hasManagerPermission("supervisor", rules, "budget")).toBe(true);
    expect(hasManagerPermission("manager", rules, "budget")).toBe(false);
    expect(hasManagerPermission("employee", {}, "budget")).toBe(false);
  });
});

describe("applyRuleLocks", () => {
  it("izin varsa müdür değiştirir", () => {
    expect(applyRuleLocks({ max_weekly_hours: 45 }, { max_weekly_hours: 50 })).toEqual({ max_weekly_hours: 50 });
  });
  it("izin kapalı kategoride mevcut değer korunur, diğerleri değişir", () => {
    const cur = { manager_permissions: { rules: false }, max_weekly_hours: 45, chat_enabled: true, checkin_required: false };
    const inc = { manager_permissions: { rules: true }, max_weekly_hours: 70, chat_enabled: false, checkin_required: true };
    expect(applyRuleLocks(cur, inc)).toEqual({ manager_permissions: { rules: false }, max_weekly_hours: 45, chat_enabled: false, checkin_required: true });
  });
  it("müdür izin ayarını hiç yazamaz", () => {
    expect(applyRuleLocks({}, { manager_permissions: { budget: false } })).toEqual({});
  });
  it("kilit listesi tekrarsız", () => {
    const all = Object.values(LOCKED_RULE_KEYS).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});
