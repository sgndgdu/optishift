import { describe, it, expect } from "vitest";
import {
  calcAssignmentBurden,
  calcWeeklyBurden,
  calcCumulativeRolling,
  calcFairnessZ,
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

// ─── calcAssignmentBurden — çarpan matrisi ────────────────────────────────────

describe("calcAssignmentBurden", () => {
  it("baz durum: 5 puan × 8 saat = 40, çarpan yok", () => {
    const r = calcAssignmentBurden(baseInput, noRules);
    expect(r.hours).toBe(8);
    expect(r.raw).toBe(40);
    expect(r.burden).toBe(40);
    expect(Object.values(r.flags).every(f => !f)).toBe(true);
  });

  it("hafta sonu ×1.2 (Cumartesi=5 ve Pazar=6)", () => {
    expect(calcAssignmentBurden({ ...baseInput, day: 5 }, noRules).burden).toBeCloseTo(48);
    expect(calcAssignmentBurden({ ...baseInput, day: 6 }, noRules).burden).toBeCloseTo(48);
    expect(calcAssignmentBurden({ ...baseInput, day: 4 }, noRules).burden).toBe(40); // Cuma değil
  });

  it("gece ×1.3", () => {
    const r = calcAssignmentBurden({ ...baseInput, is_night: true }, noRules);
    expect(r.burden).toBeCloseTo(52);
    expect(r.flags.night).toBe(true);
  });

  it("sarı gün ×1.5 (varsayılan) ve rules'tan özel çarpan", () => {
    expect(calcAssignmentBurden({ ...baseInput, is_pref_not: true }, noRules).burden).toBeCloseTo(60);
    expect(
      calcAssignmentBurden({ ...baseInput, is_pref_not: true }, { preferred_not_multiplier: 2.0 }).burden
    ).toBeCloseTo(80);
  });

  it("kahraman ×1.5 ve vardiya-bazlı override öncelikli", () => {
    expect(calcAssignmentBurden({ ...baseInput, is_hero: true }, noRules).burden).toBeCloseTo(60);
    expect(
      calcAssignmentBurden({ ...baseInput, is_hero: true, hero_multiplier: 2.0 }, { hero_multiplier: 1.5 }).burden
    ).toBeCloseTo(80);
  });

  it("zorunlu atama çarpanı yalnızca >1 iken uygulanır", () => {
    expect(calcAssignmentBurden({ ...baseInput, force_multiplier: 1.5 }, noRules).burden).toBeCloseTo(60);
    const r1 = calcAssignmentBurden({ ...baseInput, force_multiplier: 1 }, noRules);
    expect(r1.burden).toBe(40);
    expect(r1.flags.force).toBe(false);
  });

  it("çarpanlar yığılır: hafta sonu + gece + sarı = 40 × 1.2 × 1.3 × 1.5", () => {
    const r = calcAssignmentBurden({ ...baseInput, day: 6, is_night: true, is_pref_not: true }, noRules);
    expect(r.burden).toBeCloseTo(40 * 1.2 * 1.3 * 1.5);
  });

  it("toggle kapalıyken çarpan uygulanmaz", () => {
    const rules: Rules = {
      weekend_multiplier_enabled: false,
      night_multiplier_enabled: false,
      preferred_not_enabled: false,
      hero_bonus_enabled: false,
    };
    const r = calcAssignmentBurden(
      { ...baseInput, day: 6, is_night: true, is_pref_not: true, is_hero: true },
      rules
    );
    expect(r.burden).toBe(40);
    expect(r.flags.weekend).toBe(false);
  });

  it("gece geçişi süresi doğru: 22:00–06:00 = 8 saat", () => {
    const r = calcAssignmentBurden({ ...baseInput, start_time: "22:00", end_time: "06:00" }, noRules);
    expect(r.hours).toBe(8);
    expect(r.raw).toBe(40);
  });

  it("clopening: önceki gün bitişiyle dinlenme 11-13 saat arasındaysa ×1.2", () => {
    // Önceki gün 23:00 bitiş → bugün 10:00 başlangıç = 11 saat dinlenme → clopening
    const clop = calcAssignmentBurden(
      { ...baseInput, start_time: "10:00", end_time: "18:00", prev_day_end_time: "23:00" },
      noRules
    );
    expect(clop.flags.clopening).toBe(true);
    expect(clop.burden).toBeCloseTo(48);
    // 13+ saat dinlenme → clopening değil
    const ok = calcAssignmentBurden(
      { ...baseInput, start_time: "12:00", end_time: "20:00", prev_day_end_time: "23:00" },
      noRules
    );
    expect(ok.flags.clopening).toBe(false);
    // clopening_enabled: false → uygulanmaz
    const off = calcAssignmentBurden(
      { ...baseInput, start_time: "10:00", end_time: "18:00", prev_day_end_time: "23:00" },
      { clopening_enabled: false }
    );
    expect(off.flags.clopening).toBe(false);
  });
});

// ─── calcWeeklyBurden ─────────────────────────────────────────────────────────

describe("calcWeeklyBurden", () => {
  it("shift_id tanıma göre base_points; bilinmeyen id → fallback 5", () => {
    const assignments: AssignmentInput[] = [
      { personnel_id: "p1", day: 0, shift_id: "sabah", start_time: "09:00", end_time: "17:00" },
      { personnel_id: "p1", day: 1, shift_id: "custom", start_time: "09:00", end_time: "13:00" },
    ];
    const [b] = calcWeeklyBurden(assignments, defs, [], noRules);
    // sabah: 3×8=24, custom: 5×4=20
    expect(b.raw_score).toBeCloseTo(44);
    expect(b.total_hours).toBe(12);
  });

  it("clopening ardışık gün geçişinde tespit edilir (eşik ayarlanabilir)", () => {
    const assignments: AssignmentInput[] = [
      { personnel_id: "p1", day: 0, shift_id: "sabah", start_time: "14:00", end_time: "23:00" },
      { personnel_id: "p1", day: 1, shift_id: "sabah", start_time: "10:00", end_time: "18:00" }, // 11h dinlenme
    ];
    const [b] = calcWeeklyBurden(assignments, defs, [], noRules);
    expect(b.clopening_count).toBe(1);
    // Eşik 12 saate düşürülürse 11h dinlenme yasal sınırın üstü ama eşiğin altında kalmaya devam eder;
    // eşik 11 olursa hiçbir geçiş clopening sayılmaz (gap >= eşik)
    const [b11] = calcWeeklyBurden(assignments, defs, [], { clopening_min_rest_hours: 11 });
    expect(b11.clopening_count).toBe(0);
  });

  it("sarı gün availability'den okunur, hero flag'i çarpan uygular", () => {
    const assignments: AssignmentInput[] = [
      { personnel_id: "p1", day: 3, shift_id: "sabah", start_time: "09:00", end_time: "17:00", is_hero: true },
    ];
    const avail = [{ personnel_id: "p1", day_3: "preferred_not" }];
    const [b] = calcWeeklyBurden(assignments, defs, avail, noRules);
    // 3×8=24 × 1.5 (sarı) × 1.5 (hero) = 54
    expect(b.burden_score).toBeCloseTo(54);
    expect(b.pref_not_shifts).toBe(1);
    expect(b.hero_count).toBe(1);
  });
});

// ─── calcCumulativeRolling ────────────────────────────────────────────────────

describe("calcCumulativeRolling", () => {
  const hist = (weeks: number[]) =>
    weeks.map((s, i) => ({ week_start: `2026-W${i}`, burden_score: s }));

  it("decay serisi: bu hafta ×1, geçen ×0.85, önceki ×0.7225", () => {
    // history kronolojik (en eski önce): [2 hafta önce=20, geçen hafta=30]
    const c = calcCumulativeRolling(hist([20, 30]), 40);
    expect(c).toBeCloseTo(40 + 30 * 0.85 + 20 * 0.7225, 2);
  });

  it("pencere 8 haftada keser", () => {
    const many = hist(Array.from({ length: 12 }, () => 10)); // 12 hafta × 10
    const c = calcCumulativeRolling(many, 0);
    // Sadece son 7 tarihsel hafta sayılır: Σ 10 × 0.85^(1..7)
    let expected = 0;
    for (let i = 1; i <= 7; i++) expected += 10 * Math.pow(0.85, i);
    expect(c).toBeCloseTo(expected, 2);
  });

  it("özel decay/pencere parametreleri", () => {
    const c = calcCumulativeRolling(hist([10]), 20, 0.5, 4);
    expect(c).toBeCloseTo(20 + 10 * 0.5, 2);
  });

  it("adjustment'lar haftasına göre katlanır; mevcut hafta i=0'da tam ağırlık", () => {
    const history = [{ week_start: "2026-06-22", burden_score: 30 }];
    const adj = { "2026-06-29": 2, "2026-06-22": 3 };
    const c = calcCumulativeRolling(history, 40, 0.85, 8, adj, "2026-06-29");
    expect(c).toBeCloseTo(40 + 2 + (30 + 3) * 0.85, 2);
  });

  it("adjustment verilmezse eski davranış birebir korunur", () => {
    const history = [{ week_start: "2026-06-22", burden_score: 30 }];
    expect(calcCumulativeRolling(history, 40)).toBeCloseTo(40 + 30 * 0.85, 2);
  });
});

// ─── calcFairnessZ + fairnessLabel ────────────────────────────────────────────

describe("calcFairnessZ", () => {
  it("işaret: az yüklü pozitif, çok yüklü negatif", () => {
    const z = calcFairnessZ({ light: 10, mid: 20, heavy: 30 });
    expect(z.light).toBeGreaterThan(0);
    expect(z.mid).toBeCloseTo(0);
    expect(z.heavy).toBeLessThan(0);
  });

  it("stddev = 0 (herkes eşit) → herkes 0", () => {
    const z = calcFairnessZ({ a: 15, b: 15 });
    expect(z.a).toBe(0);
    expect(z.b).toBe(0);
  });

  it("boş girdi → boş sonuç", () => {
    expect(calcFairnessZ({})).toEqual({});
  });
});

describe("fairnessLabel", () => {
  it("bantlar doğru", () => {
    expect(fairnessLabel(1.5).level).toBe("low");
    expect(fairnessLabel(0.5).level).toBe("ok");
    expect(fairnessLabel(0).level).toBe("ok");
    expect(fairnessLabel(-0.5).level).toBe("ok");
    expect(fairnessLabel(-1.5).level).toBe("high");
    expect(fairnessLabel(-1.5).text).toContain("Çok yüklü");
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
