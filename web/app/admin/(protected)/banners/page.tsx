"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Plus, Trash2, Info, AlertTriangle, AlertOctagon } from "lucide-react";

type Banner = {
  id: number;
  message: string;
  type: string;        // info | warning | critical
  active: number | boolean;
  starts_at: number | null;
  ends_at: number | null;
  created_at: number;
};

const TYPE_META: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  info:     { label: "Bilgi",   cls: "bg-blue-500/15 text-blue-300 border-blue-500/20",   icon: Info },
  warning:  { label: "Uyarı",   cls: "bg-amber-500/15 text-amber-300 border-amber-500/20", icon: AlertTriangle },
  critical: { label: "Kritik",  cls: "bg-red-500/15 text-red-300 border-red-500/20",       icon: AlertOctagon },
};

function fmtDate(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AdminBannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // form
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [endsAt, setEndsAt] = useState(""); // datetime-local

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/god/banners?all=1");
      const data = await res.json();
      setBanners(Array.isArray(data) ? data : []);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!message.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/god/banners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          type,
          active: 1,
          ends_at: endsAt ? Math.floor(new Date(endsAt).getTime() / 1000) : null,
        }),
      });
      setMessage("");
      setEndsAt("");
      await load();
    } finally { setSaving(false); }
  };

  const handleDeactivate = async (id: number) => {
    if (!confirm("Bu duyuru yayından kaldırılsın mı?")) return;
    await fetch(`/api/god/banners?id=${id}`, { method: "DELETE" });
    await load();
  };

  const isActive = (b: Banner) => {
    const now = Math.floor(Date.now() / 1000);
    return !!b.active && (!b.starts_at || b.starts_at <= now) && (!b.ends_at || b.ends_at >= now);
  };

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Duyurular</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Tüm portallarda (müdür, personel, süpervizör) üst banner olarak gösterilir
        </p>
      </div>

      {/* Yeni duyuru */}
      <div className="bg-white/3 border border-white/8 rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Plus size={14} className="text-violet-400" /> Yeni Duyuru
        </h2>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={2}
          placeholder="Duyuru metni… (örn: Pazar 02:00-04:00 arası planlı bakım yapılacaktır)"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/50 resize-none"
        />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Tür</label>
            <div className="flex gap-1.5">
              {Object.entries(TYPE_META).map(([val, meta]) => (
                <button
                  key={val}
                  onClick={() => setType(val)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border transition-colors ${
                    type === val ? meta.cls : "border-white/10 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <meta.icon size={12} /> {meta.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Bitiş (isteğe bağlı)
            </label>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={e => setEndsAt(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50 [color-scheme:dark]"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={saving || !message.trim()}
            className="ml-auto flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <Megaphone size={14} /> {saving ? "Yayınlanıyor…" : "Yayınla"}
          </button>
        </div>
      </div>

      {/* Liste */}
      <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : banners.length === 0 ? (
          <div className="px-5 py-12 text-center text-slate-600 text-sm">
            <Megaphone size={22} className="mx-auto mb-2 text-slate-700" />
            Henüz duyuru yok
          </div>
        ) : (
          <div className="divide-y divide-white/4">
            {banners.map(b => {
              const meta = TYPE_META[b.type] ?? TYPE_META.info;
              const active = isActive(b);
              return (
                <div key={b.id} className={`flex items-start gap-3 px-5 py-4 ${active ? "" : "opacity-45"}`}>
                  <span className={`mt-0.5 shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.cls}`}>
                    <meta.icon size={10} /> {meta.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200">{b.message}</p>
                    <p className="text-[10px] text-slate-600 mt-1 tabular-nums">
                      Oluşturuldu: {fmtDate(b.created_at)}
                      {b.ends_at ? ` · Bitiş: ${fmtDate(b.ends_at)}` : ""}
                      {active ? " · Yayında" : " · Pasif"}
                    </p>
                  </div>
                  {active && (
                    <button
                      onClick={() => handleDeactivate(b.id)}
                      title="Yayından kaldır"
                      className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
