"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Check } from "lucide-react";
import AccountTab from "@/components/AccountTab";
import NewBranchWizard from "@/components/NewBranchWizard";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListItem, ListEmpty } from "@/components/ui/List";
import { DetailRow, sheetPrimaryClass } from "@/components/ui/Sheet";
import { StatusPill } from "@/components/ui/StatusPill";
import { ERP_SYSTEMS } from "@/lib/erp";
import { Page, PageHeader } from "@/components/ui/PageHeader";

const ERP_OPTIONS = [
  { value: "none", label: "Bağlı Değil", desc: "ERP entegrasyonu yok" },
  ...ERP_SYSTEMS.map(({ value, label, desc }) => ({ value, label, desc })),
];

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  free:       { label: "Ücretsiz",   color: "bg-slate-100 text-slate-600" },
  pro:        { label: "Pro",        color: "bg-forest-100 text-forest-700" },
  enterprise: { label: "Kurumsal",   color: "bg-forest-100 text-forest-700" },
};

export default function SupervisorSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  const [org, setOrg] = useState<any>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Yeni şube sihirbazı (components/NewBranchWizard); ?new=1 ile açık gelir
  const [showAddBranch, setShowAddBranch] = useState(false);

  // ERP formu
  const [selectedErp, setSelectedErp] = useState("none");
  const [erpSaving, setErpSaving] = useState(false);
  const [erpSaved, setErpSaved] = useState(false);
  const [erpError, setErpError] = useState("");


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
      setSelectedErp(orgRecord?.connected_erp ?? "none");
    } catch {}
    setLoading(false);
  };

  const handleSaveErp = async () => {
    setErpSaving(true);
    setErpError("");
    try {
      const res = await fetch("/api/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connected_erp: selectedErp === "none" ? null : selectedErp }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Kaydedilemedi");
      }
      setErpSaved(true);
      setTimeout(() => setErpSaved(false), 2000);
    } catch (err) {
      setErpError(err instanceof Error ? err.message : "Kaydedilemedi");
    }
    setErpSaving(false);
  };

  const plan = org?.plan ?? "free";
  const planInfo = PLAN_LABELS[plan] ?? PLAN_LABELS.free;

  if (!mounted) return <Page />;

  return (
    <Page width="narrow" className="animate-in fade-in duration-500">
      <PageHeader title="Ayarlar" description="İşletme geneli ayarlar" />

      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">İşletme</h2>
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2">
          {loading ? <p className="py-3 text-sm text-slate-500">Yükleniyor…</p> : <>
            <DetailRow label="İşletme adı">{org?.name ?? "—"}</DetailRow>
            <DetailRow label="Paket"><StatusPill tone="brand">{planInfo.label}</StatusPill></DetailRow>
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
            planLimited={(org?.plan ?? "free") === "free" && locations.length >= 1}
            // Liste sihirbaz kapanınca yenilenir: açıkken yenilenirse (loading) sihirbaz baştan başlar
            onClose={() => { setShowAddBranch(false); loadData(); }}
          />
        )}
      </section>

      {/* ERP Entegrasyonu: işletme geneli, sadece patron */}
      {user.role === "admin" && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">ERP sistemi</h2>
            <p className="text-xs text-slate-500 mt-0.5">Müdür portalı entegrasyon ayrıntılarını bu seçime göre gösterir.</p>
          </div>
          <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden" role="radiogroup" aria-label="ERP sistemi">
            {ERP_OPTIONS.map(erp => {
              const on = selectedErp === erp.value;
              return (
                <li key={erp.value}>
                  <button type="button" role="radio" aria-checked={on} onClick={() => setSelectedErp(erp.value)}
                    className={`w-full flex items-center gap-3 px-4 py-3 min-h-[56px] text-left transition-colors ${on ? "bg-primary/5" : "hover:bg-slate-50"}`}>
                    <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${on ? "border-primary" : "border-slate-300"}`}>
                      {on && <span className="w-2 h-2 rounded-full bg-primary" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{erp.label}</span>
                      <span className="block text-xs text-slate-500 truncate">{erp.desc}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {erpError && <p className="text-sm text-red-600">{erpError}</p>}
          <div className="flex justify-end">
            <button onClick={handleSaveErp} disabled={erpSaving} className={sheetPrimaryClass}>
              <span className="inline-flex items-center gap-1.5">
                {erpSaving ? "Kaydediliyor…" : erpSaved ? <><Check size={14} /> Kaydedildi</> : <><Save size={14} /> Kaydet</>}
              </span>
            </button>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">Hesabım</h2>
        <AccountTab storageKey="optishift_supervisor_user" allowNameEdit={true} />
      </section>
    </Page>
  );
}
