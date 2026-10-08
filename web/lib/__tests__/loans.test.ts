import { describe, it, expect } from "vitest";
import { canApproveLoan, canBorrow, declinedIds, worksAt } from "@/lib/loans";
import { parseOrgSettings } from "@/lib/orgSettings";
import { canBendRules, RULE_CHECK_IDS } from "@/lib/ruleBend";
import { readFileSync } from "fs";
import { missingPerm, parseAccess } from "@/lib/userAccess";

const owner = { role: "admin", location_id: null, managed_location_ids: null, access: null };
const mgrA = (perms?: string[], department_id?: string) =>
  ({ role: "manager", location_id: "A", managed_location_ids: null, access: perms ? parseAccess({ perms, department_id }) : null });
const regionAB = { role: "supervisor", location_id: null, managed_location_ids: ["A", "B"], access: null };
const employee = { role: "employee", location_id: "A", managed_location_ids: null, access: null };

describe("loans: şubeler arası ödünç kuralları", () => {
  it("başka şubeden kişi istemek 'Başka şubeden kişi' yetkisi ister", () => {
    expect(canBorrow(owner)).toBe(true);
    expect(canBorrow(mgrA())).toBe(true); // boş alan = tam yetki
    expect(canBorrow(mgrA(["prepare", "publish", "plan_settings"]))).toBe(false);
    expect(canBorrow(mgrA(["plan_settings", "cross_branch"]))).toBe(true);
    expect(canBorrow(mgrA(["prepare", "team"], "d1"))).toBe(false); // departman sorumlusu
    expect(canBorrow(employee)).toBe(false);
  });

  it("işletme ayarı: veren şubenin onayı varsayılan açık, kapatılabilir", () => {
    expect(parseOrgSettings(null).loan_approval).toBe(true);
    expect(parseOrgSettings("bozuk").loan_approval).toBe(true);
    expect(parseOrgSettings({ loan_approval: false }).loan_approval).toBe(false);
    expect(parseOrgSettings('{"loan_approval":true}').loan_approval).toBe(true);
  });

  it("kuralı sadece hesap sahibi esnetir", () => {
    expect(canBendRules(owner)).toBe(true);
    expect(canBendRules(regionAB)).toBe(false);
    expect(canBendRules(mgrA())).toBe(false);
    expect(canBendRules(employee)).toBe(false);
    // Plan Kontrolü'ndeki her kural maddesi gerçekten var (ad değişirse yayın kapısı sessizce açılmasın)
    const checks = readFileSync("lib/copilot/checks.ts", "utf-8");
    for (const id of RULE_CHECK_IDS) expect(checks).toContain(`add("${id}"`);
  });

  it("veren şubenin onayı: o şubede Onaylar yetkisi olan", () => {
    expect(canApproveLoan(owner, "A")).toBe(true);
    expect(canApproveLoan(mgrA(), "A")).toBe(true);
    expect(canApproveLoan(mgrA(), "B")).toBe(false);
    expect(canApproveLoan(mgrA(["prepare", "cross_branch"]), "A")).toBe(false);
    expect(canApproveLoan(mgrA(["prepare", "team"], "d1"), "A")).toBe(false);
    expect(canApproveLoan(employee, "A")).toBe(false);
  });

  it("onay kararı Onaylar yetkisiyle geçer, ilan işleri Plan ayarlarıyla", () => {
    const approver = mgrA(["approvals"]);
    expect(missingPerm(approver, "PATCH", "/api/open-shifts/loans")).toBeNull();
    expect(missingPerm(approver, "PATCH", "/api/open-shifts")).toBe("plan_settings");
    expect(missingPerm(mgrA(["plan_settings"]), "PATCH", "/api/open-shifts/loans")).toBe("approvals");
  });

  it("kişi şubede çalışıyor mu, onay alamayanlar", () => {
    expect(worksAt({ primary_location_id: "A", assigned_location_ids: '["A"]' }, "A")).toBe(true);
    expect(worksAt({ primary_location_id: "A", assigned_location_ids: '["A","B"]' }, "B")).toBe(true);
    expect(worksAt({ primary_location_id: "A", assigned_location_ids: '["A"]' }, "B")).toBe(false);
    expect(declinedIds({ loan_declined: '["p1"]' })).toEqual(["p1"]);
    expect(declinedIds({ loan_declined: null })).toEqual([]);
    expect(declinedIds({ loan_declined: "bozuk" })).toEqual([]);
  });
});
