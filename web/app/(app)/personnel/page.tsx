"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { hasManagerPermission, LOCK_NOTE, type ManagerPermission } from "@/lib/ruleLocks";
import { defaultWeeklyHours } from "@/lib/legal";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, Trash2, Check, Copy,
  Link, Upload, Loader2, RefreshCw, UserCog,
  ChevronDown,
} from "lucide-react";
import { isModuleOn } from "@/lib/moduleVisibility";
import { industryFromRules, matchDocument, type DocumentSpec } from "@/lib/templates";
import BulkImportModal from "@/components/personnel/BulkImportModal";
import InviteLinkList, { type InviteResult } from "@/components/personnel/InviteLinkList";
import { ManagerAccessEditor, ManagerAddSheet, accessSummary, canEditManager, type Mgr } from "@/components/personnel/ManagersCard";
import { isBranchManager, parseAccess } from "@/lib/userAccess";

const viewerAccessOf = (u: any) => ({ role: u?.role ?? null, access: parseAccess(u?.access) });
import { Page, PageHeader, pageActionClass } from "@/components/ui/PageHeader";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListEmpty, ListItem, ListSection } from "@/components/ui/List";
import { DetailRow, Sheet, sheetDangerClass, sheetPrimaryClass, sheetSecondaryClass } from "@/components/ui/Sheet";

type MergedPerson = {
  /** Giriş hesabı; hızlı eklenen personelde yoktur (portala giremez). */
  userId: string | null;
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
  department_id: string | null;
  ytd_overtime_hours: number | null;
  hourly_wage: number | null;
  night_restriction: string | null;
  role_levels?: Record<string, string> | null;
  hire_date: string | null;
  annual_leave_days_total: number | null;
  leave_adjustment_days: number | null;
  kiosk_pin_set: boolean;
};

