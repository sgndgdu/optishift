import { describe, it, expect } from "vitest";
import { buildInbox, greeting, type InboxInput } from "@/lib/inbox";

// 2026-09-23 Çarşamba (hafta ortası), 2026-09-26 Cumartesi (hafta sonu)
const WED = new Date(2026, 8, 23, 10, 0);
const SAT = new Date(2026, 8, 26, 10, 0);

const base: InboxInput = {
  now: WED,
  personnelCount: 10,
  lateCount: 0,
  nextWeek: "published",
  pendingApprovals: 0,
  pendingAccounts: 0,
  availability: { enabled: true, missing: 0 },
  openShifts: { enabled: true, count: 0 },
  overtime: { enabled: true, nearLimit: 0 },
  fatigue: { enabled: false, critical: 0, warning: 0 },
  handover: { enabled: false, unread: 0 },
  tasks: { enabled: false, total: 0, done: 0 },
};

const ids = (input: Partial<InboxInput>) => buildInbox({ ...base, ...input }).map(i => i.id);

describe("buildInbox", () => {
  it("her şey yolundaysa liste boş", () => {
    expect(buildInbox(base)).toEqual([]);
  });

  it("personel yoksa sadece 'ekibinizi ekleyin' gösterilir", () => {
    expect(ids({ personnelCount: 0, pendingApprovals: 3, nextWeek: "none" })).toEqual(["add-personnel"]);
  });

  it("kritik maddeler önce, sonra bugün, sonra bu hafta", () => {
    const items = buildInbox({
      ...base,
      nextWeek: "none",                    // hafta ortası → week
      pendingApprovals: 2,                 // today
      lateCount: 1,                        // critical
      overtime: { enabled: true, nearLimit: 1 }, // week
    });
    expect(items.map(i => i.severity)).toEqual(["critical", "today", "week", "week"]);
    expect(items[0].id).toBe("late");
  });

  it("gelecek hafta planı hafta sonu kritikleşir", () => {
    expect(buildInbox({ ...base, nextWeek: "none", now: WED })[0].severity).toBe("week");
    expect(buildInbox({ ...base, nextWeek: "none", now: SAT })[0].severity).toBe("critical");
  });

  it("taslak ile hiç plan olmaması ayrı mesaj verir, ikisi de sonraki haftaya gider", () => {
    const none  = buildInbox({ ...base, nextWeek: "none" })[0];
    const draft = buildInbox({ ...base, nextWeek: "draft" })[0];
    expect(none.title).toContain("hazır değil");
    expect(draft.title).toContain("taslakta");
    expect(none.action).toMatchObject({ href: "/schedule?week=next" });
    expect(draft.action).toMatchObject({ href: "/schedule?week=next" });
  });

  it("uygunluk hatırlatması sadece plan yayınlanmadıysa ve özellik açıksa", () => {
    expect(ids({ availability: { enabled: true, missing: 4 } })).toEqual([]);
    expect(ids({ nextWeek: "draft", availability: { enabled: true, missing: 4 } })).toContain("availability");
    expect(ids({ nextWeek: "draft", availability: { enabled: false, missing: 4 } })).not.toContain("availability");
  });

  it("kapalı özellikler madde üretmez", () => {
    expect(ids({
      openShifts: { enabled: false, count: 3 },
      overtime:   { enabled: false, nearLimit: 2 },
      fatigue:    { enabled: false, critical: 1, warning: 0 },
      handover:   { enabled: false, unread: 2 },
      tasks:      { enabled: false, total: 5, done: 1 },
    })).toEqual([]);
  });

  it("yorgunluk: kritik varsa kritik, sadece uyarı varsa bu hafta", () => {
    const crit = buildInbox({ ...base, fatigue: { enabled: true, critical: 1, warning: 2 } })[0];
    expect(crit.severity).toBe("critical");
    expect(crit.title).toBe("Kaza Risk Radarı: 1 kritik, 2 uyarı");
    const warn = buildInbox({ ...base, fatigue: { enabled: true, critical: 0, warning: 2 } })[0];
    expect(warn.severity).toBe("week");
  });

  it("görevler hepsi tamamsa madde yok", () => {
    expect(ids({ tasks: { enabled: true, total: 4, done: 4 } })).toEqual([]);
    expect(ids({ tasks: { enabled: true, total: 4, done: 1 } })).toEqual(["tasks"]);
  });
});

describe("greeting", () => {
  it("saate göre selamlar", () => {
    expect(greeting(new Date(2026, 8, 23, 8))).toBe("Günaydın");
    expect(greeting(new Date(2026, 8, 23, 14))).toBe("İyi günler");
    expect(greeting(new Date(2026, 8, 23, 21))).toBe("İyi akşamlar");
  });
});

describe("otomatik pilot maddesi", () => {
  it("taslağı otomatik pilot hazırladıysa İncele ve Yayınla", () => {
    const it0 = buildInbox({ ...base, nextWeek: "draft", autopilot: { drafted: true, upcoming: false, dayName: "Perşembe" } })[0];
    expect(it0.title).toBe("Gelecek haftanın planı otomatik hazırlandı");
    expect(it0.action.label).toBe("İncele ve Yayınla");
  });
  it("henüz gün gelmediyse acil değil, ne zaman hazırlanacağını söyler", () => {
    const it0 = buildInbox({ ...base, nextWeek: "none", now: SAT, autopilot: { drafted: false, upcoming: true, dayName: "Perşembe" } })[0];
    expect(it0.severity).toBe("week");
    expect(it0.title).toContain("Perşembe sabahı otomatik hazırlanacak");
  });
  it("otomatik pilot yoksa eski metin", () => {
    expect(buildInbox({ ...base, nextWeek: "none" })[0].title).toBe("Gelecek haftanın planı henüz hazır değil");
  });
});
