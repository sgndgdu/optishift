"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users, Plus, Search, Edit2, Trash2, X, Check, Copy,
  Phone, Mail, Link, Upload, CheckCircle, AlertCircle,
} from "lucide-react";

type MergedPerson = {
  userId: string;
  personnelId: string | null;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: string;
  display_title: string | null;
  approval_status: string;
  is_temp_password: boolean;
  title: string | null;
  employment_type: string | null;
  prev_score: number;
  hero_count: number;
  roles: string[];
  weekly_off_day: number | null;
  max_weekly_hours: number | null;
  min_weekly_hours: number | null;
  location_id: string | null;
  crew_id: string | null;
  ytd_overtime_hours: number | null;
  hourly_wage: number | null;
  night_restriction: string | null;
  hire_date: string | null;
  annual_leave_days_total: number | null;
  leave_adjustment_days: number | null;
};

const ROLE_DEFS = [
  { label: "Şube Müdürü", role: "manager", display_title: "Şube Müdürü" },
  { label: "Müdür Yardımcısı", role: "manager", display_title: "Müdür Yardımcısı" },
  { label: "Departman Müdürü", role: "manager", display_title: "Departman Müdürü" },
  { label: "Personel", role: "employee", display_title: "" },
];

const EMP_TYPES = [
  { value: "full_time", label: "Tam Zamanlı" },
  { value: "part_time", label: "Yarı Zamanlı" },
  { value: "intern", label: "Stajyer" },
];

const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