// Yöneticiler ayrı kartta (components/personnel/ManagersCard) eklenir; bu form sadece çalışan ekler
const ROLE_DEFS = [
  { label: "Çalışan", role: "employee", display_title: "" },
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

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  // Yöneticilerin yetki bilgisi (permissions, kapsam) ayrıntıda yetki düzenleyici için
  const [rawUsers, setRawUsers] = useState<Mgr[]>([]);
  const [showManagerAdd, setShowManagerAdd] = useState(false);
  const [showSignupCard, setShowSignupCard] = useState(false);
  const [locations, setLocations] = useState<{ id: string; name: string; self_signup_token?: string | null; rules?: Record<string, unknown> | null }[]>([]);
  // Müdür izinleri (lib/ruleLocks): patron/bölge müdürü her zaman, müdür şube ayarına göre
  const can = (perm: ManagerPermission) =>
    hasManagerPermission(authUser?.role, locations.find(l => l.id === authUser?.location_id)?.rules ?? {}, perm);
  const [selfSignupLoading, setSelfSignupLoading] = useState(false);
  const [selfSignupCopied, setSelfSignupCopied] = useState(false);
  const [deptCache, setDeptCache] = useState<Record<string, { id: string; name: string }[]>>({});

  // Add form
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", phone: "", title: "", employment_type: "full_time", max_weekly_hours: 45 });
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
  const [inviteLinkLoading, setInviteLinkLoading] = useState<string | null>(null);

  // Edit modal
  const [editingPerson, setEditingPerson] = useState<MergedPerson | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", title: "", employment_type: "full_time", weekly_off_day: null as number | null, max_weekly_hours: 45, min_weekly_hours: 0, roles: [] as string[], crew_id: null as string | null, hourly_wage: null as number | null, night_restriction: null as string | null, isSenior: false, hire_date: "" as string, annual_leave_days_total: 14, leave_adjustment_days: 0, department_id: null as string | null });
  const [crewList, setCrewList] = useState<{ id: string; name: string; color: string }[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  // Belgeler (Modül 5 — Belge/Sertifika Uyumluluğu)
  const [personnelDocs, setPersonnelDocs] = useState<{ id: number; doc_type: string; expiry_date: string; note: string | null }[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [newDocType, setNewDocType] = useState("");
  const [newDocExpiry, setNewDocExpiry] = useState("");
  const [docError, setDocError] = useState("");

  // Kiosk PIN (Modül 2 — Kiosk Modu)
  const [newKioskPin, setNewKioskPin] = useState("");
  const [kioskPinError, setKioskPinError] = useState("");
  const [kioskPinSaving, setKioskPinSaving] = useState(false);

  // Bulk upload
  const [showBulkModal, setShowBulkModal] = useState(false);

  const [toast, setToast] = useState("");
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  const isEmployee = true;
  const useMultiSelect = true; // çalışan birden çok şubeye atanabilir

  const fetchData = async (u: any) => {
    setLoading(true);
    try {
      const [usersRes, personnelRes, crewRes] = await Promise.all([
        fetch("/api/users"),
        fetch(`/api/personnel?location_id=${u.location_id}`),
        fetch(`/api/crews?location_id=${u.location_id}`),
      ]);
      const users = await usersRes.json();
      setRawUsers(Array.isArray(users) ? users : []);
      const personnelList = await personnelRes.json();
      const crewData = await crewRes.json();
      if (Array.isArray(crewData)) setCrewList(crewData.map((c: any) => ({ id: c.id, name: c.name, color: c.color ?? "#6366f1" })));
      // Liste şubenin PERSONELİNDEN kurulur (hızlı eklenen, hesabı olmayanlar dahil), hesap bilgisi
      // eklenir; personel kaydı olmayan hesaplar (müdürler, onay bekleyenler) sona eklenir.
      const userList: any[] = Array.isArray(users) ? users : [];
      const userByPersonnel = new Map<string, any>(userList.filter(x => x.personnel_id).map(x => [x.personnel_id, x]));
      const toMerged = (acc: any | undefined, p: any | undefined): MergedPerson => ({
        userId: acc?.id ?? null, personnelId: p?.id ?? acc?.personnel_id ?? null,
        name: p?.name ?? acc?.name ?? "", username: acc?.username ?? "",
        email: acc?.email ?? p?.email ?? null, phone: acc?.phone ?? p?.phone ?? null,
        role: acc?.role ?? "employee", display_title: acc?.display_title ?? null,
        approval_status: acc?.approval_status ?? "active", is_temp_password: !!acc?.is_temp_password,
        title: p?.title ?? null, employment_type: p?.employment_type ?? null,
        prev_score: p?.prev_score ?? 0, hero_count: p?.hero_count ?? 0,
        roles: Array.isArray(p?.roles) ? p.roles : [],
        weekly_off_day: p?.weekly_off_day ?? null, max_weekly_hours: p?.max_weekly_hours ?? null,
        min_weekly_hours: p?.min_weekly_hours ?? null, location_id: acc?.location_id ?? p?.primary_location_id ?? null,
        crew_id: p?.crew_id ?? null,
        department_id: p?.department_id ?? null,
        ytd_overtime_hours: p?.ytd_overtime_hours ?? null,
        hourly_wage: p?.hourly_wage ?? null,
        night_restriction: p?.night_restriction ?? null,
        role_levels: p?.role_levels ?? null,
        hire_date: p?.hire_date ?? null,
        annual_leave_days_total: p?.annual_leave_days_total ?? null,
        leave_adjustment_days: p?.leave_adjustment_days ?? null,
        kiosk_pin_set: !!p?.kiosk_pin_set,
      });
      const staff: any[] = Array.isArray(personnelList) ? personnelList.filter((p: any) => p.status !== "inactive") : [];
      const staffIds = new Set(staff.map(p => p.id));
      const merged: MergedPerson[] = [
        ...staff.map(p => toMerged(userByPersonnel.get(p.id), p)),
        ...userList.filter(acc => !acc.personnel_id || !staffIds.has(acc.personnel_id))
          .filter(acc => acc.id === u.id || acc.location_id === u.location_id)
          .map(acc => toMerged(acc, undefined)),
      ];
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

  const allSelectedDepts = useMultiSelect
    ? selLocIds.flatMap(locId => deptCache[locId] ?? [])
    : singleLocId ? (deptCache[singleLocId] ?? []) : [];

  const toggleLoc = (id: string) => {
    setSelLocIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setSelDeptIds([]);
  };

  const resetAddForm = () => {
    setAddForm({ name: "", email: "", phone: "", title: "", employment_type: "full_time", max_weekly_hours: 45 });
    // Şube panelindeyiz: form o şube seçili açılır
    const here = authUser?.location_id ?? "";
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
      setInviteLinks([{ name: data.user.name, username: data.credentials.username, invite_token: data.inviteToken }]);
      setShowAddModal(false);
      resetAddForm();
      fetchData(authUser);
    } catch { setAddError("Sunucu hatası"); }
    setAddLoading(false);
  };

  const createInvite = async (person: MergedPerson): Promise<InviteResult | null> => {
    const res = await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: person.userId }) });
    const data = await res.json().catch(() => null);
    return res.ok && data?.token ? { name: person.name, username: person.username, invite_token: data.token } : null;
  };

  const handleGenerateInvite = async (person: MergedPerson) => {
    setInviteLinkLoading(person.userId);
    try {
      const r = await createInvite(person);
      if (r) setInviteLinks([r]);
    } finally { setInviteLinkLoading(null); }
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

  // Hızlı eklenen (hesabı olmayan) personele portal hesabı aç; aynı davet penceresi gösterilir
  const [openingAccountId, setOpeningAccountId] = useState<string | null>(null);
  const handleOpenAccount = async (person: MergedPerson) => {
    if (!person.personnelId || person.userId) return;
    setOpeningAccountId(person.personnelId);
    try {
      const res = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ existing_personnel_id: person.personnelId, role: "employee" }) });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Hesap açılamadı"); return; }
      setInviteLinks([{ name: data.user.name, username: data.credentials.username, invite_token: data.inviteToken }]);
      fetchData(authUser);
    } finally { setOpeningAccountId(null); }
  };

  const handleApprove = async (person: MergedPerson, status: "active" | "rejected") => {
    if (!person.userId) return;
    await fetch(`/api/users?id=${person.userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approval_status: status }) });
    fetchData(authUser);
    showToast(status === "active" ? "Hesap onaylandı" : "Hesap reddedildi");
  };

  const handleDelete = async (person: MergedPerson) => {
    if (!person.userId) return;
    await fetch(`/api/users?id=${person.userId}`, { method: "DELETE" });
    fetchData(authUser);
  };

  const openEdit = (p: MergedPerson) => {
    setEditingPerson(p);
    setEditForm({ name: p.name, phone: p.phone ?? "", title: p.title ?? "", employment_type: p.employment_type ?? "full_time", weekly_off_day: p.weekly_off_day ?? null, max_weekly_hours: p.max_weekly_hours ?? 45, min_weekly_hours: p.min_weekly_hours ?? 0, roles: p.roles ?? [], crew_id: p.crew_id ?? null, hourly_wage: p.hourly_wage ?? null, night_restriction: p.night_restriction ?? null, isSenior: Object.values(p.role_levels ?? {}).includes("primary"), hire_date: p.hire_date ?? "", annual_leave_days_total: p.annual_leave_days_total ?? 14, leave_adjustment_days: p.leave_adjustment_days ?? 0, department_id: p.department_id ?? null });
    setEditError("");
    setPersonnelDocs([]);
    setNewDocType(""); setNewDocExpiry(""); setDocError("");
    if (p.personnelId) fetchPersonnelDocs(p.personnelId);
    setNewKioskPin(""); setKioskPinError("");
  };

  const fetchPersonnelDocs = async (personnelId: string) => {
    setDocsLoading(true);
    try {
      const res = await fetch(`/api/personnel-documents?personnel_id=${personnelId}`);
      const data = await res.json();
      if (Array.isArray(data)) setPersonnelDocs(data);
    } catch { /* empty */ }
    setDocsLoading(false);
  };

  const handleAddDoc = async () => {
    if (!editingPerson?.personnelId || !newDocType.trim() || !newDocExpiry) return;
    setDocError("");
    try {
      const res = await fetch("/api/personnel-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personnel_id: editingPerson.personnelId, doc_type: newDocType.trim(), expiry_date: newDocExpiry }),
      });
      const data = await res.json();
      if (!res.ok) { setDocError(data.error ?? "Belge eklenemedi"); return; }
      setNewDocType(""); setNewDocExpiry("");
      fetchPersonnelDocs(editingPerson.personnelId);
    } catch { setDocError("Belge eklenemedi"); }
  };

  const handleDeleteDoc = async (id: number) => {
    if (!editingPerson?.personnelId) return;
    await fetch(`/api/personnel-documents?id=${id}`, { method: "DELETE" });
    fetchPersonnelDocs(editingPerson.personnelId);
  };

  const handleSetKioskPin = async () => {
    if (!editingPerson?.personnelId || !/^\d{4}$/.test(newKioskPin)) return;
    setKioskPinSaving(true);
    setKioskPinError("");
    try {
      const res = await fetch(`/api/personnel/${editingPerson.personnelId}/kiosk-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: newKioskPin }),
      });
      const data = await res.json();
      if (!res.ok) { setKioskPinError(data.error ?? "PIN kaydedilemedi"); return; }
      setNewKioskPin("");
      setEditingPerson(prev => prev ? { ...prev, kiosk_pin_set: true } : prev);
      setPersons(prev => prev.map(p => p.personnelId === editingPerson.personnelId ? { ...p, kiosk_pin_set: true } : p));
      showToast("Tablet PIN'i atandı");
    } catch { setKioskPinError("PIN kaydedilemedi"); }
    finally { setKioskPinSaving(false); }
  };

  const handleClearKioskPin = async () => {
    if (!editingPerson?.personnelId) return;
    await fetch(`/api/personnel/${editingPerson.personnelId}/kiosk-pin`, { method: "DELETE" });
    setEditingPerson(prev => prev ? { ...prev, kiosk_pin_set: false } : prev);
    setPersons(prev => prev.map(p => p.personnelId === editingPerson.personnelId ? { ...p, kiosk_pin_set: false } : p));
    showToast("Tablet PIN'i kaldırıldı");
  };

  const handleEdit = async () => {
    if (!editingPerson) return;
    if (editForm.min_weekly_hours > editForm.max_weekly_hours) { setEditError("Min haftalık saat, max haftalık saatten büyük olamaz."); return; }
    setEditLoading(true); setEditError("");
    try {
      if (editingPerson.userId) {
        await fetch(`/api/users?id=${editingPerson.userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editForm.name, phone: editForm.phone }) });
      }
      if (editingPerson.personnelId) {
        // Hesabı olmayan personelde ad ve telefon yalnızca personel kaydında tutulur
        const nameFields = editingPerson.userId ? {} : { name: editForm.name, phone: editForm.phone };
        const res = await fetch(`/api/personnel?id=${editingPerson.personnelId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...nameFields, title: editForm.title, employment_type: editForm.employment_type, weekly_off_day: editForm.weekly_off_day, max_weekly_hours: editForm.max_weekly_hours, min_weekly_hours: editForm.min_weekly_hours, roles: editForm.roles, crew_id: editForm.crew_id, hourly_wage: editForm.hourly_wage, night_restriction: editForm.night_restriction, role_levels: editForm.isSenior ? { senior: "primary" } : {}, hire_date: editForm.hire_date || null, annual_leave_days_total: editForm.annual_leave_days_total, leave_adjustment_days: editForm.leave_adjustment_days, ...(editDepts.length > 0 ? { department_id: editForm.department_id } : {}) }) });
        const data = await res.json();
        if (!res.ok) { setEditError(data.error ?? "Güncelleme hatası"); setEditLoading(false); return; }
      }
      setEditingPerson(null); fetchData(authUser); showToast("Bilgiler güncellendi");
    } catch { setEditError("Sunucu hatası"); }
    setEditLoading(false);
  };

  // Yönetici/şef ekleme ve yetki düzenleme: patron, bölge yöneticisi, şube müdürü (kendi şefleri)
  const branchMgr = isBranchManager(viewerAccessOf(authUser));
  const canManageManagers = authUser?.role === "admin" || authUser?.role === "supervisor" || branchMgr;
  const managerLocations = (authUser?.role === "manager" ? locations.filter(l => l.id === authUser?.location_id) : locations).map(l => ({ id: l.id, name: l.name }));

  // Ayrıntı paneli (kişiye dokununca) ve iki adımlı silme
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const detailPerson = detailKey ? persons.find(p => (p.personnelId ?? p.userId) === detailKey) ?? null : null;
  const userOf = (p: MergedPerson) => (p.userId ? rawUsers.find(u => u.id === p.userId) ?? null : null);
  const managerSummary = (p: MergedPerson) => {
    const u = userOf(p);
    return u ? accessSummary(u, id => editDepts.find(d => d.id === id)?.name) : null;
  };
  /** Satırdaki tek durum (DESIGN.md §4): en önemlisi. */
  const rowStatus = (p: MergedPerson): { label: string; tone: PillTone } | null => {
    if (p.approval_status === "pending") return { label: "Onay bekliyor", tone: "attention" };
    if (p.userId && p.is_temp_password) return { label: "Henüz girmedi", tone: "attention" };
    if (p.personnelId && p.role === "employee" && !p.department_id && editDepts.length > 0) return { label: "Departman seçin", tone: "attention" };
    return null;
  };

  // Hesabı var ama davet bağlantısıyla hiç girip şifresini belirlememiş
  const notJoined = persons.filter(p => p.userId && p.is_temp_password && p.approval_status !== "pending");

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

  const filtered = persons.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (p.title ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const editDepts = authUser?.location_id ? (deptCache[authUser.location_id] ?? []) : [];
  const complianceTrackingEnabled = locations.some(l => isModuleOn(l.rules, "compliance_tracking_enabled"));
  // Şubenin işletme türü (lib/templates): rol listesi ve belge kataloğu buradan gelir
  const branchIndustry = industryFromRules(locations.find(l => l.id === authUser?.location_id)?.rules);
  const roleLabels = new Set(branchIndustry?.roles.map(r => r.label) ?? []);
  // Seçili rollerin gerektirdiği belgeler ve bu kişideki durumu (geçerli / süresi dolmuş / girilmemiş)
  const requiredDocStates = (() => {
    if (!branchIndustry) return [] as { spec: DocumentSpec; state: "valid" | "expired" | "missing" }[];
    const ids = new Set(branchIndustry.roles.filter(r => editForm.roles.includes(r.label)).flatMap(r => r.requiredDocs ?? []));
    for (const d of branchIndustry.documents) if (d.requiredForAll) ids.add(d.id);
    return branchIndustry.documents.filter(d => ids.has(d.id)).map(spec => {
      const mine = personnelDocs.filter(pd => matchDocument(branchIndustry, pd.doc_type)?.id === spec.id).map(pd => pd.expiry_date).sort();
      const state: "valid" | "expired" | "missing" = !mine.length ? "missing" : mine[mine.length - 1] < todayISO ? "expired" : "valid";
      return { spec, state };
    });
  })();
  const kioskModeEnabled = locations.some(l => isModuleOn(l.rules, "kiosk_mode_enabled"));
  const todayISO = new Date().toISOString().split("T")[0];

  const roleBadge = (p: MergedPerson) => {
    if (p.role === "admin") return { label: "İşletme Sahibi", tone: "accent" as PillTone };
    // Yönetici (tek ya da çok şubeli): unvan girildiyse o, yoksa "Yönetici"
    if (p.role === "supervisor" || p.role === "manager") return { label: p.display_title || "Yönetici", tone: "brand" as PillTone };
    return { label: "Çalışan", tone: "neutral" as PillTone };
  };

  if (!mounted) return <Page />;

  return (
    <Page width="narrow">
      {/* Header */}
      <PageHeader title="Ekip" description={`${persons.length} kişi`} actions={
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
                  { icon: Link, title: "Kayıt bağlantısı paylaş", sub: "Personel kendi kaydolur, siz onaylarsınız", on: () => setShowSignupCard(true) },
                  ...(canManageManagers ? [{
                    icon: UserCog, title: branchMgr ? "Şef ata" : "Yönetici ekle",
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
              Bu linki personelinizle paylaşın. Linkten kayıt olan kişiler onayınızı bekleyen bir hesap oluşturur (Onaylar sekmesinde görünür).
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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="İsim, email veya unvan ara..." className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-forest-400 shadow-sm" />
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
        <List>
          {filtered.length === 0 ? (
            <ListEmpty action={!search && (
              <button onClick={() => { resetAddForm(); setShowAddModal(true); }} className="text-sm font-semibold text-forest-700 hover:underline">Kişi ekle</button>
            )}>
              {search ? "Aramaya uyan kimse yok." : "Henüz kimse eklenmedi."}
            </ListEmpty>
          ) : (() => {
            const managers = filtered.filter(p => p.role !== "employee");
            const staff = filtered.filter(p => p.role === "employee");
            const row = (p: MergedPerson) => {
              const pill = rowStatus(p);
              const sub = [
                p.role === "employee" ? (p.title || null) : roleBadge(p).label,
                p.role !== "employee" && p.role !== "admin" ? managerSummary(p) : null,
                p.department_id ? (editDepts.find(d => d.id === p.department_id)?.name ?? null) : null,
                !p.userId ? "Giriş hesabı yok" : null,
              ].filter(Boolean).join(" · ");
              return (
                <ListItem key={p.personnelId ?? p.userId}
                  leading={<Avatar name={p.name} tone={p.role === "employee" ? "neutral" : "brand"} />}
                  title={p.name}
                  subtitle={sub || undefined}
                  trailing={pill && <StatusPill tone={pill.tone}>{pill.label}</StatusPill>}
                  onClick={() => setDetailKey(p.personnelId ?? p.userId)}
                />
              );
            };
            return (
              <>
                {managers.length > 0 && <ListSection title="Yönetim" count={managers.length} />}
                {managers.map(row)}
                {managers.length > 0 && staff.length > 0 && <ListSection title="Çalışanlar" count={staff.length} />}
                {staff.map(row)}
              </>
            );
          })()}
        </List>
      )}

      {/* Kişi ayrıntısı: iletişim, Adalet Puanı ve tüm işlemler burada */}
      {detailPerson && (() => {
        const p = detailPerson;
        const isPending = p.approval_status === "pending";
        const canDelete = !!p.userId && p.userId !== authUser?.id && p.role !== "admin"
          && (authUser?.role === "admin" || (authUser?.role === "supervisor" && p.role !== "supervisor") || (p.role === "employee" && can("personnel_delete")));
        const crew = p.crew_id ? crewList.find(c => c.id === p.crew_id) : null;
        const close = () => { setDetailKey(null); setConfirmDeleteKey(null); };
        return (
          <Sheet open onClose={close}
            title={<span className="flex items-center gap-3"><Avatar name={p.name} size="md" tone={p.role === "employee" ? "neutral" : "brand"} />{p.name}</span>}
            footer={<>
              {canDelete && (confirmDeleteKey === p.userId
                ? <button onClick={async () => { await handleDelete(p); close(); }} className="mr-auto px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">Evet, sil</button>
                : <button onClick={() => setConfirmDeleteKey(p.userId)} className={`mr-auto ${sheetDangerClass}`}>Hesabı sil</button>)}
              {p.userId
                ? <button onClick={() => handleGenerateInvite(p)} disabled={inviteLinkLoading === p.userId} className={sheetSecondaryClass}>Giriş bağlantısı</button>
                : p.personnelId && <button onClick={() => handleOpenAccount(p)} disabled={openingAccountId === p.personnelId} className={sheetSecondaryClass}>{openingAccountId === p.personnelId ? "Açılıyor…" : "Hesap aç"}</button>}
              <button onClick={() => { close(); openEdit(p); }} className={sheetPrimaryClass}>Düzenle</button>
            </>}
          >
            {isPending && (authUser?.role === "admin" || authUser?.role === "supervisor") && (
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                <span className="flex-1 text-sm text-amber-900">Hesap onay bekliyor.</span>
                <button onClick={async () => { await handleApprove(p, "rejected"); close(); }} className="text-sm font-semibold text-red-700 px-2">Reddet</button>
                <button onClick={async () => { await handleApprove(p, "active"); close(); }} className="text-sm font-bold text-white bg-emerald-600 rounded-lg px-3 py-1.5">Onayla</button>
              </div>
            )}
            <DetailRow label="Rol">{roleBadge(p).label}</DetailRow>
            {p.title && p.role === "employee" && <DetailRow label="Unvan">{p.title}</DetailRow>}
            {p.department_id && <DetailRow label="Departman">{editDepts.find(d => d.id === p.department_id)?.name ?? "-"}</DetailRow>}
            {p.personnelId && p.role === "employee" && !p.department_id && editDepts.length > 0 && (
              <DetailRow label="Departman"><span className="text-amber-700">Seçilmemiş, otomatik plana alınmaz</span></DetailRow>
            )}
            <DetailRow label="Kullanıcı adı">{p.userId ? p.username : "Giriş hesabı yok"}</DetailRow>
            {p.userId && p.is_temp_password && <DetailRow label="Durum"><span className="text-amber-700">Henüz uygulamaya girmedi</span></DetailRow>}
            {p.phone && <DetailRow label="Telefon"><a href={`tel:${p.phone}`} className="text-forest-700">{p.phone}</a></DetailRow>}
            {p.email && <DetailRow label="E-posta">{p.email}</DetailRow>}
            {p.personnelId && p.role === "employee" && <DetailRow label="Adalet Puanı">{p.prev_score}</DetailRow>}
            {p.hero_count > 0 && <DetailRow label="Açık vardiya üstlenme">{p.hero_count} kez</DetailRow>}
            {crew && <DetailRow label="Ekip">{crew.name}</DetailRow>}
            {(p.ytd_overtime_hours ?? 0) > 0 && <DetailRow label="Bu yıl fazla mesai">{p.ytd_overtime_hours} saat</DetailRow>}
            {(() => {
              const u = userOf(p);
              if (!u || (u.role !== "manager" && u.role !== "supervisor")) return null;
              return (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-base font-bold text-slate-900 mb-3">Yönetim yetkisi</p>
                  <p className="text-sm text-slate-600 mb-3">{accessSummary(u, id => editDepts.find(d => d.id === id)?.name)}</p>
                  {canEditManager(authUser?.role ?? "", branchMgr, u) && (
                    <ManagerAccessEditor key={u.id} m={u} locations={managerLocations} viewerRole={authUser?.role ?? ""} branchManager={branchMgr}
                      onDone={() => { close(); fetchData(authUser); }} />
                  )}
                </div>
              );
            })()}
          </Sheet>
        );
      })()}

      {canManageManagers && (
        <ManagerAddSheet open={showManagerAdd} onClose={() => setShowManagerAdd(false)} locations={managerLocations}
          viewerRole={authUser?.role ?? ""} branchManager={branchMgr} onDone={() => fetchData(authUser)} />
      )}

      {/* ADD MODAL */}
      {showAddModal && (
        <Sheet open onClose={() => { setShowAddModal(false); setAddError(""); }} title="Çalışan ekle"
          description="Eklendikten sonra giriş bağlantısı gösterilir."
          footer={<>
            <button onClick={() => { setShowAddModal(false); setAddError(""); }} className={sheetSecondaryClass}>Vazgeç</button>
            <button onClick={handleAdd} disabled={addLoading} className={sheetPrimaryClass}>{addLoading ? "Ekleniyor…" : "Ekle"}</button>
          </>}>
            <div className="space-y-4">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Ad Soyad *</label>
                  <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Ahmet Yılmaz" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                </div>
                {isEmployee && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Unvan</label>
                    <input value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} placeholder="Barista..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">E-posta</label>
                  <input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="ornek@mail.com" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Telefon</label>
                  <input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="0532..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                </div>
              </div>
              {isEmployee && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Çalışma Tipi</label>
                    <select value={addForm.employment_type} onChange={e => setAddForm(f => ({ ...f, employment_type: e.target.value, ...("max_weekly_hours" in f && f.max_weekly_hours === defaultWeeklyHours(f.employment_type) ? { max_weekly_hours: defaultWeeklyHours(e.target.value) } : {}) }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-forest-400">
                      {EMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Max Haftalık Saat</label>
                    <input type="number" min={8} max={60} value={addForm.max_weekly_hours} onChange={e => setAddForm(f => ({ ...f, max_weekly_hours: Number(e.target.value) }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                  </div>
                </div>
              )}
              {/* Branch */}
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
                        {selDeptIds.includes(d.id) && <Check size={10} />}{d.name}
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
      {editingPerson && (
        <Sheet open onClose={() => setEditingPerson(null)} title={`${editingPerson.name} · Düzenle`}
          footer={<>
            <button onClick={() => setEditingPerson(null)} className={sheetSecondaryClass}>Vazgeç</button>
            <button onClick={handleEdit} disabled={editLoading} className={sheetPrimaryClass}>{editLoading ? "Kaydediliyor…" : "Kaydet"}</button>
          </>}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Ad Soyad</label>
                  <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Unvan</label>
                  <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} placeholder="Barista..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Telefon</label>
                <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="+90 532 ..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
              </div>
              {editingPerson.personnelId && editDepts.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Departman</label>
                  <select value={editForm.department_id ?? ""} onChange={e => setEditForm(f => ({ ...f, department_id: e.target.value || null }))}
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-forest-400 ${editForm.department_id ? "border-slate-200" : "border-amber-300"}`}>
                    <option value="">Seçilmedi (otomatik plana alınmaz)</option>
                    {editDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
              {editingPerson.personnelId && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Çalışma Tipi</label>
                      <select value={editForm.employment_type} onChange={e => setEditForm(f => ({ ...f, employment_type: e.target.value, ...("max_weekly_hours" in f && f.max_weekly_hours === defaultWeeklyHours(f.employment_type) ? { max_weekly_hours: defaultWeeklyHours(e.target.value) } : {}) }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-forest-400">
                        {EMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Max Haftalık Saat</label>
                      <input type="number" min={8} max={60} value={editForm.max_weekly_hours} onChange={e => setEditForm(f => ({ ...f, max_weekly_hours: Number(e.target.value) }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Min Haftalık Saat</label>
                      <input type="number" min={0} max={editForm.max_weekly_hours} value={editForm.min_weekly_hours} onChange={e => setEditForm(f => ({ ...f, min_weekly_hours: Number(e.target.value) }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Sabit İzin Günü</label>
                      <select value={editForm.weekly_off_day === null ? "" : String(editForm.weekly_off_day)} onChange={e => setEditForm(f => ({ ...f, weekly_off_day: e.target.value === "" ? null : Number(e.target.value) }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-forest-400">
                        <option value="">Tanımsız</option>
                        {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Saatlik Ücret (₺, brüt)</label>
                    <input type="number" min={0} step={0.5} placeholder="Tanımsız" value={editForm.hourly_wage ?? ""} disabled={!can("budget")} onChange={e => setEditForm(f => ({ ...f, hourly_wage: e.target.value === "" ? null : Number(e.target.value) }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400 disabled:opacity-60 disabled:cursor-not-allowed" />
                    <p className="text-xs text-slate-400 mt-1">
                      {can("budget")
                        ? "Fazla mesai maliyeti hesabında kullanılır (mesai saati × ücret × 1,5). Boş bırakılırsa maliyet gösterilmez."
                        : `🔒 ${LOCK_NOTE}`}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Gece Çalışma Engeli</label>
                    <select
                      value={editForm.night_restriction ?? ""}
                      onChange={e => setEditForm(f => ({ ...f, night_restriction: e.target.value || null }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-forest-400"
                    >
                      <option value="">Yok (gece çalışabilir)</option>
                      <option value="pregnant">Gebe (gece çalışamaz)</option>
                      <option value="nursing">Emziren (gece çalışamaz)</option>
                      <option value="under18">18 yaş altı (gece çalışamaz)</option>
                      <option value="medical">Sağlık raporu (gece çalışamaz)</option>
                    </select>
                    <p className="text-xs text-slate-400 mt-1">Bir engel seçiliyse otomatik planlama bu kişiye hiçbir gece vardiyası yazmaz (İş K. m.73). Elle atamalarda yayın öncesi uyarı verilir.</p>
                  </div>
                  <label className="flex items-center gap-2.5 border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.isSenior}
                      onChange={e => setEditForm(f => ({ ...f, isSenior: e.target.checked }))}
                      className="w-4 h-4 rounded accent-forest-600"
                    />
                    <span className="text-sm font-semibold text-slate-700">Kıdemli Personel</span>
                    <span className="text-xs text-slate-400 ml-auto">Ayarlar → Gelişmiş Seçenekler → Planlama Kuralları&apos;ndaki &quot;Kıdemli Personel Kuralı&quot; açıksa, otomatik planlama her vardiyada en az 1 kıdemli bulundurmaya çalışır</span>
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">İşe Giriş Tarihi</label>
                      <input type="date" value={editForm.hire_date ?? ""} onChange={e => setEditForm(f => ({ ...f, hire_date: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Yıllık İzin (gün)</label>
                      <input type="number" min={0} max={60} value={editForm.annual_leave_days_total} onChange={e => setEditForm(f => ({ ...f, annual_leave_days_total: Number(e.target.value) || 0 }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">İzin Düzeltme (±)</label>
                      <input type="number" min={-30} max={60} value={editForm.leave_adjustment_days} onChange={e => setEditForm(f => ({ ...f, leave_adjustment_days: Number(e.target.value) || 0 }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 -mt-2">Kalan izin otomatik hesaplanır: Ayarlar'da &quot;Kıdeme Göre İzin Hak Edişi&quot; açıksa işe giriş tarihinden (1-5 yıl 14g, 5+ yıl 20g, 15+ yıl 26g, devirli); kapalıysa buradaki sabit günden. Düzeltme alanı geçmiş dönem devri gibi elle eklemeler içindir.</p>
                  {crewList.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Ekip Ataması</label>
                      <select
                        value={editForm.crew_id ?? ""}
                        onChange={e => setEditForm(f => ({ ...f, crew_id: e.target.value || null }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-forest-400"
                      >
                        <option value="">— Ekip Yok —</option>
                        {crewList.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {branchIndustry && (
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1 block">Rol ve Yetkinlikler</label>
                      <p className="text-xs text-slate-400 mb-2">Otomatik planlama, bir vardiyada &quot;en az 1 Bakım Teknisyeni&quot; gibi zorunluluğu bu listeye bakarak karşılar.</p>
                      <div className="flex flex-wrap gap-1.5">
                        {branchIndustry.roles.map(role => {
                          const selected = editForm.roles.includes(role.label);
                          return (
                            <button key={role.id} type="button"
                              onClick={() => setEditForm(f => ({ ...f, roles: selected ? f.roles.filter(r => r !== role.label) : [...f.roles, role.label] }))}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${selected ? "bg-forest-600 text-white border-forest-600" : "bg-white text-slate-600 border-slate-200 hover:border-forest-300"}`}>
                              {selected && <Check size={10} className="inline mr-1" />}{role.label}
                            </button>
                          );
                        })}
                        {editForm.roles.filter(r => !roleLabels.has(r) && !editDepts.some(d => d.name === r)).map(r => (
                          <span key={r} className="px-2.5 py-1 rounded-lg text-xs font-bold border bg-slate-50 text-slate-500 border-slate-200">{r}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {editDepts.length > 0 && (
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-2 block">Bölge / Zon Ataması</label>
                      <div className="flex flex-wrap gap-2">
                        {editDepts.map(dept => {
                          const selected = editForm.roles.includes(dept.name);
                          return (
                            <button key={dept.id} type="button" onClick={() => setEditForm(f => ({ ...f, roles: selected ? f.roles.filter(r => r !== dept.name) : [...f.roles, dept.name] }))} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${selected ? "bg-forest-600 text-white border-forest-600" : "bg-white text-slate-600 border-slate-200 hover:border-forest-300"}`}>
                              {selected && <Check size={10} className="inline mr-1" />}{dept.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {complianceTrackingEnabled && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Belgeler</label>
                      <p className="text-xs text-slate-400 mb-2">
                        {branchIndustry
                          ? "Bir rolün gerektirdiği belge geçersizse kişi o role atanmaz; herkes için zorunlu belge geçersizse o hafta plana alınmaz."
                          : "Süresi dolmuş zorunlu bir belgesi olan personel, Belge Takibi açıkken o haftaki otomatik plana hiç dahil edilmez."}
                      </p>
                      {requiredDocStates.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {requiredDocStates.map(({ spec, state }) => (
                            <button key={spec.id} type="button" onClick={() => state !== "valid" && setNewDocType(spec.label)}
                              title={state === "valid" ? "Geçerli" : state === "expired" ? "Süresi dolmuş, yenisini ekleyin" : spec.strict ? "Kritik belge girilmemiş: ilgili role atanamaz" : "Girilmemiş"}
                              className={`px-2 py-1 rounded-lg text-xs font-bold border ${
                                state === "valid" ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                : state === "expired" || spec.strict ? "bg-red-50 text-red-700 border-red-100"
                                : "bg-amber-50 text-amber-700 border-amber-100"}`}>
                              {state === "valid" ? "✓ " : "! "}{spec.label}{state === "expired" ? " · süresi doldu" : state === "missing" ? " · girilmemiş" : ""}
                            </button>
                          ))}
                        </div>
                      )}
                      {docsLoading ? (
                        <p className="text-xs text-slate-400">Yükleniyor...</p>
                      ) : (
                        <div className="space-y-1.5 mb-2">
                          {personnelDocs.length === 0 && <p className="text-xs text-slate-400">Kayıtlı belge yok.</p>}
                          {personnelDocs.map(doc => {
                            const expired = doc.expiry_date < todayISO;
                            return (
                              <div key={doc.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs border ${expired ? "bg-red-50 border-red-100" : "bg-slate-50 border-slate-200"}`}>
                                <span className="flex-1 font-semibold text-slate-700">{doc.doc_type}</span>
                                <span className={expired ? "text-red-600 font-bold" : "text-slate-500"}>{expired ? "Süresi doldu · " : ""}{doc.expiry_date}</span>
                                <button onClick={() => handleDeleteDoc(doc.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input value={newDocType} onChange={e => setNewDocType(e.target.value)} list="industry-doc-catalog" placeholder="Belge adı (örn. İş Güvenliği Belgesi)" className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:border-forest-400" />
                        {branchIndustry && (
                          <datalist id="industry-doc-catalog">
                            {branchIndustry.documents.map(d => <option key={d.id} value={d.label} />)}
                          </datalist>
                        )}
                        <input type="date" value={newDocExpiry} onChange={e => setNewDocExpiry(e.target.value)} className="border border-slate-200 rounded-xl px-2 py-2 text-xs bg-white focus:outline-none focus:border-forest-400" />
                        <button type="button" onClick={handleAddDoc} disabled={!newDocType.trim() || !newDocExpiry} className="shrink-0 px-3 py-2 bg-forest-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-xl hover:bg-forest-700">Ekle</button>
                      </div>
                      {docError && <p className="text-xs text-red-600 mt-1">{docError}</p>}
                    </div>
                  )}
                  {kioskModeEnabled && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Ortak Tablet PIN'i</label>
                      <p className="text-xs text-slate-400 mb-2">Ortak tablette giriş/çıkış için 4 haneli PIN. Ortak Tablet Modu açık şubelerde geçerlidir.</p>
                      {editingPerson?.kiosk_pin_set ? (
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-xs">
                          <span className="flex-1 font-semibold text-emerald-700">PIN atanmış</span>
                          <button type="button" onClick={handleClearKioskPin} className="text-slate-400 hover:text-red-500 font-bold">Kaldır</button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            value={newKioskPin}
                            onChange={e => setNewKioskPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                            placeholder="4 haneli PIN"
                            inputMode="numeric"
                            className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:border-forest-400"
                          />
                          <button type="button" onClick={handleSetKioskPin} disabled={!/^\d{4}$/.test(newKioskPin) || kioskPinSaving} className="shrink-0 px-3 py-2 bg-forest-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-xl hover:bg-forest-700">
                            {kioskPinSaving ? "..." : "Ata"}
                          </button>
                        </div>
                      )}
                      {kioskPinError && <p className="text-xs text-red-600 mt-1">{kioskPinError}</p>}
                    </div>
                  )}
                </>
              )}
              {editError && <p className="text-sm text-red-600">{editError}</p>}
            </div>
        </Sheet>
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
