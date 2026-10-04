import { describe, it, expect } from "vitest";
import {
  accountLevel, ALL_PERMS, canDelegate, canPublishPlan, canSeePage, capPerms, departmentScope, hasPerm, isChefBlocked,
  isViewOnly, missingPerm, normalizeAccess, parseAccess, userPerms,
} from "@/lib/userAccess";

const mgr = (perms: string[], department_id?: string) =>
  ({ role: "manager", access: parseAccess({ perms, department_id }) });

describe("userAccess: kişi bazında yetki maddeleri", () => {
  it("boş yetki = tam yetki (geriye uyum)", () => {
    expect(parseAccess(null)).toBeNull();
    expect(parseAccess("bozuk")).toBeNull();
    expect(userPerms({ role: "manager", access: null })).toEqual(ALL_PERMS);
    expect(canPublishPlan({ role: "manager" })).toBe(true);
  });

  it("eski { mode } kayıtları maddelere çevrilir", () => {
    expect(parseAccess({ mode: "view" })?.perms).toEqual([]);
    expect(parseAccess({ mode: "publish" })?.perms).toEqual(ALL_PERMS);
    const prep = parseAccess({ mode: "prepare" })!.perms;
    expect(prep).toContain("prepare");
    expect(prep).not.toContain("publish");
    expect(prep).not.toContain("delegate");
    // Şef: modsuz = hazırlar; sadece departman maddeleri kalır
    expect(parseAccess({ department_id: "d1" })).toEqual({ perms: ["prepare", "team"], department_id: "d1" });
    expect(parseAccess({ mode: "publish", department_id: "d1" })?.perms).toEqual(["prepare", "publish", "team"]);
  });

  it("yayınlayan hazırlar da; şefe şube geneli madde verilemez", () => {
    expect(parseAccess({ perms: ["publish"] })?.perms).toEqual(["prepare", "publish"]);
    expect(parseAccess({ perms: ["budget", "approvals", "team"], department_id: "d1" })?.perms).toEqual(["team"]);
    expect(parseAccess({ perms: ["uydurma", "budget"] })?.perms).toEqual(["budget"]);
  });

  it("tam yetki boş kaydedilir, diğerleri JSON", () => {
    expect(normalizeAccess({ perms: ALL_PERMS })).toBeNull();
    expect(normalizeAccess(undefined)).toBeNull();
    expect(normalizeAccess({ perms: [] })).toBe('{"perms":[]}');
    expect(normalizeAccess({ perms: ["team"], department_id: "d1" })).toBe('{"perms":["team"],"department_id":"d1"}');
  });

  it("işletme sahibi kısıtlanamaz, çalışan yönetemez", () => {
    const owner = { role: "admin", access: { perms: [], department_id: "d1" } };
    expect(isViewOnly(owner)).toBe(false);
    expect(hasPerm(owner, "budget")).toBe(true);
    expect(departmentScope(owner)).toBeNull();
    expect(isChefBlocked(owner, "PATCH", "/api/locations")).toBe(false);
    expect(hasPerm({ role: "employee" }, "prepare")).toBe(false);
    expect(missingPerm({ role: "employee" }, "PATCH", "/api/leave-requests")).toBeNull();
  });

  it("hiç maddesi olmayan yönetici sadece görür", () => {
    expect(isViewOnly(mgr([]))).toBe(true);
    expect(isViewOnly(mgr(["approvals"]))).toBe(false);
  });

  it("yazma isteği gereken maddeye bağlı (parça bazlı yol)", () => {
    const onlyPlan = mgr(["prepare"]);
    expect(missingPerm(onlyPlan, "POST", "/api/shifts")).toBeNull();
    expect(missingPerm(onlyPlan, "POST", "/api/schedule/publish")).toBe("publish");
    expect(missingPerm(onlyPlan, "PATCH", "/api/leave-requests")).toBe("approvals");
    expect(missingPerm(onlyPlan, "PATCH", "/api/personnel")).toBe("team");
    expect(missingPerm(onlyPlan, "POST", "/api/personnel-documents")).toBe("team");
    expect(missingPerm(onlyPlan, "POST", "/api/payroll-periods")).toBe("budget");
    expect(missingPerm(onlyPlan, "GET", "/api/personnel")).toBeNull();
    // Çalışanın kendi mesai yanıtı yöneticinin onay maddesine bağlı değil
    expect(missingPerm(onlyPlan, "PATCH", "/api/overtime/me")).toBeNull();
    expect(missingPerm(onlyPlan, "PATCH", "/api/overtime")).toBe("approvals");
  });

  it("veren en fazla kendi maddelerini verir", () => {
    expect(capPerms(["prepare", "budget", "delegate"], mgr(["prepare", "delegate"]))).toEqual(["prepare", "delegate"]);
    expect(capPerms(ALL_PERMS, { role: "admin" })).toEqual(ALL_PERMS);
  });

  it("kademe: sahip > bölge müdürü > şube müdürü > şef > çalışan", () => {
    expect(accountLevel("admin", null)).toBe(4);
    expect(accountLevel("supervisor", null)).toBe(3);
    expect(accountLevel("manager", null)).toBe(2);
    expect(accountLevel("manager", { perms: [], department_id: "d1" })).toBe(1);
    expect(accountLevel("employee", null)).toBe(0);
    expect(canDelegate(mgr(["prepare"]))).toBe(false);
    expect(canDelegate(mgr(["delegate"]))).toBe(true);
  });

  it("menüde yetkiye bağlı sayfalar", () => {
    expect(canSeePage(mgr(["prepare"]), "/requests")).toBe(false);
    expect(canSeePage(mgr(["approvals"]), "/requests")).toBe(true);
    expect(canSeePage(mgr([]), "/schedule")).toBe(true);
  });

  it("şef şube ayarına ve onaylara yazamaz, okuyabilir", () => {
    const chef = mgr(["prepare"], "d1");
    expect(isChefBlocked(chef, "PATCH", "/api/locations")).toBe(true);
    expect(isChefBlocked(chef, "PATCH", "/api/leave-requests")).toBe(true);
    expect(isChefBlocked(chef, "GET", "/api/locations")).toBe(false);
    expect(isChefBlocked(chef, "PATCH", "/api/departments")).toBe(false); // kendi ihtiyaç tablosu, route kontrol eder
    expect(isChefBlocked(mgr(["prepare"]), "PATCH", "/api/locations")).toBe(false);
  });
});
