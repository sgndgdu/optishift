"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Coffee, Play, Square, AlertTriangle, Users, Clock, CheckCircle2 } from "lucide-react";
import { useManagerAuth } from "@/hooks/useAuth";


function elapsed(startAt: number) {
  const sec = Math.floor(Date.now() / 1000) - startAt;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatHM(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export default function BreaksPage() {
  const router = useRouter();
  const { user, mounted } = useManagerAuth();
  const [sessions, setSessions]   = useState<any[]>([]);
  const [personnel, setPersonnel] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState("");
  const [tick, setTick]           = useState(0);
  const [maxBreakMin, setMaxBreakMin] = useState(15);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const _td = new Date(); const today = `${_td.getFullYear()}-${String(_td.getMonth()+1).padStart(2,"0")}-${String(_td.getDate()).padStart(2,"0")}`;

  const load = useCallback(async () => {
    if (!user) return;
    const locId = user.location_id || localStorage.getItem("optishift_selected_location") || "";
    try {
      const [sess, ppl, locRes] = await Promise.all([
        fetch(`/api/breaks?location_id=${locId}&date=${today}`)
          .then(r => r.json()).catch(() => []),
        fetch(`/api/personnel?location_id=${locId}`)
          .then(r => r.json()).catch(() => []),
        fetch(`/api/locations?id=${locId}`)
          .then(r => r.json()).catch(() => []),
      ]);
      setSessions(Array.isArray(sess) ? sess : []);
      setPersonnel(Array.isArray(ppl) ? ppl : []);
      const locData = Array.isArray(locRes) ? locRes[0] : null;
      if (locData?.rules) {
        try {
          const rules = JSON.parse(locData.rules);
          if (typeof rules.max_break_duration_min === "number") setMaxBreakMin(rules.max_break_duration_min);
        } catch {}
      }
    } finally { setLoading(false); }
  }, [user, today]);

  useEffect(() => { load(); }, [load]);

  // Live clock tick
  useEffect(() => {
    timerRef.current = setInterval(() => setTick(t => t + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Auto-refresh sessions every 15s
  useEffect(() => {
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  async function startBreak(p: any) {
    if (!user) return;
    const locId = user.location_id || localStorage.getItem("optishift_selected_location") || "";
    const r = await fetch("/api/breaks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location_id: locId,
        personnel_id: p.id,
        personnel_name: p.name,
        date: today,
      }),
    });
    if (r.ok) {
      showToast(`${p.name} molaya çıktı.`);
      await load();
    } else {
      const err = await r.json().catch(() => ({}));
      showToast(err.error || "Hata");
    }
  }

  async function endBreak(session: any) {
    const r = await fetch("/api/breaks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: session.id }),
    });
    if (r.ok) {
      const data = await r.json();
      showToast(`Mola bitti — ${data.duration_min} dakika.`);
      await load();
    }
  }

  // Compute active breaks
  const active = sessions.filter(s => !s.end_at);
  const done   = sessions.filter(s => s.end_at);

  // Which personnel are currently on break
  const onBreakIds = new Set(active.map(s => s.personnel_id));

  // Personnel who are NOT currently on break (available to start)
  const available = personnel.filter(p => !onBreakIds.has(p.id));

  // Alert: multiple concurrent breaks
  const multiBreakAlert = active.length >= 2;

  // Total break minutes today
  const totalBreakMin = done.reduce((sum, s) => sum + (s.duration_min ?? 0), 0);

  if (!mounted) return <div className="space-y-6" />;

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <Coffee size={20} className="text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900">Canlı Mola Takibi</h1>
            <p className="text-sm text-slate-500">{today} — gerçek zamanlı</p>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="bg-amber-50 rounded-2xl p-3 md:p-4 text-center">
          <p className="text-xl md:text-2xl font-black text-amber-700">{active.length}</p>
          <p className="text-[10px] md:text-xs font-bold text-amber-600 opacity-80 mt-0.5">Molada</p>
        </div>
        <div className="bg-emerald-50 rounded-2xl p-3 md:p-4 text-center">
          <p className="text-xl md:text-2xl font-black text-emerald-700">{available.length}</p>
          <p className="text-[10px] md:text-xs font-bold text-emerald-600 opacity-80 mt-0.5">Aktif Çalışıyor</p>
        </div>
        <div className="bg-slate-50 rounded-2xl p-3 md:p-4 text-center">
          <p className="text-xl md:text-2xl font-black text-slate-700">{totalBreakMin}</p>
          <p className="text-[10px] md:text-xs font-bold text-slate-500 opacity-80 mt-0.5">Mola (dk)</p>
        </div>
      </div>

      {/* Multi-break alert */}
      {multiBreakAlert && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0" />
          <p className="text-sm font-bold text-red-700">
            Dikkat: {active.length} kişi aynı anda molada! En az birinin dönmesini bekleyin.
          </p>
        </div>
      )}

      {/* Active breaks */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Coffee size={14} className="text-amber-500" />
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Şu An Molada</h2>
        </div>
        {loading && <p className="text-sm text-slate-400">Yükleniyor…</p>}
        {!loading && active.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6 text-center text-slate-400 text-sm">
            Şu an kimse molada değil
          </div>
        )}
        <div className="space-y-2">
          {active.map(s => {
            const elapsedSec = Math.floor(Date.now() / 1000) - s.start_at;
            const elapsedMin = Math.floor(elapsedSec / 60);
            const isLong = elapsedMin >= maxBreakMin;
            return (
              <div key={s.id} className={`bg-white rounded-2xl border p-4 flex items-center gap-4 ${isLong ? "border-red-200" : "border-amber-200"}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${isLong ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>
                  {s.personnel_name?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <Link href="/personnel" className="text-sm font-black text-slate-900 hover:underline hover:text-primary">{s.personnel_name}</Link>
                  <p className="text-xs text-slate-500">Başladı: {formatHM(s.start_at)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-base font-black tabular-nums ${isLong ? "text-red-600" : "text-amber-600"}`}>
                    {elapsed(s.start_at)}
                  </p>
                  {isLong && <p className="text-[10px] text-red-500 font-bold">Uzun mola!</p>}
                </div>
                <button
                  onClick={() => endBreak(s)}
                  className="ml-2 w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 hover:bg-emerald-200 transition-colors shrink-0"
                  title="Molayı bitir"
                >
                  <Square size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Available personnel — quick start break */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-emerald-500" />
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Aktif Personel</h2>
          <span className="text-[10px] text-slate-400">(Mola başlat)</span>
        </div>
        {!loading && available.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6 text-center text-slate-400 text-sm">
            Tüm personel molada
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {available.map(p => (
            <button
              key={p.id}
              onClick={() => startBreak(p)}
              className="bg-white rounded-2xl border border-slate-100 p-3 flex items-center gap-3 hover:border-primary hover:bg-primary/5 transition-all group text-left"
            >
              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-black text-indigo-600 shrink-0">
                {p.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800 truncate group-hover:text-primary">{p.name}</p>
                <p className="text-[10px] text-slate-400">{p.title || "Personel"}</p>
              </div>
              <Play size={13} className="text-slate-300 group-hover:text-primary shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Break history */}
      {done.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={14} className="text-slate-400" />
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Bugünkü Molalar</h2>
          </div>
          <div className="space-y-1.5">
            {done.map(s => (
              <div key={s.id} className="bg-white rounded-xl border border-slate-100 px-4 py-2.5 flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                  {s.personnel_name?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
                <Link href="/personnel" className="text-sm font-semibold text-slate-700 flex-1 hover:underline hover:text-primary">{s.personnel_name}</Link>
                <p className="text-xs text-slate-400">{formatHM(s.start_at)} – {formatHM(s.end_at)}</p>
                <span className="text-xs font-bold text-slate-500">{s.duration_min} dk</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 md:bottom-8 md:right-8 bg-slate-900 text-white text-xs font-bold px-5 py-3 rounded-2xl shadow-xl z-50 animate-in fade-in slide-in-from-bottom-4 max-w-[calc(100vw-2rem)]">
          {toast}
        </div>
      )}

      {/* Suppress unused tick warning */}
      <span className="hidden">{tick}</span>
    </div>
  );
}
