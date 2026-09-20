import { describe, it, expect } from "vitest";
import {
  calcAssignmentPoints,
  calcWeeklyPoints,
  calcCumulativeWindow,
  calcFairnessRank,
  fairnessLabel,
  resolveShiftDef,
  type AssignmentInput,
  type ShiftDef,
  type Rules,
} from "../fairness";

// ─── Ortak fikstürler ─────────────────────────────────────────────────────────

const baseInput = {
  day: 2, // Çarşamba — hafta içi
  start_time: "09:00",
  end_time: "17:00", // 8 saat
  base_points: 5,
};

const noRules: Rules = {};

const defs: ShiftDef[] = [
  { id: "sabah", name: "Sabah", base_points: 3, start: "09:00", end: "17:00" },
  { id: "gece", name: "Gece", base_points: 8, start: "22:00", end: "06:00", is_night: true },
];

// ─── calcAssignmentPoints — additive formül ───────────────────────────────────

describe("calcAssignmentPoints", () => {
  it("baz durum: 8 saat × (5/5) = 8, zor vardiya/bonus yok", () => {
    const r = calcAssignmentPoints(baseInput, noRules);
    expect(r.hours).toBe(8);
    expect(r.points).toBe(8);
    expect(Object.values(r.flags).every(f => !f)).toBe(true);
  });

  it("zorluk saatle çarpılır (base_points/5)", () => {
    expect(calcAssignmentPoints({ ...baseInput, base_points: 10 }, noRules).points).toBeCloseTo(16); // 8×2
    expect(calcAssignmentPoints({ ...baseInput, base_points: 2.5 }, noRules).points).toBeCloseTo(4); // 8×0.5
  });

  it("hafta sonu → +hard_shift_points (varsayılan 4)", () => {
    expect(calcAssignmentPoints({ ...baseInput, day: 5 }, noRules).points).toBeCloseTo(12); // Cmt
    expect(calcAssignmentPoints({ ...baseInput, day: 6 }, noRules).points).toBeCloseTo(12); // Paz
    expect(calcAssignmentPoints({ ...baseInput, day: 4 }, noRules).points).toBe(8); // Cuma değil
  });

  it("gece → +hard_shift_points", () => {
    const r = calcAssignmentPoints({ ...baseInput, is_night: true }, noRules);
    expect(r.points).toBeCloseTo(12);
    expect(r.flags.night).toBe(true);
  });

  it("sarı gün → +hard_shift_points; rules'tan özel değer okunur", () => {
    expect(calcAssignmentPoints({ ...baseInput, is_pref_not: true }, noRules).points).toBeCloseTo(12);
    expect(
      calcAssignmentPoints({ ...baseInput, is_pref_not: true }, { hard_shift_points: 10 }).points
    ).toBeCloseTo(18);
  });

  it("dedup: hafta sonu + gece + sarı aynı anda → hard_shift_points SADECE BİR KEZ eklenir", () => {
    const r = calcAssignmentPoints({ ...baseInput, day: 6, is_night: true, is_pref_not: true }, noRules);
    expect(r.points).toBeCloseTo(12); // 8 + 4 (tek sefer), 8 + 4×3 DEĞİL
    expect(r.flags.weekend && r.flags.night && r.flags.prefNot).toBe(true);
    expect(r.flags.hard).toBe(true);
  });

  it("hard_shift_points=0 → tüm bayraklar true olsa da puanı etkilemez ('0=kapalı')", () => {
    const r = calcAssignmentPoints(
      { ...baseInput, day: 6, is_night: true, is_pref_not: true },
      { hard_shift_points: 0 }
    );
    expect(r.points).toBe(8);
  });

  it("kahraman → +hero_bonus_points (varsayılan 6); vardiya-bazlı override öncelikli", () => {
    expect(calcAssignmentPoints({ ...baseInput, is_hero: true }, noRules).points).toBeCloseTo(14);
    expect(
      calcAssignmentPoints({ ...baseInput, is_hero: true, hero_points: 10 }, { hero_bonus_points: 6 }).points
    ).toBeCloseTo(18);
  });

  it("zorunlu atama bonusu yalnızca force_points > 0 iken uygulanır", () => {
    expect(calcAssignmentPoints({ ...baseInput, force_points: 5 }, noRules).points).toBeCloseTo(13);
    const r0 = calcAssignmentPoints({ ...baseInput, force_points: 0 }, noRules);
    expect(r0.points).toBe(8);
    expect(r0.flags.force).toBe(false);
  });

  it("toggle kapalıyken zor vardiya sayılmaz", () => {
    const rules: Rules = {
      hard_shift_weekend: false,
      hard_shift_night: false,
      hard_shift_preferred_not: false,
    };
    const r = calcAssignmentPoints(
      { ...baseInput, day: 6, is_night: true, is_pref_not: true },
      rules
    );
    expect(r.points).toBe(8);
    expect(r.flags.weekend).toBe(false);
    expect(r.flags.hard).toBe(false);
  });

  it("gece geçişi süresi doğru: 22:00–06:00 = 8 saat", () => {
    const r = calcAssignmentPoints({ ...baseInput, start_time: "22:00", end_time: "06:00" }, noRules);
    expect(r.hours).toBe(8);
    expect(r.points).toBe(8);
  });

  it("kahraman + zorunlu atama + zor vardiya aynı anda toplanır (additive, çarpılmaz)", () => {
    const r = calcAssignmentPoints(
      { ...baseInput, day: 6, is_hero: true, force_points: 5 },
      { hard_shift_points: 4, hero_bonus_points: 6 }
    );
    expect(r.points).toBeCloseTo(8 + 4 + 6 + 5); // 23
  });
});

