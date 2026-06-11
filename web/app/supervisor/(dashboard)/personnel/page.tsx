"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Users, Plus, Search, Edit2, X, Check,
  Phone, Mail, Briefcase, Shield, Building2, ChevronDown,
  Link2, Copy, UserPlus,
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

export default function SupervisorPersonnelPage() {
  return <Suspense><SupervisorPersonnelInner /></Suspense>;
}

function SupervisorPersonnelInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocId, setSelectedLocId] = useState<string>("");
  const [personnel, setPersonnel] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPersonnel, setEditingPersonnel] = useState<any>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const [newForm, setNewForm] = useState({
    name: "", email: "", phone: "", title: "",
    employment_type: "full_time", role: "employee",
    location_id: "",
  });
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const [editForm, setEditForm] = useState({
    name: "", phone: "", title: "",
    employment_type: "full_time", user_access_level: "employee",
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  // Davet linki
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("employee");
  const [inviteLocId, setInviteLocId] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);


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
          setNewForm(f => ({ ...f, location_id: data[0]?.id ?? "" }));
          fetchPersonnel(init, data);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, user]);

  const fetchPersonnel = async (locId: string, locs: any[] = locations) => {
    setLoading(true);
    try {
      const url = locId
        ? `/api/personnel?location_id=${locId}`
        : `/api/personnel?org_id=${user.org_id}`;
      const res = await fetch(url);
      const data = await res.json();
      setPersonnel(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
    void locs;
  };

  const handleLocChange = (id: string) => {
    setSelectedLocId(id);
    fetchPersonnel(id);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    setAddLoading(true);
    try {
      const res = await fetch("/api/personnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: user.org_id,
          location_id: newForm.location_id || locations[0]?.id,
          name: newForm.name,
          email: newForm.email,
          phone: newForm.phone,
          title: newForm.title,
          employment_type: newForm.employment_type,
          role: newForm.role,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error ?? "Hata"); setAddLoading(false); return; }
      setTempPassword(data.temp_password);
      setNewForm({ name: "", email: "", phone: "", title: "", employment_type: "full_time", role: "employee", location_id: locations[0]?.id ?? "" });
      await fetchPersonnel(selectedLocId);
    } catch {
      setAddError("Sunucu hatası");
    }
    setAddLoading(false);
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
      const res = await fetch(`/api/personnel?id=${editingPersonnel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) { setEditError("Güncelleme hatası"); setEditLoading(false); return; }
      setEditingPersonnel(null);
      await fetchPersonnel(selectedLocId);
    } catch {
      setEditError("Sunucu hatası");
    }
    setEditLoading(false);
  };

  const handleCreateInvite = async () => {
    if (!inviteLocId) return;
    setInviteLoading(true);
    setInviteLink("");
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: user.org_id,
          location_id: inviteLocId,
          invited_name: inviteName.trim() || null,
          role: inviteRole,
          created_by: user.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setInviteLoading(false); return; }
      setInviteLink(window.location.origin + data.link);
    } catch {}
    setInviteLoading(false);
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
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Personel</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Organizasyon geneli tüm personeli yönetin.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={() => { setShowInviteModal(true); setInviteLink(""); setInviteName(""); setInviteLocId(selectedLocId || locations[0]?.id || ""); setInviteRole("employee"); }}
            className="gap-2 flex-1 sm:flex-none"
          >
            <UserPlus size={16} />
            Davet Linki
          </Button>
          <Button
            onClick={() => { setShowAddModal(true); setTempPassword(null); setAddError(""); }}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-2 flex-1 sm:flex-none"
          >
            <Plus size={16} />
            Personel Ekle
          </Button>
        </div>
      </div>

      {/* Filtreler */}
      <div className="flex flex-wrap gap-2 sm:gap-3">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="İsim, email veya unvan ara..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>

        <div className="relative">
          <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={selectedLocId}
            onChange={e => handleLocChange(e.target.value)}
            className="pl-9 pr-8 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:border-violet-500 appearance-none cursor-pointer"
          >
            <option value="">Tüm Şubeler</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Personel Listesi */}
      <Card className="stripe-card border-0 shadow-none">
        <CardHeader className="border-b border-border/40 bg-slate-50/50 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-violet-100 rounded-xl text-violet-600">
              <Users size={18} />
            </div>
            <CardTitle className="text-base font-bold">Personel Listesi</CardTitle>
            <Badge variant="secondary">{filtered.length} kişi</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
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
                  <div key={p.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/50 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-sm shrink-0">
                      {p.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm">{p.name}</span>
                        <Badge variant={p.status === "active" ? "success" : "secondary"} className="text-[10px]">
                          {p.status === "active" ? "Aktif" : "Pasif"}
                        </Badge>
                        {p.user_access_level !== "employee" && (
                          <Badge variant="warning" className="text-[10px]">
                            <Shield size={9} className="mr-1" />
                            {ACCESS_LEVELS.find(a => a.value === p.user_access_level)?.label}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Briefcase size={11} /> {p.title || "—"}
                        </span>
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Mail size={11} /> {p.email}
                        </span>
                        {p.phone && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Phone size={11} /> {p.phone}
                          </span>
                        )}
                        {loc && (
                          <span className="text-xs text-violet-600 font-semibold flex items-center gap-1">
                            <Building2 size={11} /> {loc.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right mr-2 hidden md:block">
                        <div className="text-sm font-bold text-slate-700">{p.prev_score ?? 0}p</div>
                        <div className="text-[10px] text-slate-400">adalet</div>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-violet-600 hover:border-violet-300"
                        onClick={() => openEdit(p)}
                      >
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

      {/* Personel Ekle Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => { if (!tempPassword) setShowAddModal(false); }} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-slate-900">Yeni Personel Ekle</h2>
              <button onClick={() => { setShowAddModal(false); setTempPassword(null); }} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
                <X size={16} />
              </button>
            </div>

            {tempPassword ? (
              <div className="text-center space-y-4 py-4">
                <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
                  <Check size={28} className="text-emerald-600" />
                </div>
                <h3 className="font-bold text-slate-800">Personel eklendi!</h3>
                <p className="text-sm text-slate-500">Geçici şifre aşağıda. Personele iletin:</p>
                <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 font-mono text-2xl font-bold tracking-widest text-slate-800">
                  {tempPassword}
                </div>
                <Button onClick={() => { setShowAddModal(false); setTempPassword(null); }} className="w-full bg-violet-600 hover:bg-violet-700 text-white">
                  Tamam
                </Button>
              </div>
            ) : (
              <form onSubmit={handleAdd} className="space-y-4">
                {addError && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600 font-medium">{addError}</div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Ad Soyad *</label>
                    <input required value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Ahmet Yılmaz"
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">E-posta *</label>
                    <input required type="email" value={newForm.email} onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="ahmet@sirket.com"
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Telefon</label>
                    <input value={newForm.phone} onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="05XX XXX XX XX"
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Unvan</label>
                    <input value={newForm.title} onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Kasiyer"
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Şube *</label>
                    <select value={newForm.location_id} onChange={e => setNewForm(f => ({ ...f, location_id: e.target.value }))}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500 appearance-none">
                      {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Çalışma Tipi</label>
                    <select value={newForm.employment_type} onChange={e => setNewForm(f => ({ ...f, employment_type: e.target.value }))}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500 appearance-none">
                      {EMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Rol / Yetki</label>
                    <select value={newForm.role} onChange={e => setNewForm(f => ({ ...f, role: e.target.value }))}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500 appearance-none">
                      {ACCESS_LEVELS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowAddModal(false)} className="flex-1">İptal</Button>
                  <Button type="submit" disabled={addLoading} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white">
                    {addLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Ekle"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Davet Linki Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => { if (!inviteLink) setShowInviteModal(false); }} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-black text-slate-900">Davet Linki Oluştur</h2>
                <p className="text-xs text-slate-400 mt-0.5">Link 7 gün geçerlidir, tek kullanımlıktır.</p>
              </div>
              <button onClick={() => setShowInviteModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Şube *</label>
                <select
                  value={inviteLocId}
                  onChange={e => setInviteLocId(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500 appearance-none"
                >
                  <option value="">Şube seçin</option>
                  {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Davet Edilen Kişi (opsiyonel)</label>
                <input
                  value={inviteName}
                  onChange={e => setInviteName(e.target.value)}
                  placeholder="Zeynep Arslan"
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">Girilirse form otomatik doldurulur.</p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Rol</label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500 appearance-none"
                >
                  <option value="employee">Personel</option>
                  <option value="manager">Müdür</option>
                </select>
              </div>

              {inviteLink ? (
                <div className="space-y-3 pt-2">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2">
                    <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Davet Linki Hazır</p>
                    <p className="text-xs text-emerald-600 font-mono break-all">{inviteLink}</p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(inviteLink);
                      setInviteCopied(true);
                      setTimeout(() => setInviteCopied(false), 2000);
                    }}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-colors",
                      inviteCopied
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-900 hover:bg-black text-white"
                    )}
                  >
                    {inviteCopied ? <><Check size={16} /> Kopyalandı!</> : <><Copy size={16} /> Linki Kopyala</>}
                  </button>
                  <button
                    onClick={() => { setInviteLink(""); setInviteName(""); setInviteRole("employee"); }}
                    className="w-full text-sm text-slate-500 hover:text-slate-700 font-medium py-2"
                  >
                    Yeni link oluştur
                  </button>
                </div>
              ) : (
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowInviteModal(false)} className="flex-1">İptal</Button>
                  <Button
                    type="button"
                    disabled={inviteLoading || !inviteLocId}
                    onClick={handleCreateInvite}
                    className="flex-1 bg-violet-600 hover:bg-violet-700 text-white gap-2"
                  >
                    {inviteLoading
                      ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <><Link2 size={15} /> Oluştur</>
                    }
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Düzenle Modal */}
      {editingPersonnel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setEditingPersonnel(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-slate-900">Personel Düzenle</h2>
              <button onClick={() => setEditingPersonnel(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              {editError && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600 font-medium">{editError}</div>}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Ad Soyad</label>
                  <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    className={cn("w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-violet-500")} />
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
