import { describe, it, expect } from "vitest";
import { answerQuestion, buildInsights, buildWeekSnapshot, crossTrainingInsight, explainAssignment, findProblems, type CopilotInput } from "@/lib/copilot";

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
  rules: {
    maxWeeklyHours: 45, minRestHours: 11, maxConsecutiveDays: 6, clopeningMinRestHours: 13,
    balancingPeriodWeeks: 0, nightLegalWarning: true, availabilityCollection: false,
  },
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

  it("girilen saat aralığının dışı: Uygun gün kesin, Esnek gün uyarı; izin günü tekrar sayılmaz", () => {
    const input = base();
    const eve = { start: "16:00", end: "24:00" };
    input.availability = { can: ["available", "available", "preferred_not", "unavailable", "available", "available", "available"] };
    input.availabilityWindows = { can: [eve, eve, eve, null, null, null, null] };
    input.leaves = [{ personnel_id: "can", start_date: "2026-10-01", end_date: "2026-10-01", type: "annual" }];
    // Pzt sabah (dışı), Sal akşam (içi), Çar sabah (esnek dışı), Per sabah (izin + gelemem)
    input.assignments = [a("can", 0, "s-sabah"), a("can", 1, "s-aksam"), a("can", 2, "s-sabah"), a("can", 3, "s-sabah")];
    const snap = buildWeekSnapshot(input);
    const can = snap.people.find(p => p.id === "can")!;
    expect(can).toMatchObject({ outsideWindowDays: [0], outsideWindowFlexibleDays: [2], onLeaveDays: [3], unavailableDays: [] });
    const ids = findProblems(snap).map(i => i.id);
    expect(ids).toContain("outside-window");
    expect(ids).toContain("outside-window-flexible");
    expect(ids).not.toContain("unavailable");
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

  it("geçmiş günlerin eksikleri uyarılmaz (bugün verilmişse)", () => {
    const input = base();
    input.demand = { "s-sabah": { "0": 2, "3": 2 } };
    input.assignments = [a("ali", 0, "s-sabah"), a("ali", 3, "s-sabah")];
    expect(buildInsights(buildWeekSnapshot(input)).find(i => i.id === "understaffed")!.lines)
      .toEqual(["Pazartesi Sabah: 1/2", "Perşembe Sabah: 1/2"]);
    input.today = "2026-10-01"; // Perşembe: Pazartesi geçti
    expect(buildInsights(buildWeekSnapshot(input)).find(i => i.id === "understaffed")!.lines)
      .toEqual(["Perşembe Sabah: 1/2"]);
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
    expect(over.lines).toEqual(["Ali: 48 saat, sınır 45 saat"]);
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

describe("kural kontrolleri (yayın penceresiyle ortak)", () => {
  const problems = (input: CopilotInput, budgets = {}) => findProblems(buildWeekSnapshot(input), budgets);

  it("ihtiyaç tablosu boşken hafta boyu kimsenin yazılmadığı vardiya uyarılır", () => {
    const input = base();
    input.assignments = [0, 1, 2, 3, 4].flatMap(d => [a("ali", d, "s-sabah"), a("can", d, "s-aksam")]);
    const hit = problems(input).find(i => i.id === "shift-unused")!;
    expect(hit.title).toBe("1 vardiyaya hafta boyunca kimse yazılmamış");
    expect(hit.lines[0]).toBe("Gece: 7 günün hiçbirinde kimse yok");

    input.demand = { "s-sabah": { "0": 1 } }; // tablo doluysa eksikler "understaffed" ile sayılır
    expect(problems(input).map(i => i.id)).not.toContain("shift-unused");
  });

  it("hafta tatili (m.46): 7 gün çalışan ya da 24 saat kesintisiz dinlenmesi olmayan", () => {
    const seven = base();
    seven.assignments = [0, 1, 2, 3, 4, 5, 6].map(d => a("ali", d, "s-sabah"));
    const hit = problems(seven).find(i => i.id === "weekly-rest")!;
    expect(hit.lines).toEqual(["Ali: en uzun dinlenme 16 saat (İş Kanunu m.46 hafta tatili)"]);

    // Salı boş ama Pzt gece (22-06) ve Çar sabah 05:00: aradaki dinlenme 23 saat
    const night = base();
    night.rules.maxConsecutiveDays = 7;
    night.assignments = [
      a("ayse", 0, "s-gece"), { ...a("ayse", 2, "s-sabah"), start_time: "05:00", end_time: "13:00" },
      ...[3, 4, 5, 6].map(d => a("ayse", d, "s-sabah")),
    ];
    // hafta başı Pzt 00:00-22:00 = 22 saat, sonra en uzun 23 saat → ihlal
    expect(problems(night).map(i => i.id)).toContain("weekly-rest");

    const ok = base();
    ok.assignments = [0, 1, 2, 3, 4, 5].map(d => a("ali", d, "s-sabah"));
    expect(problems(ok).map(i => i.id)).not.toContain("weekly-rest");
  });

  it("günlük 11 saat (m.63): mola düşülünce 11 saati aşan vardiya", () => {
    const input = base();
    input.assignments = [
      { ...a("ali", 0, "s-sabah"), start_time: "07:00", end_time: "20:00" }, // 13 s, net 12
      { ...a("can", 0, "s-sabah"), start_time: "07:00", end_time: "19:00" }, // 12 s, net 11: yasal
    ];
    expect(problems(input).find(i => i.id === "daily-11")!.lines).toEqual(["Ali: Pazartesi 13 saat"]);
  });

  it("sürüş süresi (AETR): 10 saat üstü gün, 9 saat üstü 2'den fazla gün, haftalık 56 saat", () => {
    const input = base();
    input.shiftDefs = [...defs, { id: "s-uzun", name: "Uzun Hat", start: "05:00", end: "17:00", base_points: 6, driving_hours: 9.5 }];
    input.rules.maxConsecutiveDays = 7;
    input.assignments = [0, 1, 2].map(d => a("ali", d, "s-uzun"));
    expect(problems(input).find(i => i.id === "driving")!.lines).toEqual(["Ali: 3 gün 9 saatten uzun sürüş (haftada en fazla 2)"]);
    input.assignments = [0, 1].map(d => a("ali", d, "s-uzun"));
    expect(problems(input).map(i => i.id)).not.toContain("driving");
  });

  it("güvenilirlik: gelmeme geçmişi olan kişinin vardiyaları uyarılır", () => {
    const input = base();
    input.assignments = [a("ali", 0, "s-sabah"), a("ali", 5, "s-aksam"), a("can", 1, "s-sabah")];
    const hit = problems(input, { unreliable: { ali: "Son 8 haftada 3 kez gelmedi" } }).find(i => i.id === "reliability")!;
    expect(hit.lines).toEqual(["Ali (son 8 haftada 3 kez gelmedi): Pzt Sabah, Cmt Akşam"]);
  });

  it("kişiye özel haftalık sınır ve denkleştirme", () => {
    const input = base();
    input.personnel[0].maxWeeklyHours = 20; // Ali yarı zamanlı
    input.assignments = [0, 1, 2].map(d => a("ali", d, "s-sabah")); // 24 saat
    expect(problems(input).find(i => i.id === "over-hours")!.lines).toEqual(["Ali: 24 saat, sınır 20 saat"]);

    const full = base();
    full.assignments = [0, 1, 2, 3, 4, 5].map(d => a("ayse", d, "s-sabah")); // 48 saat
    expect(problems(full).map(i => i.id)).toContain("over-hours");
    full.rules.balancingPeriodWeeks = 4; // denkleştirmede tek hafta tavanı 66
    expect(problems(full).map(i => i.id)).not.toContain("over-hours");
  });

  it("kapanıştan açılışa: yasal sınırın üstünde ama önerilenin altında", () => {
    const input = base();
    // Akşam 16-24 → ertesi gün 12:00: 12 saat dinlenme (11 üstü, 13 altı)
    input.assignments = [a("ali", 0, "s-aksam"), { ...a("ali", 1, "s-sabah"), start_time: "12:00", end_time: "20:00" }];
    const list = problems(input);
    expect(list.map(i => i.id)).not.toContain("short-rest");
    expect(list.find(i => i.id === "clopening")!.lines).toEqual(["Ali: Pzt→Sal 12 saat"]);
  });

  it("gece engeli, arka arkaya iki hafta gece ve 7,5 saati aşan gece", () => {
    const input = base();
    input.personnel[0].nightRestriction = "pregnant";
    input.personnel[1].workedNightLastWeek = true;
    input.assignments = [a("ali", 0, "s-gece"), a("ayse", 1, "s-gece")]; // gece 8 saat
    const ids = problems(input).map(i => i.id);
    expect(ids).toEqual(expect.arrayContaining(["night-restriction", "night-weeks", "long-night"]));
    input.rules.nightLegalWarning = false;
    expect(problems(input).map(i => i.id)).not.toContain("long-night");
  });

  it("üst üste 3 gece (Kaza Risk Radarı eşiği)", () => {
    const input = base();
    input.shiftDefs = input.shiftDefs.map(d => d.id === "s-gece" ? { ...d, end: "05:30", required_skills: [] } : d);
    input.assignments = [0, 1, 2].map(d => a("ali", d, "s-gece"));
    expect(problems(input).find(i => i.id === "night-streak")!.lines).toEqual(["Ali: üst üste 3 gece"]);
  });

  it("bütçeler", () => {
    const input = base();
    input.assignments = [0, 1, 2, 3, 4, 5].map(d => a("ali", d, "s-sabah")); // 48 saat, 3 saat fazla mesai
    const ids = problems(input, { labor: { total: 12000, budget: 10000 }, overtime: { thresholdHours: 45, budgetHours: 2 } }).map(i => i.id);
    expect(ids).toEqual(expect.arrayContaining(["labor-budget", "overtime-budget"]));
    expect(problems(input, { labor: { total: 12000, budget: 0 } }).map(i => i.id)).not.toContain("labor-budget");
  });

  it("uygunluk hatırlatması boş haftada da çıkar, sorun sayılmaz", () => {
    const input = base();
    input.rules.availabilityCollection = true;
    input.availability = { ali: Array(7).fill("available") };
    const list = buildInsights(buildWeekSnapshot(input));
    expect(list.map(i => i.id)).toEqual(["no-availability", "empty"]);
    expect(list[0]).toMatchObject({ title: "2 kişi uygunluk girmedi", action: "remind-availability" });
    expect(findProblems(buildWeekSnapshot(input))).toEqual([]);
  });
});


describe("neden bu kişi", () => {
  it("uygunluk, adalet, saat, rol ve boştaki alternatifleri söyler", () => {
    const input = base();
    input.personnel[0].score = 60;   // Ali az yüklü
    input.personnel[2].score = 30;   // Can daha az yüklü ve Salı boşta
    input.availability = { ali: ["available", "available", "available", "available", "available", "available", "available"] };
    input.assignments = [a("ali", 1, "s-sabah"), a("ayse", 1, "s-gece")];
    const lines = explainAssignment(buildWeekSnapshot(input), "ali", 1, { pinned: true, requiredRoles: [] });
    const texts = lines.map(l => l.text);
    expect(texts[0]).toBe("Elle düzenlendi; yeniden oluşturmada korunuyor");
    expect(texts).toContain("Bu gün için uygun olduğunu girmiş");
    expect(texts.some(t => t.startsWith("Bu hafta 8 saat"))).toBe(true);
    expect(lines.find(l => l.text.startsWith("O gün boşta ve daha az yüklü"))!.text).toContain("Can");
  });

  it("gerekli rolü ve dinlenme uyarısını gösterir", () => {
    const input = base();
    // Pzt gece 22-06, Sal sabah 08-16: 2 saat dinlenme
    input.assignments = [a("ayse", 0, "s-gece"), a("ayse", 1, "s-sabah")];
    const lines = explainAssignment(buildWeekSnapshot(input), "ayse", 1, { requiredRoles: ["Bakım Teknisyeni"] });
    expect(lines.map(l => l.text)).toContain("Vardiyanın gerektirdiği rolü taşıyor: Bakım Teknisyeni");
    const rest = lines.find(l => l.text.startsWith("Önceki vardiyasından"))!;
    expect(rest.tone).toBe("warn");
    expect(rest.text).toBe("Önceki vardiyasından 2 saat sonra başlıyor");
  });
});


describe("çapraz eğitim", () => {
  it("zorunlu rol tek kişide ve her gece gerekiyorsa darboğaz, gece çalışan az yüklü kişi önerilir", () => {
    const input = base();
    input.personnel[0].score = 50; // Ali az yüklü
    // Gece 7 gün açık (Ayşe tek Bakım Teknisyeni), Ali ve Can gecede çalışıyor
    input.assignments = [0, 1, 2, 3, 4, 5, 6].map(d => a(d % 2 ? "ali" : "can", d, "s-gece"));
    const hit = crossTrainingInsight(buildWeekSnapshot(input), defs)!;
    expect(hit.title).toBe('"Bakım Teknisyeni" rolünde darboğaz var');
    expect(hit.lines[0]).toContain("haftada 7 vardiyada gerekiyor, 1 kişide var; bu hafta 7 vardiyada eksik");
    expect(hit.lines[0]).toContain("Eğitilirse fayda sağlar: Can, Ali"); // Can gecede daha çok çalışıyor
  });

  it("rolü yeterince kişi taşıyorsa öneri yok", () => {
    const input = base();
    input.personnel.forEach(p => { p.roles = ["Bakım Teknisyeni"]; });
    input.assignments = [0, 1, 2].map(d => a("ayse", d, "s-gece"));
    expect(crossTrainingInsight(buildWeekSnapshot(input), defs)).toBeNull();
  });
});
