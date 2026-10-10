import { describe, it, expect } from "vitest";
import {
  resolveHardDayRules,
  resolveBonusRules,
  weekDayExtraPct,
  weekShiftExtraPct,
  calcAssignmentPoints,
  calcWeeklyPoints,
  calcCumulativeWindow,
  calcWindowScores,
  calcFairnessRank,
  changeCompensationHours,
  comparableScore,
  explainAssignmentPoints,
  fairnessLabel,
  fairnessLabelFromAverage,
  fairnessLabelForEmployee,
  fairnessWeight,
  heroBonusPointsFor,
  legacyPointsToPct,
  resolveShiftDef,
  shiftDifficultyPct,
  type AssignmentInput,
  type ShiftDef,
  type Rules,
} from "../fairness";

// ─── Ortak fikstürler ─────────────────────────────────────────────────────────

const baseInput = {
  day: 2, // Çarşamba, hafta içi
  start_time: "09:00",
  end_time: "17:00", // 8 saat
  difficulty_pct: 0,
};

const noRules: Rules = {};

const defs: ShiftDef[] = [
  { id: "sabah", name: "Sabah", difficulty_pct: 0, start: "09:00", end: "17:00" },
  { id: "gece", name: "Gece", difficulty_pct: 50, start: "22:00", end: "06:00", is_night: true },
];

// ─── Tek birim: 1 puan = sıradan vardiyada 1 saat, ekler yüzde (2026-10-10) ──

describe("calcAssignmentPoints", () => {
  it("sıradan vardiya: saat kadar puan", () => {
    const r = calcAssignmentPoints(baseInput, noRules);
    expect(r.hours).toBe(8);
    expect(r.points).toBe(8);
    expect(r.flags.hard).toBe(false);
  });

  it("zorluk saatin yüzdesi olarak eklenir", () => {
    expect(calcAssignmentPoints({ ...baseInput, difficulty_pct: 50 }, noRules).points).toBeCloseTo(12);
    expect(calcAssignmentPoints({ ...baseInput, difficulty_pct: 100 }, noRules).points).toBeCloseTo(16);
  });

  it("ek vardiya uzunluğuyla orantılıdır: Pazar %50 hem 4 hem 12 saatte aynı oranda artırır", () => {
    const rules: Rules = { hard_day_pct: [0, 0, 0, 0, 0, 0, 50] };
    expect(calcAssignmentPoints({ ...baseInput, day: 6, start_time: "08:00", end_time: "12:00" }, rules).points).toBeCloseTo(6);
    expect(calcAssignmentPoints({ ...baseInput, day: 6, start_time: "08:00", end_time: "20:00" }, rules).points).toBeCloseTo(18);
  });

  it("tercih etmem günün ekine ayrıca eklenir (takvimle yarışmaz)", () => {
    const rules: Rules = { hard_day_pct: [0, 0, 0, 0, 0, 0, 50], pref_not_pct: 50 };
    const sunday = calcAssignmentPoints({ ...baseInput, day: 6 }, rules).points;
    const sundayUnwanted = calcAssignmentPoints({ ...baseInput, day: 6, is_pref_not: true }, rules).points;
    expect(sunday).toBeCloseTo(12);
    expect(sundayUnwanted).toBeCloseTo(16);
  });

  it("varsayılanlar: bayram %100, tercih etmem %50, haftanın günleri 0", () => {
    expect(calcAssignmentPoints({ ...baseInput, day: 5 }, noRules).points).toBe(8);
    expect(calcAssignmentPoints({ ...baseInput, is_pref_not: true }, noRules).points).toBeCloseTo(12);
    // 29 Ekim 2026 Perşembe
    expect(calcAssignmentPoints({ ...baseInput, day: 3, date: "2026-10-29" }, noRules).points).toBeCloseTo(16);
  });

  it("gece ek almaz, zorluğu vardiya tanımından gelir", () => {
    const r = calcAssignmentPoints({ ...baseInput, is_night: true }, noRules);
    expect(r.points).toBe(8);
    expect(r.flags.night).toBe(true);
  });

  it("boş vardiyayı alan %50, izin gününde çağrılan %100 (varsayılan)", () => {
    expect(calcAssignmentPoints({ ...baseInput, is_hero: true }, noRules).points).toBeCloseTo(12);
    expect(calcAssignmentPoints({ ...baseInput, is_force: true }, noRules).points).toBeCloseTo(16);
  });

  it("ekler kapatılınca puan yazılmaz", () => {
    const rules: Rules = { hero_bonus_enabled: false, force_bonus_enabled: false, pref_not_pct: 0 };
    expect(calcAssignmentPoints({ ...baseInput, is_hero: true, is_force: true, is_pref_not: true }, rules).points).toBe(8);
  });

  it("başka şube: varsayılan kapalı, açılınca yol süresi kadar", () => {
    expect(calcAssignmentPoints({ ...baseInput, is_away: true }, noRules).points).toBe(8);
    const on: Rules = { away_shift_enabled: true, away_travel_minutes: 90 };
    expect(calcAssignmentPoints({ ...baseInput, is_away: true }, on).points).toBeCloseTo(9.5);
  });

  it("örnek sayfadaki hesaplar: Cumartesi zor vardiya anket 8 → 16,8; bayram gecesi zor → 20", () => {
    const sat: Rules = { hard_day_pct: [0, 0, 0, 0, 0, 60, 0] };
    expect(calcAssignmentPoints({ ...baseInput, day: 5, difficulty_pct: 50 }, sat).points).toBeCloseTo(16.8);
    expect(calcAssignmentPoints({ day: 3, date: "2026-10-29", start_time: "22:00", end_time: "06:00", difficulty_pct: 50 }, noRules).points).toBeCloseTo(20);
  });

  it("gece geçişi süresi doğru: 22:00–06:00 = 8 saat", () => {
    expect(calcAssignmentPoints({ ...baseInput, start_time: "22:00", end_time: "06:00" }, noRules).hours).toBe(8);
  });

  it("açıklama cümlesi parçaları yazar", () => {
    const r = calcAssignmentPoints({ ...baseInput, day: 5, difficulty_pct: 50 }, { hard_day_pct: [0, 0, 0, 0, 0, 60, 0] });
    expect(explainAssignmentPoints(r)).toBe("8 saat + zorluk %50 (+4) + Cumartesi %60 (+4,8) = 16,8");
  });
});

