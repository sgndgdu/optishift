import { describe, it, expect, vi } from "vitest";

// lib/autopilot DB/motor modüllerini içe aktarır; saf karar fonksiyonu için onları boşa çıkar
vi.mock("@/lib/db/client", () => ({ getDB: () => ({}) }));
vi.mock("@/lib/generatePlan", () => ({ generatePlan: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ sendPushToPersonnel: vi.fn() }));

import { autopilotDecision, autopilotSettings, AUTOPILOT_DEFAULT_DAY } from "@/lib/autopilot";

const base = { rules: {}, todayIdx: 3, weekStart: "2026-09-28", nextWeekRows: 0, hasDemand: true, hasSetup: true };

describe("autopilotSettings", () => {
  it("varsayılan açık ve Perşembe", () => {
    expect(autopilotSettings({})).toEqual({ enabled: true, day: AUTOPILOT_DEFAULT_DAY });
    expect(AUTOPILOT_DEFAULT_DAY).toBe(3);
  });
  it("kapatılabilir, geçersiz gün varsayılana düşer", () => {
    expect(autopilotSettings({ autopilot: { enabled: false } }).enabled).toBe(false);
    expect(autopilotSettings({ autopilot: { day: 9 } }).day).toBe(3);
    expect(autopilotSettings({ autopilot: { day: 0 } }).day).toBe(0);
  });
});

describe("autopilotDecision", () => {
  it("gün gelince gelecek hafta için çalışır", () => {
    expect(autopilotDecision(base)).toEqual({ run: true, targetWeek: "2026-10-05" });
  });
  it("gün kaçtıysa sonraki günlerde telafi eder", () => {
    expect(autopilotDecision({ ...base, todayIdx: 5 }).run).toBe(true);
  });
  it("gün gelmeden çalışmaz", () => {
    expect(autopilotDecision({ ...base, todayIdx: 2 })).toEqual({ run: false, reason: "not_due" });
  });
  it("kapalıysa çalışmaz", () => {
    expect(autopilotDecision({ ...base, rules: { autopilot: { enabled: false } } })).toEqual({ run: false, reason: "disabled" });
  });
  it("bu hafta çalıştıysa tekrar çalışmaz", () => {
    expect(autopilotDecision({ ...base, rules: { autopilot: { last_run_week: "2026-09-28" } } }))
      .toEqual({ run: false, reason: "already_ran" });
    expect(autopilotDecision({ ...base, rules: { autopilot: { last_run_week: "2026-09-21" } } }).run).toBe(true);
  });
  it("müdür gelecek haftaya başladıysa dokunmaz", () => {
    expect(autopilotDecision({ ...base, nextWeekRows: 4 })).toEqual({ run: false, reason: "week_started" });
  });
  it("ihtiyaç tablosu boşsa ya da kurulum eksikse çalışmaz", () => {
    expect(autopilotDecision({ ...base, hasDemand: false })).toEqual({ run: false, reason: "no_demand" });
    expect(autopilotDecision({ ...base, hasSetup: false })).toEqual({ run: false, reason: "no_setup" });
  });
});
