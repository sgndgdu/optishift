"use client";
/**
 * Yöneticiler: rol sistemi kullanıcıya üç rol olarak görünür (İşletme Sahibi / Yönetici / Çalışan).
 * Yetki verirken iki şey sorulur (kullanıcı kararı 2026-10-04): NEYİ yönetir (şubeler ya da bir departman)
 * ve NELERİ yapabilir (lib/userAccess PERM_LIST, tek tek). Tek şube = users.role manager, birden çok şube =
 * supervisor + managed_location_ids. Unvan kapsamdan türetilir (managerTitle). Veren en fazla kendi
 * maddelerini verir; şefe sadece CHEF_PERMS. Hiç yönetici eklenmezse her şey işletme sahibine gelir.
 * Yöneticiler Ekip ve Tüm Personel'in ortak listesinde (PeopleList) durur; yetkileri kişi kartında
 * (PersonSheet) düzenlenir. Bu dosya ekleme penceresini ve yetki alanlarını tutar.
 */

import { useEffect, useState } from "react";
import InviteLinkList, { type InviteResult } from "@/components/personnel/InviteLinkList";
import { List } from "@/components/ui/List";
import { Sheet, sheetPrimaryClass, sheetSecondaryClass } from "@/components/ui/Sheet";
import { departmentLabel, hasSubDepartments, sortDepartments } from "@/lib/departments";
import {
  accountLevel, ALL_PERMS, canDelegate, CHEF_PERMS, parseAccess, PERM_LIST, userPerms, type Perm, type UserAccess,
} from "@/lib/userAccess";

type Loc = { id: string; name: string };
type Dept = { id: string; name: string; parent_id?: string | null };
export type Mgr = {
  id: string; name: string; username: string; role: string; display_title: string | null;
  location_id: string | null; department_id: string | null; managed_location_ids: string | null;
  is_temp_password: boolean | null; permissions: string | null;
  personnel_id: string | null; approval_status?: string | null;
};
/** Yetkiyi veren kişi (oturumdaki kullanıcı). access ham ya da ayrıştırılmış olabilir. */
export type Granter = { role?: string | null; access?: unknown };

