import { describe, it, expect } from "vitest";
import { applyRuleLocks, canEditLockedSettings, ALL_LOCKED_RULE_KEYS } from "@/lib/ruleLocks";

describe("applyRuleLocks", () => {
  it("kilitli alanlarda mevcut değer korunur, serbest alanlar değişir", () => {
    const cur = { max_weekly_hours: 45, chat_enabled: true, weekly_labor_budget_try: 50000, checkin_required: false };
    const inc = { max_weekly_hours: 70, chat_enabled: false, weekly_labor_budget_try: 0, checkin_required: true };
    expect(applyRuleLocks(cur, inc)).toEqual({ max_weekly_hours: 45, chat_enabled: true, weekly_labor_budget_try: 50000, checkin_required: true });
  });
  it("mevcutta olmayan kilitli alan yazılmaz", () => {
    expect(applyRuleLocks({}, { min_rest_hours: 5, autopilot: { enabled: false } })).toEqual({ autopilot: { enabled: false } });
  });
  it("sadece patron ve bölge müdürü kilitli alanı değiştirir", () => {
    expect(canEditLockedSettings("admin")).toBe(true);
    expect(canEditLockedSettings("supervisor")).toBe(true);
    expect(canEditLockedSettings("manager")).toBe(false);
    expect(canEditLockedSettings("employee")).toBe(false);
  });
  it("kilit listesi tekrarsız", () => {
    expect(new Set(ALL_LOCKED_RULE_KEYS).size).toBe(ALL_LOCKED_RULE_KEYS.length);
  });
});
