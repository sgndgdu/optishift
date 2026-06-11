"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Star, Trophy, AlertTriangle, TrendingUp,
  ExternalLink, Check, Info, History,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const SECTOR_PRESETS = [
  { id: "cafe",       label: "Kafe / Kahveci",    emoji: "☕",  desc: "Hafta sonu yoğunluğu yüksek",        weights: [3, 4, 6] },
  { id: "retail",     label: "Perakende",          emoji: "🛍️", desc: "Pazar kapanışı çok kritik",           weights: [3, 4, 7] },
  { id: "hotel",      label: "Otel / Konaklama",  emoji: "🏨",  desc: "Gece vardiyası en ağır",              weights: [4, 6, 9] },
  { id: "restaurant", label: "Restoran",           emoji: "🍽️", desc: "Akşam servisi ve hafta sonu öne çıkar", weights: [3, 5, 8] },
  { id: "factory",    label: "Fabrika / Üretim",  emoji: "🏭",  desc: "Gece vardiyası baskın",               weights: [4, 4, 8] },
];

function barColor(score: number, avg: number): string {
  if (avg === 0) return "bg-blue-500";
  if (score < avg * 0.8) return "bg-red-500";
  if (score > avg * 1.2) return "bg-emerald-500";
  return "bg-blue-500";
}

