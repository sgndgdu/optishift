import { describe, it, expect } from "vitest";
import {
  INDUSTRIES, LEGACY_SECTOR_MAP, getIndustry, industryFromRules,
  buildIndustryDefaults, enabledHighlights, applyCertificationShield, matchDocument,
  pendingSkillRecommendations, applySkillRecommendation, shiftWords,
  type InboxItemId,
} from "@/lib/templates";
import { MODULE_DEFAULTS } from "@/lib/moduleVisibility";
import { getSectorPreset, SECTOR_PRESETS } from "@/lib/presets";
import { buildInbox, type InboxInput } from "@/lib/inbox";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const durationH = (s: { start: string; end: string }) => {
  let d = minutes(s.end) - minutes(s.start);
  if (d <= 0) d += 1440;
  return d / 60;
};
const INBOX_IDS: InboxItemId[] = ["add-personnel", "late", "fatigue", "approvals", "accounts", "handover",
  "tasks", "open-shifts", "next-week", "availability", "overtime", "certifications", "industry"];

describe("sektör kayıtları: iç tutarlılık", () => {
  it("7 sektör, benzersiz anahtarlar", () => {
    expect(INDUSTRIES.map(i => i.key).sort()).toEqual(
      ["callcenter", "healthcare", "hospitality", "logistics", "manufacturing", "retail", "security"]);
  });

  for (const ind of INDUSTRIES) {
    describe(ind.label, () => {
      it("rol ve belge kimlikleri benzersiz, rolün istediği belgeler katalogda var", () => {
        const roleIds = ind.roles.map(r => r.id);
        const docIds = ind.documents.map(d => d.id);
        expect(new Set(roleIds).size).toBe(roleIds.length);
        expect(new Set(docIds).size).toBe(docIds.length);
        for (const r of ind.roles) for (const d of r.requiredDocs ?? []) expect(docIds, `${r.label} → ${d}`).toContain(d);
      });

      it("belge adları ve takma adları birbirini ezmiyor", () => {
        const all = ind.documents.flatMap(d => [d.label, ...(d.aliases ?? [])].map(a => a.toLocaleLowerCase("tr-TR")));
        expect(new Set(all).size).toBe(all.length);
      });

      it("alt türlerin vardiyaları geçerli; yasal istisnası olmayan sektörde gece ≤ 7,5 saat", () => {
        expect(ind.variants.length).toBeGreaterThan(0);
        for (const v of ind.variants) {
          const ids = v.shifts.map(s => s.id);
          expect(new Set(ids).size).toBe(ids.length);
          const nightWarning = (v.rules?.night_legal_warning_enabled ?? ind.rules.night_legal_warning_enabled) !== false;
          for (const s of v.shifts) {
            expect(s.start, `${v.key}/${s.id}`).toMatch(HHMM);
            expect(s.end, `${v.key}/${s.id}`).toMatch(HHMM);
            expect(s.base_points).toBeGreaterThanOrEqual(1);
            expect(s.base_points).toBeLessThanOrEqual(10);
            if (s.is_night && nightWarning) expect(durationH(s), `${v.key}/${s.id} gece süresi`).toBeLessThanOrEqual(7.5);
            // Günlük 11 saat: 12 saatlik vardiya ancak ara dinlenmesiyle, 24 saat nöbet sadece sağlıkta
            if (ind.key !== "healthcare") expect(durationH(s), `${v.key}/${s.id}`).toBeLessThanOrEqual(12);
          }
          for (const rec of v.skillRecommendations ?? []) {
            expect(ids, `öneri vardiyası ${rec.shiftId}`).toContain(rec.shiftId);
            expect(ind.roles.map(r => r.label), `öneri rolü ${rec.skill}`).toContain(rec.skill);
          }
        }
      });

      it("özellik anahtarları gerçek, kural değerleri makul", () => {
        for (const k of Object.keys(ind.modules)) expect(Object.keys(MODULE_DEFAULTS)).toContain(k);
        const rules = { ...ind.rules, ...Object.assign({}, ...ind.variants.map(v => v.rules ?? {})) };
        if (rules.max_weekly_hours !== undefined) expect(rules.max_weekly_hours).toBeLessThanOrEqual(45);
        if (rules.min_rest_hours !== undefined) expect(rules.min_rest_hours).toBeGreaterThanOrEqual(11);
      });

      it("öncelik listesi geçerli ve tekrarsız; ilk adımlar ve yasal notlar dolu", () => {
        const p = ind.nudges.inboxPriority;
        expect(new Set(p).size).toBe(p.length);
        for (const id of p) expect(INBOX_IDS).toContain(id);
        for (const id of Object.keys(ind.nudges.inboxCopy ?? {})) expect(INBOX_IDS).toContain(id);
        expect(ind.nudges.firstSteps.length).toBeGreaterThan(0);
        expect(ind.legalNotes.length).toBeGreaterThan(0);
      });
    });
  }
});

