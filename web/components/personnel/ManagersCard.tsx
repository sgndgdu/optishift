"use client";
/**
 * Yöneticiler: rol sistemi kullanıcıya üç rol olarak görünür (İşletme Sahibi / Yönetici / Çalışan).
 * Yönetici eklerken rol değil KAPSAM sorulur: tek şube seçilirse şube yöneticisi (users.role = manager),
 * birden çok şube seçilirse bölge yöneticisi (role = supervisor, managed_location_ids). Unvan serbest
 * yazılan bir etikettir (display_title), yetkiyi değiştirmez. Kapsam değişikliği PATCH scope_location_ids.
 * Hiç yönetici eklenmezse her şey işletme sahibine gelir.
 */

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import InviteLinkList, { type InviteResult } from "@/components/personnel/InviteLinkList";
import { StatusPill } from "@/components/ui/StatusPill";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListItem, ListSection } from "@/components/ui/List";
import { Sheet, sheetDangerClass, sheetPrimaryClass, sheetSecondaryClass } from "@/components/ui/Sheet";
import { ACCESS_MODE_LABELS, parseAccess, type AccessMode } from "@/lib/userAccess";

type Loc = { id: string; name: string };
type Dept = { id: string; name: string };
export type Mgr = {
  id: string; name: string; username: string; role: string; display_title: string | null;
  location_id: string | null; department_id: string | null; managed_location_ids: string | null;
  is_temp_password: boolean | null; permissions: string | null;
  personnel_id: string | null; approval_status?: string | null;
};