export default function PersonnelPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [persons, setPersons] = useState<MergedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [deptCache, setDeptCache] = useState<Record<string, { id: string; name: string }[]>>({});

  // Add form
  const [showAddModal, setShowAddModal] = useState(false);
  const [roleOption, setRoleOption] = useState(3);
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

  // Invite link for existing user
  const [inviteLinkModal, setInviteLinkModal] = useState<{ name: string; url: string } | null>(null);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [inviteLinkLoading, setInviteLinkLoading] = useState<string | null>(null);

  // Edit modal
  const [editingPerson, setEditingPerson] = useState<MergedPerson | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", title: "", employment_type: "full_time", weekly_off_day: null as number | null, max_weekly_hours: 45, min_weekly_hours: 0, roles: [] as string[], crew_id: null as string | null, hourly_wage: null as number | null, night_restriction: null as string | null, hire_date: "" as string, annual_leave_days_total: 14, leave_adjustment_days: 0 });
  const [crewList, setCrewList] = useState<{ id: string; name: string; color: string }[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  // Bulk upload
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkResults, setBulkResults] = useState<any[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState("");

  const [toast, setToast] = useState("");
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  const isEmployee = roleOption === 3;
  const isDeptMgr = roleOption === 2;
  const useMultiSelect = isEmployee || isDeptMgr;

  const fetchData = async (u: any) => {
    setLoading(true);
    try {
      const [usersRes, personnelRes, crewRes] = await Promise.all([
        fetch("/api/users"),
        fetch(`/api/personnel?location_id=${u.location_id}`),
        fetch(`/api/crews?location_id=${u.location_id}`),
      ]);
      const users = await usersRes.json();
      const personnelList = await personnelRes.json();
      const crewData = await crewRes.json();
      if (Array.isArray(crewData)) setCrewList(crewData.map((c: any) => ({ id: c.id, name: c.name, color: c.color ?? "#6366f1" })));
      const pMap = new Map<string, any>();
      if (Array.isArray(personnelList)) personnelList.forEach((p: any) => pMap.set(p.id, p));
      const merged: MergedPerson[] = (Array.isArray(users) ? users : []).map((u: any) => {
        const p = u.personnel_id ? pMap.get(u.personnel_id) : undefined;
        return {
          userId: u.id, personnelId: u.personnel_id, name: u.name, username: u.username,
          email: u.email, phone: u.phone, role: u.role, display_title: u.display_title,
          approval_status: u.approval_status, is_temp_password: !!u.is_temp_password,
          title: p?.title ?? null, employment_type: p?.employment_type ?? null,
          prev_score: p?.prev_score ?? 0, hero_count: p?.hero_count ?? 0,
          roles: Array.isArray(p?.roles) ? p.roles : [],
          weekly_off_day: p?.weekly_off_day ?? null, max_weekly_hours: p?.max_weekly_hours ?? null,
          min_weekly_hours: p?.min_weekly_hours ?? null, location_id: u.location_id,
          crew_id: p?.crew_id ?? null,
          ytd_overtime_hours: p?.ytd_overtime_hours ?? null,
          hourly_wage: p?.hourly_wage ?? null,
          night_restriction: p?.night_restriction ?? null,
          hire_date: p?.hire_date ?? null,
          annual_leave_days_total: p?.annual_leave_days_total ?? null,
          leave_adjustment_days: p?.leave_adjustment_days ?? null,
        };
      });
      setPersons(merged);
    } finally { setLoading(false); }
  };

  const cacheDept = async (locId: string, cache: Record<string, any[]>) => {
    if (cache[locId]) return;
    try {
      const res = await fetch(`/api/departments?location_id=${locId}`);
      const data = await res.json();
      if (Array.isArray(data)) setDeptCache(prev => ({ ...prev, [locId]: data.map((d: any) => ({ id: d.id, name: d.name })) }));
    } catch {}
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_manager_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (!parsed) { router.push("/login"); return; }
      setAuthUser(parsed);
      setMounted(true);
    } catch { router.push("/login"); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authUser) return;
    fetchData(authUser);
    fetch("/api/locations").then(r => r.json()).then(data => {
      if (Array.isArray(data)) setLocations(data.map((l: any) => ({ id: l.id, name: l.name })));
    }).catch(() => {});
    if (authUser.location_id) cacheDept(authUser.location_id, deptCache);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

  useEffect(() => {
    selLocIds.forEach(locId => cacheDept(locId, deptCache));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selLocIds]);

  useEffect(() => {
    if (singleLocId) cacheDept(singleLocId, deptCache);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleLocId]);

  const allSelectedDepts = useMultiSelect
    ? selLocIds.flatMap(locId => deptCache[locId] ?? [])
    : singleLocId ? (deptCache[singleLocId] ?? []) : [];

  const toggleLoc = (id: string) => {
    setSelLocIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setSelDeptIds([]);
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
        phone: addForm.phone.trim() || undefined, role: rd.role,
        display_title: rd.display_title || undefined,
      };
      if (useMultiSelect) {
        body.location_ids = selLocIds; body.department_ids = selDeptIds;
        if (isEmployee) {
          body.title = addForm.title.trim() || undefined;
          body.employment_type = addForm.employment_type;
          body.max_weekly_hours = addForm.max_weekly_hours;
        }
      } else {
        body.location_id = singleLocId;
      }
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
      fetchData(authUser);
    } catch { setAddError("Sunucu hatası"); }
    setAddLoading(false);
  };

  const handleGenerateInvite = async (person: MergedPerson) => {
    setInviteLinkLoading(person.userId);
    try {
      const res = await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: person.userId }) });
      const data = await res.json();
      if (res.ok) { setInviteLinkModal({ name: person.name, url: `${window.location.origin}/setup?token=${data.token}` }); setInviteLinkCopied(false); }
    } finally { setInviteLinkLoading(null); }
  };

  const handleApprove = async (person: MergedPerson, status: "active" | "rejected") => {
    await fetch(`/api/users?id=${person.userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approval_status: status }) });
    fetchData(authUser);
    showToast(status === "active" ? "Hesap onaylandı" : "Hesap reddedildi");
  };

  const handleDelete = async (person: MergedPerson) => {
    if (!confirm(`${person.name} hesabını silmek istediğinize emin misiniz?`)) return;
    await fetch(`/api/users?id=${person.userId}`, { method: "DELETE" });
    fetchData(authUser);
  };

  const openEdit = (p: MergedPerson) => {
    setEditingPerson(p);
    setEditForm({ name: p.name, phone: p.phone ?? "", title: p.title ?? "", employment_type: p.employment_type ?? "full_time", weekly_off_day: p.weekly_off_day ?? null, max_weekly_hours: p.max_weekly_hours ?? 45, min_weekly_hours: p.min_weekly_hours ?? 0, roles: p.roles ?? [], crew_id: p.crew_id ?? null, hourly_wage: p.hourly_wage ?? null, night_restriction: p.night_restriction ?? null, hire_date: p.hire_date ?? "", annual_leave_days_total: p.annual_leave_days_total ?? 14, leave_adjustment_days: p.leave_adjustment_days ?? 0 });
    setEditError("");
  };

  const handleEdit = async () => {
    if (!editingPerson) return;
    if (editForm.min_weekly_hours > editForm.max_weekly_hours) { setEditError("Min haftalık saat, max haftalık saatten büyük olamaz."); return; }
    setEditLoading(true); setEditError("");
    try {
      await fetch(`/api/users?id=${editingPerson.userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editForm.name, phone: editForm.phone }) });
      if (editingPerson.personnelId) {
        const res = await fetch(`/api/personnel?id=${editingPerson.personnelId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: editForm.title, employment_type: editForm.employment_type, weekly_off_day: editForm.weekly_off_day, max_weekly_hours: editForm.max_weekly_hours, min_weekly_hours: editForm.min_weekly_hours, roles: editForm.roles, crew_id: editForm.crew_id, hourly_wage: editForm.hourly_wage, night_restriction: editForm.night_restriction, hire_date: editForm.hire_date || null, annual_leave_days_total: editForm.annual_leave_days_total, leave_adjustment_days: editForm.leave_adjustment_days }) });
        const data = await res.json();
        if (!res.ok) { setEditError(data.error ?? "Güncelleme hatası"); setEditLoading(false); return; }
      }
      setEditingPerson(null); fetchData(authUser); showToast("Bilgiler güncellendi");
    } catch { setEditError("Sunucu hatası"); }
    setEditLoading(false);
  };

  const handleBulkUpload = async () => {
    setBulkError("");
    if (!bulkText.trim()) return;
    setBulkLoading(true);
    const list = bulkText.trim().split("\n").map(line => {
      const p = line.split("\t");
      return { name: p[0]?.trim(), email: p[1]?.trim(), phone: p[2]?.trim(), title: p[3]?.trim() };
    }).filter((p: any) => p.name && p.email);
    try {
      const res = await fetch("/api/personnel/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ org_id: authUser.org_id, location_id: authUser.location_id, personnel_list: list }) });
      const data = await res.json();
      if (!res.ok) { setBulkError(data.error); setBulkLoading(false); return; }
      setBulkResults(data.results); setBulkText(""); fetchData(authUser);
    } catch { setBulkError("Sunucu hatası"); }
    setBulkLoading(false);
  };

  const filtered = persons.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (p.title ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const editDepts = authUser?.location_id ? (deptCache[authUser.location_id] ?? []) : [];

  const roleBadge = (p: MergedPerson) => {
    if (p.role === "admin") return { label: "Admin", color: "bg-red-50 text-red-700 border-red-100" };
    if (p.role === "supervisor") return { label: "Süpervizör", color: "bg-violet-50 text-violet-700 border-violet-100" };
    if (p.display_title) return { label: p.display_title, color: "bg-indigo-50 text-indigo-700 border-indigo-100" };
    return { label: "Personel", color: "bg-slate-50 text-slate-600 border-slate-200" };
  };

  if (!mounted) return <div className="space-y-6 max-w-5xl" />;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Personel & Hesaplar</h1>
          <p className="text-slate-500 text-sm mt-0.5">{persons.length} hesap</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowBulkModal(true)} className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-bold px-3 md:px-4 py-2 md:py-2.5 rounded-xl transition-colors shadow-sm">
            <Upload size={16} /> <span className="hidden sm:inline">Toplu Yükle</span>
          </button>
          <button onClick={() => { resetAddForm(); setShowAddModal(true); }} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-3 md:px-5 py-2 md:py-2.5 rounded-xl transition-colors shadow-md shadow-indigo-100">
            <Plus size={16} /> <span className="hidden sm:inline">Yeni Hesap Ekle</span><span className="sm:hidden">Ekle</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="İsim, email veya unvan ara..." className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 shadow-sm" />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse flex gap-4">
              <div className="w-12 h-12 bg-slate-100 rounded-full" />
              <div className="flex-1 space-y-2 pt-1"><div className="h-4 bg-slate-100 rounded w-1/3" /><div className="h-3 bg-slate-100 rounded w-1/2" /></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <Users size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">{search ? "Arama sonucu bulunamadı" : "Henüz hesap yok"}</p>
          {!search && <button onClick={() => { resetAddForm(); setShowAddModal(true); }} className="mt-4 text-indigo-600 font-bold text-sm hover:underline">+ İlk hesabı ekle</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(p => {
            const badge = roleBadge(p);
            const isPending = p.approval_status === "pending";
            return (
              <div key={p.userId} className={`group bg-white rounded-3xl p-5 flex items-start gap-4 border shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 ${isPending ? "border-amber-200" : "border-slate-200/60"}`}>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-extrabold text-xl shrink-0 shadow-sm ${p.role === "manager" ? "bg-gradient-to-br from-indigo-100 to-indigo-200 text-indigo-700" : "bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600"}`}>
                  {p.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-slate-800 text-base truncate">{p.name}</h3>
                      <p className="text-xs font-mono text-slate-400 mt-0.5">{p.username}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border ${badge.color}`}>{badge.label}</span>
                      {isPending && <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">Onay Bekliyor</span>}
                      {p.is_temp_password && !isPending && <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600 border border-rose-100">Şifre Geçici</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100">
                    {p.email && (
                      <div className="flex flex-col gap-0.5 col-span-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">E-posta</span>
                        <span className="text-xs font-medium text-slate-600 truncate flex items-center gap-1"><Mail size={11} className="text-slate-400 shrink-0" />{p.email}</span>
                      </div>
                    )}
                    {p.phone && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Telefon</span>
                        <span className="text-xs font-medium text-slate-600 flex items-center gap-1"><Phone size={11} className="text-slate-400 shrink-0" />{p.phone}</span>
                      </div>
                    )}
                    {p.title && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unvan</span>
                        <span className="text-xs font-medium text-slate-600 truncate">{p.title}</span>
                      </div>
                    )}
                  </div>

                  {p.personnelId && p.role === "employee" && (
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className="text-xs font-bold text-slate-500">Adalet Skoru: <strong className="text-indigo-600">{p.prev_score}</strong></span>
                      {p.hero_count > 0 && <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">⭐ {p.hero_count}x</span>}
                      {p.crew_id && (() => { const crew = crewList.find(c => c.id === p.crew_id); return crew ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: crew.color }}>{crew.name}</span> : null; })()}
                      {(p.ytd_overtime_hours ?? 0) > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">⏱ {p.ytd_overtime_hours}s YTD</span>}
                    </div>
                  )}

                  {isPending && (authUser?.role === "admin" || authUser?.role === "supervisor") && (
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => handleApprove(p, "active")} className="flex-1 text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-xl flex items-center justify-center gap-1"><CheckCircle size={13} /> Onayla</button>
                      <button onClick={() => handleApprove(p, "rejected")} className="flex-1 text-xs font-bold bg-red-100 hover:bg-red-200 text-red-700 py-2 rounded-xl flex items-center justify-center gap-1"><AlertCircle size={13} /> Reddet</button>
                    </div>
                  )}

                  <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(p)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Düzenle"><Edit2 size={15} /></button>
                    <button onClick={() => handleGenerateInvite(p)} disabled={inviteLinkLoading === p.userId} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50" title="Davet Linki Oluştur">
                      {inviteLinkLoading === p.userId ? <div className="w-3.5 h-3.5 border-2 border-amber-200 border-t-amber-600 rounded-full animate-spin" /> : <Link size={15} />}
                    </button>
                    {(authUser?.role === "admin" || authUser?.role === "supervisor") && (
                      <button onClick={() => handleDelete(p)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Hesabı Sil"><Trash2 size={15} /></button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ADD MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 pb-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-800">Yeni Hesap Ekle</h2>
              <button onClick={() => { setShowAddModal(false); setAddError(""); }} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              {/* Role */}
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 block">Rol</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_DEFS.map((rd, i) => (
                    <button key={i} type="button" onClick={() => { setRoleOption(i); setSelLocIds([]); setSelDeptIds([]); setSingleLocId(""); }} className={`px-3 py-2.5 rounded-xl text-sm font-bold border transition-all text-left ${roleOption === i ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"}`}>{rd.label}</button>
                  ))}
                </div>
              </div>
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">Ad Soyad *</label>
                  <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Ahmet Yılmaz" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
                </div>
                {isEmployee && (
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1.5 block">Unvan</label>
                    <input value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} placeholder="Barista..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">E-posta</label>
                  <input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="ornek@mail.com" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">Telefon</label>
                  <input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="0532..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
                </div>
              </div>
              {isEmployee && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1.5 block">Çalışma Tipi</label>
                    <select value={addForm.employment_type} onChange={e => setAddForm(f => ({ ...f, employment_type: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400">
                      {EMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1.5 block">Max Haftalık Saat</label>
                    <input type="number" min={8} max={60} value={addForm.max_weekly_hours} onChange={e => setAddForm(f => ({ ...f, max_weekly_hours: Number(e.target.value) }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
                  </div>
                </div>
              )}
              {/* Branch */}
              {useMultiSelect ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Şube(ler) *</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setSelLocIds(locations.map(l => l.id)); setSelDeptIds([]); }} className="text-[11px] font-bold text-indigo-600 hover:underline">Tümünü Seç</button>
                      <button type="button" onClick={() => { setSelLocIds([]); setSelDeptIds([]); }} className="text-[11px] font-bold text-slate-400 hover:underline">Temizle</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    {locations.length === 0 ? <span className="text-xs text-slate-400">Şube bulunamadı</span> : locations.map(l => (
                      <button key={l.id} type="button" onClick={() => toggleLoc(l.id)} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1 ${selLocIds.includes(l.id) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"}`}>
                        {selLocIds.includes(l.id) && <Check size={10} />}{l.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 block">Şube *</label>
                  <select value={singleLocId} onChange={e => setSingleLocId(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400">
                    <option value="">Şube seçin...</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
              {/* Department */}
              {useMultiSelect && selLocIds.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Departman(lar) *</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setSelDeptIds(allSelectedDepts.map(d => d.id))} className="text-[11px] font-bold text-indigo-600 hover:underline">Tümünü Seç</button>
                      <button type="button" onClick={() => setSelDeptIds([])} className="text-[11px] font-bold text-slate-400 hover:underline">Temizle</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    {allSelectedDepts.length === 0 ? <span className="text-xs text-slate-400">Seçili şubeler için departman bulunamadı</span> : allSelectedDepts.map(d => (
                      <button key={d.id} type="button" onClick={() => setSelDeptIds(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1 ${selDeptIds.includes(d.id) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"}`}>
                        {selDeptIds.includes(d.id) && <Check size={10} />}{d.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {addError && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{addError}</div>}
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-xs text-indigo-700 flex items-center gap-2">
                <Link size={12} className="shrink-0" />
                Oluşturduktan sonra <strong className="ml-1">davet linki</strong>&nbsp;ve geçici şifre gösterilecek.
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowAddModal(false); setAddError(""); }} className="flex-1 border border-slate-200 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50">İptal</button>
              <button onClick={handleAdd} disabled={addLoading} className="flex-[2] bg-indigo-600 disabled:bg-indigo-400 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 flex items-center justify-center gap-2">
                {addLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Check size={16} /> Hesap Oluştur</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POST-CREATION INVITE MODAL */}
      {inviteModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center shrink-0"><CheckCircle size={24} className="text-emerald-600" /></div>
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
                <button onClick={() => { navigator.clipboard.writeText(inviteModal.inviteUrl); setInviteCopied(true); setTimeout(() => setInviteCopied(false), 2000); }} className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${inviteCopied ? "bg-emerald-500 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
                  {inviteCopied ? <><Check size={12} /> Kopyalandı</> : <><Copy size={12} /> Kopyala</>}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">Linke tıklandığında oturum otomatik açılır, sadece şifre belirlenir.</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Kullanıcı Adı & Geçici Şifre (Yedek)</p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Kullanıcı adı:</span>
                  <span className="font-mono font-bold text-slate-800 text-sm">{inviteModal.username}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Geçici şifre:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-indigo-600 text-sm">{inviteModal.tempPassword}</span>
                    <button onClick={() => { navigator.clipboard.writeText(inviteModal.tempPassword); setPassCopied(true); setTimeout(() => setPassCopied(false), 2000); }} className={`p-1 rounded ${passCopied ? "text-emerald-600" : "text-slate-400 hover:text-slate-600"}`}>
                      {passCopied ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <button onClick={() => { setInviteModal(null); setInviteCopied(false); setPassCopied(false); }} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl transition-colors">Tamam, Kapat</button>
          </div>
        </div>
      )}

      {/* INVITE LINK MODAL (existing users) */}
      {inviteLinkModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setInviteLinkModal(null)}>
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0"><Link size={18} className="text-amber-600" /></div>
              <div>
                <p className="text-sm font-black text-slate-900">{inviteLinkModal.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">Davet linki — 7 gün geçerli</p>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-[11px] text-slate-500 font-mono break-all leading-relaxed">{inviteLinkModal.url}</p>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">Bu linki <strong>WhatsApp, SMS veya e-posta</strong> ile iletin. 7 gün sonra geçersiz olur.</p>
            <div className="flex gap-2">
              <button onClick={() => setInviteLinkModal(null)} className="flex-1 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50">Kapat</button>
              <button onClick={() => { navigator.clipboard.writeText(inviteLinkModal.url); setInviteLinkCopied(true); setTimeout(() => setInviteLinkCopied(false), 2000); }} className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-colors ${inviteLinkCopied ? "bg-emerald-500 text-white" : "bg-amber-500 hover:bg-amber-600 text-white"}`}>
                {inviteLinkCopied ? <><Check size={14} /> Kopyalandı!</> : <><Copy size={14} /> Kopyala</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingPerson && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 pb-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Personel Düzenle</h2>
                <p className="text-sm text-slate-500 mt-0.5">{editingPerson.email}</p>
              </div>
              <button onClick={() => setEditingPerson(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">Ad Soyad</label>
                  <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">Unvan</label>
                  <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} placeholder="Barista..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1.5 block">Telefon</label>
                <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="+90 532 ..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
              </div>
              {editingPerson.personnelId && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">Çalışma Tipi</label>
                      <select value={editForm.employment_type} onChange={e => setEditForm(f => ({ ...f, employment_type: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400">
                        {EMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">Max Haftalık Saat</label>
                      <input type="number" min={8} max={60} value={editForm.max_weekly_hours} onChange={e => setEditForm(f => ({ ...f, max_weekly_hours: Number(e.target.value) }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">Min Haftalık Saat</label>
                      <input type="number" min={0} max={editForm.max_weekly_hours} value={editForm.min_weekly_hours} onChange={e => setEditForm(f => ({ ...f, min_weekly_hours: Number(e.target.value) }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">Sabit İzin Günü</label>
                      <select value={editForm.weekly_off_day === null ? "" : String(editForm.weekly_off_day)} onChange={e => setEditForm(f => ({ ...f, weekly_off_day: e.target.value === "" ? null : Number(e.target.value) }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400">
                        <option value="">Tanımsız</option>
                        {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1.5 block">Saatlik Ücret (₺, brüt)</label>
                    <input type="number" min={0} step={0.5} placeholder="Tanımsız" value={editForm.hourly_wage ?? ""} onChange={e => setEditForm(f => ({ ...f, hourly_wage: e.target.value === "" ? null : Number(e.target.value) }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
                    <p className="text-[10px] text-slate-400 mt-1">Fazla mesai maliyeti hesabında kullanılır (mesai saati × ücret × 1,5). Boş bırakılırsa maliyet gösterilmez.</p>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1.5 block">Gece Çalışma Kısıtı</label>
                    <select
                      value={editForm.night_restriction ?? ""}
                      onChange={e => setEditForm(f => ({ ...f, night_restriction: e.target.value || null }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400"
                    >
                      <option value="">Yok — gece çalışabilir</option>
                      <option value="pregnant">Gebe — gece çalışamaz</option>
                      <option value="nursing">Emziren — gece çalışamaz</option>
                      <option value="under18">18 yaş altı — gece çalışamaz</option>
                      <option value="medical">Sağlık raporu — gece çalışamaz</option>
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">Kısıt seçiliyse otomatik planlama bu kişiye hiçbir gece vardiyası yazmaz (İş K. m.73). Elle atamalarda yayın öncesi uyarı verilir.</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">İşe Giriş Tarihi</label>
                      <input type="date" value={editForm.hire_date ?? ""} onChange={e => setEditForm(f => ({ ...f, hire_date: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">Yıllık İzin (gün)</label>
                      <input type="number" min={0} max={60} value={editForm.annual_leave_days_total} onChange={e => setEditForm(f => ({ ...f, annual_leave_days_total: Number(e.target.value) || 0 }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">İzin Düzeltme (±)</label>
                      <input type="number" min={-30} max={60} value={editForm.leave_adjustment_days} onChange={e => setEditForm(f => ({ ...f, leave_adjustment_days: Number(e.target.value) || 0 }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white" />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 -mt-2">Kalan izin otomatik hesaplanır: Ayarlar'da &quot;Kıdeme Göre İzin Hak Edişi&quot; açıksa işe giriş tarihinden (1-5 yıl 14g, 5+ yıl 20g, 15+ yıl 26g, devirli); kapalıysa buradaki sabit günden. Düzeltme alanı geçmiş dönem devri gibi elle eklemeler içindir.</p>
                  {crewList.length > 0 && (
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">Ekip Ataması</label>
                      <select
                        value={editForm.crew_id ?? ""}
                        onChange={e => setEditForm(f => ({ ...f, crew_id: e.target.value || null }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-indigo-400"
                      >
                        <option value="">— Ekip Yok —</option>
                        {crewList.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {editDepts.length > 0 && (
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-2 block">Bölge / Zon Ataması</label>
                      <div className="flex flex-wrap gap-2">
                        {editDepts.map(dept => {
                          const selected = editForm.roles.includes(dept.name);
                          return (
                            <button key={dept.id} type="button" onClick={() => setEditForm(f => ({ ...f, roles: selected ? f.roles.filter(r => r !== dept.name) : [...f.roles, dept.name] }))} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${selected ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"}`}>
                              {selected && <Check size={10} className="inline mr-1" />}{dept.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
              {editError && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{editError}</div>}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditingPerson(null)} className="flex-1 border border-slate-200 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50">İptal</button>
              <button onClick={handleEdit} disabled={editLoading} className="flex-[2] bg-indigo-600 disabled:bg-indigo-400 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 flex items-center justify-center gap-2">
                {editLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Check size={16} /> Kaydet</>}
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
              <button onClick={() => { setShowBulkModal(false); setBulkResults([]); setBulkText(""); }} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={20} /></button>
            </div>
            {bulkResults.length > 0 ? (
              <div className="flex-1 overflow-auto">
                <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl mb-4 font-bold text-sm flex items-center gap-2"><Check size={18} /> {bulkResults.length} personel başarıyla eklendi!</div>
                <div className="space-y-2">
                  {bulkResults.map((r: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-lg text-sm">
                      <div><div className="font-bold text-slate-800">{r.name}</div><div className="text-xs text-slate-500">{r.email}</div></div>
                      <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg font-mono font-bold text-indigo-600">{r.temp_password}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => { setShowBulkModal(false); setBulkResults([]); }} className="w-full mt-6 bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900">Kapat</button>
              </div>
            ) : (
              <>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
                  <div className="text-xs font-bold text-slate-600 mb-2">Beklenen Format</div>
                  <div className="flex text-xs font-mono bg-white border border-slate-200 p-2 rounded text-slate-500">
                    <div className="flex-1 font-bold text-slate-700">Ad Soyad</div>
                    <div className="flex-1 font-bold text-slate-700">E-posta</div>
                    <div className="flex-1">Telefon (Ops)</div>
                    <div className="flex-1">Unvan (Ops)</div>
                  </div>
                </div>
                <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} placeholder="Excel'den buraya yapıştırın..." className="w-full flex-1 min-h-[200px] border border-slate-200 rounded-xl p-4 text-sm font-mono whitespace-pre focus:outline-none focus:border-indigo-400 resize-none" />
                {bulkError && <div className="mt-4 bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{bulkError}</div>}
                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowBulkModal(false)} className="flex-1 border border-slate-200 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50">İptal</button>
                  <button onClick={handleBulkUpload} disabled={bulkLoading || !bulkText.trim()} className="flex-[2] bg-indigo-600 disabled:bg-indigo-400 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 flex items-center justify-center gap-2">
                    {bulkLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Upload size={16} /> Kayıtları Yükle</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 md:bottom-8 md:right-8 bg-slate-900 text-white text-xs font-bold px-5 py-3 rounded-2xl shadow-xl z-50 max-w-xs">{toast}</div>
      )}
    </div>
  );
}