describe("akıllı varsayılanlar", () => {
  it("katman sırası: taban < sektör < alt tür < özellikler, sektör anahtarı yazılır", () => {
    const d = buildIndustryDefaults("security", "12-36")!;
    expect(d.rules.industry).toBe("security");
    expect(d.rules.industry_variant).toBe("12-36");
    expect(d.rules.min_rest_hours).toBe(36);          // alt tür, sektörün 11'ini ezer
    expect(d.rules.gps_checkin_required).toBe(true);  // sektör kuralı
    expect(d.rules.compliance_tracking_enabled).toBe(true); // özellik
    expect(d.rules.max_weekly_hours).toBe(45);         // taban
  });

  it("gece yarısını geçen vardiyada çalışma saatleri tüm gün açık", () => {
    const d = buildIndustryDefaults("manufacturing")!;
    expect(d.operating_hours[0]).toEqual({ isOpen: true, open: "00:00", close: "23:59" });
    const c = buildIndustryDefaults("healthcare", "clinic")!;
    expect(c.operating_hours[3]).toEqual({ isOpen: true, open: "08:00", close: "20:00" });
  });

  it("bilinmeyen sektör null, bilinmeyen alt tür ilk alt türe düşer", () => {
    expect(buildIndustryDefaults("yok")).toBeNull();
    expect(buildIndustryDefaults("retail", "yok")!.variant.key).toBe("mall");
  });

  it("şablon vardiyalarına zorunlu yetkinlik otomatik yazılmaz (yeni şubede plan kilitlenmesin)", () => {
    for (const ind of INDUSTRIES) for (const v of ind.variants)
      expect(buildIndustryDefaults(ind.key, v.key)!.shift_definitions.every(s => !s.required_skills?.length)).toBe(true);
  });

  it("vurgulanan özellikler sadece açılanlar", () => {
    expect(enabledHighlights(getIndustry("hospitality")!)).toContain("Bahşiş Havuzu");
    expect(enabledHighlights(getIndustry("healthcare")!)).toContain("Dijital Nöbet Teslimi Defteri");
    expect(enabledHighlights(getIndustry("retail")!)).not.toContain("Bahşiş Havuzu");
  });

  it("rules JSON'undan sektör okunur, eski sektör anahtarları eşlenir", () => {
    expect(industryFromRules('{"industry":"logistics"}')?.key).toBe("logistics");
    expect(industryFromRules({})).toBeNull();
    for (const [legacy, m] of Object.entries(LEGACY_SECTOR_MAP)) {
      expect(getIndustry(m.industry)!.variants.map(v => v.key), legacy).toContain(m.variant);
    }
    expect(getSectorPreset("factory").shiftDefs.find(s => s.is_night)!.end).toBe("05:30");
    expect(getSectorPreset("healthcare:hospital-24h").shiftDefs).toHaveLength(1);
    expect(SECTOR_PRESETS).toHaveLength(7);
  });
});