const parseIds = (raw: string | null): string[] => {
  try { const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch { return []; }
};

/** Yöneticinin sorumlu olduğu şubeler (bölge yöneticisinde boş liste = işletmenin tüm şubeleri). */
const scopeOf = (m: Mgr): string[] => (m.role === "supervisor" ? parseIds(m.managed_location_ids) : m.location_id ? [m.location_id] : []);

const MODE_HINTS: Record<AccessMode, string> = {
  view: "Planı, ekibi ve raporları görür; hiçbir şeyi değiştiremez.",
  prepare: "Planı hazırlar ve onaya gönderir; yayınlamayı başka bir yönetici yapar.",
  publish: "Planı hazırlar ve yayınlar.",
};

const CHEF_HINTS: Record<AccessMode, string> = {
  view: "Departmanının planını ve ekibini görür; değiştiremez.",
  prepare: "Departmanının planını hazırlar ve şube müdürüne onaya gönderir.",
  publish: "Departmanının planını hazırlar ve kendisi yayınlar (sadece kendi ekibi).",
};

/** Yöneticinin ne yapabileceği: sadece görür / hazırlar / hazırlar ve yayınlar. */
function ModePicker({ value, onChange, chef }: { value: AccessMode; onChange: (m: AccessMode) => void; chef?: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-3 gap-2">
        {(["view", "prepare", "publish"] as AccessMode[]).map(m => {
          return (
            <button key={m} type="button" onClick={() => onChange(m)}
              className={`px-2 py-2 rounded-lg text-xs font-semibold border transition-colors ${value === m ? "bg-forest-600 text-white border-forest-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
              {ACCESS_MODE_LABELS[m]}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">{chef ? CHEF_HINTS[value] : MODE_HINTS[value]}</p>
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

/** Bu yöneticiyi kim düzenler: patron herkesi; şube müdürü kendi şeflerini; bölge yöneticisi şube yöneticilerini. */
export function canEditManager(viewerRole: string, branchManager: boolean, m: Pick<Mgr, "role" | "permissions">): boolean {
  const isChef = !!parseAccess(m.permissions)?.department_id;
  return viewerRole === "admin" || (branchManager ? isChef : viewerRole === "supervisor" && m.role === "manager");
}

/** Yöneticinin kapsamını ve yetkisini tek satırla anlatır: "Sadece Bar · Planı hazırlar". */
export function accessSummary(m: Pick<Mgr, "permissions">, deptName?: (id: string) => string | undefined): string {
  const a = parseAccess(m.permissions);
  const dept = a?.department_id ? (deptName?.(a.department_id) ?? "Departman") : null;
  return [dept ? `Sadece ${dept}` : null, ACCESS_MODE_LABELS[a?.mode ?? "publish"]].filter(Boolean).join(" · ");
}

/**
 * Yönetici / şef ekleme penceresi: ekipten biri (hesabı, geçmişi ve plandaki yeri korunur) ya da yeni kişi.
 * Şube müdürü sadece kendi şubesine departman şefi atar.
 */
export function ManagerAddSheet({ open, onClose, locations, viewerRole, branchManager = false, onDone }: {
  open: boolean; onClose: () => void; locations: Loc[]; viewerRole: string; branchManager?: boolean; onDone?: () => void;
}) {
  const isOwner = viewerRole === "admin";
  const multiBranch = locations.length > 1 && !branchManager;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [pickedMulti, setPicked] = useState<string[]>([]);
  // Tek şubede seçim yok: şube o an hesaplanır (sayfa açılırken şubeler henüz yüklenmemiş olabilir)
  const picked = multiBranch ? pickedMulti : locations.slice(0, 1).map(l => l.id);
  const [deptState, setDeptState] = useState<{ loc: string; list: Dept[] }>({ loc: "", list: [] });
  const [deptId, setDeptId] = useState("");
  const [mode, setMode] = useState<AccessMode>("publish");
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
      .then(d => setDeptState({ loc: singlePick, list: Array.isArray(d) ? d.map((x: Dept) => ({ id: x.id, name: x.name })) : [] }))
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
  const pickDept = (v: string) => { setDeptId(v); setMode(v ? "prepare" : "publish"); };

  const reset = () => {
    setName(""); setPhone(""); setTitle(""); setDeptId(""); setMode("publish"); setPickedEmp(""); setError(""); setInvite(null);
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
      const unvan = title.trim() || (deptId ? "Şef" : "Yönetici");
      const dept = picked.length === 1 && depts.length ? deptId : "";
      if (source === "team") {
        // Var olan çalışan: hesabı, geçmişi ve plandaki yeri korunur. Giriş hesabı yoksa önce açılır.
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
          body: JSON.stringify({ make_manager: { department_id: dept || null, mode, display_title: unvan } }),
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
      const access = { mode, department_id: dept || undefined };
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
          <div>
            <span className={label}>Unvan <span className="font-normal text-slate-400">(isteğe bağlı)</span></span>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Müdür, Müdür Yardımcısı, Şef..." className={field} />
          </div>
          {depts.length > 0 && (
            <div>
              <span className={label}>{branchManager ? "Hangi departmanın şefi?" : <>Sadece bir departman mı? <span className="font-normal text-slate-400">(isteğe bağlı)</span></>}</span>
              <select value={deptId} onChange={e => pickDept(e.target.value)} className={field}>
                <option value="">{branchManager ? "Departman seçin…" : "Şubenin tamamı"}</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <span className={label}>Ne yapabilir?</span>
            <ModePicker value={mode} onChange={setMode} chef={!!deptId} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </Sheet>
  );
}

/**
 * Yöneticinin yetkisini düzenleme (kişi ayrıntısının içinde): unvan, ne yapabilir, şubeler (patron),
 * yöneticilikten alma / hesabı silme. Değişiklik kişinin bir sonraki girişinde geçerli olur.
 */
export function ManagerAccessEditor({ m, locations, viewerRole, branchManager = false, onDone }: {
  m: Mgr; locations: Loc[]; viewerRole: string; branchManager?: boolean; onDone?: () => void;
}) {
  const isOwner = viewerRole === "admin";
  const multiBranch = locations.length > 1 && isOwner;
  const isChef = !!parseAccess(m.permissions)?.department_id;
  const [title, setTitle] = useState(m.display_title ?? "");
  const [mode, setMode] = useState<AccessMode>(parseAccess(m.permissions)?.mode ?? "publish");
  const [ids, setIds] = useState<string[]>(scopeOf(m));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const cur = parseAccess(m.permissions);
      const body: Record<string, unknown> = { display_title: title.trim() || "Yönetici" };
      if (mode !== (cur?.mode ?? "publish")) body.access = { mode, department_id: cur?.department_id ?? undefined };
      const before = scopeOf(m);
      if (multiBranch && ids.length && (ids.length !== before.length || ids.some(id => !before.includes(id)))) body.scope_location_ids = ids;
      const r = await fetch(`/api/users?id=${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) onDone?.();
    } finally { setBusy(false); }
  };
  const demote = async () => {
    const r = await fetch(`/api/users?id=${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ make_employee: true }) });
    if (r.ok) onDone?.();
  };
  const remove = async () => {
    const r = await fetch(`/api/users?id=${m.id}`, { method: "DELETE" });
    if (r.ok) onDone?.();
  };

  return (
    <div className="space-y-4">
      <div>
        <span className={label}>Unvan</span>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Yönetici" className={field} />
      </div>
      <div>
        <span className={label}>Ne yapabilir?</span>
        <ModePicker value={mode} onChange={setMode} chef={isChef} />
      </div>
      {multiBranch && (
        <div>
          <span className={label}>Şubeler</span>
          <BranchPicker locations={locations} value={ids} onChange={setIds} />
        </div>
      )}
      <p className="text-xs text-slate-500">Değişiklik, kişinin bir sonraki girişinde geçerli olur.</p>
      <div className="flex flex-wrap items-center gap-2">
        {m.personnel_id ? (
          <button onClick={demote} className={sheetSecondaryClass}>Yöneticilikten al</button>
        ) : !branchManager && (
          confirmDelete
            ? <button onClick={remove} className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">Evet, hesabı sil</button>
            : <button onClick={() => setConfirmDelete(true)} className={sheetDangerClass}>Hesabı sil</button>
        )}
        <button onClick={save} disabled={busy || (multiBranch && !ids.length)} className={`ml-auto ${sheetPrimaryClass}`}>{busy ? "Kaydediliyor…" : "Yetkiyi kaydet"}</button>
      </div>
    </div>
  );
}

/**
 * Tüm Şubeler paneli için yöneticiler listesi (ana listesi sadece personeli gösteren sayfalarda):
 * satıra dokununca yetki düzenleyici açılır, "Yönetici ekle" penceresi.
 */
export default function ManagersCard({ locations, viewerRole, branchManager = false }: {
  locations: Loc[]; viewerRole: string; branchManager?: boolean;
}) {
  const [mgrs, setMgrs] = useState<Mgr[]>([]);
  const [deptNames, setDeptNames] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch("/api/users").then(r => r.json())
      .then(d => setMgrs((Array.isArray(d) ? d : []).filter((u: Mgr) => u.role === "manager" || u.role === "supervisor")))
      .catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  const locKey = locations.map(l => l.id).join(",");
  useEffect(() => {
    if (!locKey) return;
    Promise.all(locKey.split(",").map(id => fetch(`/api/departments?location_id=${id}`).then(r => r.json()).catch(() => [])))
      .then(lists => setDeptNames(Object.fromEntries(lists.flatMap(l => (Array.isArray(l) ? l : []).map((d: Dept) => [d.id, d.name])))));
  }, [locKey]);
  const locName = (id: string) => locations.find(l => l.id === id)?.name ?? id;
  const open = mgrs.find(m => m.id === openId) ?? null;

  return (
    <>
      <List>
        <ListSection title="Yöneticiler" count={mgrs.length} action={
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-forest-700 hover:underline">
            <Plus size={13} /> {branchManager ? "Şef ata" : "Yönetici ekle"}
          </button>
        } />
        {mgrs.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">Henüz yönetici yok. Her şey size gelir.</li>}
        {mgrs.map(m => {
          const ids = scopeOf(m);
          const where = locations.length > 1 ? (ids.length ? ids.map(locName).join(", ") : "Tüm şubeler") : null;
          return (
            <ListItem key={m.id}
              leading={<Avatar name={m.name} tone="brand" />}
              title={m.name}
              subtitle={[m.display_title || "Yönetici", accessSummary(m, id => deptNames[id]), where].filter(Boolean).join(" · ")}
              trailing={m.is_temp_password ? <StatusPill tone="attention">Henüz girmedi</StatusPill> : undefined}
              onClick={canEditManager(viewerRole, branchManager, m) ? () => setOpenId(m.id) : undefined}
            />
          );
        })}
      </List>
      <ManagerAddSheet open={adding} onClose={() => setAdding(false)} locations={locations} viewerRole={viewerRole} branchManager={branchManager} onDone={load} />
      {open && (
        <Sheet open onClose={() => setOpenId(null)} title={open.name} description={open.display_title || "Yönetici"}>
          <ManagerAccessEditor key={open.id} m={open} locations={locations} viewerRole={viewerRole} branchManager={branchManager} onDone={() => { setOpenId(null); load(); }} />
        </Sheet>
      )}
    </>
  );
}
