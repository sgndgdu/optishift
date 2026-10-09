"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AccountTab from "@/components/AccountTab";
import { DetailRow } from "@/components/ui/Sheet";
import { StatusPill } from "@/components/ui/StatusPill";
import { getPlan } from "@/lib/plans";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import BranchSettings from "@/components/settings/BranchSettings";
import { hasPerm, parseAccess } from "@/lib/userAccess";
import { cn } from "@/lib/utils";

/**
 * Tüm Şubeler › Ayarlar. "Şube ayarları" sekmesinde şube seçilir ve o şubenin ayarları burada açılır
 * (2026-10-09, kullanıcı isteği; şube paneline geçmeden). Bileşen şube panelindekiyle aynı (components/settings/BranchSettings).
 */

export default function SupervisorSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  const [org, setOrg] = useState<any>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"branch" | "org">("branch");
  const [branchId, setBranchId] = useState("");

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
      const locs = Array.isArray(locData) ? locData : [];
      setLocations(locs);
      const q = new URLSearchParams(window.location.search).get("location_id");
      setBranchId(locs.find((l: any) => l.id === q)?.id ?? locs[0]?.id ?? "");
    } catch {}
    setLoading(false);
  };

  const planInfo = getPlan(org?.plan);

  if (!mounted) return <Page />;
  const canBranch = hasPerm({ role: user?.role ?? null, access: parseAccess(user?.access) }, "plan_settings") && locations.length > 0;
  const view = canBranch ? tab : "org";

  return (
    <Page width="narrow" className="animate-in fade-in duration-500">
      <PageHeader title="Ayarlar" description={view === "branch" ? "Şubelerin vardiya, kural ve özellik ayarları" : "İşletme bilgileri ve hesabınız"} />

      {canBranch && (
        <Tabs fill value={tab} onChange={v => setTab(v as "branch" | "org")}
          items={[{ id: "branch", label: "Şube ayarları" }, { id: "org", label: "İşletme ve hesabım" }]} />
      )}

      {view === "branch" && (
        <div className="space-y-4">
          {locations.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Şube">
              {locations.map((l: any) => (
                <button key={l.id} role="tab" aria-selected={branchId === l.id} onClick={() => setBranchId(l.id)}
                  className={cn("min-h-[36px] rounded-full border px-3 text-sm font-semibold transition",
                    branchId === l.id ? "border-forest-700 bg-forest-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}>
                  {l.name}
                </button>
              ))}
            </div>
          )}
          {branchId && <BranchSettings key={branchId} locationId={branchId} embedded />}
        </div>
      )}

      {view === "org" && <>
      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">İşletme</h2>
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2">
          {loading ? <p className="py-3 text-sm text-slate-500">Yükleniyor…</p> : <>
            <DetailRow label="İşletme adı">{org?.name ?? "Yok"}</DetailRow>
            {user.role === "admin" && <DetailRow label="Paket"><StatusPill tone="brand">{planInfo.name}</StatusPill> <a href="/supervisor/billing" className="ml-2 text-xs font-semibold text-forest-700 hover:underline">Paketi yönet</a></DetailRow>}
            <DetailRow label="Şube sayısı">{locations.length} <a href="/supervisor" className="ml-2 text-xs font-semibold text-forest-700 hover:underline">Şubeler</a></DetailRow>
          </>}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">Hesabım</h2>
        <AccountTab storageKey="optishift_supervisor_user" allowNameEdit={true} />
      </section>
      </>}
    </Page>
  );
}
