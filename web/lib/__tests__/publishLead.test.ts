import { describe, it, expect } from "vitest";
import { formatPublishLead } from "@/lib/publishLead";

describe("formatPublishLead", () => {
  it("ondalık yerine anlaşılır dil", () => {
    // Son gün yayın geç sayılmaz (Tüm Şubeler'de alt yazı "son gün" derken rozet "Geç yayın" diyordu)
    expect(formatPublishLead(0.1)).toMatchObject({ short: "son gün", tone: "ok" });
    expect(formatPublishLead(-1.5)).toMatchObject({ short: "geç", tone: "late" });
    expect(formatPublishLead(2)).toMatchObject({ short: "2 gün önce", tone: "ok" });
    expect(formatPublishLead(3.4)).toEqual({ short: "3 gün önce", sentence: "Planlar ortalama 3 gün önceden yayınlanıyor", tone: "good" });
    expect(formatPublishLead(8)).toMatchObject({ tone: "good" });
    expect(formatPublishLead(null)).toEqual({ short: "—", sentence: null, tone: "none" });
  });
});