describe("sertifika kalkanı", () => {
  const sec = getIndustry("security")!;
  const man = getIndustry("manufacturing")!;
  const asOf = "2026-10-04";

  it("belge adı takma adla ve büyük/küçük harf farkıyla eşleşir", () => {
    expect(matchDocument(sec, "silahlı KİMLİK kartı")?.id).toBe("ogkk-silahli");
    expect(matchDocument(sec, "Bilinmeyen Belge")).toBeNull();
  });

  it("kritik belge eksikse rol düşer, diğer roller kalır", () => {
    const r = applyCertificationShield(sec, ["Silahlı Güvenlik Görevlisi", "Karşılama / Resepsiyon"], [], asOf);
    expect(r.skills).toEqual(["Karşılama / Resepsiyon"]);
    expect(r.revoked).toEqual([{ skill: "Silahlı Güvenlik Görevlisi", document: "Özel Güvenlik Kimlik Kartı (Silahlı)", reason: "missing" }]);
    expect(r.blockedBy).toBeNull();
  });

  it("süresi dolmuş belge rolü düşürür, yenilenmiş kayıt esas alınır", () => {
    const expired = [{ doc_type: "Silahlı Kimlik Kartı", expiry_date: "2026-09-30" }];
    expect(applyCertificationShield(sec, ["Silahlı Güvenlik Görevlisi"], expired, asOf).revoked[0].reason).toBe("expired");
    const renewed = [...expired, { doc_type: "Özel Güvenlik Kimlik Kartı (Silahlı)", expiry_date: "2031-09-30" }];
    expect(applyCertificationShield(sec, ["Silahlı Güvenlik Görevlisi"], renewed, asOf).skills).toEqual(["Silahlı Güvenlik Görevlisi"]);
  });

  it("belge haftanın son günü bitiyorsa o hafta geçerli sayılır", () => {
    const docs = [{ doc_type: "Silahlı Kimlik Kartı", expiry_date: asOf }];
    expect(applyCertificationShield(sec, ["Silahlı Güvenlik Görevlisi"], docs, asOf).revoked).toEqual([]);
  });

  it("herkes için zorunlu belgenin süresi dolarsa kişi tamamen dışarıda kalır; eksikse (kritik değil) engel olmaz", () => {
    const expiredIsg = [{ doc_type: "İş Güvenliği Eğitimi", expiry_date: "2026-01-01" }];
    const r = applyCertificationShield(man, ["Hat Operatörü"], expiredIsg, asOf);
    expect(r.blockedBy).toEqual({ document: "İSG Temel Eğitimi", reason: "expired", expiry: "2026-01-01" });
    expect(applyCertificationShield(man, ["Hat Operatörü"], [], asOf).blockedBy).toBeNull();
  });

  it("katalogda olmayan serbest yetkinlik (örn. departman adı) olduğu gibi kalır", () => {
    expect(applyCertificationShield(sec, ["Nizamiye"], [], asOf).skills).toEqual(["Nizamiye"]);
  });
});

describe("Bekleyen İşler: sektör önceliği ve dili", () => {
  const base: InboxInput = {
    now: new Date(2026, 8, 23, 10), personnelCount: 10, lateCount: 0, nextWeek: "published",
    pendingApprovals: 0, pendingAccounts: 0,
    availability: { enabled: true, missing: 0 }, openShifts: { enabled: true, count: 0 },
    overtime: { enabled: true, nearLimit: 0 }, fatigue: { enabled: true, critical: 0, warning: 0 },
    handover: { enabled: true, unread: 0 }, tasks: { enabled: false, total: 0, done: 0 },
  };

  it("aynı aciliyette sektörün derdi üste çıkar", () => {
    const input = { ...base, pendingApprovals: 2, openShifts: { enabled: true, count: 3 }, handover: { enabled: true, unread: 1 } };
    expect(buildInbox({ ...input, nudges: getIndustry("hospitality")!.nudges }).map(i => i.id))
      .toEqual(["open-shifts", "approvals", "handover"]);
    expect(buildInbox({ ...input, nudges: getIndustry("manufacturing")!.nudges }).map(i => i.id))
      .toEqual(["handover", "approvals", "open-shifts"]);
  });

  it("aciliyet sektör önceliğinden önce gelir", () => {
    const items = buildInbox({ ...base, lateCount: 1, fatigue: { enabled: true, critical: 0, warning: 2 }, nudges: getIndustry("manufacturing")!.nudges });
    expect(items.map(i => i.id)).toEqual(["late", "fatigue"]);
  });

  it("sektör dili: sağlıkta boş nöbet, taslak planın kendi metni korunur", () => {
    const hc = getIndustry("healthcare")!.nudges;
    expect(buildInbox({ ...base, openShifts: { enabled: true, count: 2 }, nudges: hc })[0].title).toBe("2 boş nöbet henüz dolmadı");
    expect(buildInbox({ ...base, nextWeek: "none", nudges: hc })[0].title).toBe("Gelecek haftanın nöbet listesi henüz hazır değil");
    expect(buildInbox({ ...base, nextWeek: "draft", nudges: hc })[0].title).toBe("Gelecek haftanın planı taslakta");
  });

  it("belge maddesi: süresi dolmuş acil, yaklaşan bu hafta, kapalıysa hiç", () => {
    expect(buildInbox({ ...base, certifications: { enabled: true, expired: 2, expiring: 1 } })[0])
      .toMatchObject({ id: "certifications", severity: "critical" });
    expect(buildInbox({ ...base, certifications: { enabled: true, expired: 0, expiring: 1 } })[0].severity).toBe("week");
    expect(buildInbox({ ...base, certifications: { enabled: false, expired: 2, expiring: 0 } })).toEqual([]);
  });

  it("işletme türü seçilmemişse hatırlatma, seçiliyse ya da bilinmiyorsa yok", () => {
    expect(buildInbox({ ...base, industrySelected: false })).toMatchObject([{ id: "industry", severity: "week", action: { href: "/settings" } }]);
    expect(buildInbox({ ...base, industrySelected: true })).toEqual([]);
    expect(buildInbox(base)).toEqual([]);
  });
});

