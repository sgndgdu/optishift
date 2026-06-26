"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Users, Plus, Search, Edit2, X, Check,
  Phone, Mail, Briefcase, Shield, Building2, ChevronDown,
  Copy, Link,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EMP_TYPES = [
  { value: "full_time",  label: "Tam Zamanlı" },
  { value: "part_time",  label: "Yarı Zamanlı" },
  { value: "intern",     label: "Stajyer" },
];

const ACCESS_LEVELS = [
  { value: "employee",  label: "Personel" },
  { value: "manager",   label: "Müdür" },
  { value: "supervisor", label: "Süpervizör" },
];

const ROLE_DEFS = [
  { label: "Şube Müdürü",      role: "manager",   display_title: "Şube Müdürü" },
  { label: "Müdür Yardımcısı", role: "manager",   display_title: "Müdür Yardımcısı" },
  { label: "Departman Müdürü", role: "manager",   display_title: "Departman Müdürü" },
  { label: "Personel",         role: "employee",  display_title: "" },
];

export default function SupervisorPersonnelPage() {
  return <Suspense><SupervisorPersonnelInner /></Suspense>;
}

function SupervisorPersonnelInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  const [locations, setLocations] = useState<any[]>([]);
  const [deptCache, setDeptCache] = useState<Record<string, { id: string; name: string }[]>>({});
  const [selectedLocId, setSelectedLocId] = useState<string>("");
  const [personnel, setPersonnel] = useState<any[]>([]);
  const [crewMap, setCrewMap] = useState<Record<string, { name: string; color: string }>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [roleOption, setRoleOption] = useState(3); // default Personel
  const [addForm, setAddForm] = useState({ name: "", email: "", phone: "", title: "", employment_type: "full_time", max_weekly_hours: 45 });
  const [selLocIds, setSelLocIds] = useState<string[]>([]);
  const [selDeptIds, setSelDeptIds] = useState<string[]>([]);
  const [singleLocId, setSingleLocId] = useState("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Post-creation invite modal
  const [inviteModal, setInviteModal] = useState<{ name: string; username: string; tempPassword: string; inviteUrl: string } | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [passCopied, setPassCopied] = useState(false);

  // Inline davet linki for existing
  const [inviteLinkModal, setInviteLinkModal] = useState<{ name: string; url: string } | null>(null);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [inviteLinkLoading, setInviteLinkLoading] = useState<string | null>(null);

  // Edit modal
  const [editingPersonnel, setEditingPersonnel] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", title: "", employment_type: "full_time", user_access_level: "employee" });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  const isEmployee = roleOption === 3;
  const isDeptMgr  = roleOption === 2;
  const useMultiSelect = isEmployee || isDeptMgr;

  const cacheDept = async (locId: string) => {
    if (deptCache[locId]) return;
    try {
      const res = await fetch(`/api/departments?location_id=${locId}`);
      const data = await res.json();
      if (Array.isArray(data)) setDeptCache(prev => ({ ...prev, [locId]: data.map((d: any) => ({ id: d.id, name: d.name })) }));
    } catch {}
  };

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

    fetch(`/api/locations?org_id=${user.org_id}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setLocations(data);
          const qLoc = searchParams.get("location_id");
          const init = qLoc && data.find((l: any) => l.id === qLoc) ? qLoc : "";
          setSelectedLocId(init);
          fetchPersonnel(init);
        }
      }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, user]);

  useEffect(() => { selLocIds.forEach(id => cacheDept(id)); }, [selLocIds]); // eslint-disable-line
  useEffect(() => { if (singleLocId) cacheDept(singleLocId); }, [singleLocId]); // eslint-disable-line

  const allSelectedDepts = useMultiSelect
    ? selLocIds.flatMap(locId => deptCache[locId] ?? [])
    : singleLocId ? (deptCache[singleLocId] ?? []) : [];

  const fetchPersonnel = async (locId: string) => {
    setLoading(true);
    try {
      const url = locId ? `/api/personnel?location_id=${locId}` : `/api/personnel?org_id=${user?.org_id}`;
      const [pRes, cRes] = await Promise.all([
        fetch(url),
        locId ? fetch(`/api/crews?location_id=${locId}`) : Promise.resolve(null),
      ]);
      const pData = await pRes.json();
      setPersonnel(Array.isArray(pData) ? pData : []);
      if (cRes) {
        const cData = await cRes.json();
        if (Array.isArray(cData)) {
          const map: Record<string, { name: string; color: string }> = {};
          cData.forEach((c: any) => { map[c.id] = { name: c.name, color: c.color ?? "#6366f1" }; });
          setCrewMap(map);
        }
      } else {
        setCrewMap({});
      }
    } finally { setLoading(false); }
  };

  const resetAddForm = () => {
    setAddForm({ name: "", email: "", phone: "", title: "", employment_type: "full_time", max_weekly_hours: 45 });
    setSelLocIds([]); setSelDeptIds([]); setSingleLocId(""); setRoleOption(3); setAddError("");
  };

  const handleAdd = async () => {
    setAddError("");
    if (!addForm.name.trim()) { setAddError("Ad soyad zorunlu"); return; }
    if (useMultiSelect && !selLocIds.length) { setAddError("En az bir şube seçmelisiniz"); return; }
    if (useMultiSelect && !selDeptIds.length) { setAddError("En az bir departman seçmelisiniz"); return; }
    if (!useMultiSelect && !singleLocId) { setAddError("Şube seçmelisiniz"); return; }
    setAddLoading(true);
    try {
      const rd = ROLE_DEFS[roleOption];
      const body: any = {
        name: addForm.name.trim(), email: addForm.email.trim() || undefined,
        phone: addForm.phone.trim() || undefined,
        role: rd.role, display_title: rd.display_title || undefined,
      };
      if (useMultiSelect) {
        body.location_ids = selLocIds; body.department_ids = selDeptIds;
        if (isEmployee) { body.title = addForm.title || undefined; body.employment_type = addForm.employment_type; body.max_weekly_hours = addForm.max_weekly_hours; }
      } else { body.location_id = singleLocId; }

      const res = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error ?? "Bir hata oluştu"); setAddLoading(false); return; }
      setInviteModal({
        name: data.user.name, username: data.credentials.username,
        tempPassword: data.credentials.temp_password,
        inviteUrl: `${window.location.origin}/setup?token=${data.inviteToken}`,
      });
      setShowAddModal(false);
      resetAddForm();
      fetchPersonnel(selectedLocId);
    } catch { setAddError("Sunucu hatası"); }
    setAddLoading(false);
  };

  const handleGenerateInvite = async (p: any) => {
    if (!p.user_id) return;
    setInviteLinkLoading(p.id);
    try {
      const res = await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: p.user_id }) });
      const data = await res.json();
      if (res.ok) { setInviteLinkModal({ name: p.name, url: `${window.location.origin}/setup?token=${data.token}` }); setInviteLinkCopied(false); }
    } finally { setInviteLinkLoading(null); }
  };

  const openEdit = (p: any) => {
    setEditingPersonnel(p);
    setEditForm({ name: p.name, phone: p.phone ?? "", title: p.title ?? "", employment_type: p.employment_type ?? "full_time", user_access_level: p.user_access_level ?? "employee" });
    setEditError("");
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPersonnel) return;
    setEditLoading(true);
    try {
      const res = await fetch(`/api/personnel?id=${editingPersonnel.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editForm) });
      if (!res.ok) { setEditError("Güncelleme hatası"); setEditLoading(false); return; }
      setEditingPersonnel(null);
      fetchPersonnel(selectedLocId);
    } catch { setEditError("Sunucu hatası"); }
    setEditLoading(false);
  };

  const filtered = personnel.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase()) ||
    p.title?.toLowerCase().includes(search.toLowerCase())
  );

  if (!mounted) return <div className="space-y-6" />;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Personel & Hesaplar</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Organizasyon geneli tüm personeli yönetin.</p>
        </div>
        <Button onClick={() => { resetAddForm(); setShowAddModal(true); }} className="bg-violet-600 hover:bg-violet-700 text-white gap-2">
          <Plus size={16} /> Yeni Hesap Ekle
        </Button>
      </div>

      {/* Filtreler */}
      <div className="flex flex-wrap gap-2 sm:gap-3">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="İsim, email veya unvan ara..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500 transition-colors" />
        </div>
        <div className="relative">
          <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select value={selectedLocId} onChange={e => { setSelectedLocId(e.target.value); fetchPersonnel(e.target.value); }}
            className="pl-9 pr-8 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:border-violet-500 appearance-none cursor-pointer">
            <option value="">Tüm Şubeler</option>
            {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Liste */}
      <Card className="stripe-card border-0 shadow-none">
        <CardHeader className="border-b border-border/40 bg-slate-50/50 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-violet-100 rounded-xl text-violet-600"><Users size={18} /></div>
            <CardTitle className="text-base font-bold">Personel Listesi</CardTitle>
            <Badge variant="secondary">{filtered.length} kişi</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Users size={32} className="mx-auto mb-3 text-slate-300" />
              <p className="font-semibold">{search ? "Arama sonucu bulunamadı." : "Henüz personel yok."}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filtered.map(p => {
                const loc = locations.find(l => l.id === p.primary_location_id);
                return (
                  <div key={p.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/50 transition-colors group">
                    <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-sm shrink-0">{p.name.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm">{p.name}</span>
                        <Badge variant={p.status === "active" ? "success" : "secondary"} className="text-[10px]">{p.status === "active" ? "Aktif" : "Pasif"}</Badge>
                        {p.user_access_level !== "employee" && (
                          <Badge variant="warning" className="text-[10px]"><Shield size={9} className="mr-1" />{ACCESS_LEVELS.find(a => a.value === p.user_access_level)?.label}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-slate-500 flex items-center gap-1"><Briefcase size={11} /> {p.title || "—"}</span>
                        <span className="text-xs text-slate-500 flex items-center gap-1"><Mail size={11} /> {p.email}</span>
                        {p.phone && <span className="text-xs text-slate-500 flex items-center gap-1"><Phone size={11} /> {p.phone}</span>}
                        {loc && <span className="text-xs text-violet-600 font-semibold flex items-center gap-1"><Building2 size={11} /> {loc.name}</span>}
                        {p.crew_id && crewMap[p.crew_id] && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: crewMap[p.crew_id].color }}>
                            {crewMap[p.crew_id].name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="text-right mr-2 hidden md:block">
                        <div className="text-sm font-bold text-slate-700">{p.prev_score ?? 0}p</div>
                        <div className="text-[10px] text-slate-400">adalet</div>
                      </div>
                      {p.user_id && (
                        <button onClick={() => handleGenerateInvite(p)} disabled={inviteLinkLoading === p.id} title="Davet Linki"
                          className="p-1.5 text-slate-300 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50">
                          {inviteLinkLoading === p.id ? <div className="w-3.5 h-3.5 border-2 border-amber-200 border-t-amber-600 rounded-full animate-spin" /> : <Link size={14} />}
                        </button>
                      )}
                      <Button variant="outline" size="icon" className="h-8 w-8 text-slate-400 hover:text-violet-600 hover:border-violet-300 opacity-0 group-hover:opacity-100" onClick={() => openEdit(p)}>
                        <Edit2 size={14} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ADD MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-slate-900">Yeni Hesap Ekle</h2>
              <button onClick={() => { setShowAddModal(false); setAddError(""); }} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"><X size={16} /></button>
            </div>

            <div className="space-y-4">
              {/* Rol seçimi */}
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 block">Rol</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_DEFS.map((rd, i) => (
                    <button key={i} type="button" onClick={() => { setRoleOption(i); setSelLocIds([]); setSelDeptIds([]); setSingleLocId(""); }}
                      className={`px-3 py-2.5 rounded-xl text-sm font-bold border transition-all text-left ${roleOption === i ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>
                      {rd.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Temel bilgiler */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Ad Soyad *</label>
                  <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Ahmet Yılmaz"
                    className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">E-posta</label>
                  <input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="ahmet@sirket.com"
                    className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Telefon</label>
                  <input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="05XX XXX XX XX"
                    className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500" />
                </div>
                {isEmployee && (
                  <>
                    <div>
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Unvan</label>
                      <input value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} placeholder="Kasiyer"
                        className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Çalışma Tipi</label>
                      <select value={addForm.employment_type} onChange={e => setAddForm(f => ({ ...f, employment_type: e.target.value }))}
                        className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500 appearance-none">
                        {EMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </>
                )}
              </div>

              {/* Şube seçimi */}
              {useMultiSelect ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Şube(ler) *</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setSelLocIds(locations.map(l => l.id)); setSelDeptIds([]); }} className="text-[11px] font-bold text-violet-600 hover:underline">Tümünü Seç</button>
                      <button type="button" onClick={() => { setSelLocIds([]); setSelDeptIds([]); }} className="text-[11px] font-bold text-slate-400 hover:underline">Temizle</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    {locations.length === 0 ? <span className="text-xs text-slate-400">Şube bulunamadı</span> : locations.map(l => (
                      <button key={l.id} type="button"
                        onClick={() => { setSelLocIds(prev => prev.includes(l.id) ? prev.filter(x => x !== l.id) : [...prev, l.id]); setSelDeptIds([]); }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1 ${selLocIds.includes(l.id) ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>
                        {selLocIds.includes(l.id) && <Check size={10} />}{l.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 block">Şube *</label>
                  <select value={singleLocId} onChange={e => setSingleLocId(e.target.value)}
                    className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500 appearance-none">
                    <option value="">Şube seçin...</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}

              {/* Departman seçimi */}
              {useMultiSelect && selLocIds.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Departman(lar) *</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setSelDeptIds(allSelectedDepts.map(d => d.id))} className="text-[11px] font-bold text-violet-600 hover:underline">Tümünü Seç</button>
                      <button type="button" onClick={() => setSelDeptIds([])} className="text-[11px] font-bold text-slate-400 hover:underline">Temizle</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    {allSelectedDepts.length === 0 ? <span className="text-xs text-slate-400">Seçili şubeler için departman bulunamadı</span> : allSelectedDepts.map(d => (
                      <button key={d.id} type="button"
                        onClick={() => setSelDeptIds(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1 ${selDeptIds.includes(d.id) ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>
                        {selDeptIds.includes(d.id) && <Check size={10} />}{d.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {addError && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600 font-medium">{addError}</div>}

              <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-xs text-violet-700 flex items-center gap-2">
                <Link size={12} className="shrink-0" />
                Oluşturduktan sonra <strong className="ml-1">davet linki</strong>&nbsp;ve geçici şifre gösterilecek.
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => { setShowAddModal(false); setAddError(""); }} className="flex-1">İptal</Button>
              <Button onClick={handleAdd} disabled={addLoading} className="flex-[2] bg-violet-600 hover:bg-violet-700 text-white gap-2">
                {addLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Check size={16} /> Hesap Oluştur</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* POST-CREATION INVITE MODAL */}
      {inviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center shrink-0"><Check size={24} className="text-emerald-600" /></div>
              <div>
                <p className="font-black text-slate-900">{inviteModal.name} oluşturuldu!</p>
                <p className="text-xs text-slate-500 mt-0.5">Personele aşağıdakilerden birini iletin</p>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Davet Linki (Önerilen)</p>
                <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">7 gün geçerli</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2">
                <p className="text-[11px] font-mono text-slate-600 truncate flex-1">{inviteModal.inviteUrl}</p>
                <button onClick={() => { navigator.clipboard.writeText(inviteModal.inviteUrl); setInviteCopied(true); setTimeout(() => setInviteCopied(false), 2000); }}
                  className={cn("shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors", inviteCopied ? "bg-emerald-500 text-white" : "bg-violet-600 text-white hover:bg-violet-700")}>
                  {inviteCopied ? <><Check size={12} /> Kopyalandı</> : <><Copy size={12} /> Kopyala</>}
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Geçici Şifre (Yedek)</p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Kullanıcı adı:</span>
                  <span className="font-mono font-bold text-slate-800 text-sm">{inviteModal.username}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Geçici şifre:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-violet-600 text-sm">{inviteModal.tempPassword}</span>
                    <button onClick={() => { navigator.clipboard.writeText(inviteModal.tempPassword); setPassCopied(true); setTimeout(() => setPassCopied(false), 2000); }} className={cn("p-1 rounded", passCopied ? "text-emerald-600" : "text-slate-400 hover:text-slate-600")}>
                      {passCopied ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <Button onClick={() => { setInviteModal(null); setInviteCopied(false); setPassCopied(false); }} className="w-full bg-slate-800 hover:bg-slate-900 text-white">Tamam, Kapat</Button>
          </div>
        </div>
      )}

      {/* INVITE LINK MODAL (existing) */}
      {inviteLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setInviteLinkModal(null)}>
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0"><Link size={18} className="text-amber-600" /></div>
              <div>
                <p className="text-sm font-black text-slate-900">{inviteLinkModal.name}</p>
                <p className="text-xs text-slate-500">Davet linki — 7 gün geçerli</p>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-[11px] text-slate-500 font-mono break-all leading-relaxed">{inviteLinkModal.url}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setInviteLinkModal(null)} className="flex-1">Kapat</Button>
              <button onClick={() => { navigator.clipboard.writeText(inviteLinkModal.url); setInviteLinkCopied(true); setTimeout(() => setInviteLinkCopied(false), 2000); }}
                className={cn("flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-colors", inviteLinkCopied ? "bg-emerald-500 text-white" : "bg-amber-500 hover:bg-amber-600 text-white")}>
                {inviteLinkCopied ? <><Check size={14} /> Kopyalandı!</> : <><Copy size={14} /> Kopyala</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingPersonnel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setEditingPersonnel(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-slate-900">Personel Düzenle</h2>
              <button onClick={() => setEditingPersonnel(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"><X size={16} /></button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              {editError && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600 font-medium">{editError}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Ad Soyad</label>
                  <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Telefon</label>
                  <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Unvan</label>
                  <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Çalışma Tipi</label>
                  <select value={editForm.employment_type} onChange={e => setEditForm(f => ({ ...f, employment_type: e.target.value }))}
                    className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500 appearance-none">
                    {EMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Rol / Yetki</label>
                  <select value={editForm.user_access_level} onChange={e => setEditForm(f => ({ ...f, user_access_level: e.target.value }))}
                    className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500 appearance-none">
                    {ACCESS_LEVELS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditingPersonnel(null)} className="flex-1">İptal</Button>
                <Button type="submit" disabled={editLoading} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white">
                  {editLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Kaydet"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
