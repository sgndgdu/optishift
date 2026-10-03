"use client";
/**
 * Yöneticiler: rol sistemi kullanıcıya üç rol olarak görünür (İşletme Sahibi / Yönetici / Çalışan).
 * Yönetici eklerken rol değil KAPSAM sorulur: tek şube seçilirse şube yöneticisi (users.role = manager),
 * birden çok şube seçilirse bölge yöneticisi (role = supervisor, managed_location_ids). Unvan serbest
 * yazılan bir etikettir (display_title), yetkiyi değiştirmez. Kapsam değişikliği PATCH scope_location_ids.
 * Hiç yönetici eklenmezse her şey işletme sahibine gelir.
 */

import { useCallback, useEffect, useState } from "react";
import { Plus, X, MapPin } from "lucide-react";
import InviteLinkList, { type InviteResult } from "@/components/personnel/InviteLinkList";
import { StatusPill } from "@/components/ui/StatusPill";

type Loc = { id: string; name: string };
type Dept = { id: string; name: string };
type Mgr = {
  id: string; name: string; username: string; role: string; display_title: string | null;
  location_id: string | null; department_id: string | null; managed_location_ids: string | null;
  is_temp_password: boolean | null;
};

const parseIds = (raw: string | null): string[] => {
  try { const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch { return []; }
};

/** Yöneticinin sorumlu olduğu şubeler (bölge yöneticisinde boş liste = işletmenin tüm şubeleri). */
const scopeOf = (m: Mgr): string[] => (m.role === "supervisor" ? parseIds(m.managed_location_ids) : m.location_id ? [m.location_id] : []);

function BranchPicker({ locations, value, onChange, single }: { locations: Loc[]; value: string[]; onChange: (v: string[]) => void; single?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {locations.map(l => {
        const on = value.includes(l.id);
        const next = single ? [l.id] : on ? value.filter(x => x !== l.id) : [...value, l.id];
        return (
          <button key={l.id} type="button" onClick={() => onChange(next)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${on ? "bg-forest-600 text-white border-forest-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            {l.name}
          </button>
        );
      })}
    </div>
  );
}

export default function ManagersCard({ locations, viewerRole }: { locations: Loc[]; viewerRole: string }) {
  const isOwner = viewerRole === "admin";
  const multiBranch = locations.length > 1;
  const [mgrs, setMgrs] = useState<Mgr[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [deptState, setDeptState] = useState<{ loc: string; list: Dept[] }>({ loc: "", list: [] });
  const [deptId, setDeptId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState<InviteResult[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editIds, setEditIds] = useState<string[]>([]);
  const [editTitle, setEditTitle] = useState("");

  const load = useCallback(() => {
    fetch("/api/users").then(r => r.json())
      .then(d => setMgrs(Array.isArray(d) ? d.filter((u: Mgr) => u.role === "manager" || u.role === "supervisor") : []))
      .catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  // Tek şube seçiliyse ve o şubede departman varsa "sadece bir departman" seçeneği sunulur
  const singlePick = picked.length === 1 ? picked[0] : "";
  useEffect(() => {
    if (!singlePick) return;
    fetch(`/api/departments?location_id=${singlePick}`).then(r => r.json())
      .then(d => setDeptState({ loc: singlePick, list: Array.isArray(d) ? d.map((x: Dept) => ({ id: x.id, name: x.name })) : [] }))
      .catch(() => setDeptState({ loc: singlePick, list: [] }));
  }, [singlePick]);
  const depts = singlePick && deptState.loc === singlePick ? deptState.list : [];
  const pickBranches = (v: string[]) => { setPicked(v); setDeptId(""); };

  const locName = (id: string) => locations.find(l => l.id === id)?.name ?? id;
  const startAdding = () => {
    setAdding(true); setInvite(null); setError("");
    setPicked(multiBranch ? [] : locations.map(l => l.id));
  };

  const create = async () => {
    setError("");
    if (!name.trim()) return setError("Ad soyad girin.");
    if (!picked.length) return setError("En az bir şube seçin.");
    setBusy(true);
    try {
      const unvan = title.trim() || "Yönetici";
      const body = picked.length === 1
        ? { name, phone: phone || undefined, role: "manager", display_title: unvan, location_id: picked[0], department_id: (depts.length && deptId) || undefined }
        : { name, phone: phone || undefined, role: "supervisor", display_title: unvan, managed_location_ids: picked };
      const r = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) return setError(d.error || "Eklenemedi.");
      setInvite([{ name: d.user.name, username: d.user.username, invite_token: d.inviteToken }]);
      setName(""); setPhone(""); setTitle(""); setPicked([]); setDeptId(""); setAdding(false);
      load();
    } finally { setBusy(false); }
  };

  /** Henüz girmemiş yöneticinin giriş bağlantısını yeniden üretir. */
  const sendInvite = async (m: Mgr) => {
    const r = await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: m.id }) });
    const d = await r.json().catch(() => null);
    if (r.ok && d?.token) setInvite([{ name: m.name, username: m.username, invite_token: d.token }]);
  };

  const saveEdit = async (m: Mgr) => {
    const body: Record<string, unknown> = { display_title: editTitle.trim() || "Yönetici" };
    const before = scopeOf(m);
    if (isOwner && editIds.length && (editIds.length !== before.length || editIds.some(id => !before.includes(id)))) {
      body.scope_location_ids = editIds;
    }
    const r = await fetch(`/api/users?id=${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) { setEditing(null); load(); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-800">Yöneticiler <span className="font-semibold text-slate-400">(isteğe bağlı)</span></p>
          <p className="text-xs text-slate-500 mt-0.5">
            Planı ve ekibi sizin yerinize yönetecek biri varsa ekleyin. Sadece seçtiğiniz şubeleri görür. Eklemezseniz her şey size gelir.
          </p>
        </div>
        {!adding && (
          <button onClick={startAdding} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-forest-600 text-white text-xs font-bold hover:bg-forest-700">
            <Plus size={14} /> Yönetici Ekle
          </button>
        )}
      </div>

      {invite && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-emerald-800">Giriş bağlantısını kendisine gönderin:</p>
            <button onClick={() => setInvite(null)} className="text-xs font-bold text-emerald-800 hover:underline shrink-0">Tamam</button>
          </div>
          <InviteLinkList results={invite} />
        </div>
      )}

      {adding && (
        <div className="rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">Yeni yönetici</p>
            <button onClick={() => setAdding(false)} className="text-slate-400 hover:text-slate-600" aria-label="Kapat"><X size={16} /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ad Soyad" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Telefon (isteğe bağlı)" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Unvan (isteğe bağlı): Müdür, Müdür Yardımcısı, Şef..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
          {multiBranch && (
            <>
              <p className="text-xs font-bold text-slate-500">Hangi şubeleri yönetecek?</p>
              <BranchPicker locations={locations} value={picked} onChange={pickBranches} single={!isOwner} />
            </>
          )}
          {depts.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1.5">Sadece bir departmanı mı yönetecek? <span className="font-semibold text-slate-400">(isteğe bağlı)</span></p>
              <select value={deptId} onChange={e => setDeptId(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white">
                <option value="">Şubenin tamamı</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          <button onClick={create} disabled={busy} className="w-full py-2.5 rounded-xl bg-forest-600 text-white text-sm font-bold disabled:opacity-50">
            {busy ? "Ekleniyor…" : "Ekle ve giriş bağlantısı oluştur"}
          </button>
        </div>
      )}

      {mgrs.length > 0 && (
        <div className="divide-y divide-slate-100">
          {mgrs.map(m => {
            const ids = scopeOf(m);
            return (
              <div key={m.id} className="py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">
                      {m.name} <span className="font-semibold text-slate-400">· {m.display_title || "Yönetici"}</span>
                    </p>
                    {multiBranch && (
                      <p className="text-xs text-slate-500 flex items-center gap-1 flex-wrap">
                        <MapPin size={12} /> {ids.length ? ids.map(locName).join(", ") : "Tüm şubeler"}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {m.is_temp_password && (
                      <button onClick={() => sendInvite(m)} title="Giriş bağlantısını gönder" className="hover:opacity-80">
                        <StatusPill tone="attention">Henüz girmedi</StatusPill>
                      </button>
                    )}
                    {editing !== m.id && (isOwner || m.role === "manager") && (
                      <button onClick={() => { setEditing(m.id); setEditIds(ids); setEditTitle(m.display_title ?? ""); }} className="text-xs font-bold text-forest-700 hover:underline">Düzenle</button>
                    )}
                  </div>
                </div>
                {editing === m.id && (
                  <div className="space-y-2">
                    <input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Unvan" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                    {isOwner && multiBranch && <BranchPicker locations={locations} value={editIds} onChange={setEditIds} />}
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(m)} disabled={isOwner && multiBranch && !editIds.length} className="px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-bold disabled:opacity-50">Kaydet</button>
                      <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600">Vazgeç</button>
                    </div>
                    {isOwner && multiBranch && <p className="text-[11px] text-slate-400">Şube değişikliği, yöneticinin bir sonraki girişinde geçerli olur.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
