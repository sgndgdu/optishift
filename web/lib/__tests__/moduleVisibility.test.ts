import { describe, it, expect } from "vitest";
import { isModuleOn, parseRules } from "@/lib/moduleVisibility";

describe("isModuleOn", () => {
  it("varsayılan açık özellik: anahtar yoksa açık, sadece false kapatır", () => {
    expect(isModuleOn({}, "chat_enabled")).toBe(true);
    expect(isModuleOn({ chat_enabled: true }, "chat_enabled")).toBe(true);
    expect(isModuleOn({ chat_enabled: false }, "chat_enabled")).toBe(false);
  });

  it("varsayılan kapalı özellik: sadece true açar", () => {
    expect(isModuleOn({}, "tip_pooling_enabled")).toBe(false);
    expect(isModuleOn({ tip_pooling_enabled: "true" }, "tip_pooling_enabled")).toBe(false);
    expect(isModuleOn({ tip_pooling_enabled: true }, "tip_pooling_enabled")).toBe(true);
  });

  it("rules JSON string ya da boş gelebilir", () => {
    expect(isModuleOn('{"fatigue_radar_enabled":true}', "fatigue_radar_enabled")).toBe(true);
    expect(isModuleOn("bozuk json", "fatigue_radar_enabled")).toBe(false);
    expect(isModuleOn(null, "open_shifts_enabled")).toBe(true);
    expect(isModuleOn(undefined, "handover_log_enabled")).toBe(false);
  });

  it("parseRules nesneyi olduğu gibi döndürür", () => {
    const r = { a: 1 };
    expect(parseRules(r)).toBe(r);
  });
});