export default function FairnessPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  const [locationId, setLocationId]         = useState("");
  const [shifts, setShifts]                 = useState<any[]>([]);
  const [personnel, setPersonnel]           = useState<any[]>([]);
  const [heroEvents, setHeroEvents]         = useState<any[]>([]);
  const [loading, setLoading]               = useState(true);
  const [appliedPreset, setAppliedPreset]   = useState<string | null>(null);
  const [applyingPreset, setApplyingPreset] = useState(false);
  const [currentPeriod, setCurrentPeriod]   = useState(true);
  const [scoreHist, setScoreHist]           = useState<Record<string, any[]>>({});
  const [histLoading, setHistLoading]       = useState(false);


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
    const stored = localStorage.getItem("optishift_manager_user");
    const u = stored ? JSON.parse(stored) : null;
    if (!u) { router.push("/login"); return; }
    if (!user) setUser(u);

    const locId = localStorage.getItem("optishift_selected_location") || u.location_id || "";
    setLocationId(locId);

    const savedPreset = localStorage.getItem(`optishift_fairness_preset_${locId}`);
    if (savedPreset) setAppliedPreset(savedPreset);

    const load = async (lid: string) => {
      setLoading(true);
      try {
        const [locRes, pRes, osRes] = await Promise.all([
          fetch(`/api/locations?id=${lid}`),
          fetch(`/api/personnel?location_id=${lid}`),
          fetch(`/api/open-shifts?location_id=${lid}`),
        ]);
        const locData = await locRes.json();
        const pData   = await pRes.json();
        const osData  = await osRes.json();

        const loc = Array.isArray(locData) ? locData[0] : locData;
        let defs: any[] = [];
        if (loc?.shift_definitions) {
          defs = typeof loc.shift_definitions === "string"
            ? JSON.parse(loc.shift_definitions)
            : loc.shift_definitions;
        }
        setShifts(defs);
        setPersonnel(Array.isArray(pData) ? pData.filter((p: any) => p.status === "active") : []);

        // Skor geçmişi
        setHistLoading(true);
        fetch(`/api/score-history?location_id=${lid}&weeks=12`)
          .then(r => r.json())
          .then(h => { if (h && typeof h === "object" && !h.error) setScoreHist(h); })
          .catch(() => {})
          .finally(() => setHistLoading(false));

        const claimed = Array.isArray(osData)
          ? osData.filter((s: any) => s.claimed_by && s.status === "claimed")
          : [];
        setHeroEvents(claimed);
      } catch {}
      setLoading(false);
    };

    if (locId) load(locId);

    const handler = () => {
      const newLoc = localStorage.getItem("optishift_selected_location") || "";
      setLocationId(newLoc);
      const saved = localStorage.getItem(`optishift_fairness_preset_${newLoc}`);
      setAppliedPreset(saved || null);
      if (newLoc) load(newLoc);
    };
    window.addEventListener("optishift_location_changed", handler);
    return () => window.removeEventListener("optishift_location_changed", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = async (presetId: string) => {
    const preset = SECTOR_PRESETS.find(p => p.id === presetId);
    if (!preset || !locationId || shifts.length === 0) return;
    setApplyingPreset(true);
    const updatedShifts = shifts.map((s, i) => ({
      ...s,
      base_points: preset.weights[i] ?? s.base_points,
    }));
    try {
      await fetch(`/api/locations?id=${locationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shift_definitions: updatedShifts }),
      });
      setShifts(updatedShifts);
      setAppliedPreset(presetId);
      localStorage.setItem(`optishift_fairness_preset_${locationId}`, presetId);
    } catch {}
    setApplyingPreset(false);
  };

  // Stats
  const scores   = personnel.map(p => p.prev_score ?? 0);
  const maxScore = Math.max(...scores, 1);
  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10
    : 0;
  const stdDev = scores.length
    ? Math.round(
        Math.sqrt(scores.reduce((acc, s) => acc + (s - avgScore) ** 2, 0) / scores.length) * 10
      ) / 10
    : 0;
  const gap = scores.length ? Math.max(...scores) - Math.min(...scores) : 0;

  const activePresetLabel = SECTOR_PRESETS.find(p => p.id === appliedPreset)?.label ?? null;
  const noShowPersonnel   = personnel.filter(p => (p.no_show_count ?? 0) > 0);

  if (!mounted) return <div className="space-y-6" />;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Adalet Puanı</h1>
        <p className="text-muted-foreground mt-1">Bu dönem personel puan dağılımı ve otomatik sistem olayları</p>
      </div>

      {/* ── 1. Sektör Şablonu ─────────────────────────────────────────────────── */}
      <Card className="stripe-card border-0 shadow-none">
        <CardHeader className="border-b border-border/40 bg-slate-50/50 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-violet-100 rounded-lg text-violet-600">
                <Star size={15} />
              </div>
              <div>
                <CardTitle className="text-sm font-bold">Sektör Şablonu</CardTitle>
                {activePresetLabel ? (
                  <p className="text-xs text-emerald-600 font-medium mt-0.5 flex items-center gap-1">
                    <Check size={10} /> Şu an aktif: {activePresetLabel}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 mt-0.5">Sektörünüze uygun hazır ağırlık şablonu seçin</p>
                )}
              </div>
            </div>
            <a
              href="/settings"
              className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
            >
              <ExternalLink size={11} />
              Ağırlıkları Düzenle
            </a>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            {SECTOR_PRESETS.map(preset => {
              const isActive = appliedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset.id)}
                  disabled={applyingPreset || shifts.length === 0}
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-2 rounded-xl border-2 text-sm font-semibold transition-all",
                    isActive
                      ? "border-primary bg-primary/5 text-slate-800"
                      : "border-slate-200 bg-white text-slate-600 hover:border-primary/40 hover:bg-slate-50",
                    "disabled:opacity-40 disabled:cursor-not-allowed"
                  )}
                >
                  <span>{preset.emoji}</span>
                  <span>{preset.label}</span>
                  {isActive && <Check size={13} className="text-primary" />}
                </button>
              );
            })}
          </div>
          {shifts.length === 0 && !loading && (
            <p className="text-xs text-slate-400 mt-3">
              Vardiya tanımı yok — önce{" "}
              <a href="/settings" className="text-primary font-bold hover:underline">
                Ayarlar → Vardiya Şablonları
              </a>{" "}
              bölümünden şablon oluşturun.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Dönem Özeti ──────────────────────────────────────────────────────── */}
      <Card className="stripe-card border-0 shadow-none">
        <CardHeader className="border-b border-border/40 bg-slate-50/50 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-indigo-100 rounded-lg text-indigo-600">
                <TrendingUp size={15} />
              </div>
              <CardTitle className="text-base font-bold">Dönem Özeti</CardTitle>
            </div>

            {/* Period toggle */}
            <div className="flex bg-slate-100 rounded-xl p-0.5 text-xs font-bold">
              <button
                onClick={() => setCurrentPeriod(true)}
                className={cn(
                  "px-3 py-1.5 rounded-[10px] transition-colors",
                  currentPeriod ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Bu Dönem
              </button>
              <button
                onClick={() => setCurrentPeriod(false)}
                className={cn(
                  "px-3 py-1.5 rounded-[10px] transition-colors",
                  !currentPeriod ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Geçen Dönem
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {!currentPeriod ? (
            <HistoryView personnel={personnel} scoreHist={scoreHist} loading={histLoading} />
          ) : loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : personnel.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <TrendingUp size={32} className="mx-auto mb-3 text-slate-200" />
              <p className="font-semibold">Henüz personel puanı yok.</p>
            </div>
          ) : (
            <>
              {/* 3 metric chips */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-6">
                <div className="flex items-center gap-2 md:gap-2.5 px-3 md:px-4 py-2 md:py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl">
                  <span className="text-xs text-indigo-500 font-semibold">Ortalama Puan</span>
                  <span className="text-lg md:text-xl font-black text-indigo-700 tabular-nums">{avgScore}</span>
                </div>

                <div className={cn(
                  "flex items-center gap-2.5 px-4 py-2.5 rounded-xl border",
                  stdDev > 5 ? "bg-red-50 border-red-100" :
                  stdDev > 2 ? "bg-amber-50 border-amber-100" :
                               "bg-emerald-50 border-emerald-100"
                )}>
                  <span className={cn(
                    "text-xs font-semibold",
                    stdDev > 5 ? "text-red-500" : stdDev > 2 ? "text-amber-600" : "text-emerald-600"
                  )}>Std. Sapma</span>
                  <span className={cn(
                    "text-xl font-black tabular-nums",
                    stdDev > 5 ? "text-red-700" : stdDev > 2 ? "text-amber-700" : "text-emerald-700"
                  )}>{stdDev}</span>
                </div>

                <div className={cn(
                  "flex items-center gap-2.5 px-4 py-2.5 rounded-xl border",
                  gap > 15 ? "bg-red-50 border-red-100" :
                  gap > 8  ? "bg-amber-50 border-amber-100" :
                             "bg-emerald-50 border-emerald-100"
                )}>
                  <span className={cn(
                    "text-xs font-semibold",
                    gap > 15 ? "text-red-500" : gap > 8 ? "text-amber-600" : "text-emerald-600"
                  )}>Maks–Min Gap</span>
                  <span className={cn(
                    "text-xl font-black tabular-nums",
                    gap > 15 ? "text-red-700" : gap > 8 ? "text-amber-700" : "text-emerald-700"
                  )}>{Math.round(gap * 10) / 10}p</span>
                </div>
              </div>

              {/* Personnel ranking */}
              <div className="space-y-3">
                {[...personnel]
                  .sort((a, b) => (b.prev_score ?? 0) - (a.prev_score ?? 0))
                  .map(p => {
                    const score = p.prev_score ?? 0;
                    const color = barColor(score, avgScore);
                    return (
                      <div key={p.id} className="flex items-center gap-2 md:gap-3">
                        <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-indigo-100 text-indigo-600 font-bold text-xs flex items-center justify-center shrink-0">
                          {p.name.charAt(0)}
                        </div>
                        <div className="w-20 md:w-28 shrink-0 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{p.name.split(" ")[0]}</p>
                          <p className="text-[10px] text-slate-400 truncate">{p.title || "Personel"}</p>
                        </div>

                        {/* Colored bar with avg line */}
                        <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden relative">
                          <div
                            className={cn("h-full rounded-full transition-all duration-700", color)}
                            style={{ width: `${(score / maxScore) * 100}%` }}
                          />
                          {maxScore > 0 && (
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-amber-400/80"
                              style={{ left: `${(avgScore / maxScore) * 100}%` }}
                            />
                          )}
                        </div>

                        <div className="text-sm font-black text-slate-700 w-10 text-right shrink-0 tabular-nums">
                          {score}p
                        </div>

                        <div className="flex items-center gap-1 w-14 shrink-0">
                          {(p.hero_count ?? 0) > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-lg">
                              <Trophy size={9} />{p.hero_count}
                            </span>
                          )}
                          {(p.no_show_count ?? 0) > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-lg">
                              <AlertTriangle size={9} />{p.no_show_count}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-5 text-[10px] text-slate-400">
                <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-emerald-500 rounded-full inline-block" />Ortalamanın %20 üstü</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-blue-500 rounded-full inline-block" />Normal aralık</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-red-500 rounded-full inline-block" />Ortalamanın %20 altı</span>
                <span className="flex items-center gap-1.5"><span className="w-0.5 h-3.5 bg-amber-400 inline-block" />Ortalama</span>
              </div>

              {gap > 12 && (
                <div className="mt-5 flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-2xl p-4">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-px" />
                  <div>
                    <p className="text-sm font-bold text-amber-800">
                      Puan dağılımı dengesiz — en yüksek ile en düşük arasında {gap} puan fark var.
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Bir sonraki otomatik planlama bu farkı kapatmaya çalışacak.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── 3. Otomatik Olaylar ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Hero bonuses */}
        <Card className="stripe-card border-0 shadow-none">
          <CardHeader className="border-b border-border/40 bg-amber-50/50 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600">
                <Trophy size={15} />
              </div>
              <div>
                <CardTitle className="text-sm font-bold">Kahraman Bonusları</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">Açık vardiyayı üstlenen personel — otomatik kayıt</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-11 bg-slate-100 rounded-xl animate-pulse" />)}
              </div>
            ) : heroEvents.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <Trophy size={26} className="mx-auto mb-2 text-slate-200" />
                <p className="text-sm font-semibold">Bu dönemde kahraman bonusu yok.</p>
                <p className="text-xs mt-1">Personel açık vardiyayı üstlenince burada görünür.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {heroEvents.map(ev => {
                  const person = personnel.find(p => p.id === ev.claimed_by || p.user_id === ev.claimed_by);
                  const dateStr = ev.claimed_at
                    ? new Date(ev.claimed_at).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })
                    : (ev.date ?? "—");
                  const multiplier = ev.hero_bonus_multiplier ?? 1.5;
                  return (
                    <div key={ev.id} className="flex items-center gap-3 px-3 py-2.5 bg-amber-50/70 rounded-xl border border-amber-100">
                      <div className="w-7 h-7 rounded-full bg-amber-200 text-amber-800 font-bold text-xs flex items-center justify-center shrink-0">
                        {person ? person.name.charAt(0) : "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{person?.name ?? ev.claimed_by}</p>
                        <p className="text-[10px] text-slate-400">{dateStr}</p>
                      </div>
                      <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-lg shrink-0">
                        ×{multiplier} bonus
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* No-show records */}
        <Card className="stripe-card border-0 shadow-none">
          <CardHeader className="border-b border-border/40 bg-red-50/30 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-red-100 rounded-lg text-red-600">
                <AlertTriangle size={15} />
              </div>
              <div>
                <CardTitle className="text-sm font-bold">No-Show Kayıtları</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">Bildirimsiz gelmeme — otomatik kayıt</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map(i => <div key={i} className="h-11 bg-slate-100 rounded-xl animate-pulse" />)}
              </div>
            ) : noShowPersonnel.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <Check size={26} className="mx-auto mb-2 text-slate-200" />
                <p className="text-sm font-semibold">Bu dönemde no-show kaydı yok.</p>
                <p className="text-xs mt-1">Personel bildirimsiz gelmediğinde bu liste boş kalır.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...noShowPersonnel]
                  .sort((a, b) => (b.no_show_count ?? 0) - (a.no_show_count ?? 0))
                  .map(p => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 bg-red-50/60 rounded-xl border border-red-100">
                      <div className="w-7 h-7 rounded-full bg-red-100 text-red-600 font-bold text-xs flex items-center justify-center shrink-0">
                        {p.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-400">{p.no_show_count} kez · toplam −{(p.no_show_count ?? 0) * 3}p</p>
                      </div>
                      <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-1 rounded-lg shrink-0">
                        −{(p.no_show_count ?? 0) * 3}p
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 4. Tarihsel Grafik (sadece "Geçen Dönem" tabında gösteriliyor) ──── */}

      {/* Info footer */}
      <Card className="bg-slate-50/50 border-slate-200/60 shadow-none">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info size={13} className="text-slate-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-500 space-y-1 leading-relaxed">
              <p>
                <strong className="text-slate-700">Ağırlıklı dönem ortalaması:</strong>{" "}
                <code className="bg-white border border-slate-200 rounded px-1 text-[10px]">
                  yeni_skor = eski × 0.2 + bu_dönem × 0.8
                </code>
              </p>
              <p><strong className="text-slate-700">Kahraman bonusu:</strong> Acil çağrıyı kabul eden personele tanımlanan çarpan uygulanır — otomatik hesaplanır.</p>
              <p><strong className="text-slate-700">No-show cezası:</strong> Her bildirimsiz gelmeme −3p olarak sisteme yansır.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── HistoryView ─────────────────────────────────────────────────────────────
function HistoryView({
  personnel,
  scoreHist,
  loading,
}: {
  personnel: any[];
  scoreHist: Record<string, any[]>;
  loading: boolean;
}) {
  const hasData = Object.keys(scoreHist).length > 0;

  if (loading) {
    return (
      <div className="space-y-4 py-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="py-12 text-center text-slate-400">
        <History size={32} className="mx-auto mb-3 text-slate-200" />
        <p className="font-semibold">Henüz tarihsel veri yok.</p>
        <p className="text-sm mt-1">
          Her hafta vardiya yayınlandıkça bu grafik otomatik birikir.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">Son 12 haftanın puan trendi — her sütun bir hafta.</p>
      {personnel.map(p => {
        const entries: any[] = scoreHist[p.id] ?? [];
        if (entries.length === 0) return null;

        const maxScore = Math.max(...entries.map((e: any) => e.score), 1);
        const latest   = entries[entries.length - 1]?.score ?? 0;
        const prev     = entries[entries.length - 2]?.score ?? latest;
        const trend    = latest > prev + 0.5 ? "↑" : latest < prev - 0.5 ? "↓" : "→";
        const trendCls = trend === "↑" ? "text-emerald-600" : trend === "↓" ? "text-red-500" : "text-slate-400";

        return (
          <div key={p.id} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 font-bold text-xs flex items-center justify-center shrink-0">
              {p.name.charAt(0)}
            </div>
            <div className="w-24 shrink-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{p.name.split(" ")[0]}</p>
              <p className="text-[10px] text-slate-400">{entries.length} hafta</p>
            </div>
            {/* Sparkline bars */}
            <div className="flex-1 flex items-end gap-0.5 h-9">
              {entries.map((e: any, i: number) => {
                const pct = maxScore > 0 ? (e.score / maxScore) * 100 : 0;
                const isLast = i === entries.length - 1;
                return (
                  <div
                    key={i}
                    title={`${e.week_start}: ${e.score}p`}
                    className={`flex-1 rounded-sm transition-all ${isLast ? "bg-indigo-500" : "bg-indigo-200"}`}
                    style={{ height: `${Math.max(pct, 4)}%` }}
                  />
                );
              })}
            </div>
            <div className="w-14 text-right shrink-0">
              <p className="text-sm font-black text-slate-700 tabular-nums">{latest}p</p>
              <p className={`text-xs font-bold ${trendCls}`}>{trend}</p>
            </div>
          </div>
        );
      }).filter(Boolean)}
    </div>
  );
}
