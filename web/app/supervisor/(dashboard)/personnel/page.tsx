"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { defaultWeeklyHours } from "@/lib/legal";
import { Suspense, useEffect, useState } from "react";
import ManagersCard from "@/components/personnel/ManagersCard";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, Check, ChevronDown, Copy } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListItem, ListEmpty, ListSection } from "@/components/ui/List";
import { Sheet, DetailRow, sheetPrimaryClass, sheetSecondaryClass, sheetDangerClass } from "@/components/ui/Sheet";
import { Page, PageHeader, pageActionClass } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";

const EMP_TYPES = [
  { value: "full_time",  label: "Tam Zamanlı" },
  { value: "part_time",  label: "Yarı Zamanlı" },
  { value: "intern",     label: "Stajyer" },
];

const ACCESS_LEVELS = [
  { value: "employee",  label: "Çalışan" },
  { value: "manager",   label: "Yönetici" },
  // Birden çok şubeli yönetici Yöneticiler kartından (kapsam seçilerek) eklenir
];

// Yöneticiler ayrı kartta (components/personnel/ManagersCard) eklenir; bu form sadece çalışan ekler
const ROLE_DEFS = [
  { label: "Çalışan", role: "employee", display_title: "" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "İşletme Sahibi", supervisor: "Yönetici", manager: "Yönetici", employee: "Çalışan",
};

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

  // Onay bekleyen hesaplar (manager'ın oluşturduğu, henüz aktif olmayan)
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);
  // Şube müdürleri: personel kaydı olmadığı için personel listesinde görünmezler (Test 3 Ö1)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
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

  const isEmployee = true;
  const useMultiSelect = true; // çalışan birden çok şubeye atanabilir

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

  const fetchPendingUsers = async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      const list: any[] = Array.isArray(data) ? data : [];
      setPendingUsers(list.filter(u => u.approval_status === "pending"));
    } catch {}
  };

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
    fetchPendingUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, user]);

  const handlePendingReview = async (id: string, approval_status: "active" | "rejected") => {
    setPendingActionId(id);
    try {
      await fetch(`/api/users?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approval_status }),
      });
      setPendingUsers(prev => prev.filter(u => u.id !== id));
    } finally {
      setPendingActionId(null);
    }
  };

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
    setSelLocIds([]); setSelDeptIds([]); setSingleLocId(""); setAddError("");
  };

  const handleAdd = async () => {
    setAddError("");
    if (!addForm.name.trim()) { setAddError("Ad soyad zorunlu"); return; }
    if (useMultiSelect && !selLocIds.length) { setAddError("En az bir şube seçmelisiniz"); return; }
    if (useMultiSelect && !selDeptIds.length && allSelectedDepts.length > 0) { setAddError("En az bir departman seçmelisiniz"); return; }
    if (!useMultiSelect && !singleLocId) { setAddError("Şube seçmelisiniz"); return; }
    setAddLoading(true);
    try {
      const rd = ROLE_DEFS[0];
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
      fetchPendingUsers();
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

  if (!mounted) return <Page />;

  const detail = personnel.find(p => p.id === detailId) ?? null;
  const pendingOpen = pendingUsers.find(u => u.id === pendingOpenId) ?? null;

  return (
    <Page className="animate-in fade-in duration-500">
      <PageHeader title="Tüm Personel" description="Tüm şubelerin ekibi" actions={
        <button onClick={() => { resetAddForm(); setShowAddModal(true); }} className={pageActionClass}>
          <Plus size={16} /> Çalışan Ekle
        </button>
      } />

      {/* Yöneticiler: patron her şubeye, bölge yöneticisi kendi şubelerine ekler */}
      {(user?.role === "admin" || user?.role === "supervisor") && locations.length > 0 && (
        <ManagersCard viewerRole={user.role} locations={locations.map((l: { id: string; name: string }) => ({ id: l.id, name: l.name }))} />
      )}

      {/* Arama + şube */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ad, e-posta ya da unvan ara"
            className="w-full pl-9 pr-3 min-h-[40px] bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <div className="relative">
          <select value={selectedLocId} onChange={e => { setSelectedLocId(e.target.value); fetchPersonnel(e.target.value); }}
            className="pl-3 pr-8 min-h-[40px] bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer">
            <option value="">Tüm şubeler</option>
            {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Onay bekleyen hesaplar (kendi kendine kayıt bağlantısından gelenler) */}
      {pendingUsers.length > 0 && (
        <List>
          <ListSection title="Onay bekleyen hesaplar" count={pendingUsers.length} />
          {pendingUsers.map(u => (
            <ListItem key={u.id} onClick={() => setPendingOpenId(u.id)}
              leading={<Avatar name={u.name} />}
              title={u.name}
              subtitle={`${ROLE_LABELS[u.role] ?? u.role}${u.display_title ? ` · ${u.display_title}` : ""}`}
              trailing={<StatusPill tone="attention">Bekliyor</StatusPill>}
            />
          ))}
        </List>
      )}

      <List>
        <ListSection title="Personel" count={filtered.length} />
        {loading ? <ListEmpty>Yükleniyor…</ListEmpty> : filtered.length === 0 ? (
          <ListEmpty>{search ? "Aramaya uyan kimse yok." : "Henüz personel yok."}</ListEmpty>
        ) : filtered.map(p => {
          const loc = locations.find(l => l.id === p.primary_location_id);
          return (
            <ListItem key={p.id} onClick={() => setDetailId(p.id)}
              leading={<Avatar name={p.name} />}
              title={p.name}
              subtitle={[p.title, loc?.name].filter(Boolean).join(" · ") || "—"}
              trailing={p.status !== "active" ? <StatusPill tone="neutral">Pasif</StatusPill>
                : p.user_access_level !== "employee" ? <StatusPill tone="brand">{ACCESS_LEVELS.find(a => a.value === p.user_access_level)?.label ?? "Yönetici"}</StatusPill>
                : undefined}
            />
          );
        })}
      </List>

      {/* Kişi ayrıntısı */}
      <Sheet open={!!detail} onClose={() => setDetailId(null)} title={detail?.name ?? ""}
        description={detail ? [detail.title, locations.find(l => l.id === detail.primary_location_id)?.name].filter(Boolean).join(" · ") : undefined}
        footer={detail && <>
          {detail.user_id && (
            <button onClick={() => handleGenerateInvite(detail)} disabled={inviteLinkLoading === detail.id} className={sheetSecondaryClass}>
              {inviteLinkLoading === detail.id ? "Hazırlanıyor…" : "Giriş bağlantısı"}
            </button>
          )}
          <button onClick={() => { const d = detail; setDetailId(null); openEdit(d); }} className={sheetPrimaryClass}>Düzenle</button>
        </>}>
        {detail && <div>
          <DetailRow label="Durum">{detail.status === "active" ? "Aktif" : "Pasif"}</DetailRow>
          <DetailRow label="E-posta">{detail.email || "—"}</DetailRow>
          <DetailRow label="Telefon">{detail.phone || "—"}</DetailRow>
          {detail.crew_id && crewMap[detail.crew_id] && <DetailRow label="Ekip">{crewMap[detail.crew_id].name}</DetailRow>}
          <DetailRow label="Adalet puanı">{detail.prev_score ?? 0}</DetailRow>
        </div>}
      </Sheet>

      {/* Onay bekleyen hesap ayrıntısı */}
      <Sheet open={!!pendingOpen} onClose={() => setPendingOpenId(null)} title={pendingOpen?.name ?? ""}
        description="Kayıt bağlantısıyla hesap açtı, onayınızı bekliyor"
        footer={pendingOpen && <>
          <button disabled={pendingActionId === pendingOpen.id} onClick={() => { handlePendingReview(pendingOpen.id, "rejected"); setPendingOpenId(null); }} className={sheetDangerClass}>Reddet</button>
          <button disabled={pendingActionId === pendingOpen.id} onClick={() => { handlePendingReview(pendingOpen.id, "active"); setPendingOpenId(null); }} className={sheetPrimaryClass}>Onayla</button>
        </>}>
        {pendingOpen && <div>
          <DetailRow label="Rol">{ROLE_LABELS[pendingOpen.role] ?? pendingOpen.role}</DetailRow>
          {pendingOpen.display_title && <DetailRow label="Unvan">{pendingOpen.display_title}</DetailRow>}
          <DetailRow label="Kullanıcı adı">{pendingOpen.username}</DetailRow>
        </div>}
      </Sheet>

      {/* Çalışan ekle */}
      <Sheet open={showAddModal} onClose={() => { setShowAddModal(false); setAddError(""); }} title="Çalışan ekle"
        footer={<>
          <button onClick={() => { setShowAddModal(false); setAddError(""); }} className={sheetSecondaryClass}>Vazgeç</button>
          <button onClick={handleAdd} disabled={addLoading} className={sheetPrimaryClass}>{addLoading ? "Oluşturuluyor…" : "Hesap oluştur"}</button>
        </>}>
            <div className="space-y-4">

              {/* Temel bilgiler */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">Ad Soyad *</label>
                  <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Ahmet Yılmaz"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">E-posta</label>
                  <input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="ahmet@sirket.com"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">Telefon</label>
                  <input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="05XX XXX XX XX"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-primary" />
                </div>
                {isEmployee && (
                  <>
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">Unvan</label>
                      <input value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} placeholder="Kasiyer"
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-primary" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">Çalışma Tipi</label>
                      <select value={addForm.employment_type} onChange={e => setAddForm(f => ({ ...f, employment_type: e.target.value, ...("max_weekly_hours" in f && f.max_weekly_hours === defaultWeeklyHours(f.employment_type) ? { max_weekly_hours: defaultWeeklyHours(e.target.value) } : {}) }))}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-primary appearance-none">
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
                    <label className="text-xs font-bold text-slate-600">Şube(ler) *</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setSelLocIds(locations.map(l => l.id)); setSelDeptIds([]); }} className="text-xs font-bold text-forest-600 hover:underline">Tümünü Seç</button>
                      <button type="button" onClick={() => { setSelLocIds([]); setSelDeptIds([]); }} className="text-xs font-bold text-slate-400 hover:underline">Temizle</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    {locations.length === 0 ? <span className="text-xs text-slate-400">Şube bulunamadı</span> : locations.map(l => (
                      <button key={l.id} type="button"
                        onClick={() => { setSelLocIds(prev => prev.includes(l.id) ? prev.filter(x => x !== l.id) : [...prev, l.id]); setSelDeptIds([]); }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1 ${selLocIds.includes(l.id) ? "bg-forest-600 text-white border-forest-600" : "bg-white text-slate-600 border-slate-200 hover:border-forest-300"}`}>
                        {selLocIds.includes(l.id) && <Check size={10} />}{l.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-2 block">Şube *</label>
                  <select value={singleLocId} onChange={e => setSingleLocId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-primary appearance-none">
                    <option value="">Şube seçin...</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}

              {/* Departman seçimi */}
              {useMultiSelect && selLocIds.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-600">Departman(lar) *</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setSelDeptIds(allSelectedDepts.map(d => d.id))} className="text-xs font-bold text-forest-600 hover:underline">Tümünü Seç</button>
                      <button type="button" onClick={() => setSelDeptIds([])} className="text-xs font-bold text-slate-400 hover:underline">Temizle</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    {allSelectedDepts.length === 0 ? <span className="text-xs text-slate-400">Seçili şubeler için departman bulunamadı</span> : allSelectedDepts.map(d => (
                      <button key={d.id} type="button"
                        onClick={() => setSelDeptIds(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1 ${selDeptIds.includes(d.id) ? "bg-forest-600 text-white border-forest-600" : "bg-white text-slate-600 border-slate-200 hover:border-forest-300"}`}>
                        {selDeptIds.includes(d.id) && <Check size={10} />}{d.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {addError && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600 font-medium">{addError}</div>}

              <p className="text-xs text-slate-500">Oluşturduktan sonra giriş bağlantısı ve geçici şifre gösterilir.</p>
            </div>

      </Sheet>

      {/* Hesap oluşturuldu: giriş bilgileri */}
      <Sheet open={!!inviteModal} onClose={() => { setInviteModal(null); setInviteCopied(false); setPassCopied(false); }}
        title={inviteModal ? `${inviteModal.name} eklendi` : ""} description="Kişiye aşağıdakilerden birini iletin"
        footer={<button onClick={() => { setInviteModal(null); setInviteCopied(false); setPassCopied(false); }} className={sheetPrimaryClass}>Tamam</button>}>
        {inviteModal && <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-600">Giriş bağlantısı (7 gün geçerli)</p>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2 pl-3">
              <p className="text-xs text-slate-600 truncate flex-1">{inviteModal.inviteUrl}</p>
              <button onClick={() => { navigator.clipboard.writeText(inviteModal.inviteUrl); setInviteCopied(true); setTimeout(() => setInviteCopied(false), 2000); }}
                className="shrink-0 inline-flex items-center gap-1 px-3 min-h-[36px] rounded-lg bg-primary text-white text-xs font-semibold">
                {inviteCopied ? <><Check size={12} /> Kopyalandı</> : <><Copy size={12} /> Kopyala</>}
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-1">Yedek: kullanıcı adı ve geçici şifre</p>
            <DetailRow label="Kullanıcı adı">{inviteModal.username}</DetailRow>
            <DetailRow label="Geçici şifre">
              <span className="inline-flex items-center gap-2">{inviteModal.tempPassword}
                <button aria-label="Şifreyi kopyala" title="Şifreyi kopyala" onClick={() => { navigator.clipboard.writeText(inviteModal.tempPassword); setPassCopied(true); setTimeout(() => setPassCopied(false), 2000); }} className="text-slate-400 hover:text-slate-700">
                  {passCopied ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </span>
            </DetailRow>
          </div>
        </div>}
      </Sheet>

      {/* Mevcut kişiye giriş bağlantısı */}
      <Sheet open={!!inviteLinkModal} onClose={() => setInviteLinkModal(null)} title={inviteLinkModal?.name ?? ""} description="Giriş bağlantısı, 7 gün geçerli"
        footer={inviteLinkModal && <>
          <button onClick={() => setInviteLinkModal(null)} className={sheetSecondaryClass}>Kapat</button>
          <button onClick={() => { navigator.clipboard.writeText(inviteLinkModal.url); setInviteLinkCopied(true); setTimeout(() => setInviteLinkCopied(false), 2000); }} className={sheetPrimaryClass}>
            {inviteLinkCopied ? "Kopyalandı" : "Kopyala"}
          </button>
        </>}>
        {inviteLinkModal && <p className="text-xs text-slate-600 break-all bg-slate-50 border border-slate-200 rounded-xl p-3">{inviteLinkModal.url}</p>}
      </Sheet>

      {/* Düzenle */}
      <Sheet open={!!editingPersonnel} onClose={() => setEditingPersonnel(null)} title="Personeli düzenle"
        footer={<>
          <button type="button" onClick={() => setEditingPersonnel(null)} className={sheetSecondaryClass}>Vazgeç</button>
          <button type="submit" form="sv-edit-form" disabled={editLoading} className={sheetPrimaryClass}>{editLoading ? "Kaydediliyor…" : "Kaydet"}</button>
        </>}>
        <form id="sv-edit-form" onSubmit={handleEdit} className="space-y-4">
              {editError && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600 font-medium">{editError}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">Ad Soyad</label>
                  <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">Telefon</label>
                  <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">Unvan</label>
                  <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">Çalışma Tipi</label>
                  <select value={editForm.employment_type} onChange={e => setEditForm(f => ({ ...f, employment_type: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-primary appearance-none">
                    {EMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
        </form>
      </Sheet>
    </Page>
  );
}
