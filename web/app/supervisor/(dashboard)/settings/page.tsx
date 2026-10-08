"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AccountTab from "@/components/AccountTab";
import { DetailRow } from "@/components/ui/Sheet";
import { StatusPill } from "@/components/ui/StatusPill";
import { getPlan } from "@/lib/plans";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { parseOrgSettings } from "@/lib/orgSettings";

export default function SupervisorSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  const [org, setOrg] = useState<any>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_supervisor_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed) setUser(parsed);
      // Eski bağlantılar: şube ekleme artık Genel Bakış'ta
      if (new URLSearchParams(window.location.search).get("new") === "1") { window.location.replace("/supervisor?new=1"); return; }
      setMounted(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!mounted) return;
    if (!user) { router.push("/login"); return; }
    if (user.role !== "supervisor" && user.role !== "admin") { router.push("/login"); return; }
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [orgRes, locRes] = await Promise.all([
        fetch(`/api/admin/organizations?id=${user.org_id}`),
        fetch(`/api/locations?org_id=${user.org_id}`),
      ]);
      const orgData = await orgRes.json();
      const locData = await locRes.json();
      const orgRecord = Array.isArray(orgData) ? orgData[0] : orgData;
      setOrg(orgRecord);
      setLocations(Array.isArray(locData) ? locData : []);
    } catch {}
    setLoading(false);
  };

  const planInfo = getPlan(org?.plan);
  const loanApproval = parseOrgSettings(org?.settings).loan_approval;
  const [savingLoan, setSavingLoan] = useState(false);
  const setLoanApproval = async (v: boolean) => {
    setSavingLoan(true);
    try {
      const r = await fetch(`/api/admin/organizations?id=${user.org_id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { loan_approval: v } }),
      });
      if (r.ok) setOrg((o: any) => ({ ...o, settings: JSON.stringify({ ...parseOrgSettings(o?.settings), loan_approval: v }) }));
    } finally { setSavingLoan(false); }
  };

  if (!mounted) return <Page />;

  return (
    <Page width="narrow" className="animate-in fade-in duration-500">
      <PageHeader title="Ayarlar" description="İşletme geneli ayarlar" />

      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">İşletme</h2>
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2">
          {loading ? <p className="py-3 text-sm text-slate-500">Yükleniyor…</p> : <>
            <DetailRow label="İşletme adı">{org?.name ?? "—"}</DetailRow>
            {user.role === "admin" && <DetailRow label="Paket"><StatusPill tone="brand">{planInfo.name}</StatusPill> <a href="/supervisor/billing" className="ml-2 text-xs font-semibold text-forest-700 hover:underline">Paketi yönet</a></DetailRow>}
            <DetailRow label="Şube sayısı">{locations.length} <a href="/supervisor" className="ml-2 text-xs font-semibold text-forest-700 hover:underline">Şubeler</a></DetailRow>
          </>}
        </div>
      </section>

      {/* İşletme geneli ayar (lib/orgSettings), tek yeri burası; sadece hesap sahibi ve birden çok şubede */}
      {user.role === "admin" && locations.length > 1 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-slate-900">Şubeler arası</h2>
          <label className="flex items-start gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 cursor-pointer">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-forest-700" checked={loanApproval} disabled={savingLoan || loading}
              onChange={e => setLoanApproval(e.target.checked)} />
            <span>
              <span className="block text-sm font-semibold text-slate-900">Başka şubeden kişi alınca kendi sorumlusu onaylasın</span>
              <span className="block text-xs text-slate-500 mt-0.5">Açıkken bir şube başka şubenin çalışanını vardiyaya yazdığında ya da kişi ilanı aldığında, kişinin kendi şubesinin sorumlusu Onaylar&apos;dan onaylar. Kapalıyken vardiya hemen yazılır, kişinin şubesine sadece haber gider.</span>
            </span>
          </label>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">Hesabım</h2>
        <AccountTab storageKey="optishift_supervisor_user" allowNameEdit={true} />
      </section>
    </Page>
  );
}
