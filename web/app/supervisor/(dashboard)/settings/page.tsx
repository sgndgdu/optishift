"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AccountTab from "@/components/AccountTab";
import { DetailRow } from "@/components/ui/Sheet";
import { StatusPill } from "@/components/ui/StatusPill";
import { getPlan } from "@/lib/plans";
import { openBranchPanel } from "@/lib/sessionRouting";
import { Page, PageHeader } from "@/components/ui/PageHeader";

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

  if (!mounted) return <Page />;

  return (
    <Page width="narrow" className="animate-in fade-in duration-500">
      <PageHeader title="Ayarlar" description="İşletme geneli ayarlar" />

      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">İşletme</h2>
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2">
          {loading ? <p className="py-3 text-sm text-slate-500">Yükleniyor…</p> : <>
            <DetailRow label="İşletme adı">{org?.name ?? "—"}</DetailRow>
            {user.role === "admin" && <DetailRow label="Paket"><StatusPill tone="brand">{planInfo.name}</StatusPill> <button type="button" onClick={() => {
                // Ödeme sayfası şube panelinde: önce bir şubenin oturumu hazırlanır (yoksa giriş sayfasına düşerdi)
                if (locations[0]) openBranchPanel(user, locations[0].id);
                window.location.href = "/billing";
              }} className="ml-2 text-xs font-semibold text-forest-700 hover:underline">Paketi yönet</button></DetailRow>}
            <DetailRow label="Şube sayısı">{locations.length} <a href="/supervisor" className="ml-2 text-xs font-semibold text-forest-700 hover:underline">Şubeler</a></DetailRow>
          </>}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">Hesabım</h2>
        <AccountTab storageKey="optishift_supervisor_user" allowNameEdit={true} />
      </section>
    </Page>
  );
}
