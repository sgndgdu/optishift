import { describe, it, expect } from "vitest";
import { answerQuestion, buildInsights, buildWeekSnapshot, type CopilotInput } from "@/lib/copilot";

// 2026-09-28 Pazartesi haftası
const defs = [
  { id: "s-sabah", name: "Sabah", start: "08:00", end: "16:00", base_points: 3 },
  { id: "s-aksam", name: "Akşam", start: "16:00", end: "24:00", base_points: 4 },
  { id: "s-gece", name: "Gece", start: "22:00", end: "06:00", base_points: 6, is_night: true,
    required_skills: [{ skill: "Bakım Teknisyeni", count: 1 }] },
];

const a = (personnel_id: string, day: number, shift_id: string) =>
  ({ personnel_id, day, shift_id, start_time: null, end_time: null, publication_status: "draft" });

const base = (): CopilotInput => ({
  weekStart: "2026-09-28",
  shiftDefs: defs,
  demand: {},
  rules: { maxWeeklyHours: 45, minRestHours: 11, maxConsecutiveDays: 6 },
  personnel: [
    { id: "ali", name: "Ali", roles: [], score: 100 },
    { id: "ayse", name: "Ayşe", roles: ["Bakım Teknisyeni"], score: 100 },
    { id: "can", name: "Can", roles: [], score: 100 },
  ],
  assignments: [],
  leaves: [],
  availability: {},
});

const ids = (input: CopilotInput) => buildInsights(buildWeekSnapshot(input)).map(i => i.id);

describe("haftanın durumu", () => {
  it("saat, gece, hafta sonu ve dinlenme", () => {
    const input = base();
    // Ali: Pzt akşam (16-24) → Sal sabah (08-16): 8 saat dinlenme; Cmt gece
    input.assignments = [a("ali", 0, "s-aksam"), a("ali", 1, "s-sabah"), a("ali", 5, "s-gece")];
    const ali = buildWeekSnapshot(input).people.find(p => p.id === "ali")!;
    expect(ali).toMatchObject({ hours: 24, nights: 1, weekendShifts: 1, hardShifts: 1, minRestHours: 8, longestStreak: 2 });
    expect(ali.freeDays).toEqual([2, 3, 4, 6]);
  });

  it("izin, uygun değil ve tercih etmem günleri", () => {
    const input = base();
    input.leaves = [{ personnel_id: "can", start_date: "2026-09-29", end_date: "2026-09-30", type: "annual" }];
    input.availability = { can: ["available", "available", "available", "unavailable", "preferred_not", "available", "available"] };
    input.assignments = [a("can", 1, "s-sabah"), a("can", 3, "s-sabah"), a("can", 4, "s-sabah")];
    const can = buildWeekSnapshot(input).people.find(p => p.id === "can")!;
    expect(can).toMatchObject({ leaveDays: [1, 2], onLeaveDays: [1], unavailableDays: [3], preferredNotDays: [4] });
    expect(can.freeDays).toEqual([0, 5, 6]);
  });

  it("durum: boş, taslak, yayınlandı", () => {
    const input = base();
    expect(buildWeekSnapshot(input).status).toBe("empty");
    input.assignments = [a("ali", 0, "s-sabah")];
    expect(buildWeekSnapshot(input).status).toBe("draft");
    input.assignments[0].publication_status = "published";
    expect(buildWeekSnapshot(input).status).toBe("published");
  });
});

