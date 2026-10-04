import { describe, it, expect } from "vitest";
import { applyRuleLocks, isCategoryLocked, LOCKED_RULE_KEYS, ruleKeyPerm } from "@/lib/ruleLocks";
import { parseAccess } from "@/lib/userAccess";

const mgr = (perms: string[]) => ({ role: "manager", access: parseAccess({ perms }) });
const owner = { role: "admin", access: null };

describe("ayar anahtarı → madde", () => {
  it("bütçe, ek özellik, hazırlık ve plan ayarı", () => {
    expect(ruleKeyPerm("weekly_labor_budget_try")).toBe("budget");
    expect(ruleKeyPerm("chat_enabled")).toBeNull();
    expect(ruleKeyPerm("call_forecast")).toBe("prepare");
    expect(ruleKeyPerm("max_weekly_hours")).toBe("plan_settings");
  });
  it("ayarlar ekranı kilitleri", () => {
    expect(isCategoryLocked(owner, "features")).toBe(false);
    expect(isCategoryLocked(mgr(["plan_settings", "budget"]), "features")).toBe(true);
    expect(isCategoryLocked(mgr(["plan_settings"]), "rules")).toBe(false);
    expect(isCategoryLocked(mgr(["plan_settings"]), "budget")).toBe(true);
  });
});

describe("applyRuleLocks", () => {
  it("sahibe uygulanmaz", () => {
    expect(applyRuleLocks({ chat_enabled: true }, { chat_enabled: false }, owner)).toEqual({ chat_enabled: false });
  });
  it("yetkili madde değişir, yetkisiz korunur, ek özellik sadece sahipte", () => {
    const cur = { max_weekly_hours: 45, weekly_labor_budget_try: 1000, chat_enabled: true };
    const inc = { max_weekly_hours: 50, weekly_labor_budget_try: 9, chat_enabled: false };
    expect(applyRuleLocks(cur, inc, mgr(["plan_settings"]))).toEqual({ max_weekly_hours: 50, weekly_labor_budget_try: 1000, chat_enabled: true });
    expect(applyRuleLocks(cur, inc, mgr(["budget"]))).toEqual({ max_weekly_hours: 45, weekly_labor_budget_try: 9, chat_enabled: true });
  });
  it("gönderilmeyen anahtar silinmez, yeni anahtar yetkisizse yazılmaz", () => {
    expect(applyRuleLocks({ max_weekly_hours: 45 }, {}, mgr([]))).toEqual({ max_weekly_hours: 45 });
    expect(applyRuleLocks({}, { max_weekly_hours: 70 }, mgr([]))).toEqual({});
  });
  it("hazırlayan sadece çağrı tahminini yazar", () => {
    expect(applyRuleLocks({ min_rest_hours: 11 }, { min_rest_hours: 8, call_forecast: { x: 1 } }, mgr(["prepare"])))
      .toEqual({ min_rest_hours: 11, call_forecast: { x: 1 } });
  });
  it("eski şube izin anahtarını kimse yazamaz", () => {
    expect(applyRuleLocks({}, { manager_permissions: { budget: false } }, mgr(["plan_settings"]))).toEqual({});
  });
  it("kilit listesi tekrarsız", () => {
    const all = Object.values(LOCKED_RULE_KEYS).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});
