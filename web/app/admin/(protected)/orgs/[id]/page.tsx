"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, User, MapPin, Activity, Settings, Loader2 } from "lucide-react";
import UserActions from "../../_components/UserActions";

type OrgDetail = {
  org: any;
  locations: any[];
  daily_shifts: { date: string; count: number }[];
  admin_users: any[];
  events: any[];
};

function timeAgo(ts: number | null): string {
  if (!ts) return "Hic";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s once`;
  if (diff < 3600) return `${Math.floor(diff / 60)}dk once`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa once`;
  return `${Math.floor(diff / 86400)}g once`;
}

const TABS = [
  { id: "genel",      label: "Genel",       icon: Settings },
  { id: "metrikler",  label: "Metrikler",   icon: Activity },
  { id: "kullanicilar", label: "Kullanicilar", icon: User },
  { id: "timeline",   label: "Timeline",    icon: Activity },
];

export default function OrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("genel");
  const [saving, setSaving] = useState(false);

  // Form state
  const [plan, setPlan] = useState("free");
  const [notes, setNotes] = useState("");
  const [maxPersonnel, setMaxPersonnel] = useState("");
  const [suspendReason, setSuspendReason] = useState("");

  useEffect(() => {
    fetch(`/api/god/orgs/${id}`)
      .then((r) => r.json())
      .then((d: OrgDetail) => {
        setData(d);
        setPlan(d.org.plan ?? "free");
        setNotes(d.org.notes ?? "");
        setMaxPersonnel(d.org.max_personnel != null ? String(d.org.max_personnel) : "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const save = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      await fetch(`/api/god/orgs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // Reload
      const r = await fetch(`/api/god/orgs/${id}`);
      setData(await r.json());
    } finally {
      setSaving(false);
    }
  };

  const handleSuspend = () => save({ suspend: true, suspend_reason: suspendReason });
  const handleUnsuspend = () => save({ suspend: false });
  const handleSavePlan = () => save({
    plan,
    notes,
    max_personnel: maxPersonnel === "" ? null : parseInt(maxPersonnel, 10),
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-slate-400">Org bulunamadi.</div>
    );
  }

  const { org, locations, daily_shifts, admin_users, events } = data;
  const maxShifts = Math.max(...daily_shifts.map((d) => Number(d.count)), 1);

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Geri butonu + baslik */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">{org.name}</h1>
          <p className="text-xs text-slate-500 capitalize">{org.plan ?? "free"} plan</p>
        </div>
        {org.suspended_at && (
          <span className="ml-2 bg-red-500/15 text-red-400 border border-red-500/20 text-xs font-semibold px-3 py-1 rounded-full">
            Askiya Alinmis
          </span>
        )}
      </div>

      {/* Sekmeler */}
      <div className="flex gap-1 bg-white/3 rounded-xl p-1 w-fit">
        {TABS.map(({ id: tid, label, icon: Icon }) => (
          <button
            key={tid}
            onClick={() => setTab(tid)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === tid
                ? "bg-violet-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Genel Sekmesi */}
      {tab === "genel" && (
        <div className="space-y-4">
          {/* Plan */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">Plan Yonetimi</h3>
            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-slate-500 mb-1.5">Plan</label>
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50"
                >
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs text-slate-500 mb-1.5">Maks. Personel (boş = sınırsız)</label>
                <input
                  type="number"
                  min={0}
                  value={maxPersonnel}
                  onChange={(e) => setMaxPersonnel(e.target.value)}
                  placeholder="Sınırsız"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/50"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-slate-500 mb-1.5">Dahili Not</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Admin notu..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/50"
                />
              </div>
            </div>
            <button
              onClick={handleSavePlan}
              disabled={saving}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Kaydet
            </button>
          </div>

          {/* Suspend */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">Hesap Durumu</h3>
            {org.suspended_at ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-400">
                  Askiya alinma tarihi: <span className="text-white">{timeAgo(org.suspended_at)}</span>
                </p>
                {org.suspended_reason && (
                  <p className="text-sm text-slate-400">
                    Sebep: <span className="text-white">{org.suspended_reason}</span>
                  </p>
                )}
                <button
                  onClick={handleUnsuspend}
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors"
                >
                  Askiyi Kaldir
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="Askiya alma sebebi..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-red-500/50"
                />
                <button
                  onClick={handleSuspend}
                  disabled={saving}
                  className="bg-red-600/80 hover:bg-red-600 disabled:opacity-50 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors"
                >
                  Askiya Al
                </button>
              </div>
            )}
          </div>

          {/* Lokasyonlar */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Lokasyonlar ({locations.length})</h3>
            <div className="space-y-2">
              {locations.map((loc: any) => (
                <div
                  key={loc.id}
                  className="flex items-center gap-3 px-3 py-2.5 bg-white/3 rounded-xl"
                >
                  <MapPin size={14} className="text-slate-500 shrink-0" />
                  <span className="text-sm text-slate-200 flex-1">{loc.name}</span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {loc.personnel_count} personel
                  </span>
                </div>
              ))}
              {locations.length === 0 && (
                <p className="text-sm text-slate-600 py-2">Lokasyon yok</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Metrikler Sekmesi */}
      {tab === "metrikler" && (
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Son 7 Gun Vardiya Sayisi</h3>
          {daily_shifts.length === 0 ? (
            <p className="text-sm text-slate-600">Veri yok</p>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {daily_shifts.map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-violet-600/60 rounded-t-sm transition-all hover:bg-violet-500/80"
                    style={{ height: `${(Number(d.count) / maxShifts) * 100}%`, minHeight: "4px" }}
                    title={`${d.date}: ${d.count} vardiya`}
                  />
                  <span className="text-[9px] text-slate-600 tabular-nums">
                    {d.date?.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Kullanicilar Sekmesi */}
      {tab === "kullanicilar" && (
        <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Isim</th>
                <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Rol</th>
                <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Son Giris</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {admin_users.map((u: any) => (
                <tr key={u.id} className="border-b border-white/4 hover:bg-white/3 transition-colors group">
                  <td className="px-5 py-4">
                    <div>
                      <p className="font-medium text-white">{u.name}</p>
                      <p className="text-[10px] text-slate-500">{u.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-xs font-medium text-slate-300 capitalize">{u.role}</span>
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-400 tabular-nums">
                    {timeAgo(u.last_login_at)}
                  </td>
                  <td className="px-4 py-4">
                    <UserActions user={u} />
                  </td>
                </tr>
              ))}
              {admin_users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-slate-600 text-sm">
                    Kullanici yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Timeline Sekmesi */}
      {tab === "timeline" && (
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Son Platform Olaylari</h3>
          <div className="space-y-2">
            {events.map((ev: any) => (
              <div
                key={ev.id}
                className="flex items-start gap-3 px-3 py-3 bg-white/3 rounded-xl"
              >
                <div className="w-2 h-2 rounded-full bg-violet-400 mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-200">{ev.type}</p>
                  {ev.meta && (
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
                      {typeof ev.meta === "string" ? ev.meta : JSON.stringify(ev.meta)}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-slate-600 shrink-0 tabular-nums">
                  {timeAgo(ev.created_at)}
                </span>
              </div>
            ))}
            {events.length === 0 && (
              <p className="text-sm text-slate-600 py-4">Olay yok</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
