"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import { Wallet, Plus, Split, ChevronDown, ChevronUp, X } from "lucide-react";
import { useManagerAuth } from "@/hooks/useAuth";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTry(n: number) {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

export default function TipPoolsPage() {
  const { user, mounted } = useManagerAuth();
  const [locationId, setLocationId] = useState("");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pools, setPools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [periodStart, setPeriodStart] = useState(todayStr());
  const [periodEnd, setPeriodEnd] = useState(todayStr());
  const [totalAmount, setTotalAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Record<number, any>>({});
  const [distributingId, setDistributingId] = useState<number | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const load = useCallback(async () => {
    if (!user) return;
    const locId = user.location_id || localStorage.getItem("optishift_selected_location") || "";
    setLocationId(locId);
    if (!locId) { setLoading(false); return; }
    try {
      const locRes = await fetch(`/api/locations?id=${locId}`).then(r => r.json()).catch(() => []);
      const locData = Array.isArray(locRes) ? locRes[0] : null;
      let tipEnabled = false;
      if (locData?.rules) {
        try { tipEnabled = JSON.parse(locData.rules).tip_pooling_enabled === true; } catch {}
      }
      setEnabled(tipEnabled);
      if (!tipEnabled) { setLoading(false); return; }

      const poolRes = await fetch(`/api/tip-pools?location_id=${locId}`).then(r => r.json()).catch(() => []);
      setPools(Array.isArray(poolRes) ? poolRes : []);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function createPool() {
    const amount = Number(totalAmount);
    if (!amount || amount <= 0) { showToast("Geçerli bir tutar girin"); return; }
    if (periodEnd < periodStart) { showToast("Bitiş tarihi başlangıçtan önce olamaz"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/tip-pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: locationId, period_start: periodStart, period_end: periodEnd, total_amount: amount }),
      });
      if (r.ok) {
        showToast("Bahşiş havuzu oluşturuldu");
        setShowForm(false);
        setTotalAmount("");
        await load();
      } else {
        const err = await r.json().catch(() => ({}));
        showToast(err.error || "Hata");
      }
    } finally {
      setSaving(false);
    }
  }

  async function distributePool(id: number) {
    setDistributingId(id);
    try {
      const r = await fetch("/api/tip-pools", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "distribute" }),
      });
      if (r.ok) {
        showToast("Havuz dağıtıldı");
        await load();
        await toggleDetail(id, true);
      } else {
        const err = await r.json().catch(() => ({}));
        showToast(err.error || "Dağıtım başarısız");
      }
    } finally {
      setDistributingId(null);
    }
  }

  async function toggleDetail(id: number, forceOpen = false) {
    if (!forceOpen && expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!detail[id]) {
      const d = await fetch(`/api/tip-pools?id=${id}`).then(r => r.json()).catch(() => null);
      if (d) setDetail(prev => ({ ...prev, [id]: d }));
    }
  }

  if (!mounted) return <div className="space-y-6" />;

  if (enabled === false) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
          <Wallet size={28} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-600">Bahşiş Havuzu bu şubede kapalı</p>
          <p className="text-xs text-slate-400 mt-1">Ayarlar &gt; Kurallar &gt; Modüller bölümünden açabilirsiniz.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6 md:space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
            <Wallet size={20} className="text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900">Bahşiş Havuzu</h1>
            <p className="text-sm text-slate-500">Dönemlik prim dağıtımı</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 bg-primary text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
        >
          <Plus size={16} /> Yeni Havuz
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">Yeni Bahşiş Havuzu</p>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Başlangıç</label>
              <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Bitiş</label>
              <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Toplam Tutar (₺)</label>
            <input type="number" min="0" step="0.01" value={totalAmount} onChange={e => setTotalAmount(e.target.value)}
              placeholder="0.00"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <button
            onClick={createPool}
            disabled={saving}
            className="w-full bg-primary text-white text-sm font-bold py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Kaydediliyor…" : "Havuzu Oluştur"}
          </button>
        </div>
      )}

      <div>
        {loading && <p className="text-sm text-slate-400">Yükleniyor…</p>}
        {!loading && pools.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6 text-center text-slate-400 text-sm">
            Henüz bahşiş havuzu oluşturulmadı
          </div>
        )}
        <div className="space-y-2">
          {pools.map(pool => {
            const isOpen = expandedId === pool.id;
            const d = detail[pool.id];
            return (
              <div key={pool.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <div className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900">{pool.period_start} – {pool.period_end}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {pool.status === "distributed" ? `Dağıtıldı · ${formatTry(pool.distributed_amount)}` : "Taslak · henüz dağıtılmadı"}
                    </p>
                  </div>
                  <p className="text-base font-black text-emerald-700 shrink-0">{formatTry(pool.total_amount)}</p>
                  {pool.status === "draft" ? (
                    <button
                      onClick={() => distributePool(pool.id)}
                      disabled={distributingId === pool.id}
                      className="flex items-center gap-1.5 bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-2 rounded-xl hover:bg-emerald-200 transition-colors disabled:opacity-50 shrink-0"
                    >
                      <Split size={13} /> {distributingId === pool.id ? "Dağıtılıyor…" : "Dağıt"}
                    </button>
                  ) : (
                    <button
                      onClick={() => toggleDetail(pool.id)}
                      className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors shrink-0"
                    >
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  )}
                </div>
                {isOpen && pool.status === "distributed" && (
                  <div className="border-t border-slate-100 px-4 py-3 space-y-1.5 bg-slate-50/50">
                    {!d && <p className="text-xs text-slate-400">Yükleniyor…</p>}
                    {d?.allocations?.map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-700">{a.personnel_name ?? a.personnel_id}</span>
                        <span className="text-xs text-slate-400">{Math.round(a.worked_minutes / 60 * 10) / 10} sa</span>
                        <span className="font-bold text-emerald-700">{formatTry(a.amount)}</span>
                      </div>
                    ))}
                    {d?.allocations?.length === 0 && <p className="text-xs text-slate-400">Dağıtım kaydı yok</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 md:bottom-8 md:right-8 bg-slate-900 text-white text-xs font-bold px-5 py-3 rounded-2xl shadow-xl z-50 animate-in fade-in slide-in-from-bottom-4 max-w-[calc(100vw-2rem)]">
          {toast}
        </div>
      )}
    </div>
  );
}
