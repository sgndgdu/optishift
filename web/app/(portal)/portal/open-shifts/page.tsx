"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import { Megaphone, Star, Gavel, Clock } from "lucide-react";
import { usePortalAuth } from "@/hooks/useAuth";

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("tr-TR", { weekday: "long", day: "2-digit", month: "long" });
}

export default function PortalOpenShiftsPage() {
  const { user, mounted } = usePortalAuth();
  const [shifts, setShifts]     = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [biddingEnabled, setBiddingEnabled] = useState(false);
  const [myBids, setMyBids]     = useState<Record<number, any>>({}); // open_shift_id -> bekleyen teklifim
  const [drafts, setDrafts]     = useState<Record<number, { amount: string; note: string }>>({});
  const [busyId, setBusyId]     = useState<number | null>(null);
  const [toast, setToast]       = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const load = useCallback(async () => {
    if (!user?.location_id) { setLoading(false); return; }
    setLoading(true);
    try {
      const [shiftsData, locData] = await Promise.all([
        fetch(`/api/open-shifts?location_id=${user.location_id}&status=open`).then(r => r.json()),
        fetch(`/api/locations?id=${user.location_id}`).then(r => r.json()),
      ]);
      const list = Array.isArray(shiftsData) ? shiftsData : [];
      setShifts(list);

      const loc = Array.isArray(locData) ? locData[0] : null;
      let rules: any = {};
      try { rules = typeof loc?.rules === "string" ? JSON.parse(loc.rules) : (loc?.rules ?? {}); } catch { /* boş kalır */ }
      const enabled = rules.shift_bidding_enabled === true;
      setBiddingEnabled(enabled);

      if (enabled && list.length > 0) {
        const results = await Promise.all(
          list.map((s: any) => fetch(`/api/shift-bids?open_shift_id=${s.id}`).then(r => r.json()).catch(() => []))
        );
        const map: Record<number, any> = {};
        list.forEach((s: any, i: number) => {
          const mine = Array.isArray(results[i]) ? results[i].find((b: any) => b.status === "pending") : null;
          if (mine) map[s.id] = mine;
        });
        setMyBids(map);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function handleClaim(shift: any) {
    if (!user?.personnel_id) return;
    setBusyId(shift.id);
    try {
      const r = await fetch("/api/open-shifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: shift.id, claimed_by: user.personnel_id, claimed_by_name: user.name }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) { showToast("Vardiyayı üstlendin, kahraman bonusu kazandın!"); await load(); }
      else { showToast(data.error || "Üstlenilemedi"); }
    } finally { setBusyId(null); }
  }

  async function handleBid(shift: any) {
    const draft = drafts[shift.id];
    const amount = Number(draft?.amount);
    if (!amount || amount <= 0) { showToast("Geçerli bir puan girin"); return; }
    setBusyId(shift.id);
    try {
      const r = await fetch("/api/shift-bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open_shift_id: shift.id, requested_bonus_points: amount, note: draft?.note?.trim() || undefined }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) { showToast("Teklifin gönderildi!"); await load(); }
      else { showToast(data.error || "Teklif gönderilemedi"); }
    } finally { setBusyId(null); }
  }

  if (!mounted) return <div className="p-4 md:p-8" />;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
          <Megaphone size={20} className="text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-black text-slate-900">Açık Vardiyalar</h1>
          <p className="text-xs text-slate-500">{biddingEnabled ? "Teklif ver, müdür seçsin" : "Üstlen, kahraman bonusu kazan"}</p>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400 text-center py-8">Yükleniyor…</p>}

      {!loading && shifts.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 flex flex-col items-center gap-3 text-slate-300">
          <Megaphone size={36} strokeWidth={1.5} />
          <p className="text-sm font-semibold text-slate-400">Şu an açık vardiya ilanı yok</p>
        </div>
      )}

      <div className="space-y-3">
        {shifts.map(s => {
          const myBid = myBids[s.id];
          const draft = drafts[s.id] ?? { amount: "", note: "" };
          return (
            <div key={s.id} className="bg-white rounded-2xl border border-amber-200 p-5 space-y-3">
              <div className="flex items-center gap-2">
                {s.hero_bonus_multiplier > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                    <Star size={9} /> +{s.hero_bonus_multiplier} Kahraman
                  </span>
                )}
                {biddingEnabled && s.bid_count > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">{s.bid_count} teklif</span>
                )}
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">{formatDate(s.date)}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.start_time} – {s.end_time}</p>
                {s.note && <p className="text-xs text-slate-400 mt-1 italic">&quot;{s.note}&quot;</p>}
              </div>

              {!biddingEnabled && (
                <button
                  disabled={busyId === s.id}
                  onClick={() => handleClaim(s)}
                  className="w-full py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {busyId === s.id ? "Üstleniliyor…" : "Vardiyayı Üstlen"}
                </button>
              )}

              {biddingEnabled && myBid && (
                <div className="flex items-center gap-2 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2 text-xs">
                  <Clock size={13} className="text-sky-600 shrink-0" />
                  <span className="text-sky-700 font-semibold">Teklifin: +{myBid.requested_bonus_points} puan, yanıt bekleniyor</span>
                </div>
              )}

              {biddingEnabled && !myBid && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="number" min="0" step="0.5"
                      value={draft.amount}
                      onChange={e => setDrafts(prev => ({ ...prev, [s.id]: { ...draft, amount: e.target.value } }))}
                      placeholder="İstediğin puan"
                      className="w-28 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-400"
                    />
                    <input
                      value={draft.note}
                      onChange={e => setDrafts(prev => ({ ...prev, [s.id]: { ...draft, note: e.target.value } }))}
                      placeholder="Not (isteğe bağlı)"
                      className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-400"
                    />
                  </div>
                  <button
                    disabled={busyId === s.id}
                    onClick={() => handleBid(s)}
                    className="w-full py-2.5 bg-sky-600 text-white rounded-xl text-sm font-bold hover:bg-sky-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <Gavel size={14} /> {busyId === s.id ? "Gönderiliyor…" : "Teklif Ver"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {toast && (
        <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs font-bold px-5 py-3 rounded-2xl shadow-xl z-50 max-w-[calc(100vw-2rem)]">
          {toast}
        </div>
      )}
    </div>
  );
}
