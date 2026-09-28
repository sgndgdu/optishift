import { describe, it, expect } from "vitest";
import { agentsForHour, callDemand, coverHours, erlangC, serviceLevel } from "@/lib/erlang";

describe("Erlang C", () => {
  it("bilinen değer: 10 erlang, 12 temsilci → bekleme olasılığı ~%45", () => {
    expect(erlangC(12, 10)).toBeCloseTo(0.4497, 3);
  });

  it("temsilci trafiğe eşit ya da azsa herkes bekler", () => {
    expect(erlangC(10, 10)).toBe(1);
    expect(serviceLevel(9, 10, 180, 20)).toBe(0);
  });

  it("klasik örnek: saatte 200 çağrı, 180 sn, 80/20 → 14 temsilci", () => {
    // Trafik 10 erlang; 13 temsilcide SL ~%71, 14'te ~%84
    expect(agentsForHour(200, 180, 80, 20)).toBe(14);
    expect(serviceLevel(14, 10, 180, 20)).toBeGreaterThan(0.8);
    expect(serviceLevel(13, 10, 180, 20)).toBeLessThan(0.8);
  });

  it("çağrı yoksa temsilci gerekmez", () => {
    expect(agentsForHour(0, 180, 80, 20)).toBe(0);
  });
});

describe("saatlik ihtiyacın vardiyalara dağıtımı", () => {
  const defs = [
    { id: "sabah", start: "08:00", end: "16:00" },
    { id: "ara", start: "12:00", end: "20:00" },
    { id: "aksam", start: "16:00", end: "24:00" },
  ];

  it("her saati karşılar, gereğinden fazla kişi koymaz", () => {
    const req = Array(24).fill(0);
    for (let h = 8; h < 12; h++) req[h] = 3;
    for (let h = 12; h < 16; h++) req[h] = 5; // sabah 3 + ara 2
    for (let h = 16; h < 20; h++) req[h] = 2; // ara 2 yeter
    const out = coverHours(defs, req);
    expect(out).toEqual({ sabah: 3, ara: 2, aksam: 0 });
  });

  it("uçtan uca: tepe saatte daha çok kişi, çağrı yoksa 0", () => {
    const r = callDemand(defs, {
      dailyCalls: [800, 800, 800, 800, 800, 0, 0], curve: "office",
      ahtSec: 240, slPercent: 80, slSeconds: 20, shrinkagePercent: 30,
    });
    expect(r.matrix.sabah[5]).toBe(0);
    expect(r.matrix.sabah[0]).toBeGreaterThan(0);
    expect(r.peak!.agents).toBeGreaterThan(r.hourly[0][19]);
    // her saatin ihtiyacı karşılanıyor
    for (let h = 8; h < 24; h++) {
      const have = defs.filter(d => {
        const s = Number(d.start.slice(0, 2)); const e = Number(d.end.slice(0, 2)) || 24;
        return s <= h && h < e;
      }).reduce((t, d) => t + r.matrix[d.id][0], 0);
      expect(have).toBeGreaterThanOrEqual(r.hourly[0][h]);
    }
  });
});