describe("içgörüler", () => {
  it("boş haftada tek bilgi maddesi", () => {
    expect(ids(base())).toEqual(["empty"]);
  });

  it("kesin sorunlar üstte, özet sonda", () => {
    const input = base();
    input.leaves = [{ personnel_id: "can", start_date: "2026-09-28", end_date: "2026-09-28", type: "annual" }];
    input.assignments = [a("can", 0, "s-sabah"), a("ali", 0, "s-aksam"), a("ali", 1, "s-sabah")];
    const list = ids(input);
    expect(list.slice(0, 2)).toEqual(["on-leave", "short-rest"]);
    expect(list.at(-1)).toBe("summary");
  });

  it("gece vardiyasında zorunlu rol eksikse", () => {
    const input = base();
    input.assignments = [a("ali", 2, "s-gece")];
    const gap = buildInsights(buildWeekSnapshot(input)).find(i => i.id === "skill-gap")!;
    expect(gap.lines[0]).toBe("Çarşamba Gece: 1 Bakım Teknisyeni gerekli, 0 var");
    input.assignments.push(a("ayse", 2, "s-gece"));
    expect(ids(input)).not.toContain("skill-gap");
  });

  it("personel ihtiyacına göre eksik ve fazla", () => {
    const input = base();
    input.demand = { "s-sabah": { "0": 2, "1": 1 } };
    input.assignments = [a("ali", 0, "s-sabah"), a("ayse", 1, "s-sabah"), a("can", 1, "s-sabah")];
    const list = buildInsights(buildWeekSnapshot(input));
    expect(list.find(i => i.id === "understaffed")!.lines).toEqual(["Pazartesi Sabah: 1/2"]);
    expect(list.find(i => i.id === "overstaffed")!.lines).toEqual(["Salı Sabah: 2/1"]);
    expect(list.map(i => i.id)).not.toContain("no-demand");
  });

  it("45 saati aşan kişi", () => {
    const input = base();
    input.assignments = [0, 1, 2, 3, 4, 5].map(d => a("ali", d, "s-sabah"));
    const over = buildInsights(buildWeekSnapshot(input)).find(i => i.id === "over-hours")!;
    expect(over.lines).toEqual(["Ali: 48 saat"]);
  });

  it("adalet: yüklü kişiye zor vardiya, az yüklüye yok", () => {
    const input = base();
    input.personnel = [
      { id: "ali", name: "Ali", roles: [], score: 200 },
      { id: "ayse", name: "Ayşe", roles: [], score: 50 },
      { id: "can", name: "Can", roles: [], score: 50 },
    ];
    input.assignments = [a("ali", 5, "s-sabah"), a("ali", 6, "s-sabah"), a("ayse", 0, "s-sabah"), a("can", 1, "s-sabah")];
    const f = buildInsights(buildWeekSnapshot(input)).find(i => i.id === "fairness")!;
    expect(f.lines[0]).toContain("Ali");
    expect(f.lines[1]).toBe("Daha az yüklü olanlar: Ayşe (0) ve Can (0)");
  });
});

describe("hazır sorular", () => {
  it("ek vardiya: az yüklü ve boş günü olan önce", () => {
    const input = base();
    input.personnel[0].score = 200; // Ali yüklü
    input.personnel[2].score = 20;  // Can az yüklü
    input.assignments = [a("ali", 0, "s-sabah"), a("ayse", 0, "s-sabah")];
    const ans = answerQuestion(buildWeekSnapshot(input), "extra-shift")!;
    expect(ans.lines[0]).toMatch(/^Can: 0 saat çalışıyor/);
    expect(ans.lines[0]).toContain("sıra onda");
  });

  it("ihtiyaç girilmemişse eksik günler yerine günlük sayı", () => {
    const input = base();
    input.assignments = [a("ali", 0, "s-sabah")];
    const ans = answerQuestion(buildWeekSnapshot(input), "gaps")!;
    expect(ans.title).toContain("girilmediği");
    expect(ans.lines[1]).toBe("Pazartesi: 1 kişi");
  });

  it("kişinin haftası", () => {
    const input = base();
    input.assignments = [a("ayse", 2, "s-gece")];
    const ans = answerQuestion(buildWeekSnapshot(input), "person", "ayse")!;
    expect(ans.title).toBe("Ayşe: 8 saat, 1 vardiya");
    expect(ans.lines).toEqual(["Çarşamba: Gece 22:00-06:00 (gece)"]);
  });

  it("bilinmeyen soru", () => {
    expect(answerQuestion(buildWeekSnapshot(base()), "yok")).toBeNull();
  });
});
