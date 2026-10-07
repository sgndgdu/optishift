import { describe, it, expect } from "vitest";
import { normalizeProposal, normalizeTeam, parseSetupReply } from "@/lib/ai/setupAssistant";

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
