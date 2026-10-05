"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import { Star } from "lucide-react";
import { usePortalAuth } from "@/hooks/useAuth";

import { useShiftWords } from "@/hooks/useShiftWords";
import { violationText } from "@/lib/ruleViolations";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("tr-TR", { weekday: "long", day: "2-digit", month: "long" });
}

export default function PortalOpenShiftsPage() {
  const words = useShiftWords();
  const { user, mounted } = usePortalAuth();
  const [shifts, setShifts]     = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [busyId, setBusyId]     = useState<number | null>(null);
  // Üstlenmeden önce kısa onay (yanlışlıkla dokunma riski)
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [toast, setToast]       = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const load = useCallback(async () => {
    if (!user?.location_id) { setLoading(false); return; }
    setLoading(true);
    try {
      // Çalıştığı tüm şubeler + bildirimdeki davet (?invite=<id>, başka şubeden yardım isteği)
      const invite = new URLSearchParams(window.location.search).get("invite");
      const shiftsData = await fetch(`/api/open-shifts?mine=1${invite ? `&invite=${encodeURIComponent(invite)}` : ""}`).then(r => r.json());
      setShifts(Array.isArray(shiftsData) ? shiftsData : []);
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
      if (r.ok) { showToast("Vardiyayı üstlendin. Teşekkürler!"); await load(); }
      else { showToast(violationText(data, "Üstlenilemedi")); }
    } finally { setBusyId(null); }
  }

  async function handleWithdraw(shift: any) {
    setBusyId(shift.id);
    try {
      const r = await fetch("/api/open-shifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: shift.id, withdraw: true }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) { showToast("İlan geri çekildi, vardiya sende kalmaya devam ediyor."); await load(); }
      else { showToast(data.error || "İlan geri çekilemedi"); }
    } finally { setBusyId(null); }
  }

  if (!mounted) return <div className="p-4 md:p-8" />;

  return (
    <Page>
      <PageHeader title={words.OpenShifts} description="Boştaki vardiyalar. Üstlenmek istediğine dokun." />

      {loading && <p className="text-sm text-slate-400 text-center py-8">Yükleniyor…</p>}

      {!loading && shifts.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 flex flex-col items-center gap-3 text-slate-300">
          <p className="text-sm font-semibold text-slate-400">Şu an {words.openShift} ilanı yok</p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 items-start">
        {shifts.map(s => {
          // Kendi devir ilanım: üstlenemem, sadece geri çekebilirim
          if (s.released_by && s.released_by === user?.personnel_id) {
            return (
              <div key={s.id} className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3">
                <StatusPill tone="neutral">Senin ilanın</StatusPill>
                <div>
                  <p className="text-sm font-bold text-slate-900">{formatDate(s.date)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.start_time} – {s.end_time}</p>
                  <p className="text-xs text-slate-500 mt-1">Biri üstlenene kadar bu vardiya sende kalır.</p>
                </div>
                {s.source_assignment_id && (
                  <button
                    disabled={busyId === s.id}
                    onClick={() => handleWithdraw(s)}
                    className="w-full py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-100 transition-colors disabled:opacity-50"
                  >
                    {busyId === s.id ? "Geri çekiliyor…" : "İlanı Geri Çek"}
                  </button>
                )}
              </div>
            );
          }
          return (
            <div key={s.id} className={`bg-white rounded-2xl border p-5 space-y-3 ${(s.problems?.length ?? 0) > 0 ? "border-slate-200" : "border-amber-200"}`}>
              <div className="flex flex-wrap items-center gap-2">
                {s.other_branch && <StatusPill tone="info">{s.location_name} şubesi</StatusPill>}
                {s.invited && <StatusPill tone="brand">Sana özel davet</StatusPill>}
                {s.hero_bonus_multiplier > 0 && (
                  <StatusPill tone="attention">
                    <Star size={9} /> +{s.hero_bonus_multiplier} puan
                  </StatusPill>
                )}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{formatDate(s.date)}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.start_time} – {s.end_time}</p>
                {s.note && <p className="text-xs text-slate-400 mt-1 italic">&quot;{s.note}&quot;</p>}
              </div>

              {(s.problems?.length ?? 0) > 0 ? (
                // Üstlenemez: neden baştan yazılır, düğme yok
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs text-slate-600">
                  <p className="font-bold text-slate-700">Bu vardiyayı alamazsın</p>
                  {s.problems.map((p: string, i: number) => <p key={i}>{p}</p>)}
                </div>
              ) : confirmId === s.id ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-800">{formatDate(s.date)} {s.start_time} – {s.end_time} senin olsun mu?</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmId(null)} disabled={busyId === s.id}
                      className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50">Vazgeç</button>
                    <button disabled={busyId === s.id} onClick={() => { setConfirmId(null); handleClaim(s); }}
                      className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50">Evet, üstlen</button>
                  </div>
                </div>
              ) : (
              <button
                disabled={busyId === s.id}
                onClick={() => setConfirmId(s.id)}
                className="w-full py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {busyId === s.id ? "Üstleniliyor…" : "Üstlen"}
              </button>
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
    </Page>
  );
}
