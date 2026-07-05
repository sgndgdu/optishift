"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, Building2, Plug, Plus, Save, X, Check, Sparkles, UserCircle } from "lucide-react";
import AccountTab from "@/components/AccountTab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ERP_SYSTEMS } from "@/lib/erp";

const ERP_OPTIONS = [
  { value: "none", label: "Bağlı Değil", desc: "ERP entegrasyonu yok" },
  ...ERP_SYSTEMS.map(({ value, label, desc }) => ({ value, label, desc })),
];

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  free:       { label: "Ücretsiz",   color: "bg-slate-100 text-slate-600" },
  pro:        { label: "Pro",        color: "bg-indigo-100 text-indigo-700" },
  enterprise: { label: "Kurumsal",   color: "bg-violet-100 text-violet-700" },
};

export default function SupervisorSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  const [org, setOrg] = useState<any>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Yeni şube formu
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [addBranchLoading, setAddBranchLoading] = useState(false);
  const [addBranchError, setAddBranchError] = useState("");
  const [addBranchSuccess, setAddBranchSuccess] = useState(false);

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

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    setAddBranchLoading(true);
    setAddBranchError("");
    try {
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: user.org_id, name: newBranchName.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        setAddBranchError(d.error ?? "Hata");
      } else {
        setAddBranchSuccess(true);
        setNewBranchName("");
        await loadData();
        setTimeout(() => { setAddBranchSuccess(false); setShowAddBranch(false); }, 1500);
      }
    } catch {
      setAddBranchError("Sunucu hatası");
    }
    setAddBranchLoading(false);
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

  if (!mounted) return <div className="space-y-8" />;

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Ayarlar</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">Organizasyon geneli ayarlar ve entegrasyonlar.</p>
      </div>

      {/* Organizasyon Bilgileri */}
      <Card className="stripe-card border-0 shadow-none">
        <CardHeader className="border-b border-border/40 bg-slate-50/50 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-violet-100 rounded-xl text-violet-600">
              <Building2 size={18} />
            </div>
            <CardTitle className="text-base font-bold">Organizasyon</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-8 bg-slate-100 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Organizasyon Adı</p>
                <p className="font-bold text-slate-800 text-lg">{org?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Plan</p>
                <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-xl ${planInfo.color}`}>
                  <Sparkles size={13} />
                  {planInfo.label}
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Org ID</p>
                <p className="text-sm font-mono text-slate-500">{org?.id ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Şube Sayısı</p>
                <p className="font-bold text-slate-800">{locations.length}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Şube Yönetimi */}
      <Card className="stripe-card border-0 shadow-none">
        <CardHeader className="border-b border-border/40 bg-slate-50/50 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600">
                <Building2 size={18} />
              </div>
              <CardTitle className="text-base font-bold">Şubeler</CardTitle>
              <Badge variant="secondary">{locations.length}</Badge>
            </div>
            {user.role === "admin" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-violet-200 text-violet-700 hover:bg-violet-50"
                onClick={() => { setShowAddBranch(true); setAddBranchError(""); setAddBranchSuccess(false); }}
              >
                <Plus size={14} />
                Şube Ekle
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : locations.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              <Building2 size={28} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold">Henüz şube eklenmemiş.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {locations.map(loc => (
                <div key={loc.id} className="flex items-center justify-between px-4 py-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                      <Building2 size={14} className="text-violet-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{loc.name}</p>
                      <p className="text-xs text-slate-500 font-mono">{loc.id}</p>
                    </div>
                  </div>
                  <Badge variant="success" className="text-[10px]">Aktif</Badge>
                </div>
              ))}
            </div>
          )}

          {/* Yeni Şube Formu */}
          {showAddBranch && (
            <div className="mt-4 p-4 bg-violet-50 border border-violet-100 rounded-2xl">
              <p className="text-sm font-bold text-violet-800 mb-3">Yeni Şube</p>
              <form onSubmit={handleAddBranch} className="flex flex-col sm:flex-row gap-2">
                <input
                  value={newBranchName}
                  onChange={e => setNewBranchName(e.target.value)}
                  placeholder="Şube adı (örn: İstanbul Kadıköy)"
                  required
                  className="flex-1 px-4 py-2.5 border-2 border-violet-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500 bg-white min-h-[44px]"
                />
                <div className="flex gap-2">
                  <Button type="submit" disabled={addBranchLoading} size="sm" className="bg-violet-600 hover:bg-violet-700 text-white flex-1 sm:flex-none min-h-[44px]">
                    {addBranchLoading
                      ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : addBranchSuccess ? <Check size={14} /> : <Save size={14} />}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowAddBranch(false)} className="flex-1 sm:flex-none min-h-[44px]">
                    <X size={14} />
                  </Button>
                </div>
              </form>
              {addBranchError && <p className="text-xs text-red-600 font-medium mt-2">{addBranchError}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hesabım */}
      <Card className="stripe-card border-0 shadow-none">
        <CardHeader className="border-b border-border/40 bg-slate-50/50 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600">
              <UserCircle size={18} />
            </div>
            <CardTitle className="text-base font-bold">Hesabım</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <AccountTab storageKey="optishift_supervisor_user" allowNameEdit={true} />
        </CardContent>
      </Card>

      {/* ERP Entegrasyonu */}
      <Card className="stripe-card border-0 shadow-none">
        <CardHeader className="border-b border-border/40 bg-slate-50/50 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 rounded-xl text-emerald-600">
              <Plug size={18} />
            </div>
            <CardTitle className="text-base font-bold">ERP Entegrasyonu</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-slate-500">
            Organizasyonunuzun bağlı olduğu ERP sistemini seçin. Müdür portalı entegrasyon detaylarını bu seçime göre gösterir.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ERP_OPTIONS.map(erp => (
              <button
                key={erp.value}
                onClick={() => setSelectedErp(erp.value)}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  selectedErp === erp.value
                    ? "border-violet-500 bg-violet-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                    selectedErp === erp.value ? "border-violet-600 bg-violet-600" : "border-slate-300"
                  }`}>
                    {selectedErp === erp.value && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                  <span className="text-sm font-bold text-slate-800">{erp.label}</span>
                </div>
                <p className="text-xs text-slate-500 pl-5">{erp.desc}</p>
              </button>
            ))}
          </div>
          {erpError && (
            <p className="text-sm text-red-600 font-medium">{erpError}</p>
          )}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSaveErp}
              disabled={erpSaving}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
            >
              {erpSaving
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : erpSaved ? <><Check size={14} /> Kaydedildi</> : <><Save size={14} /> Kaydet</>
              }
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