const parseIds = (raw: string | null): string[] => {
  try { const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch { return []; }
};

const granterAccess = (g: Granter): { role: string | null; access: UserAccess | null } =>
  ({ role: g.role ?? null, access: parseAccess(g.access) });

/** Yöneticinin sorumlu olduğu şubeler (bölge yöneticisinde boş liste = işletmenin tüm şubeleri). */
const scopeOf = (m: Mgr): string[] => (m.role === "supervisor" ? parseIds(m.managed_location_ids) : m.location_id ? [m.location_id] : []);

/** Yöneticinin maddeleri (boş alan = hepsi). */
const permsOf = (m: Pick<Mgr, "permissions">): Perm[] => parseAccess(m.permissions)?.perms ?? ALL_PERMS;

/**
 * Yöneticinin unvanı kapsamından gelir (elle yazılan unvan yok): Şef / Bölge Müdürü / Şube Müdürü.
 * Tek şubeli işletmede "şube" geçmez: Müdür.
 */
export const managerTitle = (chef: boolean, branchCount: number, orgBranchCount = 2): string =>
  chef ? "Şef" : branchCount > 1 ? "Bölge Müdürü" : orgBranchCount > 1 ? "Şube Müdürü" : "Müdür";

/**
 * Neleri yapabilir: maddeler tek tek. Veren kişinin sahip olmadığı madde verilemez (soluk görünür).
 * Şefe sadece kendi departmanıyla ilgili maddeler; tek şubeli işletmede "Başka şubeden personel" gizli.
 */
function PermPicker({ value, onChange, chef, multiBranch, granter }: {
  value: Perm[]; onChange: (v: Perm[]) => void; chef: boolean; multiBranch: boolean; granter: Granter;
}) {
  const grantable = userPerms(granterAccess(granter));
  const items = PERM_LIST.filter(p => (!chef || CHEF_PERMS.includes(p.key)) && (multiBranch || p.key !== "cross_branch"));
  const toggle = (k: Perm) => {
    const on = value.includes(k);
    let next = on ? value.filter(x => x !== k) : [...value, k];
    // Yayınlayan hazırlar da; hazırlamayan yayınlayamaz
    if (!on && k === "publish" && !next.includes("prepare")) next = [...next, "prepare"];
    if (on && k === "prepare") next = next.filter(x => x !== "publish");
    onChange(next);
  };
  const none = items.every(p => !value.includes(p.key));
  return (
    <div className="space-y-1.5">
      <List>
        {items.map(p => {
          const allowed = grantable.includes(p.key);
          return (
            <li key={p.key}>
              <label className={`flex items-start gap-3 px-4 py-3 ${allowed ? "cursor-pointer" : "opacity-50 cursor-not-allowed"}`}>
                <input type="checkbox" checked={value.includes(p.key)} disabled={!allowed} onChange={() => toggle(p.key)}
                  className="mt-0.5 w-4 h-4 rounded accent-forest-600 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">{p.label}</span>
                  <span className="block text-xs text-slate-500 mt-0.5">{allowed ? p.description : "Sizde olmayan bir yetkiyi veremezsiniz."}</span>
                </span>
              </label>
            </li>
          );
        })}
      </List>
      <p className="text-xs text-slate-500">
        {none ? "Hiçbiri seçili değil: bu kişi her şeyi görür, hiçbir şeyi değiştiremez." : "Ek özellikleri açıp kapatmak sadece işletme sahibindedir."}
      </p>
    </div>
  );
}

function BranchPicker({ locations, value, onChange, single }: { locations: Loc[]; value: string[]; onChange: (v: string[]) => void; single?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {locations.map(l => {
        const on = value.includes(l.id);
        const next = single ? [l.id] : on ? value.filter(x => x !== l.id) : [...value, l.id];
        return (
          <button key={l.id} type="button" onClick={() => onChange(next)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${on ? "bg-forest-600 text-white border-forest-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            {l.name}
          </button>
        );
      })}
    </div>
  );
}

const label = "block text-sm font-medium text-slate-700 mb-1.5";
const field = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white";
const segBtn = (on: boolean) => `px-2 py-2 rounded-lg text-xs font-semibold border transition-colors ${on ? "bg-forest-600 text-white border-forest-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`;

/**
 * Bu yöneticinin yetkisini değiştirebilir mi (sunucu: lib/access canManageAccount). İşletme sahibi herkesi;
 * diğerleri "Başkasına yetki verme" ile sadece kendinden alt kademedekini (listeler zaten kapsamla süzülü).
 */
export function canEditManager(granter: Granter, m: Pick<Mgr, "role" | "permissions">): boolean {
  const g = granterAccess(granter);
  if (g.role === "admin") return true;
  return canDelegate(g) && accountLevel(m.role, parseAccess(m.permissions)) < accountLevel(g.role, g.access);
}

/** Yetki verebilen ama sadece şef atayabilen (şube müdürü kademesi) kişi mi. */
export const addsOnlyChefs = (granter: Granter): boolean => {
  const g = granterAccess(granter);
  return g.role !== "admin" && canDelegate(g) && accountLevel(g.role, g.access) === 2;
};

/** Yetki maddelerinin listede kısa adları. */
const PERM_SHORT: Record<Perm, string> = {
  prepare: "Plan", publish: "Yayın", approvals: "Onaylar", team: "Ekip",
  plan_settings: "Plan ayarları", budget: "Bütçe", cross_branch: "Şubeler arası", delegate: "Yetki verme",
};

/** Yöneticinin kapsamı: departman şefiyse "Salon şefi", değilse verilen unvan (ör. "Müdür"). */
export function scopeTitle(m: Pick<Mgr, "permissions">, deptName?: (id: string) => string | undefined, fallback?: string): string | null {
  const a = parseAccess(m.permissions);
  if (a?.department_id) return `${deptName?.(a.department_id) ?? "Departman"} şefi`;
  return fallback ?? null;
}

/** Yöneticinin kapsamını ve yetkisini tek satırla anlatır: "Salon şefi · Plan, Ekip" / "Müdür · Tam yetki". */
export function accessSummary(m: Pick<Mgr, "permissions">, deptName?: (id: string) => string | undefined, roleLabel?: string): string {
  const a = parseAccess(m.permissions);
  const perms = a?.perms ?? ALL_PERMS;
  const full = a?.department_id ? CHEF_PERMS.every(p => perms.includes(p)) : perms.length === ALL_PERMS.length;
  const what = perms.length === 0 ? "Sadece görür" : full ? "Tam yetki" : perms.map(p => PERM_SHORT[p]).join(", ");
  return [scopeTitle(m, deptName, roleLabel), what].filter(Boolean).join(" · ");
}

/**
 * Yönetici / şef ekleme penceresi: ekipten biri (hesabı ve geçmişi korunur) ya da yeni kişi.
 * Şube müdürü sadece kendi şubesine departman şefi atar.
 */
export function ManagerAddSheet({ open, onClose, locations, granter, onDone }: {
  open: boolean; onClose: () => void; locations: Loc[]; granter: Granter; onDone?: () => void;
}) {
  const isOwner = granter.role === "admin";
  const branchManager = addsOnlyChefs(granter);
  const multiBranch = locations.length > 1 && !branchManager;
  const startPerms = () => userPerms(granterAccess(granter));
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pickedMulti, setPicked] = useState<string[]>([]);
  // Tek şubede seçim yok: şube o an hesaplanır (sayfa açılırken şubeler henüz yüklenmemiş olabilir)
  const picked = multiBranch ? pickedMulti : locations.slice(0, 1).map(l => l.id);
  const [deptState, setDeptState] = useState<{ loc: string; list: Dept[] }>({ loc: "", list: [] });
  const [deptId, setDeptId] = useState("");
  const [perms, setPerms] = useState<Perm[]>(startPerms);
  const [teamState, setTeamState] = useState<{ loc: string; list: { personnelId: string; userId: string | null; name: string }[] }>({ loc: "", list: [] });
  const [source, setSource] = useState<"team" | "new">("team");
  const [pickedEmp, setPickedEmp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState<InviteResult[] | null>(null);

  const singlePick = picked.length === 1 ? picked[0] : "";
  useEffect(() => {
    if (!open || !singlePick) return;
    fetch(`/api/departments?location_id=${singlePick}`).then(r => r.json())
      .then(d => setDeptState({ loc: singlePick, list: Array.isArray(d) ? d.map((x: Dept) => ({ id: x.id, name: x.name, parent_id: x.parent_id ?? null })) : [] }))
      .catch(() => setDeptState({ loc: singlePick, list: [] }));
    fetch(`/api/personnel?location_id=${singlePick}`).then(r => r.json())
      .then(d => setTeamState({
        loc: singlePick,
        list: (Array.isArray(d) ? d : [])
          .filter((p: { status?: string; user_access_level?: string }) => p.status !== "inactive" && (p.user_access_level ?? "employee") === "employee")
          .map((p: { id: string; user_id?: string | null; name: string }) => ({ personnelId: p.id, userId: p.user_id ?? null, name: p.name }))
          .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "tr")),
      }))
      .catch(() => setTeamState({ loc: singlePick, list: [] }));
  }, [open, singlePick]);
  const depts = singlePick && deptState.loc === singlePick ? deptState.list : [];
  const teamChoices = singlePick && teamState.loc === singlePick ? teamState.list : [];
  const pickDept = (v: string) => setDeptId(v);

  const reset = () => {
    setName(""); setPhone(""); setDeptId(""); setPerms(startPerms()); setPickedEmp(""); setError(""); setInvite(null);
    setPicked([]);
  };
  const close = () => { reset(); onClose(); };

  const save = async () => {
    setError("");
    if (source === "new" && !name.trim()) return setError("Ad soyad girin.");
    if (source === "team" && !pickedEmp) return setError("Ekipten bir kişi seçin.");
    if (!picked.length) return setError("En az bir şube seçin.");
    if (branchManager && !deptId) return setError("Hangi departmanın şefi olacağını seçin.");
    setBusy(true);
    try {
      const unvan = managerTitle(!!deptId, picked.length, locations.length);
      const dept = picked.length === 1 && depts.length ? deptId : "";
      if (source === "team") {
        // Var olan çalışan: hesabı ve geçmişi korunur. Giriş hesabı yoksa önce açılır.
        const person = teamChoices.find(t => t.personnelId === pickedEmp);
        if (!person) return setError("Kişi bulunamadı.");
        let userId = person.userId;
        let newInvite: InviteResult | null = null;
        if (!userId) {
          const cr = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ existing_personnel_id: person.personnelId }) });
          const cd = await cr.json().catch(() => ({}));
          if (!cr.ok) return setError(cd.error || "Hesap açılamadı.");
          userId = cd.user.id as string;
          newInvite = { name: cd.user.name, username: cd.user.username, invite_token: cd.inviteToken };
        }
        const r = await fetch(`/api/users?id=${userId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ make_manager: { department_id: dept || null, perms, display_title: unvan } }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return setError(d.error || "Yapılamadı.");
        if (picked.length > 1) {
          await fetch(`/api/users?id=${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope_location_ids: picked }) });
        }
        onDone?.();
        if (newInvite) setInvite([newInvite]); else close();
        return;
      }
      const access = { perms, department_id: dept || undefined };
      const body = picked.length === 1
        ? { name, phone: phone || undefined, role: "manager", display_title: unvan, location_id: picked[0], department_id: dept || undefined, access }
        : { name, phone: phone || undefined, role: "supervisor", display_title: unvan, managed_location_ids: picked, access };
      const r = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) return setError(d.error || "Eklenemedi.");
      onDone?.();
      setInvite([{ name: d.user.name, username: d.user.username, invite_token: d.inviteToken }]);
    } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={close}
      title={invite ? "Giriş bağlantısını gönderin" : branchManager ? "Şef ata" : "Yönetici ekle"}
      description={invite ? undefined : branchManager
        ? "Şef sadece kendi departmanını görür ve planlar."
        : "Planı ve ekibi sizin yerinize yönetecek kişi. Sadece seçtiğiniz şubeleri görür."}
      footer={invite
        ? <button onClick={close} className={sheetPrimaryClass}>Tamam</button>
        : <>
            <button onClick={close} className={sheetSecondaryClass}>Vazgeç</button>
            <button onClick={save} disabled={busy} className={sheetPrimaryClass}>{busy ? "Kaydediliyor…" : source === "team" ? "Yetkiyi ver" : "Ekle"}</button>
          </>}
    >
      {invite ? <InviteLinkList results={invite} /> : (
        <div className="space-y-4">
          {multiBranch && (
            <div>
              <span className={label}>Hangi şubeleri yönetecek?</span>
              <BranchPicker locations={locations} value={picked} onChange={v => { setPicked(v); setDeptId(""); setPickedEmp(""); }} single={!isOwner} />
            </div>
          )}
          <div>
            <span className={label}>Kim?</span>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {(["team", "new"] as const).map(k => (
                <button key={k} type="button" onClick={() => setSource(k)} className={segBtn(source === k)}>{k === "team" ? "Ekipten biri" : "Yeni kişi"}</button>
              ))}
            </div>
            {source === "team" ? (
              singlePick ? (
                <select value={pickedEmp} onChange={e => setPickedEmp(e.target.value)} className={field}>
                  <option value="">Kişi seçin…</option>
                  {teamChoices.map(e => <option key={e.personnelId} value={e.personnelId}>{e.name}{e.userId ? "" : " (hesap açılacak)"}</option>)}
                </select>
              ) : <p className="text-xs text-slate-500">Ekipten seçmek için önce tek bir şube seçin.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Ad Soyad" className={field} />
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Telefon (isteğe bağlı)" className={field} />
              </div>
            )}
          </div>
          {depts.length > 0 && (
            <div>
              <span className={label}>{branchManager ? "Hangi departmanın şefi?" : <>Sadece bir departman mı? <span className="font-normal text-slate-400">(isteğe bağlı)</span></>}</span>
              <select value={deptId} onChange={e => pickDept(e.target.value)} className={field}>
                <option value="">{branchManager ? "Departman seçin…" : "Tüm departmanlar"}</option>
                {/* Departmanın şefi alt departmanlarını da yönetir (lib/departments) */}
                {sortDepartments(depts).map(d => <option key={d.id} value={d.id}>{departmentLabel(depts, d)}{hasSubDepartments(depts, d.id) ? " (alt departmanlarıyla)" : ""}</option>)}
              </select>
            </div>
          )}
          <div>
            <span className={label}>Neleri yapabilir?</span>
            <PermPicker value={perms} onChange={setPerms} chef={!!deptId} multiBranch={locations.length > 1} granter={granter} />
          </div>
          <p className="text-xs text-slate-500">Yöneticiye vardiya yazılmaz. Vardiyaya da girecekse kişinin kartında &quot;Vardiya planına dahil&quot;i açın.</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </Sheet>
  );
}

