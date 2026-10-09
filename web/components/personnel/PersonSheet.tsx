"use client";
/**
 * Kişi kartı: bir kişinin TEK penceresi (Ekip ve Tüm Personel aynı kartı açar). Görüntüleme ve düzenleme
 * ayrı değil; tek Kaydet, tek "Ekipten çıkar". Kişinin şubesinin bağlamını (departman, vardiya grubu,
 * işletme türü, açık modüller) kendisi kurar, bu yüzden hangi panelden açıldığı fark etmez.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Sheet, sheetDangerClass, sheetPrimaryClass } from "@/components/ui/Sheet";
import type { InviteResult } from "@/components/personnel/InviteLinkList";
import { ManagerAddSheet, ManagerAccessFields, accessSummary, scopeTitle, canEditManager, demoteManager, initialManagerAccess, saveManagerAccess, type ManagerAccessValue, type Mgr } from "@/components/personnel/ManagersCard";
import { createInvite, roleBadge, type MergedPerson } from "@/components/personnel/people";
import { accountLevel, canDelegate, hasPerm, parseAccess, type Perm } from "@/lib/userAccess";
import { isModuleOn } from "@/lib/moduleVisibility";
import { industryFromRules, matchDocument } from "@/lib/templates";
import { departmentLabel, hasSubDepartments, leafDepartments, sortDepartments, type DeptLite } from "@/lib/departments";
import { parseBranchRotation, rotationBranchForWeek } from "@/lib/branchRotation";
import { defaultWeeklyHours } from "@/lib/legal";
import { formatScore, scoreVsAverageText } from "@/lib/fairness";
import { businessToday, getWeekStart } from "@/lib/date";

type Loc = { id: string; name: string; rules?: Record<string, unknown> | null };
type Doc = { id: number; doc_type: string; expiry_date: string; note: string | null };

const EMP_TYPES = [
  { value: "full_time", label: "Tam Zamanlı" },
  { value: "part_time", label: "Yarı Zamanlı" },
  { value: "intern", label: "Stajyer" },
];
const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

export type Viewer = { id: string; role: string; location_id?: string | null; access?: unknown };

const formOf = (p: MergedPerson) => ({
  name: p.name, phone: p.phone ?? "", schedulable: p.schedulable, employment_type: p.employment_type ?? "full_time",
  weekly_off_day: p.weekly_off_day ?? null, max_weekly_hours: p.max_weekly_hours ?? 45, min_weekly_hours: p.min_weekly_hours ?? 0,
  hourly_wage: p.hourly_wage ?? null, night_restriction: p.night_restriction ?? null,
  hire_date: p.hire_date ?? "", annual_leave_days_total: p.annual_leave_days_total ?? 14, leave_adjustment_days: p.leave_adjustment_days ?? 0,
  department_id: p.department_id ?? null,
});

export default function PersonSheet({ person, account, viewer, branch, managerLocations, teamAvgScore, onClose, onChanged, onInvite }: {
  person: MergedPerson;
  /** Kişinin giriş hesabı (yetki alanları için); hesabı yoksa null. */
  account: Mgr | null;
  viewer: Viewer;
  /** Kişinin şubesi (kurallar ve açık modüller buradan). */
  branch: Loc | null;
  /** Yönetici yetkisinde seçilebilecek şubeler. */
  managerLocations: Loc[];
  /** Şubenin aktif çalışanlarının ortalama Adalet Puanı (puanın yanındaki açıklama için) */
  teamAvgScore?: number;
  onClose: () => void;
  /** Kayıt sonrası: liste yenilenir, kart kapanır, mesaj gösterilir. */
  onChanged: (message: string) => void;
  onInvite: (links: InviteResult[]) => void;
}) {
  const ep = person;
  const acc = account;
  const rules = branch?.rules ?? {};
  const viewerRole = viewer.role ?? "";
  // Bakan kişinin yetki maddeleri (lib/userAccess): sahip hepsi, yönetici kendi seçilmiş maddeleri
  const viewerAccess = { role: viewer.role, access: parseAccess(viewer.access) };
  const can = (perm: Perm) => hasPerm(viewerAccess, perm);

  const [editForm, setEditForm] = useState(() => formOf(person));
  const [mgrAccess, setMgrAccess] = useState<ManagerAccessValue | null>(() =>
    acc && (acc.role === "manager" || acc.role === "supervisor") ? initialManagerAccess(acc) : null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [openingAccount, setOpeningAccount] = useState(false);
  const [depts, setDepts] = useState<DeptLite[]>([]);
  const [personnelDocs, setPersonnelDocs] = useState<Doc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [newDocType, setNewDocType] = useState("");
  const [newDocExpiry, setNewDocExpiry] = useState("");
  const [docError, setDocError] = useState("");
  const [pinSet, setPinSet] = useState(person.kiosk_pin_set);
  const [newKioskPin, setNewKioskPin] = useState("");
  const [kioskPinError, setKioskPinError] = useState("");
  const [kioskPinSaving, setKioskPinSaving] = useState(false);
  const [makeManagerOpen, setMakeManagerOpen] = useState(false);
  // Ana departman dışında yardım edebileceği departmanlar (bu şube): planda onların ihtiyacına da yazılabilir
  const initialExtraDepts = (ep.assigned_department_ids ?? []).filter(id => id !== ep.department_id);
  const [extraDepts, setExtraDepts] = useState<string[]>(initialExtraDepts);
  // Sorumlu yapıldı: pencere kapanınca liste yenilenir (giriş bağlantısı gösteriliyorsa önce o okunur)
  const managerMade = useRef(false);

  const branchId = branch?.id ?? ep.location_id;
  useEffect(() => {
    if (!branchId) return;
    let alive = true;
    fetch(`/api/departments?location_id=${branchId}`).then(r => r.json()).catch(() => []).then(d => {
      if (!alive) return;
      setDepts(Array.isArray(d) ? d.map((x: DeptLite) => ({ id: x.id, name: x.name, parent_id: x.parent_id ?? null })) : []);
    });
    return () => { alive = false; };
  }, [branchId]);

  const loadDocs = async (personnelId: string) => {
    setDocsLoading(true);
    try {
      const data = await fetch(`/api/personnel-documents?personnel_id=${personnelId}`).then(r => r.json());
      if (Array.isArray(data)) setPersonnelDocs(data);
    } catch { /* boş */ }
    setDocsLoading(false);
  };
  const complianceTrackingEnabled = isModuleOn(rules, "compliance_tracking_enabled");
  useEffect(() => {
    if (ep.personnelId && complianceTrackingEnabled) void Promise.resolve().then(() => loadDocs(ep.personnelId!));
  }, [ep.personnelId, complianceTrackingEnabled]);

  const kioskModeEnabled = isModuleOn(rules, "kiosk_mode_enabled");
  // Şubeler arası (lib/branchRotation): çalıştığı şubeler + planlı rotasyon. "Başka şubeden personel" yetkisiyle
  // (departman şefi hariç) değiştirilir.
  const canCrossBranch = can("cross_branch") && !viewerAccess.access?.department_id;
  const [orgBranches, setOrgBranches] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/locations?names=1").then(r => r.json()).then(d => { if (alive && Array.isArray(d)) setOrgBranches(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const initialRot = parseBranchRotation(ep.branch_rotation);
  const [branchIds, setBranchIds] = useState<string[]>(ep.assigned_location_ids);
  const [rotOn, setRotOn] = useState(!!initialRot);
  const [rotEvery, setRotEvery] = useState(initialRot?.every_weeks ?? 1);
  const [rotAnchor] = useState(initialRot?.anchor ?? getWeekStart(0));
  // Diğer şubelerdeki departman: departmanlı şubede plan departman bazında yapılır, kişinin orada bir departmanı olmalı
  const [branchDeptLists, setBranchDeptLists] = useState<Record<string, DeptLite[]>>({});
  const [branchDept, setBranchDept] = useState<Record<string, string>>({});
  const otherBranchKey = branchIds.filter(id => id !== ep.location_id).join(",");
  // Kartın açıldığı şube (şubenin Ekip sayfası); Tüm Şubeler'den açılınca yok
  const viewBranchId = viewer.location_id ?? null;
  const branchName = (id: string) => orgBranches.find(b => b.id === id)?.name ?? "Bu";
  useEffect(() => {
    let alive = true;
    for (const loc of otherBranchKey ? otherBranchKey.split(",") : []) {
      if (branchDeptLists[loc]) continue;
      fetch(`/api/departments?location_id=${loc}&names=1`).then(r => r.json()).then((d: DeptLite[]) => {
        if (!alive || !Array.isArray(d)) return;
        setBranchDeptLists(prev => ({ ...prev, [loc]: d }));
        const mine = d.find(x => ep.assigned_department_ids.includes(x.id));
        if (mine) setBranchDept(prev => (prev[loc] ? prev : { ...prev, [loc]: mine.id }));
      }).catch(() => {});
    }
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherBranchKey]);
  // Birlikte çalışamaz çiftleri (personnel_conflicts): kişinin kartında tanımlanır, anında kaydedilir
  const conflictsEnabled = isModuleOn(rules, "personnel_conflicts_enabled");
  const [pairs, setPairs] = useState<{ id: number; otherId: string; otherName: string }[]>([]);
  const [teammates, setTeammates] = useState<{ id: string; name: string }[]>([]);
  const [newPairWith, setNewPairWith] = useState("");
  const [pairError, setPairError] = useState("");
  const loadPairs = async (locId: string, pid: string) => {
    const [pc, pp] = await Promise.all([
      fetch(`/api/personnel-conflicts?location_id=${locId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/personnel?location_id=${locId}`).then(r => r.json()).catch(() => []),
    ]);
    setPairs((Array.isArray(pc) ? pc : []).filter((x: { personnel_id_a: string; personnel_id_b: string }) => x.personnel_id_a === pid || x.personnel_id_b === pid)
      .map((x: { id: number; personnel_id_a: string; personnel_a_name: string; personnel_id_b: string; personnel_b_name: string }) =>
        x.personnel_id_a === pid ? { id: x.id, otherId: x.personnel_id_b, otherName: x.personnel_b_name } : { id: x.id, otherId: x.personnel_id_a, otherName: x.personnel_a_name }));
    setTeammates((Array.isArray(pp) ? pp : []).filter((x: { id: string; status?: string }) => x.id !== pid && x.status !== "inactive")
      .map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })).sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "tr")));
  };
  useEffect(() => {
    if (conflictsEnabled && ep.personnelId && branchId) void Promise.resolve().then(() => loadPairs(branchId, ep.personnelId!));
  }, [conflictsEnabled, ep.personnelId, branchId]);
  const addPair = async () => {
    if (!newPairWith || !ep.personnelId || !branchId) return;
    setPairError("");
    const r = await fetch("/api/personnel-conflicts", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location_id: branchId, personnel_id_a: ep.personnelId, personnel_id_b: newPairWith }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setPairError(d.error ?? "Eklenemedi"); return; }
    setNewPairWith(""); loadPairs(branchId, ep.personnelId);
  };
  const removePair = async (id: number) => {
    await fetch(`/api/personnel-conflicts?id=${id}`, { method: "DELETE" });
    setPairs(prev => prev.filter(x => x.id !== id));
  };
  const branchWeeklyMax = typeof rules.max_weekly_hours === "number" ? rules.max_weekly_hours : 45;
  const autoLeaveOn = rules.auto_leave_entitlement_enabled === true;
  // Şubenin işletme türü (lib/templates): görev listesi ve belge kataloğu buradan gelir
  const branchIndustry = industryFromRules(rules);
  const todayISO = new Date().toISOString().split("T")[0];
  // Zorunlu belgeler ve bu kişideki durumu (geçerli / süresi dolmuş / girilmemiş)
  const requiredDocStates = (() => {
    if (!branchIndustry) return [];
    // Görevler kaldırıldı (2026-10-05): sadece herkes için zorunlu belgeler
    const ids = new Set<string>();
    for (const d of branchIndustry.documents) if (d.requiredForAll) ids.add(d.id);
    return branchIndustry.documents.filter(d => ids.has(d.id)).map(spec => {
      const mine = personnelDocs.filter(pd => matchDocument(branchIndustry, pd.doc_type)?.id === spec.id).map(pd => pd.expiry_date).sort();
      const state: "valid" | "expired" | "missing" = !mine.length ? "missing" : mine[mine.length - 1] < todayISO ? "expired" : "valid";
      return { spec, state };
    });
  })();

  const patch = (url: string, body: unknown) => fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const save = async () => {
    if (ep.personnelId && editForm.min_weekly_hours > editForm.max_weekly_hours) { setEditError("Haftalık en az süre, en fazladan büyük olamaz."); return; }
    setEditLoading(true); setEditError("");
    try {
      if (ep.userId) {
        await patch(`/api/users?id=${ep.userId}`, { name: editForm.name, phone: editForm.phone });
        // Yönetici vardiyaya da girsin mi: çalışan kaydı yoksa sunucu açar
        if (editForm.schedulable !== ep.schedulable && (ep.role === "manager" || ep.role === "admin")) {
          const r = await patch(`/api/users?id=${ep.userId}`, { schedulable: editForm.schedulable });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) { setEditError(d.error ?? "Plan ayarı kaydedilemedi"); return; }
        }
        if (acc && mgrAccess) {
          const err = await saveManagerAccess(acc, mgrAccess);
          if (err) { setEditError(err); return; }
        }
      }
      if (ep.personnelId && canCrossBranch && orgBranches.length > 1) {
        const rotation = rotOn && branchIds.length >= 2 ? { every_weeks: rotEvery, order: branchIds, anchor: rotAnchor } : null;
        const deptsChanged = Object.entries(branchDept).some(([loc, d]) => d && !ep.assigned_department_ids.includes(d) && branchIds.includes(loc));
        const changed = JSON.stringify(branchIds) !== JSON.stringify(ep.assigned_location_ids)
          || JSON.stringify(rotation) !== JSON.stringify(initialRot) || deptsChanged;
        if (changed) {
          const r = await patch(`/api/personnel?id=${ep.personnelId}`, { assigned_location_ids: branchIds, branch_rotation: rotation, branch_department_ids: branchDept });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) { setEditError(d.error ?? "Şubeler kaydedilemedi"); return; }
        }
      }
      if (ep.personnelId) {
        // Hesabı olmayan personelde ad ve telefon yalnızca çalışan kaydında tutulur
        const nameFields = ep.userId ? {} : { name: editForm.name, phone: editForm.phone };
        const res = await patch(`/api/personnel?id=${ep.personnelId}`, {
          ...nameFields, employment_type: editForm.employment_type, weekly_off_day: editForm.weekly_off_day,
          max_weekly_hours: editForm.max_weekly_hours, min_weekly_hours: editForm.min_weekly_hours,
 hourly_wage: editForm.hourly_wage, night_restriction: editForm.night_restriction,
          hire_date: editForm.hire_date || null, annual_leave_days_total: editForm.annual_leave_days_total,
          leave_adjustment_days: editForm.leave_adjustment_days, ...(depts.length > 0 ? { department_id: editForm.department_id } : {}),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setEditError(data.error ?? "Güncelleme hatası"); return; }
        // Ek departmanlar: sadece bu şubenin en alttaki departmanları, ana departman hariç
        const branchLeafIds = new Set(leafDepartments(depts).map(d => d.id));
        const wantExtra = editForm.department_id ? extraDepts.filter(id => branchLeafIds.has(id) && id !== editForm.department_id) : [];
        const hadExtra = initialExtraDepts.filter(id => branchLeafIds.has(id));
        if (depts.length > 0 && JSON.stringify([...wantExtra].sort()) !== JSON.stringify([...hadExtra].sort())) {
          const r2 = await patch(`/api/personnel?id=${ep.personnelId}`, { extra_department_ids: wantExtra });
          const d2 = await r2.json().catch(() => ({}));
          if (!r2.ok) { setEditError(d2.error ?? "Departmanlar kaydedilemedi"); return; }
        }
      }
      onChanged("Kaydedildi");
    } catch { setEditError("Sunucu hatası"); }
    finally { setEditLoading(false); }
  };

  /** Tek silme işlemi: ekipteki kişi pasife alınır (girişi kapanır), çalışan kaydı olmayan yöneticinin hesabı silinir. */
  const remove = async () => {
    const r = ep.personnelId
      ? await fetch(`/api/personnel?id=${ep.personnelId}`, { method: "DELETE" })
      : await fetch(`/api/users?id=${ep.userId}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setEditError(d.error ?? "Yapılamadı"); setConfirmDelete(false); return; }
    onChanged(ep.personnelId ? "Ekipten çıkarıldı" : "Hesap silindi");
  };

  const restore = async () => {
    const r = await patch(`/api/personnel?id=${ep.personnelId}`, { status: "active" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setEditError(d.error ?? "Yapılamadı"); return; }
    onChanged("Ekibe geri alındı");
  };

  const approve = async (status: "active" | "rejected") => {
    await patch(`/api/users?id=${ep.userId}`, { approval_status: status });
    onChanged(status === "active" ? "Hesap onaylandı" : "Hesap reddedildi");
  };

  const sendInvite = async () => {
    setInviteLoading(true);
    try {
      const r = await createInvite(ep);
      if (r) onInvite([r]);
    } finally { setInviteLoading(false); }
  };

  // Hızlı eklenen (hesabı olmayan) personele portal hesabı aç; aynı davet penceresi gösterilir
  const openAccount = async () => {
    if (!ep.personnelId || ep.userId) return;
    setOpeningAccount(true);
    try {
      const res = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ existing_personnel_id: ep.personnelId, role: "employee" }) });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error ?? "Hesap açılamadı"); return; }
      onInvite([{ name: data.user.name, username: data.credentials.username, invite_token: data.inviteToken }]);
      onChanged("Hesap açıldı");
    } finally { setOpeningAccount(false); }
  };

  const handleAddDoc = async () => {
    if (!ep.personnelId || !newDocType.trim() || !newDocExpiry) return;
    setDocError("");
    try {
      const res = await fetch("/api/personnel-documents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personnel_id: ep.personnelId, doc_type: newDocType.trim(), expiry_date: newDocExpiry }),
      });
      const data = await res.json();
      if (!res.ok) { setDocError(data.error ?? "Belge eklenemedi"); return; }
      setNewDocType(""); setNewDocExpiry("");
      loadDocs(ep.personnelId);
    } catch { setDocError("Belge eklenemedi"); }
  };
  const handleDeleteDoc = async (id: number) => {
    if (!ep.personnelId) return;
    await fetch(`/api/personnel-documents?id=${id}`, { method: "DELETE" });
    loadDocs(ep.personnelId);
  };

  const handleSetKioskPin = async () => {
    if (!ep.personnelId || !/^\d{4}$/.test(newKioskPin)) return;
    setKioskPinSaving(true); setKioskPinError("");
    try {
      const res = await fetch(`/api/personnel/${ep.personnelId}/kiosk-pin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: newKioskPin }) });
      const data = await res.json();
      if (!res.ok) { setKioskPinError(data.error ?? "PIN kaydedilemedi"); return; }
      setNewKioskPin(""); setPinSet(true);
    } catch { setKioskPinError("PIN kaydedilemedi"); }
    finally { setKioskPinSaving(false); }
  };
  const handleClearKioskPin = async () => {
    if (!ep.personnelId) return;
    await fetch(`/api/personnel/${ep.personnelId}/kiosk-pin`, { method: "DELETE" });
    setPinSet(false);
  };

  // Ekipten çıkmış kişi: sadece geri alma
  if (ep.inactive) {
    return (
      <Sheet open onClose={onClose}
        title={<span className="flex items-center gap-3"><Avatar name={ep.name} size="md" />{ep.name}</span>}
        description={[roleBadge(ep).label, ep.title].filter(Boolean).join(" · ")}
        footer={can("team") ? <button onClick={restore} className={sheetPrimaryClass}>Ekibe geri al</button> : undefined}>
        <p className="text-sm text-slate-600">Ekipten çıkarıldı: plana alınmaz ve uygulamaya giremez. Geri alınca bilgileri ve geçmişi olduğu gibi döner.</p>
        {editError && <p className="text-sm text-red-600 mt-3">{editError}</p>}
      </Sheet>
    );
  }

  const isMgr = ep.role === "manager" || ep.role === "supervisor";
  const canEditAccess = !!acc && isMgr && canEditManager(viewer, acc);
  // Kademe (lib/userAccess accountLevel): kimse kendi kademesindeki ya da üstündeki kişiyi değiştiremez
  const targetLevel = accountLevel(ep.role, acc ? parseAccess(acc.permissions) : null);
  const below = viewerRole === "admin" || targetLevel < accountLevel(viewerRole, viewerAccess.access);
  // Vardiyaya girme anahtarı sadece yöneticide (çalışan her zaman plandadır)
  const canToggleShift = !!ep.userId && can("team")
    && (ep.role === "admin" ? viewerRole === "admin" : isMgr && (ep.userId === viewer.id || canEditAccess));
  const canRemove = (!!ep.userId || !!ep.personnelId) && ep.userId !== viewer.id && ep.role !== "admin"
    && can("team") && below && (ep.role === "employee" || canEditAccess);
  // Kendinden üst ya da eş kademedeki kişi (bölge müdürünün gözünden patron gibi): sadece okunur.
  // Sunucu da reddeder (lib/access canManageAccount); eskiden form açık kalıp kaydette hata veriyordu.
  // "Ekip" yetkisi olmayan yönetici de kartı sadece okur.
  const isSelfCard = !!ep.userId && ep.userId === viewer.id;
  const readOnly = !isSelfCard && (!below || !can("team"));
  if (readOnly) {
    return (
      <Sheet open onClose={onClose}
        title={<span className="flex items-center gap-3"><Avatar name={ep.name} size="md" tone="brand" />{ep.name}</span>}
        description={roleBadge(ep).label}>
        <div className="space-y-2 text-sm text-slate-700">
          {ep.phone && <p>Telefon: <a href={`tel:${ep.phone}`} className="text-forest-700">{ep.phone}</a></p>}
          {ep.email && <p>E-posta: {ep.email}</p>}
          <p className="text-xs text-slate-500 pt-2">{ep.role === "admin" ? "Hesap sahibinin bilgilerini sadece kendisi değiştirir." : below ? "Kişi kartını değiştirmek için \"Ekip\" yetkisi gerekir. Hesap sahibi verebilir." : "Bu kişinin bilgilerini hesap sahibi değiştirir."}</p>
        </div>
      </Sheet>
    );
  }
  // Ekip üyesini sorumlu yapma: hesap sahibi ya da "Başkasına yetki verme" maddesi olan sorumlu (sunucu: canManageAccount)
  const canMakeManager = ep.role === "employee" && !!ep.personnelId && !!branchId
    && (viewerRole === "admin" || canDelegate(viewerAccess));
  // Çalışma bilgileri sadece plana giren kişide anlamlı
  const showWork = !!ep.personnelId && (ep.role === "employee" || editForm.schedulable);
  const sectionTitle = "text-sm font-bold text-slate-900";

  return (
    <Sheet open onClose={onClose}
      title={<span className="flex items-center gap-3"><Avatar name={ep.name} size="md" tone={ep.role === "employee" ? "neutral" : "brand"} />{ep.name}</span>}
      description={[
        ep.role === "employee" || !acc ? roleBadge(ep).label : scopeTitle(acc, id => depts.find(d => d.id === id)?.name, roleBadge(ep).label),
        ep.role === "employee" || editForm.schedulable ? ep.title : null,
      ].filter(Boolean).join(" · ")}
      footer={<>
        {canRemove && (confirmDelete
          ? <button onClick={() => remove()} className="mr-auto px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">{ep.personnelId ? "Evet, ekipten çıkar" : "Evet, hesabı sil"}</button>
          : <button onClick={() => setConfirmDelete(true)} className={`mr-auto ${sheetDangerClass}`}>{ep.personnelId ? "Ekipten çıkar" : "Hesabı sil"}</button>)}
        <button onClick={save} disabled={editLoading} className={sheetPrimaryClass}>{editLoading ? "Kaydediliyor…" : "Kaydet"}</button>
      </>}>
        <div className="space-y-4">
          {ep.approval_status === "pending" && can("team") && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
              <span className="flex-1 text-sm text-amber-900">Hesap onay bekliyor.</span>
              <button onClick={async () => { await approve("rejected"); }} className="text-sm font-semibold text-red-700 px-2">Reddet</button>
              <button onClick={async () => { await approve("active"); }} className="text-sm font-bold text-white bg-emerald-600 rounded-lg px-3 py-1.5">Onayla</button>
            </div>
          )}
          {ep.personnelId && ep.role === "employee" && (
            <p className="text-xs text-slate-500">
              {[ep.prev_score > 0 ? `Adalet Puanı ${formatScore(ep.prev_score)} (${scoreVsAverageText(ep.prev_score, teamAvgScore ?? 0)})` : null, ep.hero_count > 0 ? `${ep.hero_count} kez açık vardiya aldı` : null,
                (ep.ytd_overtime_hours ?? 0) > 0 ? `bu yıl ${ep.ytd_overtime_hours} saat fazla mesai` : null].filter(Boolean).join(" · ")}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Ad Soyad</label>
              <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Telefon</label>
              <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="+90 532 ..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
            </div>
          </div>
          {/* Giriş: hesabın durumu ve tek işlemi aynı satırda */}
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
            <div className="flex-1 min-w-0 text-sm">
              {ep.userId ? (
                <>
                  {ep.is_temp_password
                    ? <p className="text-amber-700">Henüz uygulamaya girmedi</p>
                    : <p className="text-slate-700">Uygulamaya giriş yapıyor</p>}
                  {ep.email && <p className="text-xs text-slate-500 truncate">{ep.email}</p>}
                </>
              ) : <p className="text-slate-600">Giriş hesabı yok</p>}
            </div>
            {ep.userId
              ? <button onClick={() => sendInvite()} disabled={inviteLoading} className="shrink-0 text-sm font-semibold text-forest-700 hover:underline disabled:opacity-50">Giriş bağlantısı</button>
              : ep.personnelId && <button onClick={() => openAccount()} disabled={openingAccount} className="shrink-0 text-sm font-semibold text-forest-700 hover:underline disabled:opacity-50">{openingAccount ? "Açılıyor…" : "Hesap aç"}</button>}
          </div>
          {canToggleShift && (
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-3 py-2.5 cursor-pointer">
              <span className="flex-1">
                <span className="block text-sm font-medium text-slate-800">Vardiya planına dahil</span>
                <span className="block text-xs text-slate-500">Açıksa bu kişiye de vardiya yazılır{!ep.personnelId ? "; çalışma bilgileri kaydettikten sonra burada çıkar" : ""}.</span>
              </span>
              <input type="checkbox" checked={editForm.schedulable} onChange={e => setEditForm(f => ({ ...f, schedulable: e.target.checked }))} className="mt-1 h-5 w-5 accent-forest-600" />
            </label>
          )}
          {/* Ana şubesi başka olan kişi bu şubenin Ekip'inden açıldıysa: bu şubedeki departmanı en üstte
              (eskiden sadece aşağıdaki Şubeler bölümündeydi, üstteki seçim ana şubeye yazıyordu ve kişi "departmanı seçilmemiş" kalıyordu) */}
          {showWork && viewBranchId && viewBranchId !== ep.location_id && branchIds.includes(viewBranchId) && (branchDeptLists[viewBranchId]?.length ?? 0) > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{branchName(viewBranchId)} şubesinde departmanı</label>
              <select value={branchDept[viewBranchId] ?? ""} disabled={!canCrossBranch}
                onChange={e => setBranchDept(prev => ({ ...prev, [viewBranchId]: e.target.value }))}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-forest-400 ${branchDept[viewBranchId] ? "border-slate-200" : "border-amber-300"}`}>
                <option value="">Seçilmedi (bu şubede otomatik plana alınmaz)</option>
                {leafDepartments(sortDepartments(branchDeptLists[viewBranchId])).map(d => <option key={d.id} value={d.id}>{departmentLabel(branchDeptLists[viewBranchId], d)}</option>)}
              </select>
              {!canCrossBranch && <p className="text-xs text-slate-400 mt-1">Bunu "Başka şubeden kişi" yetkisi olan sorumlu ya da hesap sahibi değiştirebilir.</p>}
            </div>
          )}
          {showWork && depts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {viewBranchId && viewBranchId !== ep.location_id ? `Ana şubesindeki (${branchName(ep.location_id ?? "")}) departmanı` : "Departman"}
              </label>
              <select value={editForm.department_id ?? ""} onChange={e => setEditForm(f => ({ ...f, department_id: e.target.value || null }))}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-forest-400 ${editForm.department_id ? "border-slate-200" : "border-amber-300"}`}>
                <option value="">Seçilmedi (otomatik plana alınmaz)</option>
                {/* Kişi en alttaki departmana bağlanır (lib/departments); eskiden üst departmana bağlıysa o da görünür */}
                {sortDepartments(depts).filter(d => !hasSubDepartments(depts, d.id) || d.id === editForm.department_id).map(d => (
                  <option key={d.id} value={d.id}>{departmentLabel(depts, d)}{hasSubDepartments(depts, d.id) ? " (alt departman seçin)" : ""}</option>
                ))}
              </select>
              {/* Joker: birden çok departmanda çalışabilir. Plan her vardiyasını tek departmana yazar. */}
              {editForm.department_id && leafDepartments(sortDepartments(depts)).length > 1 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-slate-700">{viewBranchId && viewBranchId !== ep.location_id ? "Ana şubesinde başka hangi departmanlarda çalışabilir?" : "Başka hangi departmanlarda çalışabilir?"}</p>
                  <p className="text-xs text-slate-400 mb-2">Seçerseniz otomatik plan bu kişiyi o departmanların eksiğine de yazar. Planda ana departmanının altında görünür, başka departmana yazıldığı gün kutuda o departmanın adı yazar.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {leafDepartments(sortDepartments(depts)).filter(d => d.id !== editForm.department_id).map(d => {
                      const on = extraDepts.includes(d.id);
                      return (
                        <button key={d.id} type="button" onClick={() => setExtraDepts(v => (on ? v.filter(x => x !== d.id) : [...v, d.id]))}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${on ? "bg-forest-600 text-white border-forest-600" : "bg-white text-slate-600 border-slate-200 hover:border-forest-300"}`}>
                          {on && <Check size={10} className="inline mr-1" />}{departmentLabel(depts, d)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {showWork && (
            <>
              <details className="rounded-xl border border-slate-200 px-3 py-2">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Çalışma düzeni ve ücret</summary>
              <div className="space-y-4 mt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Çalışma Tipi</label>
                  <select value={editForm.employment_type} onChange={e => setEditForm(f => ({ ...f, employment_type: e.target.value, ...("max_weekly_hours" in f && f.max_weekly_hours === defaultWeeklyHours(f.employment_type) ? { max_weekly_hours: defaultWeeklyHours(e.target.value) } : {}) }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-forest-400">
                    {EMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Haftada en fazla</label>
                  <input type="number" min={8} max={60} value={editForm.max_weekly_hours} onChange={e => setEditForm(f => ({ ...f, max_weekly_hours: Number(e.target.value) }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                </div>
              </div>
              {/* Tek kural (lib/legal effectiveWeeklyLimit): şube sınırı üst sınırdır */}
              <p className="text-xs text-slate-400 -mt-2">
                Şubenin sınırı {branchWeeklyMax} saat. Kişiye sadece daha düşük bir sınır (yarı zamanlı gibi) yazılabilir.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Haftada en az</label>
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
                    ? "Fazla mesai maliyeti hesabında kullanılır (fazla mesai × ücret × 1,5). Boş bırakılırsa maliyet gösterilmez."
                    : "🔒 Ücretleri görmek ve değiştirmek için \"Ücretler ve maliyet\" yetkisi gerekir. Hesap sahibi verebilir."}
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
              </div>
              </details>
              <details className="rounded-xl border border-slate-200 px-3 py-2">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">İşe giriş ve izin</summary>
              <div className="space-y-4 mt-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">İşe Giriş Tarihi</label>
                  <input type="date" value={editForm.hire_date ?? ""} onChange={e => setEditForm(f => ({ ...f, hire_date: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                </div>
                {/* Kıdeme göre hak ediş açıkken ve tarih girilmişse hak tarihten hesaplanır: sabit gün alanı gösterilmez (tek kaynak) */}
                {!(autoLeaveOn && editForm.hire_date) && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Yıllık İzin (gün)</label>
                    <input type="number" min={0} max={60} value={editForm.annual_leave_days_total} onChange={e => setEditForm(f => ({ ...f, annual_leave_days_total: Number(e.target.value) || 0 }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Devreden / ek izin (gün)</label>
                  <input type="number" min={-30} max={60} value={editForm.leave_adjustment_days} onChange={e => setEditForm(f => ({ ...f, leave_adjustment_days: Number(e.target.value) || 0 }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400" />
                </div>
              </div>
              <p className="text-xs text-slate-400 -mt-2">
                {autoLeaveOn && editForm.hire_date
                  ? "Yıllık izin hakkı işe giriş tarihinden hesaplanır (İş K. m.53)."
                  : "Yıllık izin hakkı buradaki sabit günden hesaplanır."}
                {" "}Devreden / ek izin: önceki yıldan kalan ya da elle eklenen günler (eksi de olabilir).
              </p>
              </div>
              </details>
              {complianceTrackingEnabled && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Belgeler</label>
                  <p className="text-xs text-slate-400 mb-2">
                    {branchIndustry
                      ? "Herkes için zorunlu bir belge geçersizse kişi o hafta plana alınmaz."
                      : "Süresi dolmuş zorunlu bir belgesi olan kişi, Belge Takibi açıkken o haftaki otomatik plana hiç dahil edilmez."}
                  </p>
                  {requiredDocStates.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {requiredDocStates.map(({ spec, state }) => (
                        <button key={spec.id} type="button" onClick={() => state !== "valid" && setNewDocType(spec.label)}
                          title={state === "valid" ? "Geçerli" : state === "expired" ? "Süresi dolmuş, yenisini ekleyin" : spec.strict ? "Zorunlu belge girilmemiş, bu kişi ilgili göreve yazılamaz" : "Girilmemiş"}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold border ${
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
                    <button type="button" onClick={handleAddDoc} disabled={!newDocType.trim() || !newDocExpiry} className="shrink-0 px-3 py-2 bg-forest-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-xl hover:bg-forest-700">Ekle</button>
                  </div>
                  {docError && <p className="text-xs text-red-600 mt-1">{docError}</p>}
                </div>
              )}
              {orgBranches.length > 1 && (() => {
                const name = (id: string) => orgBranches.find(b => b.id === id)?.name ?? id;
                const primary = ep.location_id;
                const rot = rotOn && branchIds.length >= 2 ? { every_weeks: rotEvery, order: branchIds, anchor: rotAnchor } : null;
                return (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Şubeler</label>
                    <p className="text-xs text-slate-400 mb-2">Birden çok şubede çalışabilir. Planlar çakışmaz: bir şubede vardiyası olan gün diğerinde yazılmaz, haftalık saati şubeler arasında toplanır.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {orgBranches.map(b => {
                        const on = branchIds.includes(b.id);
                        const isPrimary = b.id === primary;
                        return (
                          <button key={b.id} type="button" disabled={!canCrossBranch || isPrimary}
                            onClick={() => setBranchIds(ids => on ? ids.filter(x => x !== b.id) : [...ids, b.id])}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors disabled:cursor-default ${on ? "bg-forest-600 text-white border-forest-600" : "bg-white text-slate-600 border-slate-200 hover:border-forest-300"}`}>
                            {on && <Check size={10} className="inline mr-1" />}{b.name}{isPrimary && <span className="font-normal opacity-80"> (ana)</span>}
                          </button>
                        );
                      })}
                    </div>
                    {/* Departmanlı diğer şubelerde kişinin departmanı (yoksa o şubede otomatik plana alınmaz) */}
                    {branchIds.filter(id => id !== primary && (branchDeptLists[id]?.length ?? 0) > 0).map(id => (
                      <div key={id} className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-slate-600 shrink-0">{name(id)} departmanı</span>
                        <select value={branchDept[id] ?? ""} disabled={!canCrossBranch}
                          onChange={e => setBranchDept(prev => ({ ...prev, [id]: e.target.value }))}
                          className={`flex-1 min-w-0 border rounded-lg px-2 py-1.5 text-sm bg-white ${branchDept[id] ? "border-slate-200" : "border-amber-300"}`}>
                          <option value="">Seçilmedi (orada otomatik plana alınmaz)</option>
                          {leafDepartments(sortDepartments(branchDeptLists[id])).map(d => <option key={d.id} value={d.id}>{departmentLabel(branchDeptLists[id], d)}</option>)}
                        </select>
                      </div>
                    ))}
                    {branchIds.length >= 2 && (
                      <div className="mt-3 rounded-xl border border-slate-200 px-3 py-2.5 space-y-2">
                        <label className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-slate-800">Şubeler arasında sırayla çalışma</span>
                          <input type="checkbox" disabled={!canCrossBranch} checked={rotOn} onChange={e => setRotOn(e.target.checked)} className="h-5 w-5 accent-forest-600" />
                        </label>
                        {!rotOn && <p className="text-xs text-slate-500">Kapalıyken kişi her hafta seçili şubelerin hepsinde planlanabilir.</p>}
                        {rotOn && (
                          <>
                            <div className="flex items-center gap-2 text-xs text-slate-600">
                              <span>Her</span>
                              <select value={rotEvery} disabled={!canCrossBranch} onChange={e => setRotEvery(Number(e.target.value))}
                                className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white">
                                {[1, 2, 3, 4, 8].map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                              <span>haftada bir sıradaki şubeye geçer: {branchIds.map(name).join(" → ")}</span>
                            </div>
                            <p className="text-xs text-slate-500">
                              Bu hafta: <b>{name(rotationBranchForWeek(rot, getWeekStart(0)) ?? "")}</b> · Gelecek hafta: <b>{name(rotationBranchForWeek(rot, getWeekStart(1)) ?? "")}</b>.
                              Sırayı değiştirmek için şubeleri istediğiniz sırada seçin.
                            </p>
                          </>
                        )}
                      </div>
                    )}
                    {!canCrossBranch && <p className="text-xs text-slate-400 mt-1">Şubeleri hesap sahibi ya da bölge sorumlusu değiştirir.</p>}
                  </div>
                );
              })()}
              {conflictsEnabled && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Birlikte çalışamaz</label>
                  <p className="text-xs text-slate-400 mb-2">Seçilen kişiyle hiçbir gün aynı vardiyaya yazılmaz. Değişiklik anında kaydedilir.</p>
                  {pairs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {pairs.map(x => (
                        <span key={x.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border bg-slate-50 text-slate-700 border-slate-200">
                          {x.otherName}
                          <button type="button" title="Kaldır" onClick={() => removePair(x.id)} className="text-slate-400 hover:text-red-500"><X size={12} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <select value={newPairWith} onChange={e => setNewPairWith(e.target.value)}
                      className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:border-forest-400">
                      <option value="">Kişi seçin…</option>
                      {teammates.filter(t => !pairs.some(x => x.otherId === t.id)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <button type="button" onClick={addPair} disabled={!newPairWith}
                      className="shrink-0 px-3 py-2 bg-forest-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-xl hover:bg-forest-700">Ekle</button>
                  </div>
                  {pairError && <p className="text-xs text-red-600 mt-1">{pairError}</p>}
                </div>
              )}
              {kioskModeEnabled && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Ortak Tablet PIN&apos;i</label>
                  <p className="text-xs text-slate-400 mb-2">Ortak tablette giriş/çıkış için 4 haneli PIN. Ortak tablet girişi açıkken geçerlidir.</p>
                  {pinSet ? (
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
                      <button type="button" onClick={handleSetKioskPin} disabled={!/^\d{4}$/.test(newKioskPin) || kioskPinSaving} className="shrink-0 px-3 py-2 bg-forest-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-xl hover:bg-forest-700">
                        {kioskPinSaving ? "..." : "Ata"}
                      </button>
                    </div>
                  )}
                  {kioskPinError && <p className="text-xs text-red-600 mt-1">{kioskPinError}</p>}
                </div>
              )}
            </>
          )}
          {canMakeManager && (
            <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className={sectionTitle}>Sorumlu yap</p>
                <p className="text-xs text-slate-500 mt-0.5">Planı ve ekibi sizin yerinize yönetebilsin. Neleri yapabileceğini siz seçersiniz.</p>
              </div>
              <button type="button" onClick={() => setMakeManagerOpen(true)}
                className="shrink-0 px-3 py-2 rounded-xl border border-forest-200 text-forest-700 text-sm font-semibold hover:bg-forest-50">Sorumlu yap</button>
            </div>
          )}
          {acc && isMgr && (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className={sectionTitle}>Yönetim yetkisi</p>
                {canEditAccess && acc.personnel_id && (
                  <button type="button" onClick={async () => { if (await demoteManager(acc)) onChanged("Artık ekip üyesi"); }}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline">Sorumluluktan al</button>
                )}
              </div>
              {canEditAccess && mgrAccess
                ? <ManagerAccessFields m={acc} value={mgrAccess} onChange={setMgrAccess} locations={managerLocations} granter={viewer} />
                : <p className="text-sm text-slate-600">{accessSummary(acc, id => depts.find(d => d.id === id)?.name)}</p>}
            </div>
          )}
          {editError && <p className="text-sm text-red-600">{editError}</p>}
        </div>
        {canMakeManager && makeManagerOpen && (
          <ManagerAddSheet open onClose={() => (managerMade.current ? onChanged(`${ep.name} artık sorumlu`) : setMakeManagerOpen(false))}
            locations={managerLocations.some(l => l.id === branchId) ? managerLocations : [...managerLocations, { id: branchId!, name: branch?.name ?? "" }]}
            granter={viewer} preset={{ personnelId: ep.personnelId!, locationId: branchId!, name: ep.name }}
            onDone={() => { managerMade.current = true; }} />
        )}
    </Sheet>
  );
}
