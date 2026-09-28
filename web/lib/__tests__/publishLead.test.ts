import { describe, it, expect } from "vitest";
import { formatPublishLead } from "@/lib/publishLead";

describe("formatPublishLead", () => {
  it("ondalık yerine anlaşılır dil", () => {
    expect(formatPublishLead(0.1)).toMatchObject({ short: "Son gün", tone: "late" });
    expect(formatPublishLead(-1.5)).toMatchObject({ short: "Geç", tone: "late" });
    expect(formatPublishLead(3.4)).toEqual({ short: "3 gün önce", sentence: "Planlar ortalama 3 gün önceden yayınlanıyor", tone: "ok" });
    expect(formatPublishLead(8)).toMatchObject({ tone: "good" });
    expect(formatPublishLead(null)).toEqual({ short: "—", sentence: null, tone: "none" });
  });
});