/** Yöneticinin düzenlenebilir yetkisi: neleri yapabilir + (patron, çok şubede) hangi şubeler. */
export type ManagerAccessValue = { perms: Perm[]; ids: string[] };

export const initialManagerAccess = (m: Mgr): ManagerAccessValue => ({ perms: permsOf(m), ids: scopeOf(m) });

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id));

export const managerAccessDirty = (m: Mgr, v: ManagerAccessValue): boolean => {
  const cur = initialManagerAccess(m);
  return !sameIds(cur.perms, v.perms) || !sameIds(cur.ids, v.ids);
};

/** Değişen yetkiyi kaydeder; hata metni ya da null döner. Değişiklik kişinin bir sonraki girişinde geçerli olur. */
export async function saveManagerAccess(m: Mgr, v: ManagerAccessValue): Promise<string | null> {
  if (!managerAccessDirty(m, v)) return null;
  const cur = parseAccess(m.permissions);
  const body: Record<string, unknown> = {};
  if (!sameIds(permsOf(m), v.perms)) body.access = { perms: v.perms };
  if (!sameIds(scopeOf(m), v.ids)) {
    if (!v.ids.length) return "En az bir şube seçin.";
    body.scope_location_ids = v.ids;
    body.display_title = managerTitle(!!cur?.department_id, v.ids.length);
  }
  const r = await fetch(`/api/users?id=${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.ok) return null;
  const d = await r.json().catch(() => ({}));
  return d.error || "Yetki kaydedilemedi.";
}

/** Yetki alanları (kayıt düğmesi yok): kişi kartı tek "Kaydet" ile saveManagerAccess çağırır. */
export function ManagerAccessFields({ m, value, onChange, locations, granter }: {
  m: Mgr; value: ManagerAccessValue; onChange: (v: ManagerAccessValue) => void; locations: Loc[]; granter: Granter;
}) {
  const multiBranch = locations.length > 1 && granter.role === "admin";
  const chef = !!parseAccess(m.permissions)?.department_id;
  return (
    <div className="space-y-4">
      {multiBranch && (
        <div>
          <span className={label}>Hangi şubeleri yönetir?</span>
          <BranchPicker locations={locations} value={value.ids} onChange={ids => onChange({ ...value, ids })} />
        </div>
      )}
      <div>
        <span className={label}>Neleri yapabilir?</span>
        <PermPicker value={value.perms} onChange={perms => onChange({ ...value, perms })} chef={chef} multiBranch={locations.length > 1} granter={granter} />
      </div>
      <p className="text-xs text-slate-500">Yetki değişikliği, kişinin bir sonraki girişinde geçerli olur.</p>
    </div>
  );
}

/** Yöneticiyi çalışana döndürür (ekipteki kaydı varsa). */
export async function demoteManager(m: Mgr): Promise<boolean> {
  const r = await fetch(`/api/users?id=${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ make_employee: true }) });
  return r.ok;
}
