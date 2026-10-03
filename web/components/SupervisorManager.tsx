"use client";
/**
 * Bölge müdürleri (opsiyonel): patron ekler ve sorumlu oldukları şubeleri seçer.
 * Bölge müdürü sadece bu şubeleri görür ve yönetir (users.managed_location_ids, lib/access).
 * Hiç eklenmezse her şey patrona gelir.
 */
import { useCallback, useEffect, useState } from "react";
import { Plus, X, MapPin } from "lucide-react";
import InviteLinkList, { type InviteResult } from "@/components/personnel/InviteLinkList";

type Loc = { id: string; name: string };
type Sup = { id: string; name: string; username: string; managed_location_ids: string | null };

const parseIds = (raw: string | null): string[] => {
  try { const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch { return []; }
};

function BranchPicker({ locations, value, onChange }: { locations: Loc[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {locations.map(l => {
        const on = value.includes(l.id);
        return (
          <button key={l.id} type="button" onClick={() => onChange(on ? value.filter(x => x !== l.id) : [...value, l.id])}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${on ? "bg-forest-600 text-white border-forest-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            {l.name}
          </button>
        );
      })}
    </div>
  );
}

export default function SupervisorManager({ locations }: { locations: Loc[] }) {
  const [sups, setSups] = useState<Sup[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState<InviteResult[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editIds, setEditIds] = useState<string[]>([]);

  const load = useCallback(() => {
    fetch("/api/users").then(r => r.json())
      .then(d => setSups(Array.isArray(d) ? d.filter((u: { role: string }) => u.role === "supervisor") : []))
      .catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const locName = (id: string) => locations.find(l => l.id === id)?.name ?? id;

  const create = async () => {
    setError("");
    if (!name.trim()) return setError("Ad soyad girin.");
    if (!picked.length) return setError("En az bir şube seçin.");
    setBusy(true);
    try {
      const r = await fetch("/api/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone: phone || undefined, role: "supervisor", display_title: "Bölge Müdürü", managed_location_ids: picked }),
      });
      const d = await r.json();
      if (!r.ok) return setError(d.error || "Eklenemedi.");
      setInvite([{ name: d.user.name, username: d.user.username, invite_token: d.inviteToken }]);
      setName(""); setPhone(""); setPicked([]); setAdding(false);
      load();
    } finally { setBusy(false); }
  };

  const saveBranches = async (id: string) => {
    if (!editIds.length) return;
    const r = await fetch(`/api/users?id=${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managed_location_ids: editIds }),
    });
    if (r.ok) { setEditing(null); load(); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-800">Bölge Müdürleri <span className="font-semibold text-slate-400">(isteğe bağlı)</span></p>
          <p className="text-xs text-slate-500 mt-0.5">Birden çok şubeyi sizin yerinize takip edecek biri varsa ekleyin. Sadece seçtiğiniz şubeleri görür ve yönetir. Eklemezseniz her şey size gelir.</p>
        </div>
        {!adding && (
          <button onClick={() => { setAdding(true); setInvite(null); }} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-forest-600 text-white text-xs font-bold hover:bg-forest-700">
            <Plus size={14} /> Bölge Müdürü Ekle
          </button>
        )}
      </div>

      {/* Yeni eklenenin giriş bağlantısı: listedeki satırın kopyası gibi durmasın, tek seferlik paylaşım kutusu */}
      {invite && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-emerald-800">Eklendi. Giriş bağlantısını kendisine gönderin:</p>
            <button onClick={() => setInvite(null)} className="text-xs font-bold text-emerald-800 hover:underline shrink-0">Tamam</button>
          </div>
          <InviteLinkList results={invite} />
        </div>
      )}

      {adding && (
        <div className="rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">Yeni bölge müdürü</p>
            <button onClick={() => setAdding(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ad Soyad" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Telefon (isteğe bağlı)" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <p className="text-xs font-bold text-slate-500">Sorumlu olduğu şubeler</p>
          <BranchPicker locations={locations} value={picked} onChange={setPicked} />
          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          <button onClick={create} disabled={busy} className="w-full py-2.5 rounded-xl bg-forest-600 text-white text-sm font-bold disabled:opacity-50">
            {busy ? "Ekleniyor…" : "Ekle ve giriş bağlantısı oluştur"}
          </button>
        </div>
      )}

      {sups.length > 0 && (
        <div className="divide-y divide-slate-100">
          {sups.map(s => {
            const ids = parseIds(s.managed_location_ids);
            return (
              <div key={s.id} className="py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{s.name}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1 flex-wrap">
                      <MapPin size={12} /> {ids.length ? ids.map(locName).join(", ") : "Tüm şubeler"}
                    </p>
                  </div>
                  {editing !== s.id && (
                    <button onClick={() => { setEditing(s.id); setEditIds(ids); }} className="shrink-0 text-xs font-bold text-forest-700 hover:underline">Şubeleri düzenle</button>
                  )}
                </div>
                {editing === s.id && (
                  <div className="space-y-2">
                    <BranchPicker locations={locations} value={editIds} onChange={setEditIds} />
                    <div className="flex gap-2">
                      <button onClick={() => saveBranches(s.id)} disabled={!editIds.length} className="px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-bold disabled:opacity-50">Kaydet</button>
                      <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600">Vazgeç</button>
                    </div>
                    <p className="text-[11px] text-slate-400">Değişiklik, bölge müdürünün bir sonraki girişinde geçerli olur.</p>
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