describe("önerilen zorunlu roller", () => {
  const mfg = getIndustry("manufacturing")!;
  const shifts = buildIndustryDefaults("manufacturing", "three-shift")!.shift_definitions;
  const holders = (n: number, role: string) => Array.from({ length: n }, () => [role]);

  it("kimsede rol yoksa uygulanamaz, az kişide varsa uyarı, yeterliyse hazır", () => {
    const status = (roles: string[][]) =>
      pendingSkillRecommendations(mfg, "three-shift", shifts, roles).find(r => r.skill === "Bakım Teknisyeni")!.status;
    expect(status([])).toBe("no-holders");
    expect(status(holders(1, "Bakım Teknisyeni"))).toBe("thin");
    expect(status(holders(2, "Bakım Teknisyeni"))).toBe("ready");
    // Motor birebir eşleştirir: farklı yazım sayılmaz
    expect(status(holders(3, "bakım teknisyeni"))).toBe("no-holders");
  });

  it("uygulanan öneri listeden düşer, diğer vardiyalar değişmez", () => {
    const rec = pendingSkillRecommendations(mfg, "three-shift", shifts, holders(3, "Bakım Teknisyeni"))[0];
    const next = applySkillRecommendation(shifts, rec);
    expect(next.find(s => s.id === rec.shiftId)!.required_skills).toEqual([{ skill: rec.skill, count: rec.count }]);
    expect(next.filter(s => s.id !== rec.shiftId)).toEqual(shifts.filter(s => s.id !== rec.shiftId));
    expect(pendingSkillRecommendations(mfg, "three-shift", next, []).map(r => r.skill)).not.toContain(rec.skill);
  });

  it("vardiyası olmayan öneri atlanır", () => {
    expect(pendingSkillRecommendations(mfg, "three-shift", [], [])).toEqual([]);
  });
});

describe("portal kelimeleri", () => {
  it("sektör yoksa vardiya, sağlıkta nöbet, üretimde posta (ek uyumu)", () => {
    expect(shiftWords(null)).toEqual({ shift: "vardiya", Shift: "Vardiya", Shifts: "Vardiyalar", MyShifts: "Vardiyalarım", openShift: "açık vardiya", OpenShifts: "Açık Vardiyalar" });
    expect(shiftWords(getIndustry("healthcare")!.nudges)).toMatchObject({ Shifts: "Nöbetler", MyShifts: "Nöbetlerim", OpenShifts: "Boş Nöbetler" });
    expect(shiftWords(getIndustry("manufacturing")!.nudges)).toMatchObject({ Shift: "Posta", MyShifts: "Postalarım", OpenShifts: "Boş Postalar" });
  });
});
