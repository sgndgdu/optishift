"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { managerFallbackPath } from "@/hooks/useAuth";
import { defaultWeeklyHours } from "@/lib/legal";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, Check, Copy,
  Link, Upload, Loader2, RefreshCw, UserCog,
  ChevronDown,
} from "lucide-react";
import BulkImportModal from "@/components/personnel/BulkImportModal";
import InviteLinkList, { type InviteResult } from "@/components/personnel/InviteLinkList";
import { ManagerAddSheet, accessSummary, addsOnlyChefs, type Mgr } from "@/components/personnel/ManagersCard";
import PeopleList from "@/components/personnel/PeopleList";
import { List } from "@/components/ui/List";
import PersonSheet from "@/components/personnel/PersonSheet";
import { createInvite, mergePeople, personKey, roleBadge, type MergedPerson } from "@/components/personnel/people";
import { canDelegate, parseAccess } from "@/lib/userAccess";
import { departmentLabel, leafDepartments, sortDepartments } from "@/lib/departments";
import { Page, PageHeader, pageActionClass } from "@/components/ui/PageHeader";
import { Sheet, sheetPrimaryClass, sheetSecondaryClass } from "@/components/ui/Sheet";
import DepartmentAssignSheet from "@/components/personnel/DepartmentAssignSheet";

const viewerAccessOf = (u: any) => ({ role: u?.role ?? null, access: parseAccess(u?.access) });


// Yöneticiler "Yönetici ekle" penceresinden (ManagerAddSheet) eklenir; bu form sadece çalışan ekler
const ROLE_DEFS = [
  { label: "Ekip üyesi", role: "employee", display_title: "" },
];

const EMP_TYPES = [
  { value: "full_time", label: "Tam Zamanlı" },
  { value: "part_time", label: "Yarı Zamanlı" },
  { value: "intern", label: "Stajyer" },
];


