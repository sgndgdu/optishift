"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy, AlertTriangle, RefreshCw, Scale, Gauge, Ruler, ChevronRight } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListItem, ListEmpty } from "@/components/ui/List";
import { DetailRow } from "@/components/ui/Sheet";
import { formatDateTR } from "@/lib/date";
import { cn } from "@/lib/utils";
import { fairnessBarColor, fairnessLabelFromAverage } from "@/lib/fairness";
import { StatusPill } from "@/components/ui/StatusPill";
import { Tabs } from "@/components/ui/Tabs";

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

// ─── Raporlar → Adalet Puanı sekmesi ─────────────────────────────────────────
// Eskiden /fairness sayfasıydı; menü sadeleştirmesiyle Raporlar'ın içine taşındı
// (/fairness artık /reports?tab=adalet adresine yönlendirir).

export default function FairnessReport() {
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

  const leastLoaded = [...personnel].sort((a, b) => (a.prev_score ?? 0) - (b.prev_score ?? 0))[0];

  const noShowPersonnel = personnel.filter(p => (p.no_show_count ?? 0) > 0);

  if (!mounted) return <div className="space-y-6" />;

  const gapTone = gap > 40 ? "danger" : gap > 20 ? "attention" : "positive";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Son {rules.fairness_window_weeks ?? 4} haftanın toplamı. Yeni plan bu birikimi dengeler.</p>
        <button
          onClick={() => locationId && load(locationId)}
          className="shrink-0 inline-flex items-center gap-1.5 px-2 min-h-[40px] text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <RefreshCw size={13} /> Yenile
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Ortalama" value={`${Math.round(avgBurden * 10) / 10}`} icon={Scale} />
        <StatCard label="En hafif" value={<span className="block truncate">{leastLoaded ? leastLoaded.name.split(" ")[0] : "—"}</span>} icon={Gauge} tone="positive" />
        <StatCard label="Fark" value={`${Math.round(gap * 10) / 10}`} icon={Ruler} tone={gapTone} />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">Yük dağılımı</h2>
          <Tabs items={[{ id: "current", label: "Güncel" }, { id: "history", label: "8 Hafta" }] as const} value={view} onChange={setView} />
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : personnel.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Henüz veri yok.</p>
          ) : view === "current" ? (
            <CurrentView personnel={personnel} avgBurden={avgBurden} maxBurden={maxBurden} gap={gap} scoreHist={scoreHist} adjustments={adjustments} />
          ) : (
            <HistoryView personnel={personnel} scoreHist={scoreHist} />
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <HeroCard heroEvents={heroEvents} personnel={personnel} loading={loading} />
        <NoShowCard noShowPersonnel={noShowPersonnel} loading={loading} />
      </div>

      {/* Puan kuralları: salt okunur özet, değiştirme Ayarlar'da */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">Puan kuralları</h2>
          <a href="/settings?tab=advanced&group=fairness" className="inline-flex items-center gap-1 min-h-[40px] text-xs font-semibold text-primary hover:underline">
            Ayarlarda değiştir <ChevronRight size={14} />
          </a>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2">
          <DetailRow label="Zor gün (hafta sonu, tercih etmem günü)">+{rules.hard_shift_points ?? 4}</DetailRow>
          <DetailRow label="Açık vardiyayı üstlenme">+{rules.hero_bonus_points ?? 6}</DetailRow>
          <DetailRow label="İzinliyken zorunlu atama">+{rules.force_bonus_points ?? 5}</DetailRow>
          <DetailRow label="Yayından sonra değişiklik">+{rules.change_compensation_points ?? 2}</DetailRow>
          {shiftDefs.length > 0 && (
            <DetailRow label="Vardiya zorluğu">
              {shiftDefs.map((d: any) => `${d.name} ${d.base_points ?? 5}`).join(" · ")}
            </DetailRow>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Puan = saat × zorluk ÷ 5 + zor vardiya puanı (bir vardiyada bir kez) + bonuslar. Çarpan zinciri yok, düz toplam.
        </p>
      </section>
    </div>
  );
}

// ─── Güncel Görünüm ──────────────────────────────────────────────────────────

function CurrentView({
  personnel,
  avgBurden,
  maxBurden,
  gap,
  scoreHist,
  adjustments,
}: {
  personnel: any[];
  avgBurden: number;
  maxBurden: number;
  gap: number;
  scoreHist: Record<string, any[]>;
  adjustments: any[];
}) {
  const sorted = [...personnel].sort((a, b) => (b.prev_score ?? 0) - (a.prev_score ?? 0));
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-0.5">
      {sorted.map(p => {
        const burden = p.prev_score ?? 0;
        const { text: fairnessText, level } = fairnessLabelFromAverage(burden, avgBurden);
        const color = fairnessBarColor(burden, avgBurden);
        const isExpanded = expandedId === p.id;
        const pHist = scoreHist[p.id] ?? [];
        const pAdjs = adjustments.filter(a => a.personnel_id === p.id);

        return (
          <div key={p.id}>
          <button
            onClick={() => setExpandedId(isExpanded ? null : p.id)}
            className={cn("w-full flex items-center gap-2 md:gap-3 rounded-xl px-1 py-1.5 min-h-[44px] transition-colors text-left", isExpanded ? "bg-forest-50/60" : "hover:bg-slate-50")}
          >
            <Avatar name={p.name} tone="brand" />

            {/* İsim + durum (ortalamadaysa durum yazılmaz) */}
            <div className="w-28 md:w-40 shrink-0 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{p.name}</p>
              {fairnessText !== "Takım ortalamasında" && (
                <p className={cn(
                  "text-xs truncate",
                  level === "low" ? "text-emerald-600" : level === "high" ? "text-red-600" : "text-slate-500"
                )}>
                  {level === "low" ? "Az yüklü" : level === "high" ? "Çok yüklü" : "Ortalamanın üstü"}
                </p>
              )}
            </div>

            {/* Bar */}
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden relative">
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
            <div className="text-sm font-semibold text-slate-700 w-12 text-right shrink-0 tabular-nums">
              {Math.round(burden * 10) / 10}
            </div>
          </button>

          {/* Kırılım — neden bu puan? */}
          {isExpanded && (
            <div className="ml-10 mr-1 mt-1.5 mb-2 bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2.5">
              <p className="text-xs text-slate-500">{fairnessText}{(p.hero_count ?? 0) > 0 && ` · ${p.hero_count} kez açık vardiya üstlendi`}{(p.no_show_count ?? 0) > 0 && ` · ${p.no_show_count} kez gelmedi`}</p>
              {pHist.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400 font-semibold text-left">
                        <th className="pr-3 pb-1 font-semibold">Hafta</th>
                        <th className="pr-3 pb-1 font-semibold text-right">Puan</th>
                        <th className="pr-3 pb-1 font-semibold text-right">Saat</th>
                        <th className="pr-3 pb-1 font-semibold text-right">Hf.sonu</th>
                        <th className="pr-3 pb-1 font-semibold text-right">Gece</th>
                        <th className="pr-3 pb-1 font-semibold text-right">Tercih etmem</th>
                        <th className="pb-1 font-semibold text-right">Kap→Açl</th>
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
                <p className="text-xs text-slate-400">Henüz yayınlanmış hafta puanı yok.</p>
              )}
              {pAdjs.length > 0 && (
                <div className="border-t border-slate-200/60 pt-2 space-y-1">
                  <p className="text-xs text-slate-400 font-bold">Puan Olayları</p>
                  {pAdjs.slice(0, 5).map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 truncate mr-2">{a.note ?? (a.type === "change_comp" ? "Değişiklik telafisi" : "Elle düzeltme")} · {new Date(a.week_start + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} haftası</span>
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-emerald-500 rounded-full inline-block" />Az yüklü (%20 altı)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-blue-400 rounded-full inline-block" />Normal</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-red-400 rounded-full inline-block" />Çok yüklü (%20 üstü)</span>
        <span className="flex items-center gap-1.5"><span className="w-0.5 h-3.5 bg-amber-400 inline-block" />Ortalama</span>
      </div>

      {gap > 30 && (
        <div className="mt-3 flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-px" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              Yük dağılımı dengesiz, {Math.round(gap * 10) / 10} puanlık fark var.
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
      <p className="py-8 text-center text-sm text-slate-500">Vardiya yayınlandıkça haftalık geçmiş burada birikir.</p>
    );
  }

  return (
    <div className="space-y-3">
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
            <Avatar name={p.name} tone="brand" />
            <div className="w-24 md:w-40 shrink-0 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{p.name}</p>
              <p className="text-xs text-slate-500">{entries.length} hafta</p>
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
                  e.pref_not_shifts ? `Tercih etmem günü: ${e.pref_not_shifts}` : "",
                  e.clopening_count ? `Kapanış→Açılış: ${e.clopening_count}` : "",
                ].filter(Boolean).join(" | ");
                return (
                  <div
                    key={i}
                    title={tip}
                    className={cn("flex-1 rounded-sm transition-all cursor-help", isLast ? "bg-forest-500" : "bg-forest-200")}
                    style={{ height: `${Math.max(pct, 4)}%` }}
                  />
                );
              })}
            </div>

            <div className="w-14 text-right shrink-0">
              <p className="text-sm font-bold text-slate-700 tabular-nums">{Math.round(latest * 10) / 10}p</p>
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
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-bold text-slate-900">Açık vardiya üstlenenler</h2>
        <p className="text-xs text-slate-500 mt-0.5">Her üstlenme ek puan kazandırır</p>
      </div>
      <List>
        {loading ? <ListEmpty>Yükleniyor…</ListEmpty>
          : heroEvents.length === 0 ? <ListEmpty>Bu dönemde açık vardiya üstlenen olmadı.</ListEmpty>
          : heroEvents.map(ev => {
            const person = personnel.find(p => p.id === ev.claimed_by);
            const name = person?.name ?? ev.claimed_by_name ?? "Personel";
            return (
              <ListItem key={ev.id}
                leading={<Avatar name={name} />}
                title={name}
                subtitle={ev.date ? formatDateTR(ev.date) : undefined}
                trailing={<StatusPill tone="attention"><Trophy size={10} /> +{ev.hero_bonus_multiplier ?? 6}</StatusPill>}
              />
            );
          })}
      </List>
    </section>
  );
}

// ─── Gelmeme Kayıtları ────────────────────────────────────────────────────────

const NO_SHOW_PREVIEW = 5;

function NoShowCard({ noShowPersonnel, loading }: { noShowPersonnel: any[]; loading: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = [...noShowPersonnel].sort((a, b) => (b.no_show_count ?? 0) - (a.no_show_count ?? 0));
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-bold text-slate-900">Haber vermeden gelmeyenler</h2>
        <p className="text-xs text-slate-500 mt-0.5">Giriş yapılmayan vardiyalardan otomatik sayılır</p>
      </div>
      <List>
        {loading ? <ListEmpty>Yükleniyor…</ListEmpty>
          : noShowPersonnel.length === 0 ? <ListEmpty>Bu dönemde gelmeme kaydı yok.</ListEmpty>
          : (showAll ? sorted : sorted.slice(0, NO_SHOW_PREVIEW)).map(p => (
            <ListItem key={p.id}
              leading={<Avatar name={p.name} />}
              title={p.name}
              subtitle={p.title || undefined}
              trailing={<StatusPill tone="danger">{p.no_show_count} kez</StatusPill>}
            />
          ))}
        {!loading && sorted.length > NO_SHOW_PREVIEW && (
          <li>
            <button onClick={() => setShowAll(v => !v)} className="w-full py-3 text-sm font-semibold text-primary hover:bg-slate-50">
              {showAll ? "Daha az göster" : `Tümünü göster (${sorted.length} kişi)`}
            </button>
          </li>
        )}
      </List>
    </section>
  );
}
