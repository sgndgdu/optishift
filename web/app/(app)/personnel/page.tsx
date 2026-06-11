"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users, Plus, Search, Edit2, Trash2, Key, X, Check, Copy,
  Phone, Mail, Briefcase, Shield, ChevronDown, Upload
} from "lucide-react";

type Personnel = {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string;
  title: string;
  employment_type: string;
  status: string;
  user_access_level: string;
  prev_score: number;
  hero_count: number;
  roles: string[];
  weekly_off_day: number | null;
};

const ROLES = [
  { value: "employee", label: "Personel" },
  { value: "manager", label: "Müdür Yardımcısı" },
];

const EMP_TYPES = [
  { value: "full_time", label: "Tam Zamanlı" },
  { value: "part_time", label: "Yarı Zamanlı" },
  { value: "intern", label: "Stajyer" },
];

export default function PersonnelManagementPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [resetLinkModal, setResetLinkModal] = useState<{ name: string; url: string } | null>(null);
  const [resetLinkCopied, setResetLinkCopied] = useState(false);
  const [resetLinkLoading, setResetLinkLoading] = useState<string | null>(null);

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkResults, setBulkResults] = useState<any[]>([]);

  const [newForm, setNewForm] = useState({
    name: "", email: "", phone: "", title: "", employment_type: "full_time", role: "employee",
  });
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Edit modal state
  const [editingPersonnel, setEditingPersonnel] = useState<Personnel | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", title: "", employment_type: "full_time", user_access_level: "employee", roles: [] as string[], weekly_off_day: null as number | null });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  const fetchPersonnel = async (u: any) => {
    setLoading(true);
    try {
      // Şef ise kendi departmanı, sahip/supervisor ise tüm şube
      const param = u.department_id
        ? `department_id=${u.department_id}`
        : `location_id=${u.location_id}`;
      const res = await fetch(`/api/personnel?${param}`);
      const data = await res.json();
      setPersonnel(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_manager_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (!parsed) { router.push("/login"); return; }
      setUser(parsed);
      setMounted(true);
    } catch { router.push("/login"); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchPersonnel(user);

    // Load departments from settings localStorage
    try {
      const locId = localStorage.getItem("optishift_selected_location") || user.location_id;
      const raw = localStorage.getItem(`optishift_settings_mock_${locId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.departments)) setDepartments(parsed.departments);
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router]);

  const handleAdd = async () => {
    setAddError("");
    if (!newForm.name || !newForm.email) { setAddError("Ad ve email zorunlu"); return; }
    setAddLoading(true);
    try {
      const res = await fetch("/api/personnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: user.org_id,
          location_id: user.location_id,
          department_id: user.department_id ?? null,
          ...newForm,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402 && data.upgrade) {
          setAddError(`${data.error} → Faturalandırma sayfasından planınızı yükseltin.`);
        } else {
          setAddError(data.error);
        }
        setAddLoading(false);
        return;
      }
      setTempPassword(data.temp_password);
      setShowAddModal(false);
      setNewForm({ name: "", email: "", phone: "", title: "", employment_type: "full_time", role: "employee" });
      fetchPersonnel(user);
    } catch { setAddError("Sunucu hatası"); }
    setAddLoading(false);
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm("Bu personeli devre dışı bırakmak istediğinize emin misiniz?")) return;
    await fetch(`/api/personnel?id=${id}`, { method: "DELETE" });
    fetchPersonnel(user);
  };

  const handleGenerateResetLink = async (p: Personnel) => {
    if (!p.user_id) return;
    setResetLinkLoading(p.id);
    try {
      const res = await fetch("/api/auth/admin-reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: p.user_id }),
      });
      const data = await res.json();
      if (res.ok) {
        setResetLinkModal({ name: p.name, url: data.resetUrl });
        setResetLinkCopied(false);
      }
    } finally {
      setResetLinkLoading(null);
    }
  };

  const openEdit = (p: Personnel) => {
    setEditingPersonnel(p);
    setEditForm({
      name: p.name,
      phone: p.phone || "",
      title: p.title || "",
      employment_type: p.employment_type || "full_time",
      user_access_level: p.user_access_level || "employee",
      roles: Array.isArray(p.roles) ? p.roles : [],
      weekly_off_day: p.weekly_off_day ?? null,
    });
    setEditError("");
  };

  const handleEdit = async () => {
    if (!editingPersonnel) return;
    setEditLoading(true);
    setEditError("");
    try {
      const res = await fetch(`/api/personnel?id=${editingPersonnel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error || "Güncelleme hatası"); setEditLoading(false); return; }
      setEditingPersonnel(null);
      fetchPersonnel(user);
    } catch { setEditError("Sunucu hatası"); }
    setEditLoading(false);
  };

  const handleBulkUpload = async () => {
    setAddError("");
    if (!bulkText.trim()) return;
    
    setAddLoading(true);
    const lines = bulkText.trim().split("\n");
    const list = lines.map(line => {
      const parts = line.split("\t"); // Assuming Excel copy (TSV)
      return {
        name: parts[0]?.trim(),
        email: parts[1]?.trim(),
        phone: parts[2]?.trim(),
        title: parts[3]?.trim()
      };
    }).filter(p => p.name && p.email);

    try {
      const res = await fetch("/api/personnel/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: user.org_id,
          location_id: user.location_id,
          personnel_list: list,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error); setAddLoading(false); return; }
      
      setBulkResults(data.results);
      setBulkText("");
      fetchPersonnel(user);
    } catch { setAddError("Sunucu hatası"); }
    setAddLoading(false);
  };

  const filtered = personnel.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.email?.toLowerCase().includes(search.toLowerCase()) ||
      p.title?.toLowerCase().includes(search.toLowerCase())
  );

  if (!mounted) return <div className="space-y-6 max-w-5xl" />;

  const active = personnel.filter(p => p.status === "active").length;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Personel Yönetimi</h1>
          <p className="text-slate-500 text-sm mt-0.5">{active} aktif çalışan</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowBulkModal(true)}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-bold px-3 md:px-4 py-2 md:py-2.5 rounded-xl transition-colors shadow-sm"
          >
            <Upload size={16} /> <span className="hidden sm:inline">Toplu Yükle</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-3 md:px-5 py-2 md:py-2.5 rounded-xl transition-colors shadow-md shadow-indigo-100"
          >
            <Plus size={16} /> <span className="hidden sm:inline">Personel Ekle</span><span className="sm:hidden">Ekle</span>
          </button>
        </div>
      </div>

      {/* Temp password banner */}
      {tempPassword && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-emerald-800 text-sm">✅ Personel eklendi!</p>
            <p className="text-emerald-700 text-sm mt-1">
              Geçici şifre: <span className="font-mono font-bold bg-emerald-100 px-2 py-0.5 rounded">{tempPassword}</span>
              — Bu şifreyi personele iletin, giriş yapıp değiştirebilirler.
            </p>
          </div>
          <button onClick={() => setTempPassword(null)} className="text-emerald-500 hover:text-emerald-700">
            <X size={18} />
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="İsim, email veya unvan ara..."
          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 shadow-sm"
        />
      </div>

      {/* Personnel List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse flex gap-4">
              <div className="w-12 h-12 bg-slate-100 rounded-full" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-4 bg-slate-100 rounded w-1/3" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <Users size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">
            {search ? "Arama sonucu bulunamadı" : "Henüz personel yok"}
          </p>
          {!search && (
            <button onClick={() => setShowAddModal(true)} className="mt-4 text-indigo-600 font-bold text-sm hover:underline">
              + İlk personeli ekle
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
          {filtered.map((p) => (
            <div
              key={p.id}
              className={`group bg-white rounded-3xl p-5 flex items-start gap-4 transition-all duration-300 border border-slate-200/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 h-full ${p.status === "inactive" ? "opacity-60 bg-slate-50" : ""}`}
            >
              {/* Avatar */}
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-extrabold text-xl shrink-0 shadow-sm ${p.user_access_level === "manager" ? "bg-gradient-to-br from-purple-100 to-purple-200 text-purple-700 border border-purple-200" : "bg-gradient-to-br from-indigo-100 to-indigo-200 text-indigo-700 border border-indigo-200"}`}>
                {p.name.charAt(0)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-slate-800 text-base truncate">{p.name}</h3>
                    <p className="text-xs font-medium text-slate-500 mt-0.5 truncate">{p.email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border ${p.user_access_level === "manager" ? "bg-purple-50 text-purple-700 border-purple-100" : "bg-slate-50 text-slate-600 border-slate-200"}`}>
                      {p.user_access_level === "manager" ? "Yönetici" : "Personel"}
                    </span>
                    {p.status === "inactive" && (
                      <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-lg bg-red-50 text-red-600 border border-red-100">Pasif</span>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unvan / Rol</span>
                    <span className="text-xs font-semibold text-slate-700 truncate">{p.title || "Belirtilmedi"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Telefon</span>
                    <span className="text-xs font-semibold text-slate-700 flex items-center gap-1"><Phone size={12} className="text-slate-400"/> {p.phone || "—"}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {Array.isArray(p.roles) && p.roles.map(r => (
                    <span key={r} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">{r}</span>
                  ))}
                  {p.weekly_off_day !== null && p.weekly_off_day !== undefined && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      İzin: {["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"][p.weekly_off_day]}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 mt-4 bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-500">Adalet Skoru: <strong className="text-indigo-600">{p.prev_score}</strong></span>
                    {p.hero_count > 0 && <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100 flex items-center gap-1">⭐ {p.hero_count}x</span>}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(p)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Düzenle"
                    >
                      <Edit2 size={15} />
                    </button>
                    {p.user_id && (
                      <button
                        onClick={() => handleGenerateResetLink(p)}
                        disabled={resetLinkLoading === p.id}
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Şifre Sıfırlama Linki Oluştur"
                      >
                        {resetLinkLoading === p.id
                          ? <div className="w-3.5 h-3.5 border-2 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
                          : <Key size={15} />
                        }
                      </button>
                    )}
                    {p.status === "active" && (
                      <button
                        onClick={() => handleDeactivate(p.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Devre dışı bırak"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* EDIT MODAL */}
      {editingPersonnel && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 pb-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Personel Düzenle</h2>
                <p className="text-sm text-slate-500 mt-0.5">{editingPersonnel.email}</p>
              </div>
              <button onClick={() => setEditingPersonnel(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">Ad Soyad</label>
                  <input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">Unvan</label>
                  <input value={editForm.title} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))} placeholder="Barista, Kasiyer..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 mb-1.5 block">Telefon</label>
                <input value={editForm.phone} onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="+90 532 ..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">Çalışma Tipi</label>
                  <select value={editForm.employment_type} onChange={(e) => setEditForm(f => ({ ...f, employment_type: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400">
                    {EMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">Sistem Rolü</label>
                  <select value={editForm.user_access_level} onChange={(e) => setEditForm(f => ({ ...f, user_access_level: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400">
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              </div>

              {departments.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-2 block">Bölge / Zon Ataması</label>
                  <div className="flex flex-wrap gap-2">
                    {departments.map(dept => {
                      const selected = editForm.roles.includes(dept.name);
                      return (
                        <button
                          key={dept.id}
                          type="button"
                          onClick={() => setEditForm(f => ({
                            ...f,
                            roles: selected
                              ? f.roles.filter(r => r !== dept.name)
                              : [...f.roles, dept.name],
                          }))}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                            selected
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
                          }`}
                        >
                          {selected && <Check size={10} className="inline mr-1" />}
                          {dept.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">Seçilen bölgeler vardiya planında personelin kartında görünür.</p>
                </div>
              )}

              {/* Sabit İzin Günü */}
              <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3.5">
                <label className="text-xs font-bold text-slate-600 mb-1.5 block">Sabit Haftalık İzin Günü</label>
                <select
                  value={editForm.weekly_off_day === null ? "" : String(editForm.weekly_off_day)}
                  onChange={e => setEditForm(f => ({ ...f, weekly_off_day: e.target.value === "" ? null : Number(e.target.value) }))}
                  className="w-full border border-amber-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-indigo-400"
                >
                  <option value="">Tanımsız (esnek çalışma)</option>
                  {["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi","Pazar"].map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
                <p className="text-[10px] text-amber-700 mt-1.5">OR-Tools bu günü her hafta otomatik bloklar. Part-time için "Tanımsız" bırakın.</p>
              </div>

              {editError && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{editError}</div>}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditingPersonnel(null)} className="flex-1 border border-slate-200 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50">İptal</button>
              <button onClick={handleEdit} disabled={editLoading} className="flex-[2] bg-indigo-600 disabled:bg-indigo-400 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 flex items-center justify-center gap-2">
                {editLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Check size={16} /> Kaydet</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 pb-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-800">Yeni Personel Ekle</h2>
              <button onClick={() => { setShowAddModal(false); setAddError(""); }} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">Ad Soyad *</label>
                  <input value={newForm.name} onChange={(e) => setNewForm(f => ({ ...f, name: e.target.value }))} placeholder="Ahmet Yılmaz" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">Unvan</label>
                  <input value={newForm.title} onChange={(e) => setNewForm(f => ({ ...f, title: e.target.value }))} placeholder="Barista" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 mb-1.5 block">E-posta *</label>
                <input type="email" value={newForm.email} onChange={(e) => setNewForm(f => ({ ...f, email: e.target.value }))} placeholder="personel@sirket.com" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 mb-1.5 block">Telefon</label>
                <input value={newForm.phone} onChange={(e) => setNewForm(f => ({ ...f, phone: e.target.value }))} placeholder="+90 532 ..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">Çalışma Tipi</label>
                  <select value={newForm.employment_type} onChange={(e) => setNewForm(f => ({ ...f, employment_type: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400">
                    {EMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">Rol</label>
                  <select value={newForm.role} onChange={(e) => setNewForm(f => ({ ...f, role: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400">
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              </div>

              {addError && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{addError}</div>}

              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
                <Key size={12} className="inline mr-1" />
                Sistem otomatik bir geçici şifre oluşturacak — personele iletmeniz gerekecek.
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowAddModal(false); setAddError(""); }} className="flex-1 border border-slate-200 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50">İptal</button>
              <button onClick={handleAdd} disabled={addLoading} className="flex-[2] bg-indigo-600 disabled:bg-indigo-400 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 flex items-center justify-center gap-2">
                {addLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Check size={16} /> Ekle & Davet Et</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK UPLOAD MODAL */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Excel&apos;den Toplu Yükle</h2>
                <p className="text-sm text-slate-500 mt-1">Excel tablosunu kopyalayıp aşağıdaki alana yapıştırın.</p>
              </div>
              <button onClick={() => { setShowBulkModal(false); setBulkResults([]); setBulkText(""); }} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400">
                <X size={20} />
              </button>
            </div>

            {bulkResults.length > 0 ? (
              <div className="flex-1 overflow-auto">
                <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl mb-4 font-bold text-sm flex items-center gap-2">
                  <Check size={18} /> {bulkResults.length} personel başarıyla eklendi!
                </div>
                <p className="text-xs text-slate-500 mb-3 font-medium">Bu şifreleri personellerinize iletmeyi unutmayın (sayfayı kapattığınızda şifreleri göremezsiniz).</p>
                <div className="space-y-2">
                  {bulkResults.map((r, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-lg text-sm">
                      <div>
                        <div className="font-bold text-slate-800">{r.name}</div>
                        <div className="text-xs text-slate-500">{r.email}</div>
                      </div>
                      <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg font-mono font-bold text-indigo-600">
                        {r.temp_password}
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => { setShowBulkModal(false); setBulkResults([]); }} className="w-full mt-6 bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900">
                  Kapat
                </button>
              </div>
            ) : (
              <>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
                  <div className="text-xs font-bold text-slate-600 mb-2">Beklenen Format (Sütunlar)</div>
                  <div className="flex text-xs font-mono bg-white border border-slate-200 p-2 rounded text-slate-500">
                    <div className="flex-1 font-bold text-slate-700">Ad Soyad</div>
                    <div className="flex-1 font-bold text-slate-700">E-posta</div>
                    <div className="flex-1">Telefon (Ops)</div>
                    <div className="flex-1">Unvan (Ops)</div>
                  </div>
                </div>

                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder="Excel'den buraya yapıştırın..."
                  className="w-full flex-1 min-h-[200px] border border-slate-200 rounded-xl p-4 text-sm font-mono whitespace-pre focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 transition-all resize-none"
                />

                {addError && <div className="mt-4 bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{addError}</div>}

                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowBulkModal(false)} className="flex-1 border border-slate-200 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50">İptal</button>
                  <button onClick={handleBulkUpload} disabled={addLoading || !bulkText.trim()} className="flex-[2] bg-indigo-600 disabled:bg-indigo-400 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 flex items-center justify-center gap-2">
                    {addLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Upload size={16} /> Kayıtları Yükle</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Reset Link Modal */}
      {resetLinkModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setResetLinkModal(null)}>
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-5"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                <Key size={18} className="text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">{resetLinkModal.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">Şifre sıfırlama linki — 1 saat geçerli</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-[11px] text-slate-500 font-mono break-all leading-relaxed">{resetLinkModal.url}</p>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Bu linki personele <strong>WhatsApp, SMS veya e-posta</strong> ile iletin. Link 1 saat sonra geçersiz olur.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setResetLinkModal(null)}
                className="flex-1 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Kapat
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(resetLinkModal.url);
                  setResetLinkCopied(true);
                  setTimeout(() => setResetLinkCopied(false), 2000);
                }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
                  resetLinkCopied
                    ? "bg-emerald-500 text-white"
                    : "bg-amber-500 hover:bg-amber-600 text-white"
                }`}
              >
                {resetLinkCopied ? <><Check size={14} /> Kopyalandı!</> : <><Copy size={14} /> Kopyala</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