describe("shiftDifficultyPct ve eski ayarlar", () => {
  it("difficulty_pct yoksa eski zorluk çevrilir: 7 ve üstü zor, altı sıradan", () => {
    expect(shiftDifficultyPct({ base_points: 8 })).toBe(50);
    expect(shiftDifficultyPct({ base_points: 5 })).toBe(0);
    expect(shiftDifficultyPct({ base_points: 3 })).toBe(0);
    expect(shiftDifficultyPct({ base_points: 8, difficulty_pct: 100 })).toBe(100);
    expect(shiftDifficultyPct(null)).toBe(0);
  });

  it("eski düz gün puanı 8 saat üzerinden yüzdeye çevrilir", () => {
    expect(legacyPointsToPct(4)).toBe(50);
    expect(legacyPointsToPct(2)).toBe(25);
    expect(resolveHardDayRules({ hard_day_points: [0, 0, 0, 0, 2, 4, 4] }).dayPct).toEqual([0, 0, 0, 0, 25, 50, 50]);
    expect(resolveHardDayRules({}).dayPct).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("eski özel gün puanı yüzdeye çevrilir", () => {
    const hr = resolveHardDayRules({ special_date_points: [{ date: "2026-12-31", name: "Yılbaşı", points: 8 }] });
    expect(hr.specialDates[0].pct).toBe(100);
  });

  it("başka şube eski düz puanı saat sayılır", () => {
    expect(resolveBonusRules({ away_shift_enabled: true, away_shift_points: 2 }).awayMinutes).toBe(120);
  });
});

describe("calcWeeklyPoints", () => {
  it("vardiya tanımına göre zorluk; bilinmeyen saat sıradan", () => {
    const assignments: AssignmentInput[] = [
      { personnel_id: "p1", day: 0, shift_id: "gece", start_time: "22:00", end_time: "06:00" },
      { personnel_id: "p1", day: 1, shift_id: "custom", start_time: "10:00", end_time: "14:00" },
    ];
    const [b] = calcWeeklyPoints(assignments, defs, [], noRules, "2026-10-05");
    expect(b.total_hours).toBe(12);
    expect(b.burden_score).toBeCloseTo(16); // 8 × 1,5 + 4
  });

  it("clopening bilgi amaçlı sayılır ama puanı etkilemez", () => {
    const assignments: AssignmentInput[] = [
      { personnel_id: "p1", day: 0, shift_id: "x", start_time: "14:00", end_time: "23:00" },
      { personnel_id: "p1", day: 1, shift_id: "y", start_time: "11:00", end_time: "17:00" },
    ];
    const [b] = calcWeeklyPoints(assignments, [], [], noRules, "2026-10-05");
    expect(b.clopening_count).toBe(1);
    expect(b.burden_score).toBe(15);
  });

  it("tercih etmem, boş vardiyayı alma ve izin gününde çağrılma işaretleri", () => {
    const assignments: AssignmentInput[] = [
      { personnel_id: "p1", day: 0, shift_id: "sabah", start_time: "09:00", end_time: "17:00", is_hero: true },
      { personnel_id: "p1", day: 1, shift_id: "sabah", start_time: "09:00", end_time: "17:00", is_force: true },
    ];
    const [b] = calcWeeklyPoints(assignments, defs, [{ personnel_id: "p1", day_0: "preferred_not" }], noRules, "2026-10-05");
    expect(b.burden_score).toBeCloseTo(8 * 2 + 8 * 2); // (8 + %50 tercih + %50 boş vardiya) + (8 + %100 çağrılma)
    expect(b.pref_not_shifts).toBe(1);
    expect(b.hero_count).toBe(1);
  });
});

describe("zor günler ve özel günler", () => {
  const rules: Rules = {
    hard_day_pct: [0, 0, 0, 0, 25, 50, 50],
    holiday_pct: 100,
    special_date_points: [{ date: "2026-12-31", name: "Yılbaşı gecesi", pct: 75 }],
  };

  it("birden fazla neden: en yüksek yüzde uygulanır, toplanmaz", () => {
    // 1 Kasım 2026 Pazar, resmi tatil değil; 29 Ekim Perşembe bayram
    const r = calcAssignmentPoints({ ...baseInput, day: 3, date: "2026-10-29" }, { ...rules, hard_day_pct: [0, 0, 0, 50, 0, 0, 0] });
    expect(r.pct.day).toBe(100);
    expect(r.hardReasons.length).toBe(2);
  });

  it("özel gün kendi yüzdesini alır", () => {
    expect(calcAssignmentPoints({ ...baseInput, day: 3, date: "2026-12-31" }, rules).points).toBeCloseTo(14);
  });

  it("haftalık motor ekleri tarihleri çözer", () => {
    // 26 Ekim 2026 haftası: 29 Ekim Perşembe bayram
    expect(weekDayExtraPct("2026-10-26", rules)).toEqual([0, 0, 0, 100, 25, 50, 50]);
  });

  it("boş weekStart çökmez, sadece haftanın gününe bakar", () => {
    expect(weekDayExtraPct("", rules)).toEqual([0, 0, 0, 0, 25, 50, 50]);
  });

  it("vardiyaya özel ve her ay tekrar eden gün", () => {
    const r: Rules = { special_date_points: [{ date: "2026-01-31", name: "Ay sonu sayımı", pct: 50, shift_ids: ["aksam"], repeat: "monthly_last" }] };
    expect(calcAssignmentPoints({ ...baseInput, day: 5, date: "2026-10-31", shift_id: "aksam" }, r).points).toBeCloseTo(12);
    expect(calcAssignmentPoints({ ...baseInput, day: 5, date: "2026-10-31", shift_id: "sabah" }, r).points).toBe(8);
    expect(weekShiftExtraPct("2026-10-26", r)).toEqual({ aksam: [0, 0, 0, 100, 0, 50, 0] }); // 29 Ekim bayram (varsayılan %100) gün geneli
  });
});

describe("yayından sonra değişiklik: kaydırılan saat", () => {
  it("örtüşmeyen kısmın büyüğü", () => {
    expect(changeCompensationHours("08:00", "16:00", "12:00", "20:00")).toBe(4);
    expect(changeCompensationHours("08:00", "16:00", "08:00", "18:00")).toBe(2);
    expect(changeCompensationHours("08:00", "16:00", "08:00", "14:00")).toBe(2);
    expect(changeCompensationHours("08:00", "16:00", "08:00", "16:00")).toBe(0);
    expect(changeCompensationHours("22:00", "06:00", "23:00", "07:00")).toBe(1);
  });

  it("ilan kartındaki ek puan kuraldan gelir", () => {
    expect(heroBonusPointsFor("09:00", "17:00", {})).toBe(4);
    expect(heroBonusPointsFor("09:00", "17:00", { hero_bonus_enabled: false })).toBe(0);
  });
});

describe("yarı zamanlı karşılaştırma", () => {
  it("ağırlık kişinin sınırı ÷ şubenin tam süresi, en çok 1", () => {
    expect(fairnessWeight(27, 45)).toBeCloseTo(0.6);
    expect(fairnessWeight(null, 45)).toBe(1);
    expect(fairnessWeight(50, 45)).toBe(1);
  });

  it("27 saatlik kişinin 60 puanı tam zamanlının 100 puanına eşittir", () => {
    expect(comparableScore(60, 27, 45)).toBeCloseTo(100);
  });
});

describe("calcWindowScores: izinli ve yeni gelen ortalamayla dolar", () => {
  const weeks = ["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"];
  const full = (v: number) => Object.fromEntries(weeks.map(w => [w, v]));

  it("iki hafta izinli kişi ekip ortalaması kadar sayılır", () => {
    const r = calcWindowScores(weeks, [
      { id: "a", weight: 1, startDate: null, hist: full(40), leaveDays: {} },
      { id: "b", weight: 1, startDate: null, hist: full(40), leaveDays: {} },
      { id: "c", weight: 1, startDate: null, hist: { "2026-09-21": 40, "2026-09-28": 40 }, leaveDays: { "2026-10-05": 7, "2026-10-12": 7 } },
    ]);
    expect(r.a.cumulative).toBe(160);
    expect(r.c.cumulative).toBe(160);
    expect(r.c.filled).toBe(80);
  });

  it("yeni başlayan kişinin önceki haftaları ortalamayla dolar", () => {
    const r = calcWindowScores(weeks, [
      { id: "a", weight: 1, startDate: null, hist: full(40), leaveDays: {} },
      { id: "n", weight: 1, startDate: "2026-10-12", hist: { "2026-10-12": 40 }, leaveDays: {} },
    ]);
    expect(r.n.cumulative).toBe(160);
  });

  it("izinsiz çalışmayan kişi 0 kalır; yarı zamanlı kendi ağırlığıyla dolar", () => {
    const r = calcWindowScores(weeks, [
      { id: "a", weight: 1, startDate: null, hist: full(40), leaveDays: {} },
      { id: "z", weight: 1, startDate: null, hist: {}, leaveDays: {} },
      { id: "y", weight: 0.5, startDate: null, hist: { "2026-09-21": 20, "2026-09-28": 20, "2026-10-05": 20 }, leaveDays: { "2026-10-12": 7 } },
    ]);
    expect(r.z.cumulative).toBe(0);
    // z o haftalarda tam çalışmış sayılır (izinli değil) ve ortalamayı düşürür: son hafta ortalaması (40 + 0) / 2 = 20
    expect(r.y.cumulative).toBe(60 + 20 * 0.5);
    expect(r.y.comparable).toBe(140);
  });

  it("puan olayları eklenir", () => {
    const r = calcWindowScores(weeks, [{ id: "a", weight: 1, startDate: null, hist: full(10), leaveDays: {}, adjustments: { "2026-10-12": 4 } }]);
    expect(r.a.cumulative).toBe(44);
  });
});

describe("calcCumulativeWindow", () => {
  const hist = (weeks: number[]) =>
    weeks.map((s, i) => ({ week_start: `2026-W${i}`, burden_score: s }));

  it("düz toplam: decay uygulanmaz", () => {
    // history kronolojik (en eski önce): [2 hafta önce=20, geçen hafta=30]
    const c = calcCumulativeWindow(hist([20, 30]), 40, 4);
    expect(c).toBeCloseTo(40 + 30 + 20, 2);
  });

  it("pencere sınırında keser (varsayılan 4 hafta)", () => {
    const many = hist(Array.from({ length: 12 }, () => 10)); // 12 hafta × 10
    const c = calcCumulativeWindow(many, 0);
    // Varsayılan pencere 4 → bu hafta + son 3 tarihsel hafta = 3×10
    expect(c).toBeCloseTo(30, 2);
  });

  it("özel pencere parametresi", () => {
    const c = calcCumulativeWindow(hist([10]), 20, 4);
    expect(c).toBeCloseTo(30, 2);
  });

  it("adjustment'lar decay'siz eklenir; mevcut hafta da dahil edilir", () => {
    const history = [{ week_start: "2026-06-22", burden_score: 30 }];
    const adj = { "2026-06-29": 2, "2026-06-22": 3 };
    const c = calcCumulativeWindow(history, 40, 8, adj, "2026-06-29");
    expect(c).toBeCloseTo(40 + 2 + (30 + 3), 2);
  });

  it("adjustment verilmezse düz toplam", () => {
    const history = [{ week_start: "2026-06-22", burden_score: 30 }];
    expect(calcCumulativeWindow(history, 40, 4)).toBeCloseTo(70, 2);
  });
});

// ─── calcFairnessRank + fairnessLabel ─────────────────────────────────────────


describe("calcFairnessRank", () => {
  it("artan sıralama: en az puanlı 1. sırada (en az yüklü)", () => {
    const r = calcFairnessRank({ light: 10, mid: 20, heavy: 30 });
    expect(r.light.rank).toBe(1);
    expect(r.mid.rank).toBe(2);
    expect(r.heavy.rank).toBe(3);
    expect(r.light.percentile).toBeGreaterThan(r.heavy.percentile);
  });

  it("deterministik tie-break: eşit puanlarda personnel_id'ye göre sıralanır", () => {
    const r1 = calcFairnessRank({ zeta: 10, alpha: 10 });
    const r2 = calcFairnessRank({ zeta: 10, alpha: 10 });
    expect(r1.alpha.rank).toBe(1); // alphabetik olarak önce
    expect(r1.zeta.rank).toBe(2);
    expect(r1).toEqual(r2); // her çağrıda aynı sonuç
  });

  it("tek kişilik takımda percentile = 100", () => {
    const r = calcFairnessRank({ solo: 42 });
    expect(r.solo.rank).toBe(1);
    expect(r.solo.teamSize).toBe(1);
    expect(r.solo.percentile).toBe(100);
  });

  it("boş girdi → boş sonuç", () => {
    expect(calcFairnessRank({})).toEqual({});
  });
});


describe("fairnessLabel", () => {
  it("percentile bantları doğru (yüksek=az yüklü)", () => {
    expect(fairnessLabel(90).level).toBe("low");
    expect(fairnessLabel(75).level).toBe("low");
    expect(fairnessLabel(50).level).toBe("ok");
    expect(fairnessLabel(25).level).toBe("ok");
    expect(fairnessLabel(10).level).toBe("high");
    expect(fairnessLabel(10).text).toContain("Çok çalıştı");
  });
});


describe("resolveShiftDef", () => {
  const defs = [
    { id: "SD-SABAH", name: "Sabah", start: "06:00", end: "14:00", base_points: 4 },
    { id: "SD-AKSAM", name: "Akşam", start: "14:00", end: "22:00", base_points: 5 },
    { id: "SD-GECE",  name: "Gece",  start: "22:00", end: "06:00", base_points: 7, is_night: true },
  ];

  it("geçerli id → doğrudan id ile bulur", () => {
    expect(resolveShiftDef("SD-AKSAM", "09:00", "17:00", defs)?.id).toBe("SD-AKSAM");
  });

  it("'custom' id lookup'ı atlanır, saate göre çözülür (eski kayıt onarımı)", () => {
    expect(resolveShiftDef(null, "06:00", "14:00", defs)?.id).toBe("SD-SABAH");
    expect(resolveShiftDef("bilinmeyen-id", "14:00", "22:00", defs)?.id).toBe("SD-AKSAM");
  });

  it("gece geçişi vardiyası saate göre eşleşir", () => {
    expect(resolveShiftDef(null, "22:00", "06:00", defs)?.id).toBe("SD-GECE");
  });

  it("±10 dk tolerans", () => {
    expect(resolveShiftDef(null, "06:05", "13:55", defs)?.id).toBe("SD-SABAH");
    expect(resolveShiftDef(null, "06:20", "14:00", defs)).toBeNull();
  });

  it("gerçekten özel saat → null", () => {
    expect(resolveShiftDef(null, "10:00", "16:00", defs)).toBeNull();
    expect(resolveShiftDef(null, null, null, defs)).toBeNull();
  });
});


describe("fairnessLabelFromAverage", () => {
  it("puanlar birbirine yakınsa kimse çok yüklü değil", () => {
    // Kafe örneği: 319-372 arası, ortalama ~345
    for (const b of [319, 330, 345, 360, 372]) expect(fairnessLabelFromAverage(b, 345).level).toBe("ok");
    expect(fairnessLabelFromAverage(372, 345).text).toBe("Ortalamanın üstünde çalıştı");
  });
  it("±%20 dışı: az yüklü / çok yüklü (çubuk rengiyle aynı eşik)", () => {
    expect(fairnessLabelFromAverage(79, 100)).toMatchObject({ level: "low" });
    expect(fairnessLabelFromAverage(121, 100)).toMatchObject({ level: "high", text: "Çok çalıştı, daha az vardiya verilmeli" });
    expect(fairnessLabelFromAverage(100, 100).text).toBe("Takım ortalamasında");
  });
  it("eşit puan eşit etiket; ortalama 0 ise nötr", () => {
    expect(fairnessLabelFromAverage(50, 50)).toEqual(fairnessLabelFromAverage(50, 50));
    expect(fairnessLabelFromAverage(0, 0).level).toBe("ok");
  });
});


describe("fairnessLabelForEmployee", () => {
  it("personele hitap eder, müdüre yönelik cümle yok", () => {
    expect(fairnessLabelForEmployee(130, 100)).toEqual({ text: "Son haftalarda ekibe göre fazla çalıştınız", level: "high" });
    expect(fairnessLabelForEmployee(110, 100).text).toBe("Ortalamanın biraz üstünde");
    expect(fairnessLabelForEmployee(100, 100).text).toBe("Ekip ortalamasında");
    expect(fairnessLabelForEmployee(70, 100).level).toBe("low");
    for (const b of [50, 100, 150]) expect(fairnessLabelForEmployee(b, 100).text).not.toContain("azaltılmalı");
  });
});


describe("fairnessBarColor", async () => {
  const { fairnessBarColor } = await import("@/lib/fairness");
  it("herkes eşit puandayken kırmızı değil (2026-09-28 denetimi)", () => {
    expect(fairnessBarColor(12, 12)).toBe("bg-blue-400");
  });
  it("±%20 dışı yeşil / kırmızı, ortalama 0 iken nötr", () => {
    expect(fairnessBarColor(7, 10)).toBe("bg-emerald-500");
    expect(fairnessBarColor(13, 10)).toBe("bg-red-400");
    expect(fairnessBarColor(0, 0)).toBe("bg-blue-400");
  });
});