export default function PersonnelPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [persons, setPersons] = useState<MergedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  // Yöneticilerin yetki bilgisi (permissions, kapsam) ayrıntıda yetki düzenleyici için
  const [rawUsers, setRawUsers] = useState<Mgr[]>([]);
  const [showManagerAdd, setShowManagerAdd] = useState(false);
  const [showSignupCard, setShowSignupCard] = useState(false);
  const [locations, setLocations] = useState<{ id: string; name: string; self_signup_token?: string | null; rules?: Record<string, unknown> | null }[]>([]);
  const [selfSignupLoading, setSelfSignupLoading] = useState(false);
  const [selfSignupCopied, setSelfSignupCopied] = useState(false);
  const [deptCache, setDeptCache] = useState<Record<string, { id: string; name: string; parent_id?: string | null }[]>>({});

  // Add form
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", phone: "", employment_type: "full_time", max_weekly_hours: 45 });
  const [selLocIds, setSelLocIds] = useState<string[]>([]);
  const [selDeptIds, setSelDeptIds] = useState<string[]>([]);
  const [singleLocId, setSingleLocId] = useState("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Post-creation invite modal

  // Invite link for existing user
  // Giriş bağlantıları (tek kişi ya da uygulamaya hiç girmemiş herkes); WhatsApp ile gönder / kopyala
  const [inviteLinks, setInviteLinks] = useState<InviteResult[] | null>(null);
  const [preparingLinks, setPreparingLinks] = useState(false);
  // Açık kişi kartı (personKey)
  const [openKey, setOpenKey] = useState<string | null>(null);

  // Bulk upload
  const [showBulkModal, setShowBulkModal] = useState(false);

  const [toast, setToast] = useState("");
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  const isEmployee = true;
  const useMultiSelect = true; // çalışan birden çok şubeye atanabilir

  const fetchData = async (u: any) => {
    setLoading(true);
    try {
      const [usersRes, personnelRes] = await Promise.all([
        fetch("/api/users"),
        fetch(`/api/personnel?location_id=${u.location_id}`),
      ]);
      const users = await usersRes.json();
      setRawUsers(Array.isArray(users) ? users : []);
      const personnelList = await personnelRes.json();
      // Bu şubenin çalışanları + çalışan kaydı olmayan şube hesapları (yöneticiler, kendisi)
      const merged = mergePeople(Array.isArray(users) ? users : [], Array.isArray(personnelList) ? personnelList : [],
        acc => acc.id === u.id || acc.location_id === u.location_id);
      setPersons(merged);
    } finally { setLoading(false); }
  };

  const cacheDept = async (locId: string, cache: Record<string, any[]>) => {
    if (cache[locId]) return;
    try {
      const res = await fetch(`/api/departments?location_id=${locId}`);
      const data = await res.json();
      if (Array.isArray(data)) setDeptCache(prev => ({ ...prev, [locId]: data.map((d: any) => ({ id: d.id, name: d.name, parent_id: d.parent_id ?? null })) }));
    } catch {}
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_manager_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (!parsed) { router.push(managerFallbackPath()); return; }
      setAuthUser(parsed);
      setMounted(true);
    } catch { router.push(managerFallbackPath()); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authUser) return;
    fetchData(authUser);
    fetch("/api/locations").then(r => r.json()).then(data => {
      if (Array.isArray(data)) setLocations(data.map((l: any) => {
        let rules: Record<string, unknown> | null = null;
        try { rules = typeof l.rules === "string" ? JSON.parse(l.rules) : (l.rules ?? null); } catch { rules = null; }
        return { id: l.id, name: l.name, self_signup_token: l.self_signup_token ?? null, rules };
      }));
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

  // Kişi en alttaki departmana bağlanır (lib/departments): alt departmanı olan departman seçilmez
  const allSelectedDepts = (useMultiSelect
    ? selLocIds.flatMap(locId => leafDepartments(sortDepartments(deptCache[locId] ?? [])))
    : singleLocId ? leafDepartments(sortDepartments(deptCache[singleLocId] ?? [])) : [])
    .map(d => ({ ...d, label: departmentLabel(Object.values(deptCache).flat(), d) }));

  const toggleLoc = (id: string) => {
    setSelLocIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setSelDeptIds([]);
  };

  const resetAddForm = () => {
    setAddForm({ name: "", email: "", phone: "", employment_type: "full_time", max_weekly_hours: 45 });
    // Şube panelindeyiz: form o şube seçili açılır
    const here = authUser?.location_id || (locations.length === 1 ? locations[0].id : "");
    setSelLocIds(here ? [here] : []); setSelDeptIds([]); setSingleLocId(here); setAddError("");
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
        phone: addForm.phone.trim() || undefined, role: rd.role,
        display_title: rd.display_title || undefined,
      };
      if (useMultiSelect) {
        body.location_ids = selLocIds; body.department_ids = selDeptIds;
        if (isEmployee) {
          body.employment_type = addForm.employment_type;
          body.max_weekly_hours = addForm.max_weekly_hours;
        }
      } else {
        body.location_id = singleLocId;
      }
      const res = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error ?? "Bir hata oluştu"); setAddLoading(false); return; }
      setInviteLinks([{ name: data.user.name, username: data.credentials.username, invite_token: data.inviteToken }]);
      setShowAddModal(false);
      resetAddForm();
      fetchData(authUser);
    } catch { setAddError("Sunucu hatası"); }
    setAddLoading(false);
  };

  /** Uygulamaya hiç girmemiş herkesin bağlantısını tek seferde hazırlar. */
  const prepareNotJoinedLinks = async (list: MergedPerson[]) => {
    if (list.length === 0) return;
    setPreparingLinks(true);
    try {
      const results = await Promise.all(list.map(p => createInvite(p).catch(() => null)));
      const ok = results.filter((r): r is InviteResult => r !== null);
      if (ok.length) setInviteLinks(ok);
    } finally { setPreparingLinks(false); }
  };

  const handleSelfSignup = async (action: "generate" | "disable") => {
    if (!authUser?.location_id) return;
    setSelfSignupLoading(true);
    try {
      const res = await fetch("/api/self-signup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: authUser.location_id, action }),
      });
      const data = await res.json();
      if (res.ok) {
        setLocations(prev => prev.map(l => l.id === authUser.location_id ? { ...l, self_signup_token: data.token } : l));
        setSelfSignupCopied(false);
      }
    } finally { setSelfSignupLoading(false); }
  };

  const userOf = (p: MergedPerson) => (p.userId ? rawUsers.find(u => u.id === p.userId) ?? null : null);
  // Tüm Personel'den gelen bağlantılar: ?add=1 ekleme penceresini, ?edit=<personel> kişinin düzenlemesini açar
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || loading || persons.length === 0 && !new URLSearchParams(window.location.search).get("add")) return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("add") === "1") { deepLinkDone.current = true; resetAddForm(); setShowAddModal(true); return; }
    const editId = q.get("edit");
    if (editId) {
      const target = persons.find(p => p.personnelId === editId);
      if (target) { deepLinkDone.current = true; setOpenKey(personKey(target)); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persons, loading]);


  // Yönetici/şef ekleme: işletme sahibi ya da "Başkasına yetki verme" yetkisi olan (şube müdürü kademesi sadece şef atar)
  const branchMgr = addsOnlyChefs(authUser ?? {});
  const canManageManagers = canDelegate(viewerAccessOf(authUser));
  const managerLocations = (authUser?.role === "manager" ? locations.filter(l => l.id === authUser?.location_id) : locations).map(l => ({ id: l.id, name: l.name }));

  const managerSummary = (p: MergedPerson) => {
    const u = userOf(p);
    return u ? accessSummary(u, id => editDepts.find(d => d.id === id)?.name, roleBadge(p).label) : null;
  };
  // Hesabı var ama davet bağlantısıyla hiç girip şifresini belirlememiş
  const [assignOpen, setAssignOpen] = useState(false);
  const notJoined = persons.filter(p => !p.inactive && p.userId && p.is_temp_password && p.approval_status !== "pending");

  // Ana Sayfa'daki "henüz girmedi" maddesinden gelindiyse bağlantılar hemen hazırlanır
  const autoPrepared = useRef(false);
  useEffect(() => {
    if (autoPrepared.current || loading || notJoined.length === 0) return;
    if (new URLSearchParams(window.location.search).get("notJoined") !== "1") return;
    autoPrepared.current = true;
    // Effect gövdesinde senkron setState olmasın diye bir sonraki mikro göreve bırakılır
    void Promise.resolve().then(() => prepareNotJoinedLinks(notJoined));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, persons]);

  const openPerson = openKey ? persons.find(p => personKey(p) === openKey) ?? null : null;
  const editDepts = authUser?.location_id ? (deptCache[authUser.location_id] ?? []) : [];
  const filtered = persons.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    [p.department_id, ...p.assigned_department_ids].some(id => (editDepts.find(d => d.id === id)?.name ?? "").toLowerCase().includes(search.toLowerCase()))
  );

  // Departmanlı şubede departmanı olmayan, plana giren kişi otomatik plana alınmaz
  const noDept = editDepts.length > 0 ? persons.filter(p => !p.inactive && p.personnelId && p.schedulable && !p.department_id) : [];

  if (!mounted) return <Page />;

  return (
    <Page width="narrow">
      {/* Header */}
      <PageHeader title="Ekip" description={(() => {
        const act = persons.filter(p => !p.inactive);
        const staff = act.filter(p => p.role === "employee").length;
        const mgrs = act.filter(p => p.role === "manager" || p.role === "supervisor").length;
        return `${staff} ekip üyesi${mgrs ? ` · ${mgrs} sorumlu` : ""}`;
      })()} actions={
        /* Kişi eklemenin üç yolu tek düğmede */
        <div className="relative">
          <button onClick={() => setAddMenuOpen(o => !o)} className={pageActionClass}>
            <Plus size={16} /> Ekle <ChevronDown size={14} className={addMenuOpen ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
          {addMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setAddMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1.5 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-40 p-1.5">
                {[
                  { icon: Plus, title: "Tek kişi ekle", sub: "İsim ve telefonla hesap açılır", on: () => { resetAddForm(); setShowAddModal(true); } },
                  { icon: Upload, title: "Excel'den toplu ekle", sub: "Şablonu doldurup tüm ekibi bir kerede", on: () => setShowBulkModal(true) },
                  { icon: Link, title: "Kayıt bağlantısı paylaş", sub: "Kişiler kendisi kaydolur, siz onaylarsınız", on: () => setShowSignupCard(true) },
                  ...(canManageManagers ? [{
                    icon: UserCog, title: branchMgr ? "Departman sorumlusu ata" : "Sorumlu ekle",
                    sub: branchMgr ? "Bir departmanın planını yapacak kişi" : "Planı ve ekibi sizin yerinize yönetecek kişi",
                    on: () => setShowManagerAdd(true),
                  }] : []),
                ].map(o => (
                  <button key={o.title} onClick={() => { setAddMenuOpen(false); o.on(); }}
                    className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-slate-50">
                    <o.icon size={16} className="text-forest-600 mt-0.5 shrink-0" />
                    <span>
                      <span className="block text-sm font-bold text-slate-800">{o.title}</span>
                      <span className="block text-xs text-slate-500">{o.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      } />

      {/* Kayıt Linki: açık bir bağlantı varsa ya da menüden seçildiyse */}
      {authUser?.location_id && (() => {
        const myLoc = locations.find(l => l.id === authUser.location_id);
        const token = myLoc?.self_signup_token;
        if (!token && !showSignupCard) return null;
        const url = token ? `${window.location.origin}/self-signup/${token}` : "";
        return (
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Link size={15} className="text-forest-600" />
              <p className="text-sm font-bold text-slate-800">Kayıt Linki</p>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Bu bağlantıyı ekibinizle paylaşın. Linkten kayıt olan kişiler onayınızı bekleyen bir hesap oluşturur (Onaylar sekmesinde görünür).
            </p>
            {token ? (
              <div className="flex flex-wrap items-center gap-2">
                <input readOnly value={url} className="flex-1 min-w-[200px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-600" />
                <button
                  onClick={() => { navigator.clipboard.writeText(url); setSelfSignupCopied(true); setTimeout(() => setSelfSignupCopied(false), 2000); }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${selfSignupCopied ? "bg-emerald-500 text-white" : "bg-forest-600 hover:bg-forest-700 text-white"}`}
                >
                  {selfSignupCopied ? <Check size={13} /> : <Copy size={13} />} {selfSignupCopied ? "Kopyalandı" : "Kopyala"}
                </button>
                <button onClick={() => handleSelfSignup("generate")} disabled={selfSignupLoading} className="p-2 text-slate-400 hover:text-forest-600 hover:bg-forest-50 rounded-xl transition-colors disabled:opacity-50" title="Linki Yenile (eskisi geçersiz olur)">
                  {selfSignupLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                </button>
                <button onClick={() => handleSelfSignup("disable")} disabled={selfSignupLoading} className="px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50">
                  Kapat
                </button>
              </div>
            ) : (
              <button onClick={() => handleSelfSignup("generate")} disabled={selfSignupLoading} className="flex items-center gap-2 bg-forest-600 hover:bg-forest-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50">
                {selfSignupLoading ? <Loader2 size={14} className="animate-spin" /> : <Link size={14} />} Kayıt Linki Oluştur
              </button>
            )}
          </div>
        );
      })()}


      {noDept.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-900">{noDept.length} kişinin departmanı yok</p>
            <p className="text-xs text-red-800 mt-0.5">Departman seçilene kadar otomatik plana alınmazlar.</p>
          </div>
          <button onClick={() => setAssignOpen(true)}
            className="shrink-0 flex items-center justify-center gap-2 bg-forest-700 hover:bg-forest-800 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors">
            Departmanlara dağıt
          </button>
        </div>
      )}
      {assignOpen && <DepartmentAssignSheet open onClose={() => setAssignOpen(false)} depts={editDepts}
        people={noDept.map(p => ({ personnelId: p.personnelId!, name: p.name, title: p.title }))}
        onSaved={n => { setAssignOpen(false); fetchData(authUser); showToast(`${n} kişinin departmanı kaydedildi`); }} />}

      {notJoined.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-900">{notJoined.length} kişi henüz uygulamaya girmedi</p>
            <p className="text-xs text-amber-800 mt-0.5">Giriş bağlantılarını gönderin, yoksa vardiyalarını göremezler.</p>
          </div>
          <button onClick={() => prepareNotJoinedLinks(notJoined)} disabled={preparingLinks}
            className="shrink-0 flex items-center justify-center gap-2 bg-forest-700 hover:bg-forest-800 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50">
            {preparingLinks ? <Loader2 size={14} className="animate-spin" /> : <Link size={14} />} Bağlantıları Gönder
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="İsim, e-posta veya departman ara..." className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-forest-400 shadow-sm" />
      </div>

      {/* Liste (DESIGN.md §2): satırda ad, unvan ve en önemli tek durum; ayrıntılar dokununca açılır */}
      {loading ? (
        <List>
          {[1, 2, 3, 4].map(i => (
            <li key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
              <span className="w-8 h-8 rounded-full bg-slate-100" />
              <span className="flex-1 space-y-1.5"><span className="block h-3 bg-slate-100 rounded w-1/3" /><span className="block h-2.5 bg-slate-100 rounded w-1/4" /></span>
            </li>
          ))}
        </List>
      ) : (
        <PeopleList people={filtered} onOpen={p => setOpenKey(personKey(p))}
          // Ana departman + bu şubede yardım edebildiği departmanlar ("Mutfak + Kasa")
          deptName={p => {
            if (!p.department_id) return null;
            const ids = [p.department_id, ...p.assigned_department_ids.filter(id => id !== p.department_id)];
            return ids.map(id => editDepts.find(d => d.id === id)).filter(Boolean).map(d => departmentLabel(editDepts, d)).join(" + ") || null;
          }}
          hasDepts={() => editDepts.length > 0}
          managerSummary={managerSummary}
          empty={search ? "Aramaya uyan kimse yok." : "Henüz kimse eklenmedi."}
          emptyAction={!search && (
            <button onClick={() => { resetAddForm(); setShowAddModal(true); }} className="text-sm font-semibold text-forest-700 hover:underline">Kişi ekle</button>
          )} />
      )}

      {canManageManagers && (
        <ManagerAddSheet open={showManagerAdd} onClose={() => setShowManagerAdd(false)} locations={managerLocations}
          granter={authUser ?? {}} onDone={() => fetchData(authUser)} />
      )}

      {/* ADD MODAL */}
      {showAddModal && (
        <Sheet open onClose={() => { setShowAddModal(false); setAddError(""); }} title="Ekibe kişi ekle"
          description="Ekledikten sonra kişiye göndereceğiniz giriş bağlantısı çıkacak."
          footer={<>
            <button onClick={() => { setShowAddModal(false); setAddError(""); }} className={sheetSecondaryClass}>Vazgeç</button>
            <button onClick={handleAdd} disabled={addLoading} className={sheetPrimaryClass}>{addLoading ? "Ekleniyor…" : "Ekle"}</button>
          </>}>
            <div className="space-y-4">
              {/* Sadece gerekenler; gerisi "Diğer bilgiler"de ve sonradan kişinin ayrıntısında */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Ad Soyad *</label>
                  <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Ahmet Yılmaz" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Telefon</label>
                  <input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="0532..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                </div>
              </div>
              {isEmployee && (
                <details className="rounded-xl border border-slate-200 px-3 py-2">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-600">Diğer bilgiler (isteğe bağlı)</summary>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">E-posta</label>
                      <input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="ornek@mail.com" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Çalışma Tipi</label>
                      <select value={addForm.employment_type} onChange={e => setAddForm(f => ({ ...f, employment_type: e.target.value, ...("max_weekly_hours" in f && f.max_weekly_hours === defaultWeeklyHours(f.employment_type) ? { max_weekly_hours: defaultWeeklyHours(e.target.value) } : {}) }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-forest-400">
                        {EMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Haftalık en fazla saat</label>
                      <input type="number" min={8} max={60} value={addForm.max_weekly_hours} onChange={e => setAddForm(f => ({ ...f, max_weekly_hours: Number(e.target.value) }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                    </div>
                  </div>
                </details>
              )}
              {/* Şube: tek şubede sorulmaz (form bu şubeyle açılır) */}
              {locations.length <= 1 ? null : useMultiSelect ? (
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
                      <button key={l.id} type="button" onClick={() => toggleLoc(l.id)} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1 ${selLocIds.includes(l.id) ? "bg-forest-600 text-white border-forest-600" : "bg-white text-slate-600 border-slate-200 hover:border-forest-300"}`}>
                        {selLocIds.includes(l.id) && <Check size={10} />}{l.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Şube *</label>
                  <select value={singleLocId} onChange={e => setSingleLocId(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-forest-400">
                    <option value="">Şube seçin...</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
              {/* Department */}
              {/* Departman sadece şubede tanımlıysa sorulur (onboarding bilinçli olarak departman açmaz) */}
              {useMultiSelect && selLocIds.length > 0 && allSelectedDepts.length > 0 && (
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
                      <button key={d.id} type="button" onClick={() => setSelDeptIds(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1 ${selDeptIds.includes(d.id) ? "bg-forest-600 text-white border-forest-600" : "bg-white text-slate-600 border-slate-200 hover:border-forest-300"}`}>
                        {selDeptIds.includes(d.id) && <Check size={10} />}{d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {addError && <p className="text-sm text-red-600">{addError}</p>}
            </div>
        </Sheet>
      )}

      {/* GİRİŞ BAĞLANTILARI (yeni hesap, tek kişi ya da henüz girmeyen herkes) */}
      <Sheet open={!!inviteLinks} onClose={() => setInviteLinks(null)} title="Giriş bağlantıları"
        footer={<button onClick={() => setInviteLinks(null)} className={sheetPrimaryClass}>Tamam</button>}>
        {inviteLinks && <InviteLinkList results={inviteLinks} />}
      </Sheet>

      {/* EDIT MODAL */}
      {openPerson && (
        <PersonSheet key={personKey(openPerson)} person={openPerson} account={userOf(openPerson)}
          viewer={{ id: authUser?.id, role: authUser?.role ?? "", location_id: authUser?.location_id, access: authUser?.access }}
          branch={locations.find(l => l.id === (openPerson.location_id ?? authUser?.location_id)) ?? locations.find(l => l.id === authUser?.location_id) ?? null}
          managerLocations={managerLocations}
          teamAvgScore={(() => {
            const team = persons.filter(x => x.personnelId && x.role === "employee" && !x.inactive && x.location_id === openPerson.location_id);
            return team.length ? team.reduce((a, x) => a + x.prev_score, 0) / team.length : 0;
          })()}
          onClose={() => setOpenKey(null)}
          onChanged={msg => { setOpenKey(null); fetchData(authUser); showToast(msg); }}
          onInvite={setInviteLinks} />
      )}

      {/* Excel/CSV ile toplu aktarım (components/personnel/BulkImportModal) */}
      {showBulkModal && authUser?.location_id && (
        <BulkImportModal locationId={authUser.location_id} onClose={() => setShowBulkModal(false)} onDone={() => fetchData(authUser)} />
      )}

      {toast && (
        <div className="fixed bottom-24 right-4 lg:bottom-8 md:right-8 bg-slate-900 text-white text-xs font-bold px-5 py-3 rounded-2xl shadow-xl z-50 max-w-xs">{toast}</div>
      )}
    </Page>
  );
}
