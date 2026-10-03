import { describe, it, expect } from "vitest";
import {
  accessMode, canPublishPlan, departmentScope, isChefBlocked, isViewOnly, normalizeAccess, parseAccess,
} from "@/lib/userAccess";

describe("userAccess", () => {
  it("boş yetki = tam yetki (geriye uyum)", () => {
    expect(parseAccess(null)).toBeNull();
    expect(parseAccess("bozuk")).toBeNull();
    expect(accessMode({ role: "manager", access: null })).toBe("publish");
    expect(canPublishPlan({ role: "manager" })).toBe(true);
  });

  it("departman şefi her zaman 'hazırlar'", () => {
    expect(parseAccess({ mode: "publish", department_id: "d1" })).toEqual({ mode: "prepare", department_id: "d1" });
    expect(parseAccess('{"mode":"view","department_id":"d1"}')).toEqual({ mode: "view", department_id: "d1" });
  });

  it("tam yetki boş kaydedilir, diğerleri JSON", () => {
    expect(normalizeAccess({ mode: "publish" })).toBeNull();
    expect(normalizeAccess(undefined)).toBeNull();
    expect(normalizeAccess({ mode: "view" })).toBe('{"mode":"view"}');
    expect(normalizeAccess({ mode: "publish", department_id: "d1" })).toBe('{"mode":"prepare","department_id":"d1"}');
  });

  it("işletme sahibi kısıtlanamaz", () => {
    const owner = { role: "admin", access: { mode: "view" as const, department_id: "d1" } };
    expect(isViewOnly(owner)).toBe(false);
    expect(departmentScope(owner)).toBeNull();
    expect(isChefBlocked(owner, "PATCH", "/api/locations")).toBe(false);
  });

  it("şef şube ayarına ve onaylara yazamaz, okuyabilir", () => {
    const chef = { role: "manager", access: { mode: "prepare" as const, department_id: "d1" } };
    expect(isChefBlocked(chef, "PATCH", "/api/locations")).toBe(true);
    expect(isChefBlocked(chef, "PATCH", "/api/leave-requests")).toBe(true);
    expect(isChefBlocked(chef, "GET", "/api/locations")).toBe(false);
    expect(isChefBlocked(chef, "PATCH", "/api/departments")).toBe(false); // kendi ihtiyaç tablosu, route kontrol eder
    expect(isChefBlocked({ role: "manager", access: { mode: "prepare" } }, "PATCH", "/api/locations")).toBe(false);
  });
});
