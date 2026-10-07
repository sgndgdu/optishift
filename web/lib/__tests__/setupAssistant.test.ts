import { describe, it, expect } from "vitest";
import { normalizeProposal, normalizeTeam, parseSetupReply, titleCaseIfShouting } from "@/lib/ai/setupAssistant";

describe("normalizeTeam", () => {
  it("adları temizler, tekrarı ve okunamayanı atar, departmanı eşler", () => {
    const team = normalizeTeam([
      { name: "  Ayşe   Demir ", department: "salon", phone: "0532 111 22 33" },
      { name: "ayşe demir", department: "Mutfak" },
      { name: "?", department: "Salon" },
      { name: "12", department: "Salon" },
      "Can Bulut",
      { name: "Mert Yıldız", department: "Teras" },
    ], ["Salon", "Mutfak"]);
    expect(team).toEqual([
      { name: "Ayşe Demir", department: "Salon", phone: "05321112233" },
      { name: "Can Bulut", department: "", phone: "" },
      { name: "Mert Yıldız", department: "", phone: "" },
    ]);
  });
  it("liste değilse boş döner", () => {
    expect(normalizeTeam(null, [])).toEqual([]);
    expect(normalizeTeam("Ayşe", [])).toEqual([]);
  });
});

describe("normalizeProposal ekip", () => {
  it("ekip büyüklüğü okunan kişi sayısından az olamaz", () => {
    const p = normalizeProposal({
      industry: "hospitality", variant: "cafe", departments: [], teamSize: 2,
      shifts: [{ name: "Sabah", start: "08:00", end: "16:00" }],
      demand: { "": { Sabah: [1, 1, 1, 1, 1, 1, 1] } },
      team: [{ name: "Ayşe Demir" }, { name: "Can Bulut" }, { name: "Elif Kaya" }],
    });
    expect(p?.team).toHaveLength(3);
    expect(p?.teamSize).toBe(3);
  });
  it("ekip yoksa boş liste", () => {
    const r = parseSetupReply(JSON.stringify({ proposal: { industry: "hospitality", variant: "cafe", shifts: [] } }));
    expect(r?.type).toBe("proposal");
    if (r?.type === "proposal") expect(r.proposal.team).toEqual([]);
  });
});

describe("çizelgeden sayım", () => {
  it("kişi-gün vardiyalarından kaç kişi tablosunu kodla sayar (ad ya da saatle)", () => {
    const p = normalizeProposal({
      industry: "hospitality", variant: "cafe", departments: ["SALON", "MUTFAK"], teamSize: 2,
      shifts: [{ name: "Sabah", start: "08:00", end: "16:00" }, { name: "Akşam", start: "15:00", end: "23:00" }],
      demand: { SALON: { Sabah: [9, 9, 9, 9, 9, 9, 9] } },
      team: [
        { name: "Elif Kaya", department: "SALON", week: ["Sabah", "Sabah", "Akşam", "", "Akşam", "Sabah", "Sabah"] },
        { name: "Mert Yılmaz", department: "SALON", week: ["08-16", "15-23", "izin", "Sabah", "Sabah", "Akşam", "Akşam"] },
        { name: "Can Bulut", department: "MUTFAK", week: ["Sabah", "Sabah", "Sabah", "", "Sabah", "Sabah", ""] },
      ],
    });
    expect(p?.departments).toEqual(["Salon", "Mutfak"]);
    expect(p?.team.map(t => t.department)).toEqual(["Salon", "Salon", "Mutfak"]);
    expect(p?.demand.Salon.Sabah).toEqual([2, 1, 0, 1, 1, 1, 1]);
    expect(p?.demand.Salon["Akşam"]).toEqual([0, 1, 1, 0, 1, 1, 1]);
    expect(p?.demand.Mutfak.Sabah).toEqual([1, 1, 1, 0, 1, 1, 0]);
  });
  it("büyük harfli başlığı düzeltir, karışık yazılmışa dokunmaz", () => {
    expect(titleCaseIfShouting("SALON")).toBe("Salon");
    expect(titleCaseIfShouting("İÇ MEKAN")).toBe("İç Mekan");
    expect(titleCaseIfShouting("Kasa")).toBe("Kasa");
    expect(titleCaseIfShouting("AVM")).toBe("Avm");
  });
});
