"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Plus, X, Star, CheckCircle2, Clock, Trash2, AlertTriangle } from "lucide-react";

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("tr-TR", { weekday: "long", day: "2-digit", month: "long" });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "open") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Açık</span>;
  if (status === "claimed") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Üstlenildi</span>;
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">İptal</span>;
}

export default function OpenShiftsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  const [shifts, setShifts]         = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [toast, setToast]           = useState("");

  // form state
  const [date, setDate]             = useState("");
  const [startTime, setStartTime]   = useState("09:00");
  const [endTime, setEndTime]       = useState("17:00");
  const [note, setNote]             = useState("");
  const [bonus, setBonus]           = useState(1.5);
  const [saving, setSaving]         = useState(false);


  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_manager_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed) setUser(parsed);
      setMounted(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!mounted) return;
    if (!user) { router.push("/login"); return; }
    if (user.role !== "manager" && user.role !== "admin" && user.role !== "supervisor") {
      router.push("/dashboard");
    }
  }, [mounted, user, router]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const locId = user.location_id || localStorage.getItem("optishift_selected_location") || "";
      const r = await fetch(`/api/open-shifts?org_id=${user.org_id}&location_id=${locId}`);
      const data = await r.json();
      setShifts(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!date || !startTime || !endTime || !user) return;
    setSaving(true);
    try {
      const locId = user.location_id || localStorage.getItem("optishift_selected_location") || "";
      const r = await fetch("/api/open-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: user.org_id, location_id: locId,
          date, start_time: startTime, end_time: endTime,
          note, hero_bonus_multiplier: bonus,
        }),
      });
      if (r.ok) {
        showToast("Açık vardiya ilanı oluşturuldu!");
        setShowForm(false);
        setDate(""); setNote(""); setBonus(1.5);
        await load();
      }
    } finally { setSaving(false); }
  }

  async function handleCancel(id: number) {
    await fetch("/api/open-shifts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "cancelled" }),
    });
    showToast("İlan iptal edildi.");
    await load();
  }

  async function handleDelete(id: number) {
    await fetch(`/api/open-shifts?id=${id}`, { method: "DELETE" });
    showToast("İlan silindi.");
    await load();
  }

  const openCount   = shifts.filter(s => s.status === "open").length;
  const claimedCount = shifts.filter(s => s.status === "claimed").length;

  if (!mounted) return <div className="space-y-6" />;

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <Megaphone size={20} className="text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900">Açık Vardiyalar</h1>
            <p className="text-xs md:text-sm text-slate-500">İlan et — personel kahraman bonusuyla üstlensin</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 md:gap-2 bg-primary text-white px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors shadow-md shadow-primary/20 shrink-0"
        >
          <Plus size={16} /> <span className="hidden sm:inline">Yeni İlan</span><span className="sm:hidden">Ekle</span>
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {[
          { label: "Açık İlan", value: openCount, color: "bg-amber-50 text-amber-700" },
          { label: "Üstlenildi", value: claimedCount, color: "bg-emerald-50 text-emerald-700" },
          { label: "Toplam", value: shifts.length, color: "bg-slate-50 text-slate-700" },
        ].map(k => (
          <div key={k.label} className={`${k.color} rounded-2xl p-4 text-center`}>
            <p className="text-2xl font-black">{k.value}</p>
            <p className="text-xs font-bold opacity-70 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl shadow-slate-200/50 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-slate-900">Yeni Açık Vardiya İlanı</h2>
            <button onClick={() => setShowForm(false)} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200">
              <X size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Tarih</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full text-sm border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary transition-colors" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Başlangıç</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full text-sm border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary transition-colors" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Bitiş</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full text-sm border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary transition-colors" />
            </div>
          </div>

          {/* Hero bonus selector */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block flex items-center gap-1">
              <Star size={10} className="text-amber-500" /> Kahraman Bonusu Çarpanı
            </label>
            <div className="flex gap-2">
              {[1.0, 1.25, 1.5, 2.0].map(b => (
                <button
                  key={b}
                  onClick={() => setBonus(b)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                    bonus === b ? "border-amber-400 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-600 hover:border-amber-300"
                  }`}
                >
                  {b === 1.0 ? "Normal" : `×${b}`}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              {bonus === 1.0 ? "Standart puan" : `Bu vardiyayı üstlenen personel ${bonus}x kahraman puanı kazanır`}
            </p>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Not (opsiyonel)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="Personele ek bilgi..."
              className="w-full text-sm border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary transition-colors resize-none" />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)}
              className="flex-1 py-3 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
              İptal
            </button>
            <button
              disabled={!date || !startTime || !endTime || saving}
              onClick={handleCreate}
              className="flex-1 py-3 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Kaydediliyor…" : "İlan Oluştur"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {loading && <div className="text-center py-12 text-slate-400 text-sm">Yükleniyor…</div>}
        {!loading && shifts.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 flex flex-col items-center gap-3 text-slate-300">
            <Megaphone size={40} strokeWidth={1.5} />
            <p className="text-sm font-semibold">Henüz açık vardiya ilanı yok</p>
            <p className="text-xs text-center max-w-xs">Personelin rapor aldığında veya acil kapanma gerektiğinde ilan oluştur. Personele anlık bildirim gider.</p>
          </div>
        )}
        {shifts.map(s => (
          <div key={s.id} className={`bg-white rounded-2xl border p-5 space-y-3 ${s.status === "open" ? "border-amber-200" : "border-slate-100"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <StatusBadge status={s.status} />
                  {s.hero_bonus_multiplier > 1 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                      <Star size={9} /> ×{s.hero_bonus_multiplier} Kahraman
                    </span>
                  )}
                </div>
                <p className="text-sm font-black text-slate-900">{formatDate(s.date)}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.start_time} – {s.end_time}</p>
                {s.note && <p className="text-xs text-slate-400 mt-1 italic">"{s.note}"</p>}
              </div>
              {s.status === "open" && (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleCancel(s.id)}
                    title="İptal et"
                    className="w-8 h-8 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 hover:text-amber-600 hover:border-amber-200 hover:bg-amber-50 transition-colors"
                  >
                    <AlertTriangle size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    title="Sil"
                    className="w-8 h-8 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>

            {s.status === "claimed" && s.claimed_by_name && (
              <div className="flex items-center gap-2 bg-emerald-50 rounded-xl px-3 py-2">
                <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                <p className="text-xs font-bold text-emerald-700">
                  {s.claimed_by_name} bu vardiyayı üstlendi — {s.hero_bonus_multiplier}x kahraman bonusu kazandı
                </p>
              </div>
            )}

            {s.status === "open" && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
                <Clock size={13} className="shrink-0" />
                <span>Personel bildirimi gönderildi, yanıt bekleniyor</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 md:bottom-8 md:right-8 bg-slate-900 text-white text-xs font-bold px-5 py-3 rounded-2xl shadow-xl z-50 animate-in fade-in slide-in-from-bottom-4 max-w-[calc(100vw-2rem)]">
          {toast}
        </div>
      )}
    </div>
  );
}
