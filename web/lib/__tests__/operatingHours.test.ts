import { describe, it, expect } from "vitest";
import { summarizeOperatingHours } from "@/lib/operatingHours";

const open = (o: string, c: string) => ({ isOpen: true, open: o, close: c });
const closed = { isOpen: false, open: "09:00", close: "17:00" };

describe("summarizeOperatingHours", () => {
  it("girilmemişse varsayılan: her gün 24 saat", () => {
    expect(summarizeOperatingHours(undefined)).toBe("Her gün 24 saat açık");
    expect(summarizeOperatingHours({})).toBe("Her gün 24 saat açık");
  });

  it("her gün aynı saat", () => {
    const h = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, open("09:00", "22:00")]));
    expect(summarizeOperatingHours(h)).toBe("Her gün 09:00-22:00");
  });

  it("ardışık aynı günler gruplanır, kapalı gün yazılır", () => {
    const h = {
      0: open("09:00", "22:00"), 1: open("09:00", "22:00"), 2: open("09:00", "22:00"),
      3: open("09:00", "22:00"), 4: open("09:00", "22:00"), 5: open("10:00", "23:00"), 6: closed,
    };
    expect(summarizeOperatingHours(h)).toBe("Pzt-Cum 09:00-22:00 · Cmt 10:00-23:00 · Paz kapalı");
  });

  it("aynı saat ama ardışık değilse ayrı yazılır", () => {
    const h = { 0: open("08:00", "16:00"), 1: closed, 2: open("08:00", "16:00") };
    expect(summarizeOperatingHours(h)).toBe("Pzt 08:00-16:00 · Sal kapalı · Çar 08:00-16:00 · Per-Paz 24 saat açık");
  });

  it("hep kapalı", () => {
    const h = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, closed]));
    expect(summarizeOperatingHours(h)).toBe("Her gün kapalı");
  });
});
