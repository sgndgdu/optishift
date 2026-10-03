import { describe, it, expect } from "vitest";
import { isSenior } from "../seniority";

describe("isSenior", () => {
  it("işe giriş tarihi yoksa kıdemli değil", () => {
    expect(isSenior(null, "2026-10-03")).toBe(false);
    expect(isSenior("", "2026-10-03")).toBe(false);
  });
  it("1 yıl dolunca kıdemli", () => {
    expect(isSenior("2025-10-03", "2026-10-03")).toBe(true);
    expect(isSenior("2025-10-04", "2026-10-03")).toBe(false);
    expect(isSenior("2020-01-01", "2026-10-03")).toBe(true);
  });
});
