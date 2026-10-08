"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { managerFallbackPath } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy, AlertTriangle, RefreshCw, Scale, Gauge, Ruler, ChevronRight } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListItem, ListEmpty } from "@/components/ui/List";
import { DetailRow } from "@/components/ui/Sheet";
import { formatDateTR } from "@/lib/date";
import { cn } from "@/lib/utils";
import { fairnessBarColor, fairnessLabelFromAverage, formatScore, resolveHardDayRules } from "@/lib/fairness";
import { DAY_SHORT } from "@/lib/constants";
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
  const [rules, setRules] = useState<Record<string, any>>({}); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"current" | "history">("current");

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const stored = localStorage.getItem("optishift_manager_user");
    const u = stored ? JSON.parse(stored) : null;
    if (!u) { router.push(managerFallbackPath()); return; }

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
        fetch(`/api/score-history?location_id=${lid}&weeks=8&all_branches=1`),
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
        <StatCard label="Ortalama" value={formatScore(avgBurden)} icon={Scale} />
        <StatCard label="En hafif" value={<span className="block truncate">{leastLoaded ? leastLoaded.name : "—"}</span>} icon={Gauge} tone="positive" />
        <StatCard label="Fark" value={formatScore(gap)} icon={Ruler} tone={gapTone} />
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

      {/* Elle yapılan değişikliklerin yük etkisi (lib/manualLoad): kayırma ve mobbinge karşı */}
      {locationId && <ManualLoadSection locationId={locationId} />}

      {/* Puan kuralları: salt okunur özet, değiştirme Ayarlar'da */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">Puan kuralları</h2>
          <a href="/settings?tab=advanced&group=fairness" className="inline-flex items-center gap-1 min-h-[40px] text-xs font-semibold text-primary hover:underline">
            Ayarlarda değiştir <ChevronRight size={14} />
          </a>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2">
          {(() => {
            const hr = resolveHardDayRules(rules);
            const days = hr.dayPoints.map((p, i) => (p > 0 ? `${DAY_SHORT[i]} +${p}` : "")).filter(Boolean);
            return (
              <>
                <DetailRow label="Zor günler">{days.length ? days.join(" · ") : "Yok"}</DetailRow>
                {hr.holidayPoints > 0 && <DetailRow label="Resmi tatil ve bayram">+{hr.holidayPoints}</DetailRow>}
                {hr.prefNotPoints > 0 && <DetailRow label="Tercih etmem günü">+{hr.prefNotPoints}</DetailRow>}
                {hr.specialDates.length > 0 && (
                  <DetailRow label="Özel günler">{hr.specialDates.map(d => `${d.name || formatDateTR(d.date)} +${d.points}`).join(" · ")}</DetailRow>
                )}
              </>
            );
          })()}
          <DetailRow label="Boş kalan vardiyayı kendisi alırsa">{rules.hero_bonus_enabled === false ? "Kapalı" : `+${rules.hero_bonus_points ?? 6}`}</DetailRow>
          <DetailRow label="İzin gününde çalışmaya çağrılırsa">{rules.force_bonus_enabled === false ? "Kapalı" : `+${rules.force_bonus_points ?? 5}`}</DetailRow>
          <DetailRow label="Başka bir şubede çalışırsa">{rules.away_shift_enabled === true ? `+${rules.away_shift_points ?? 0}` : "Kapalı"}</DetailRow>
          <DetailRow label="Yayından sonra değişiklik">+{rules.change_compensation_points ?? 2}</DetailRow>
          {shiftDefs.length > 0 && (
            <DetailRow label="Vardiya zorluğu">
              {shiftDefs.map((d: any) => `${d.name} ${d.base_points ?? 5}`).join(" · ")}
            </DetailRow>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Puan = saat × zorluk ÷ 5 + zor gün puanı + ek puanlar. Bir gün birden fazla nedenle zor sayılıyorsa en yüksek puan yazılır.
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
              {formatScore(burden)}
            </div>
          </button>

          {/* Kırılım — neden bu puan? */}
          {isExpanded && (
            <div className="ml-10 mr-1 mt-1.5 mb-2 bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2.5">
              <p className="text-xs text-slate-500">{fairnessText}{(p.hero_count ?? 0) > 0 && ` · ${p.hero_count} kez açık vardiya aldı`}{(p.no_show_count ?? 0) > 0 && ` · ${p.no_show_count} kez gelmedi`}</p>
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
                          <td className="pr-3 py-1 text-right font-bold">{formatScore(h.burden_score ?? 0)}</td>
                          <td className="pr-3 py-1 text-right">{formatScore(h.total_hours ?? 0)}</td>
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
              Yük dağılımı dengesiz, {formatScore(gap)} puanlık fark var.
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
                  `${e.week_start}: ${formatScore(val)}p`,
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
              <p className="text-sm font-bold text-slate-700 tabular-nums">{formatScore(latest)}p</p>
              <p className={cn("text-xs font-semibold", trendCls)}>{trend}</p>
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
            const name = person?.name ?? ev.claimed_by_name ?? "Bir kişi";
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

// ─── Elle yapılan değişiklikler ──────────────────────────────────────────────

type ManualLoad = {
  weeks: { week_start: string; avg_shift_points: number }[];
  people: { personnel_id: string; name: string; weeks: (number | null)[]; total: number }[];
  flags: { personnel_id: string; name: string; direction: "more" | "less"; total: number }[];
  flag_weeks: number;
};

/**
 * Motorun hazırladığı plan ile yayınlanan plan arasındaki kişi başı puan farkı: elle yapılan değişiklikler kimin yükünü
 * artırdı ya da azalttı. Üst üste haftalarda aynı yönde değişen kişi işaretlenir (hesap sahibine bildirim de gider).
 */
function ManualLoadSection({ locationId }: { locationId: string }) {
  const [data, setData] = useState<ManualLoad | null>(null);
  useEffect(() => {
    let stale = false;
    fetch(`/api/fairness/manual-load?location_id=${locationId}`).then(r => (r.ok ? r.json() : null)).then(d => { if (!stale) setData(d); }).catch(() => {});
    return () => { stale = true; };
  }, [locationId]);
  if (!data || data.weeks.length === 0) return null;
  const fmt = (v: number | null) => (v === null ? "-" : v === 0 ? "0" : `${v > 0 ? "+" : ""}${formatScore(v)}`);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold text-slate-900">Elle yapılan değişiklikler</h2>
      <p className="text-xs text-slate-500">
        Otomatik planın verdiği puan ile yayınlanan plandaki puan arasındaki fark. Artı, elle yapılan değişikliklerin kişinin yükünü artırdığı anlamına gelir. İzin, vardiya değişimi ya da hastalık gibi sebeplerle değişiklik yapmak normaldir. Aynı kişinin yükü {data.flag_weeks} hafta üst üste aynı yönde değişirse işaretlenir ve hesap sahibine bildirim gider.
      </p>
      {data.flags.length > 0 && (
        <div className="space-y-1.5">
          {data.flags.map(f => (
            <p key={f.personnel_id} className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <span>Son {data.flag_weeks} haftada elle yapılan değişiklikler her hafta {f.name} adlı kişinin yükünü {f.direction === "more" ? "artırdı" : "azalttı"} (toplam {fmt(f.total)} puan).</span>
            </p>
          ))}
        </div>
      )}
      {data.people.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Son haftalarda yayınlanan planlar otomatik planla aynı. Elle yapılan bir değişiklik yok.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[480px] text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="px-3 py-2 font-semibold">Kişi</th>
                {data.weeks.map(w => <th key={w.week_start} className="px-2 py-2 text-right font-semibold">{formatDateTR(w.week_start, { weekday: false })}</th>)}
                <th className="px-3 py-2 text-right font-semibold">Toplam</th>
              </tr>
            </thead>
            <tbody>
              {data.people.map(p => (
                <tr key={p.personnel_id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-semibold text-slate-800">{p.name}</td>
                  {p.weeks.map((d, i) => (
                    <td key={i} className={cn("px-2 py-2 text-right", d && d > 0 ? "text-amber-700" : d && d < 0 ? "text-sky-700" : "text-slate-400")}>{fmt(d)}</td>
                  ))}
                  <td className="px-3 py-2 text-right font-bold text-slate-800">{fmt(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
