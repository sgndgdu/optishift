"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import AccountTab from "@/components/AccountTab";
import NewBranchWizard from "@/components/NewBranchWizard";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListItem, ListEmpty } from "@/components/ui/List";
import { DetailRow } from "@/components/ui/Sheet";
import { StatusPill } from "@/components/ui/StatusPill";
import { getPlan } from "@/lib/plans";
import { Page, PageHeader } from "@/components/ui/PageHeader";

export default function SupervisorSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  const [org, setOrg] = useState<any>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Yeni şube sihirbazı (components/NewBranchWizard); ?new=1 ile açık gelir
  const [showAddBranch, setShowAddBranch] = useState(false);



  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_supervisor_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed) setUser(parsed);
      // Genel Bakış'taki "Şube Ekle" → ?new=1 (istemci geçişinde adres effect'te günceldir)
      if (parsed?.role === "admin" && new URLSearchParams(window.location.search).get("new") === "1") setShowAddBranch(true);
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
            <DetailRow label="Paket"><StatusPill tone="brand">{planInfo.name}</StatusPill></DetailRow>
            <DetailRow label="Şube sayısı">{locations.length}</DetailRow>
          </>}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">Şubeler</h2>
          {user.role === "admin" && (
            <button onClick={() => setShowAddBranch(true)}
              className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Plus size={15} /> Şube ekle
            </button>
          )}
        </div>
        <List>
          {loading ? <ListEmpty>Yükleniyor…</ListEmpty> : locations.length === 0 ? <ListEmpty>Henüz şube yok.</ListEmpty>
            : locations.map(loc => (
              <ListItem key={loc.id} leading={<Avatar name={loc.name} tone="brand" />} title={loc.name} />
            ))}
        </List>
        {/* Yeni Şube sihirbazı */}
        {showAddBranch && !loading && (
          <NewBranchWizard
            existing={locations}
            planLimited={planInfo.maxLocations !== null && locations.length >= planInfo.maxLocations}
            // Liste sihirbaz kapanınca yenilenir: açıkken yenilenirse (loading) sihirbaz baştan başlar
            onClose={() => { setShowAddBranch(false); loadData(); }}
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">Hesabım</h2>
        <AccountTab storageKey="optishift_supervisor_user" allowNameEdit={true} />
      </section>
    </Page>
  );
}
