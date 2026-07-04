"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Trophy, AlertTriangle, TrendingUp, Moon, Calendar, Zap, Info, RefreshCw, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fairnessLabel } from "@/lib/fairness";

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function zBarColor(z: number) {
  if (z > 0.5)  return "bg-emerald-500";
  if (z > -0.5) return "bg-blue-400";
  return "bg-red-400";
}

function burdenColor(burden: number, avg: number) {
  if (avg === 0) return "bg-blue-400";
  if (burden < avg * 0.8) return "bg-emerald-500";
  if (burden > avg * 1.2) return "bg-red-400";
  return "bg-blue-400";
}

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default function FairnessPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [locationId, setLocationId] = useState("");

  const [personnel, setPersonnel] = useState<any[]>([]);
  const [scoreHist, setScoreHist] = useState<Record<string, any[]>>({});
  const [heroEvents, setHeroEvents] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [shiftDefs, setShiftDefs] = useState<any[]>([]);
  const [rules, setRules] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"current" | "history">("current");

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const stored = localStorage.getItem("optishift_manager_user");
    const u = stored ? JSON.parse(stored) : null;
    if (!u) { router.push("/login"); return; }

    const locId = localStorage.getItem("optishift_selected_location") || u.location_id || "";
    setLocationId(locId);
    if (locId) load(locId);

    const handler = () => {
      const newLoc = localStorage.getItem("optishift_selected_location") || "";
      setLocationId(newLoc);
      if (newLoc) load(newLoc);
    };
    window.addEventListener("optishift_location_changed", handler);
    return () => window.removeEventListener("optishift_location_changed", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(lid: string) {
    setLoading(true);
    try {
      const [locRes, pRes, osRes, histRes, adjRes] = await Promise.all([
        fetch(`/api/locations?id=${lid}`),
        fetch(`/api/personnel?location_id=${lid}`),
        fetch(`/api/open-shifts?location_id=${lid}`),
        fetch(`/api/score-history?location_id=${lid}&weeks=8`),
        fetch(`/api/score-adjustments?location_id=${lid}`),
      ]);
      const locData  = await locRes.json();
      const pData    = await pRes.json();
      const osData   = await osRes.json();
      const histData = await histRes.json();
      const adjData  = await adjRes.json();
      setAdjustments(Array.isArray(adjData) ? adjData : []);

      const loc = Array.isArray(locData) ? locData[0] : locData;
      const defs = loc?.shift_definitions
        ? (typeof loc.shift_definitions === "string" ? JSON.parse(loc.shift_definitions) : loc.shift_definitions)
        : [];
      const parsedRules = loc?.rules
        ? (typeof loc.rules === "string" ? JSON.parse(loc.rules) : loc.rules)
        : {};
      setShiftDefs(defs);
      setRules(parsedRules);
      setPersonnel(Array.isArray(pData) ? pData.filter((p: any) => p.status === "active") : []);
      setHeroEvents(Array.isArray(osData) ? osData.filter((s: any) => s.status === "claimed") : []);
      if (histData && !histData.error) setScoreHist(histData);
    } catch { /* sessiz hata */ }
    setLoading(false);
  }

  // ── İstatistikler ───────────────────────────────────────────────────────────
  const burdens   = personnel.map(p => p.prev_score ?? 0);
  const avgBurden = burdens.length ? burdens.reduce((a, b) => a + b, 0) / burdens.length : 0;
  const maxBurden = Math.max(...burdens, 1);
  const gap       = burdens.length ? Math.max(...burdens) - Math.min(...burdens) : 0;
  const variance  = burdens.length
    ? burdens.reduce((acc, v) => acc + (v - avgBurden) ** 2, 0) / burdens.length : 0;
  const stdDev    = Math.round(Math.sqrt(variance) * 10) / 10;

  // Stored fairness_z_score yerine mevcut prev_score dağılımından canlı hesapla
  const liveZ: Record<string, number> = {};
  if (stdDev > 0) {
    for (const p of personnel) {
      liveZ[p.id] = Math.round(((avgBurden - (p.prev_score ?? 0)) / stdDev) * 100) / 100;
    }
  }

  const noShowPersonnel = personnel.filter(p => (p.no_show_count ?? 0) > 0);

  if (!mounted) return <div className="space-y-6" />;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Adalet Puanı</h1>
          <p className="text-muted-foreground mt-1 text-sm">Kümülatif yük dağılımı — rolling 8 hafta</p>
        </div>
        <button
          onClick={() => locationId && load(locationId)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <RefreshCw size={13} />
          Yenile
        </button>
      </div>

      {/* ── Özet Kartları ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Ort. Kümülatif Yük",
            value: Math.round(avgBurden * 10) / 10,
            color: "text-indigo-700",
            bg: "bg-indigo-50 border-indigo-100",
          },
          {
            label: "Dağılım Dengesi",
            value: stdDev <= 5 ? "İyi" : stdDev <= 15 ? "Orta" : "Dengesiz",
            color: stdDev <= 5 ? "text-emerald-700" : stdDev <= 15 ? "text-amber-700" : "text-red-700",
            bg: stdDev <= 5 ? "bg-emerald-50 border-emerald-100" : stdDev <= 15 ? "bg-amber-50 border-amber-100" : "bg-red-50 border-red-100",
          },
          {
            label: "Maks – Min Gap",
            value: `${Math.round(gap * 10) / 10}p`,
            color: gap > 40 ? "text-red-700" : gap > 20 ? "text-amber-700" : "text-emerald-700",
            bg: gap > 40 ? "bg-red-50 border-red-100" : gap > 20 ? "bg-amber-50 border-amber-100" : "bg-emerald-50 border-emerald-100",
          },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("flex flex-col gap-0.5 px-4 py-3 rounded-2xl border", bg)}>
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
            <span className={cn("text-xl font-black tabular-nums", color)}>{value}</span>
          </div>
        ))}
      </div>

      {/* ── Personel Yük Tablosu ────────────────────────────────────────────── */}
      <Card className="stripe-card border-0 shadow-none">
        <CardHeader className="border-b border-border/40 bg-slate-50/50 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-indigo-100 rounded-lg text-indigo-600">
                <TrendingUp size={15} />
              </div>
              <CardTitle className="text-sm font-bold">Yük Dağılımı</CardTitle>
            </div>
            <div className="flex bg-slate-100 rounded-xl p-0.5 text-xs font-bold">
              {(["current", "history"] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "px-3 py-1.5 rounded-[10px] transition-colors",
                    view === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {v === "current" ? "Güncel" : "8 Hafta"}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : personnel.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <TrendingUp size={32} className="mx-auto mb-3 text-slate-200" />
              <p className="font-semibold">Henüz veri yok.</p>
            </div>
          ) : view === "current" ? (
            <CurrentView personnel={personnel} avgBurden={avgBurden} maxBurden={maxBurden} gap={gap} liveZ={liveZ} scoreHist={scoreHist} adjustments={adjustments} />
          ) : (
            <HistoryView personnel={personnel} scoreHist={scoreHist} />
          )}
        </CardContent>
      </Card>

      {/* ── Kahraman Bonusları + No-Show ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <HeroCard heroEvents={heroEvents} personnel={personnel} loading={loading} />
        <NoShowCard noShowPersonnel={noShowPersonnel} loading={loading} />
      </div>

      {/* ── Adalet Ayarları Özeti ────────────────────────────────────────────── */}
      <Card className="stripe-card border-0 shadow-none">
        <CardHeader className="border-b border-border/40 bg-slate-50/50 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-violet-100 rounded-lg text-violet-600">
                <Zap size={15} />
              </div>
              <div>
                <CardTitle className="text-sm font-bold">Adalet Motoru Ayarları</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">Mevcut yapılandırma — Ayarlar sayfasından değiştirin</p>
              </div>
            </div>
            <a
              href="/settings"
              className="flex items-center gap-1 text-xs font-bold text-primary hover:underline shrink-0"
            >
              <ExternalLink size={11} />
              Ayarları Aç
            </a>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {/* Multiplier'lar */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Yük Çarpanları</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Hafta sonu", value: rules.weekend_multiplier ?? 1.2, icon: null, note: "Cmt & Paz" },
                { label: "Gece vardiyası", value: rules.night_multiplier ?? 1.3, icon: <Moon size={10} className="text-indigo-400" />, note: "is_night=true" },
                { label: "Sarı gün", value: rules.preferred_not_multiplier ?? 1.5, icon: null, note: "Preferred not" },
                { label: "Clopening", value: rules.clopening_multiplier ?? 1.2, icon: null, note: "Kapanış→Açılış" },
              ].map(({ label, value, icon, note }) => (
                <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    {icon}
                    <span className="text-[10px] text-slate-500 font-medium">{label}</span>
                  </div>
                  <span className="text-lg font-black text-slate-800">×{value}</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">{note}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-2">
              Değiştirmek için: <a href="/settings" className="text-primary font-semibold hover:underline">Ayarlar → Ağırlıklar</a>
            </p>
          </div>

          {/* Vardiya tanımları */}
          {shiftDefs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Vardiya Tanımları</p>
              <div className="flex flex-wrap gap-2">
                {shiftDefs.map((d: any) => (
                  <div key={d.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm">
                    <span className="font-semibold text-slate-700">{d.name}</span>
                    <span className="text-xs text-slate-400">{d.start}–{d.end}</span>
                    {d.is_night && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md">
                        <Moon size={9} /> Gece
                      </span>
                    )}
                    <span className="text-xs font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-md">
                      {d.base_points ?? "?"}p
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-2">
                Gece işareti veya zorluk puanı için: <a href="/settings" className="text-primary font-semibold hover:underline">Ayarlar → Vardiya Şablonları</a>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Footer Açıklama ─────────────────────────────────────────────────── */}
      <Card className="bg-slate-50/50 border-slate-200/60 shadow-none">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info size={13} className="text-slate-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-500 space-y-1 leading-relaxed">
              <p>
                <strong className="text-slate-700">Yük skoru:</strong>{" "}
                <code className="bg-white border border-slate-200 rounded px-1 text-[10px]">
                  difficulty × saat × [hafta_sonu×1.2] × [gece×1.3] × [sarı_gün×1.5] × [kahraman×1.5]
                </code>
              </p>
              <p>
                <strong className="text-slate-700">Kümülatif yük:</strong>{" "}
                Son 8 haftanın yük toplamı; eski haftalar 0.85 katsayısıyla söner. Yeni plan bu birikimi dengeleyecek şekilde üretilir.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Güncel Görünüm ──────────────────────────────────────────────────────────

function CurrentView({
  personnel,
  avgBurden,
  maxBurden,
  gap,
  liveZ,
  scoreHist,
  adjustments,
}: {
  personnel: any[];
  avgBurden: number;
  maxBurden: number;
  gap: number;
  liveZ: Record<string, number>;
  scoreHist: Record<string, any[]>;
  adjustments: any[];
}) {
  const sorted = [...personnel].sort((a, b) => (b.prev_score ?? 0) - (a.prev_score ?? 0));
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-2.5">
      {sorted.map(p => {
        const burden = p.prev_score ?? 0;
        // Rescore sonrası stored z otoritedir; hiç puanlanmamış lokasyonda canlı hesaba düşülür
        const z = (typeof p.fairness_z_score === "number" && p.fairness_z_score !== 0)
          ? p.fairness_z_score
          : (liveZ[p.id] ?? 0);
        const { text: fairnessText, level } = fairnessLabel(z);
        const color = burdenColor(burden, avgBurden);
        const isExpanded = expandedId === p.id;
        const pHist = scoreHist[p.id] ?? [];
        const pAdjs = adjustments.filter(a => a.personnel_id === p.id);

        return (
          <div key={p.id}>
          <button
            onClick={() => setExpandedId(isExpanded ? null : p.id)}
            className={cn("w-full flex items-center gap-2 md:gap-3 rounded-xl px-1 py-0.5 transition-colors text-left", isExpanded ? "bg-indigo-50/60" : "hover:bg-slate-50")}
          >
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 font-bold text-xs flex items-center justify-center shrink-0">
              {p.name.charAt(0)}
            </div>

            {/* İsim + durum */}
            <div className="w-24 md:w-32 shrink-0 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{p.name.split(" ")[0]}</p>
              <p className={cn(
                "text-[10px] font-medium truncate",
                level === "low" ? "text-emerald-600" : level === "high" ? "text-red-500" : "text-slate-400"
              )}>
                {fairnessText}
              </p>
            </div>

            {/* Bar */}
            <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden relative">
              <div
                className={cn("h-full rounded-full transition-all duration-700", color)}
                style={{ width: `${(burden / maxBurden) * 100}%` }}
              />
              {maxBurden > 0 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-400/80"
                  style={{ left: `${(avgBurden / maxBurden) * 100}%` }}
                />
              )}
            </div>

            {/* Puan */}
            <div className="text-sm font-black text-slate-700 w-14 text-right shrink-0 tabular-nums">
              {Math.round(burden * 10) / 10}p
            </div>

            {/* Rozetler */}
            <div className="flex items-center gap-1 w-12 shrink-0">
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
          </button>

          {/* Kırılım — neden bu puan? */}
          {isExpanded && (
            <div className="ml-10 mr-1 mt-1.5 mb-2 bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2.5">
              {pHist.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-slate-400 font-semibold text-left">
                        <th className="pr-3 pb-1 font-semibold">Hafta</th>
                        <th className="pr-3 pb-1 font-semibold text-right">Yük</th>
                        <th className="pr-3 pb-1 font-semibold text-right">Saat</th>
                        <th className="pr-3 pb-1 font-semibold text-right">Hf.sonu</th>
                        <th className="pr-3 pb-1 font-semibold text-right">Gece</th>
                        <th className="pr-3 pb-1 font-semibold text-right">Sarı</th>
                        <th className="pb-1 font-semibold text-right">Clopening</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-600 tabular-nums">
                      {[...pHist].slice(-4).reverse().map((h: any) => (
                        <tr key={h.week_start} className="border-t border-slate-100">
                          <td className="pr-3 py-1">{new Date(h.week_start + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</td>
                          <td className="pr-3 py-1 text-right font-bold">{Math.round((h.burden_score ?? 0) * 10) / 10}</td>
                          <td className="pr-3 py-1 text-right">{Math.round((h.total_hours ?? 0) * 10) / 10}</td>
                          <td className="pr-3 py-1 text-right">{h.weekend_shifts ?? 0}</td>
                          <td className="pr-3 py-1 text-right">{h.night_shifts ?? 0}</td>
                          <td className="pr-3 py-1 text-right">{h.pref_not_shifts ?? 0}</td>
                          <td className="py-1 text-right">{h.clopening_count ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">Henüz yayınlanmış hafta puanı yok.</p>
              )}
              {pAdjs.length > 0 && (
                <div className="border-t border-slate-200/60 pt-2 space-y-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Puan Olayları</p>
                  {pAdjs.slice(0, 5).map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 truncate mr-2">{a.note ?? (a.type === "change_comp" ? "Değişiklik telafisi" : "Manuel düzeltme")} · {new Date(a.week_start + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} haftası</span>
                      <span className="font-bold text-emerald-600 shrink-0">+{a.points}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>
        );
      })}

      {/* Renk açıklaması */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-4 text-[10px] text-slate-400">
        <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-emerald-500 rounded-full inline-block" />Ortalamanın %20 altı (az yüklü)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-blue-400 rounded-full inline-block" />Normal aralık</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-red-400 rounded-full inline-block" />Ortalamanın %20 üstü (çok yüklü)</span>
        <span className="flex items-center gap-1.5"><span className="w-0.5 h-3.5 bg-amber-400 inline-block" />Ortalama</span>
      </div>

      {gap > 30 && (
        <div className="mt-4 flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-px" />
          <div>
            <p className="text-sm font-bold text-amber-800">
              Yük dağılımı dengesiz — {Math.round(gap * 10) / 10} puanlık fark var.
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Bir sonraki otomatik plan bu farkı kapatmaya çalışacak.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 8 Hafta Geçmişi ─────────────────────────────────────────────────────────

function HistoryView({
  personnel,
  scoreHist,
}: {
  personnel: any[];
  scoreHist: Record<string, any[]>;
}) {
  const hasData = Object.keys(scoreHist).some(pid => (scoreHist[pid]?.length ?? 0) > 0);

  if (!hasData) {
    return (
      <div className="py-12 text-center text-slate-400">
        <Calendar size={32} className="mx-auto mb-3 text-slate-200" />
        <p className="font-semibold">Henüz tarihsel veri yok.</p>
        <p className="text-sm mt-1">Her hafta vardiya yayınlandıkça bu bölüm otomatik dolar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">Son 8 haftanın haftalık yük trendi</p>
      {personnel.map(p => {
        const entries: any[] = scoreHist[p.id] ?? [];
        if (entries.length === 0) return null;

        const vals = entries.map((e: any) => e.burden_score ?? e.score ?? 0);
        const maxVal = Math.max(...vals, 1);
        const latest = vals[vals.length - 1] ?? 0;
        const prev   = vals[vals.length - 2] ?? latest;
        const trend  = latest > prev + 1 ? "↑" : latest < prev - 1 ? "↓" : "→";
        const trendCls = trend === "↑" ? "text-amber-600" : trend === "↓" ? "text-emerald-600" : "text-slate-400";

        return (
          <div key={p.id} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 font-bold text-xs flex items-center justify-center shrink-0">
              {p.name.charAt(0)}
            </div>
            <div className="w-24 shrink-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{p.name.split(" ")[0]}</p>
              <p className="text-[10px] text-slate-400">{entries.length} hafta</p>
            </div>

            {/* Sparkline */}
            <div className="flex-1 flex items-end gap-0.5 h-9">
              {entries.map((e: any, i: number) => {
                const val = e.burden_score ?? e.score ?? 0;
                const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                const isLast = i === entries.length - 1;
                // Hafta sonu / gece breakdown rozetleri tooltip'te
                const tip = [
                  `${e.week_start}: ${Math.round(val * 10) / 10}p`,
                  e.weekend_shifts  ? `Hafta sonu: ${e.weekend_shifts}` : "",
                  e.night_shifts    ? `Gece: ${e.night_shifts}` : "",
                  e.pref_not_shifts ? `Sarı gün: ${e.pref_not_shifts}` : "",
                  e.clopening_count ? `Clopening: ${e.clopening_count}` : "",
                ].filter(Boolean).join(" | ");
                return (
                  <div
                    key={i}
                    title={tip}
                    className={cn("flex-1 rounded-sm transition-all cursor-help", isLast ? "bg-indigo-500" : "bg-indigo-200")}
                    style={{ height: `${Math.max(pct, 4)}%` }}
                  />
                );
              })}
            </div>

            <div className="w-14 text-right shrink-0">
              <p className="text-sm font-black text-slate-700 tabular-nums">{Math.round(latest * 10) / 10}p</p>
              <p className={cn("text-xs font-bold", trendCls)}>{trend}</p>
            </div>
          </div>
        );
      }).filter(Boolean)}
    </div>
  );
}

// ─── Kahraman Bonusları ───────────────────────────────────────────────────────

function HeroCard({ heroEvents, personnel, loading }: { heroEvents: any[]; personnel: any[]; loading: boolean }) {
  return (
    <Card className="stripe-card border-0 shadow-none">
      <CardHeader className="border-b border-border/40 bg-amber-50/50 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600"><Trophy size={15} /></div>
          <div>
            <CardTitle className="text-sm font-bold">Kahraman Bonusları</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">Açık vardiyayı üstlenen personel — ×1.5 yük bonusu</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-11 bg-slate-100 rounded-xl animate-pulse" />)}</div>
        ) : heroEvents.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <Trophy size={26} className="mx-auto mb-2 text-slate-200" />
            <p className="text-sm font-semibold">Bu dönemde kahraman bonusu yok.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {heroEvents.map(ev => {
              const person = personnel.find(p => p.id === ev.claimed_by);
              const dateStr = ev.date ?? "—";
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
                    ×{ev.hero_bonus_multiplier ?? 1.5} bonus
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── No-Show Kayıtları ────────────────────────────────────────────────────────

function NoShowCard({ noShowPersonnel, loading }: { noShowPersonnel: any[]; loading: boolean }) {
  return (
    <Card className="stripe-card border-0 shadow-none">
      <CardHeader className="border-b border-border/40 bg-red-50/30 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-red-100 rounded-lg text-red-600"><AlertTriangle size={15} /></div>
          <div>
            <CardTitle className="text-sm font-bold">No-Show Kayıtları</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">Bildirimsiz gelmeme — otomatik kayıt</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-11 bg-slate-100 rounded-xl animate-pulse" />)}</div>
        ) : noShowPersonnel.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <AlertTriangle size={26} className="mx-auto mb-2 text-slate-200" />
            <p className="text-sm font-semibold">Bu dönemde no-show kaydı yok.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {[...noShowPersonnel].sort((a, b) => (b.no_show_count ?? 0) - (a.no_show_count ?? 0)).map(p => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 bg-red-50/60 rounded-xl border border-red-100">
                <div className="w-7 h-7 rounded-full bg-red-100 text-red-600 font-bold text-xs flex items-center justify-center shrink-0">
                  {p.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                  <p className="text-[10px] text-slate-400">{p.no_show_count} kez</p>
                </div>
                <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-1 rounded-lg shrink-0">
                  {p.no_show_count}×
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
