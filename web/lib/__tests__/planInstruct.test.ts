import { describe, it, expect } from "vitest";
import { parseDays, resolveDirectives, type InstructCtx } from "@/lib/ai/planInstruct";
import { applyOverrides, sanitizeOverrides } from "@/lib/planOverrides";

const ctx: InstructCtx = {
  weekStart: "2026-10-12", today: "2026-10-09",
  people: [{ id: "P1", name: "Ayşe Kaya" }, { id: "P2", name: "Mehmet Demir" }, { id: "P3", name: "Mehmet Uslu" }],
  shifts: [
    { id: "s1", name: "Sabah", start: "07:00", end: "15:00" },
    { id: "s2", name: "Akşam", start: "15:00", end: "23:00" },
    { id: "s3", name: "Gece", start: "23:00", end: "07:00" },
  ],
  departments: [],
};

describe("parseDays", () => {
  it("bütün hafta, gün adı ve numara", () => {
    expect(parseDays("all")).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(parseDays(["Cuma", "cmt", 0])).toEqual([0, 4, 5]);
  });
});

describe("resolveDirectives", () => {
  it("sadece sabah: vardiyanın saat aralığına çevrilir", () => {
    const r = resolveDirectives([{ type: "only_shifts", person: "Ayşe", shifts: ["Sabah"], days: "all" }], ctx);
    expect(r.overrides).toEqual([{ type: "hours", personnel_id: "P1", days: [0, 1, 2, 3, 4, 5, 6], start: "07:00", end: "15:00" }]);
    expect(r.summary[0]).toBe("Ayşe Kaya: bütün hafta sadece Sabah vardiyasına yazılır.");
  });
  it("gece olmasın: kalan vardiyaların aralığı", () => {
    const r = resolveDirectives([{ type: "not_shifts", person: "Ayşe Kaya", shifts: ["Gece"] }], ctx);
    expect(r.overrides[0]).toMatchObject({ type: "hours", start: "07:00", end: "23:00" });
  });
  it("ortadaki vardiyayı yasaklamak kesin uygulanamaz, düşer", () => {
    const r = resolveDirectives([{ type: "not_shifts", person: "Ayşe Kaya", shifts: ["Akşam"] }], ctx);
    expect(r.overrides).toEqual([]);
    expect(r.dropped[0]).toContain("Akşam");
  });
  it("belirsiz isim düşer, sebebi yazılır", () => {
    const r = resolveDirectives([{ type: "day_off", person: "Mehmet", days: [4] }], ctx);
    expect(r.overrides).toEqual([]);
    expect(r.dropped[0]).toContain("Mehmet");
  });
  it("izin günü ve geçmiş gün ayıklanır", () => {
    const r = resolveDirectives([{ type: "day_off", person: "Mehmet Demir", days: ["Cuma"] }], { ...ctx, today: "2026-10-14" });
    expect(r.overrides).toEqual([{ type: "day_off", personnel_id: "P2", days: [4] }]);
    const past = resolveDirectives([{ type: "day_off", person: "Mehmet Demir", days: [0] }], { ...ctx, today: "2026-10-14" });
    expect(past.overrides).toEqual([]);
  });
  it("saat: gece geçişi 24 saati aşar, özette normal yazılır", () => {
    const r = resolveDirectives([{ type: "hours", person: "Ayşe Kaya", start: "18:00", end: "02:00", days: [5] }], ctx);
    expect(r.overrides[0]).toMatchObject({ start: "18:00", end: "26:00", days: [5] });
    expect(r.summary[0]).toContain("18:00-02:00");
  });
  it("çalışsın, birlikte olmasın, kişi sayısı, saat sınırı", () => {
    const r = resolveDirectives([
      { type: "work", person: "Ayşe Kaya", shift: "akşam", days: [5] },
      { type: "not_together", person: "Ayşe Kaya", other: "Mehmet Uslu" },
      { type: "demand", shift: "Akşam", days: [5, 6], count: 4 },
      { type: "max_hours", person: "Mehmet Uslu", hours: 30 },
    ], ctx);
    expect(r.overrides).toEqual([
      { type: "work", personnel_id: "P1", day: 5, shift_id: "s2" },
      { type: "not_together", personnel_id: "P1", other_id: "P3" },
      { type: "demand", shift_id: "s2", days: [5, 6], count: 4, department_id: null },
      { type: "max_hours", personnel_id: "P3", hours: 30 },
    ]);
    expect(r.dropped).toEqual([]);
  });
  it("bir kişi daha: kayıtlı sayının üstüne eklenir, gün gün", () => {
    const withDemand = {
      ...ctx, departments: [{ id: "bar", name: "Bar" }],
      demand: { bar: { s2: { "5": 2, "6": 3 } } },
    };
    const r = resolveDirectives([{ type: "demand", shift: "Akşam", days: [5, 6], add: 1, department: "Bar" }], withDemand);
    expect(r.overrides).toEqual([
      { type: "demand", shift_id: "s2", days: [5], count: 3, department_id: "bar" },
      { type: "demand", shift_id: "s2", days: [6], count: 4, department_id: "bar" },
    ]);
    expect(r.summary[0]).toBe("Bar, Akşam: Cumartesi 2 yerine 3, Pazar 3 yerine 4 kişi (sadece bu plan için).");
    const less = resolveDirectives([{ type: "demand", shift: "Akşam", days: [5], add: -5, department: "Bar" }], withDemand);
    expect(less.overrides[0]).toMatchObject({ count: 0 });
  });
});

describe("applyOverrides", () => {
  it("motor girdisine uygular, istemci verisini sınırlar", () => {
    const o = sanitizeOverrides([
      { type: "day_off", personnel_id: "P1", days: [4, 9] },
      { type: "hours", personnel_id: "P2", days: [0], start: "07:00", end: "15:00" },
      { type: "work", personnel_id: "P3", day: 5, shift_id: "s2" },
      { type: "max_hours", personnel_id: "P2", hours: 30 },
      { type: "demand", shift_id: "s2", days: [5], count: 4 },
      { type: "bilinmeyen" },
    ]);
    expect(o).toHaveLength(5);
    const t = {
      availability: { P3: { 5: "unavailable" } } as Record<string, any>,
      fixed: [{ personnel_id: "P1", day: 4, shift_id: "s1" }] as any[],
      personnel: [{ id: "P2", max_weekly_hours: 45 }],
      conflictPairs: [] as [string, string][],
      demand: { s2: { "5": 2 } } as Record<string, Record<string, number>>,
      deptDemand: {},
      shifts: ctx.shifts,
    };
    applyOverrides(o, t);
    expect(t.availability.P1[4]).toBe("unavailable");
    expect(t.fixed.find(f => f.personnel_id === "P1")).toBeUndefined();
    expect(t.availability.P2[0]).toEqual({ status: "available", start: "07:00", end: "15:00" });
    expect(t.fixed).toContainEqual({ personnel_id: "P3", day: 5, shift_id: "s2", start_time: "15:00", end_time: "23:00" });
    expect(t.availability.P3[5]).toBeUndefined();
    expect(t.personnel[0].max_weekly_hours).toBe(30);
    expect(t.demand.s2["5"]).toBe(4);
  });
});