// ─── calcWeeklyPoints ─────────────────────────────────────────────────────────

describe("calcWeeklyPoints", () => {
  it("shift_id tanıma göre base_points; bilinmeyen id → fallback 5", () => {
    const assignments: AssignmentInput[] = [
      { personnel_id: "p1", day: 0, shift_id: "sabah", start_time: "09:00", end_time: "17:00" },
      { personnel_id: "p1", day: 1, shift_id: "custom", start_time: "09:00", end_time: "13:00" },
    ];
    const [b] = calcWeeklyPoints(assignments, defs, [], noRules);
    // sabah: 8×(3/5)=4.8, custom (fallback 5): 4×(5/5)=4 — ikisi de hafta içi, zor değil
    expect(b.burden_score).toBeCloseTo(8.8);
    expect(b.total_hours).toBe(12);
  });

  it("clopening bilgi amaçlı sayılır ama PUANI ETKİLEMEZ (decoupling regresyon testi)", () => {
    const assignments: AssignmentInput[] = [
      { personnel_id: "p1", day: 0, shift_id: "sabah", start_time: "14:00", end_time: "23:00" },
      { personnel_id: "p1", day: 1, shift_id: "sabah", start_time: "10:00", end_time: "18:00" }, // 11h dinlenme → clopening
    ];
    const [withClopening] = calcWeeklyPoints(assignments, defs, [], noRules);
    expect(withClopening.clopening_count).toBe(1);

    // Aynı atamalar ama clopening eşiği çok yüksek tutulup gap'in altına düşürülürse count değişir,
    // FAKAT burden_score her koşulda AYNI kalmalı (clopening artık puanı hiç etkilemiyor)
    const [noClopeningThreshold] = calcWeeklyPoints(assignments, defs, [], { clopening_min_rest_hours: 11 });
    expect(noClopeningThreshold.clopening_count).toBe(0);
    expect(noClopeningThreshold.burden_score).toBe(withClopening.burden_score);
  });

  it("sarı gün + kahraman aynı vardiyada toplanır (dedup: sadece bir hard bonus)", () => {
    const assignments: AssignmentInput[] = [
      { personnel_id: "p1", day: 3, shift_id: "sabah", start_time: "09:00", end_time: "17:00", is_hero: true },
    ];
    const avail = [{ personnel_id: "p1", day_3: "preferred_not" }];
    const [b] = calcWeeklyPoints(assignments, defs, avail, noRules);
    // 8×(3/5)=4.8 + hard(4, sarı gün) + hero(6) = 14.8
    expect(b.burden_score).toBeCloseTo(14.8);
    expect(b.pref_not_shifts).toBe(1);
    expect(b.hero_count).toBe(1);
  });
});

// ─── calcCumulativeWindow — düz toplam, decay YOK ─────────────────────────────

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
    expect(fairnessLabel(10).text).toContain("Çok yüklü");
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
