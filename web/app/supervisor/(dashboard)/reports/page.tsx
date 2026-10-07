"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { netWorkMinutes } from "@/lib/legal";
import { trNum } from "@/lib/format";
import { effectiveWeeklyLimit } from "@/lib/legal";
import { formatScore, scoreVsAverageText } from "@/lib/fairness";
import { useEffect, useState, useCallback } from "react";
import { useSupervisorAuth } from "@/hooks/useAuth";
import { getWeekStart } from "@/lib/date";
import { Clock, AlertTriangle, ChevronLeft, ChevronRight, ShieldCheck, RefreshCw } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListItem, ListEmpty, ListSection } from "@/components/ui/List";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Tabs } from "@/components/ui/Tabs";

// ─── helpers ───────────────────────────────────────────────────────────────
function formatWeekLabel(weekStart: string) {
  if (!weekStart) return "";
  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function calcHours(start_time: string, end_time: string): number {
  if (!start_time || !end_time) return 0;
  const [sh, sm] = start_time.split(":").map(Number);
  const [eh, em] = end_time.split(":").map(Number);
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 1440;
  // Mola çalışma süresine sayılmaz; bu görünümde vardiya tanımı yok, yasal asgari düşülür (lib/legal)
  return netWorkMinutes(endMin - startMin) / 60;
}

// ─── types ─────────────────────────────────────────────────────────────────
interface BranchReport {
  id: string;
  name: string;
  personnel_count: number;
  scheduled_shifts: number;
  total_hours: number;
  personnel: PersonnelRow[];
}

/** Kişinin haftası: TÜM şubelerdeki saatleri toplanır (iki şubede çalışan tek kişi olarak sayılır) */
interface WorkerWeek {
  id: string;
  name: string;
  hours: number;
  limit: number;
  /** şube adı → saat */
  byBranch: Record<string, number>;
  home_location_id: string;
}

interface PersonnelRow {
  id: string;
  name: string;
  title?: string;
  prev_score: number;
  weekly_hours: number;
  max_weekly_hours: number;
}

// ─── page ──────────────────────────────────────────────────────────────────
export default function SupervisorReports() {
  const { user, mounted } = useSupervisorAuth();

  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading]       = useState(true);
  const [branches, setBranches]     = useState<BranchReport[]>([]);
  const [workers, setWorkers]       = useState<WorkerWeek[]>([]);
  const [activeTab, setActiveTab]   = useState<"summary" | "hours" | "fairness">("summary");

  // ── data loading ────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!user?.org_id) return;
    setLoading(true);
    try {
      const weekStart = getWeekStart(weekOffset);

      const locRes = await fetch(`/api/locations?org_id=${user.org_id}`);
      const locs: any[] = await locRes.json();
      if (!Array.isArray(locs)) { setLoading(false); return; }

      // Kişi bazında hafta (tüm şubeler): sınır kişinin ana şubesinin kuralıyla
      const people: Record<string, WorkerWeek> = {};
      const reports: BranchReport[] = await Promise.all(
        locs.map(async (loc) => {
          const [personnelRes, shiftsRes] = await Promise.all([
            fetch(`/api/personnel?location_id=${loc.id}`).then(r => r.json()).catch(() => []),
            fetch(`/api/shifts?location_id=${loc.id}&week_start=${weekStart}`).then(r => r.json()).catch(() => []),
          ]);

          const personnelList: any[] = (Array.isArray(personnelRes) ? personnelRes : []).filter((p: any) => p.status !== "inactive");
          let branchMax = 45;
          try {
            const r = typeof loc.rules === "string" ? JSON.parse(loc.rules) : (loc.rules ?? {});
            if (typeof r.max_weekly_hours === "number") branchMax = r.max_weekly_hours;
          } catch { /* varsayılan */ }
          const shiftList: any[]     = Array.isArray(shiftsRes)    ? shiftsRes    : [];

          const hoursMap: Record<string, number> = {};
          for (const s of shiftList) {
            const h = calcHours(s.start_time, s.end_time);
            hoursMap[s.personnel_id] = (hoursMap[s.personnel_id] ?? 0) + h;
          }

          for (const p of personnelList) {
            const w = people[p.id] ??= { id: p.id, name: p.name, hours: 0, limit: 0, byBranch: {}, home_location_id: p.primary_location_id ?? loc.id };
            // Tek kural (lib/legal): şube sınırı üst sınır, kişinin değeri sadece daha düşükse. Ana şubenin kuralı geçerli.
            if ((p.primary_location_id ?? loc.id) === loc.id || w.limit === 0) w.limit = effectiveWeeklyLimit(p.max_weekly_hours, branchMax);
          }
          for (const [pid, h] of Object.entries(hoursMap)) {
            const w = people[pid];
            if (!w) continue;
            w.hours += h;
            w.byBranch[loc.name] = (w.byBranch[loc.name] ?? 0) + h;
          }

          const personnelRows: PersonnelRow[] = personnelList.map((p: any) => ({
            id: p.id,
            name: p.name,
            title: p.title,
            prev_score: p.prev_score ?? 0,
            weekly_hours: Math.round((hoursMap[p.id] ?? 0) * 10) / 10,
            max_weekly_hours: effectiveWeeklyLimit(p.max_weekly_hours, branchMax),
          }));

          return {
            id: loc.id,
            name: loc.name,
            personnel_count: personnelList.length,
            scheduled_shifts: shiftList.length,
            total_hours: Math.round(
              Object.values(hoursMap).reduce((a, b) => a + b, 0) * 10
            ) / 10,
            personnel: personnelRows,
          };
        })
      );

      setWorkers(Object.values(people).map(w => ({ ...w, hours: Math.round(w.hours * 10) / 10 })));
      setBranches(reports);
    } finally {
      setLoading(false);
    }
  }, [user, weekOffset]);

  useEffect(() => { if (mounted && user) loadData(); }, [mounted, user, loadData]);

  // ── derived totals ───────────────────────────────────────────────────────
  const totalShifts     = branches.reduce((a, b) => a + b.scheduled_shifts, 0);
  const totalHours      = Math.round(branches.reduce((a, b) => a + b.total_hours, 0) * 10) / 10;
  // Sınırı aşan (kırmızı) ya da %90'ına gelen (sarı) kişiler; hiç çalışmayanlar listede yok
  const working         = workers.filter(w => w.hours > 0).sort((a, b) => b.hours / b.limit - a.hours / a.limit);
  const overCount       = working.filter(w => w.hours > w.limit).length;
  const nearCount       = working.filter(w => w.hours <= w.limit && w.hours > w.limit * 0.9).length;
  const flagsIn = (branchName: string) => working.filter(w => w.byBranch[branchName] && w.hours > w.limit * 0.9);

  if (!mounted) return <div className="h-screen" />;

  // Satıra dokununca şubenin AYNI haftası açılır (eskiden şubenin varsayılan haftası açılıyordu)
  const planHref = (id: string) => `/supervisor/schedule?location_id=${id}&week=${weekOffset}`;

  return (
    <Page>
      <PageHeader title="Raporlar" description="Tüm şubeler, haftalık" actions={
        <button onClick={loadData}
          className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 shrink-0">
          <RefreshCw size={14} /> Yenile
        </button>
      } />

      {/* Hafta seçici */}
      <div className="flex items-center gap-1">
        <button onClick={() => setWeekOffset(w => w - 1)} aria-label="Önceki hafta" title="Önceki hafta"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900">
          <ChevronLeft size={18} />
        </button>
        <p className="min-w-[8rem] text-center text-base font-bold text-slate-900">{formatWeekLabel(getWeekStart(weekOffset))}</p>
        <button onClick={() => setWeekOffset(w => w + 1)} aria-label="Sonraki hafta" title="Sonraki hafta"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900">
          <ChevronRight size={18} />
        </button>
        {weekOffset !== 0 && (
          <button onClick={() => setWeekOffset(0)} className="ml-1 px-2 min-h-[40px] text-xs font-semibold text-primary hover:underline">
            Bu hafta
          </button>
        )}
      </div>

      {/* Şube/personel sayıları Genel Bakış'ta; burada sadece rapor sayıları */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Toplam çalışma" value={`${trNum(totalHours)} saat`} icon={Clock} hint={`${totalShifts} vardiya`} />
        <StatCard label="Çalışma sınırı" value={overCount > 0 ? `${overCount} kişi aştı` : nearCount > 0 ? `${nearCount} kişi sınırda` : "Herkes sınırın altında"}
          icon={overCount + nearCount > 0 ? AlertTriangle : ShieldCheck} tone={overCount > 0 ? "danger" : nearCount > 0 ? "attention" : "positive"}
          hint={overCount > 0 && nearCount > 0 ? `${nearCount} kişi de sınırda` : `${working.length} kişi çalışıyor`}
          onClick={() => setActiveTab("hours")} />
      </div>

      <Tabs fill value={activeTab} onChange={setActiveTab} items={[
        { id: "summary",    label: "Şubeler" },
        { id: "hours",      label: "Kişilerin haftası", count: overCount + nearCount || undefined },
        { id: "fairness",   label: "Adalet" },
      ] as const} />

      {loading ? (
        <List><ListEmpty>Yükleniyor…</ListEmpty></List>
      ) : activeTab === "summary" ? (
        <List>
          {branches.length === 0 ? <ListEmpty>Şube bulunamadı.</ListEmpty> : branches.map(b => (
            <ListItem key={b.id} href={planHref(b.id)}
              leading={<Avatar name={b.name} tone="brand" />}
              title={b.name}
              subtitle={`${b.personnel_count} kişi · ${b.scheduled_shifts} vardiya · ${trNum(b.total_hours)} saat`}
              trailing={flagsIn(b.name).length > 0
                ? <StatusPill tone={flagsIn(b.name).some(w => w.hours > w.limit) ? "danger" : "attention"}>{flagsIn(b.name).length} kişi sınırda</StatusPill>
                : undefined}
            />
          ))}
        </List>
      ) : activeTab === "hours" ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Bu tablo bu hafta kimin ne kadar çalıştığını gösterir. İki şubede çalışan kişinin süreleri toplanır. Sınır, kişinin ana şubesindeki haftalık sınırdır (yarı zamanlı çalışanda kişinin kendi sınırı). Sınırı aşan kırmızı, sınırın %90&apos;ına gelen sarı gösterilir.</p>
          <List>
            {working.length === 0 ? <ListEmpty>Bu hafta plan yok.</ListEmpty>
              : working.map(w => {
                const over = w.hours > w.limit, near = !over && w.hours > w.limit * 0.9;
                const branchesText = Object.keys(w.byBranch).length > 1
                  ? Object.entries(w.byBranch).map(([n, h]) => `${n} ${trNum(Math.round(h * 10) / 10)}`).join(" + ") + " saat"
                  : Object.keys(w.byBranch)[0];
                return (
                  <ListItem key={w.id} href={`/supervisor/personnel?location_id=${w.home_location_id}`}
                    leading={<Avatar name={w.name} />}
                    title={w.name}
                    subtitle={branchesText}
                    trailing={<span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-700 tabular-nums">{trNum(w.hours)} / {trNum(w.limit)} saat</span>
                      {(over || near) && <StatusPill tone={over ? "danger" : "attention"}>{over ? "Aştı" : "Sınırda"}</StatusPill>}
                    </span>}
                  />
                );
              })}
          </List>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Puanlar şube içinde karşılaştırılır (şubeler arası puan kıyası anlamsız: vardiya zorlukları farklı) */}
          <p className="text-xs text-slate-500">Adalet Puanı kişinin son haftalarda ne kadar ve ne kadar zor çalıştığını gösterir. Her kişi kendi şubesinin ortalamasıyla karşılaştırılır.</p>
          <List>
            {branches.flatMap(b => {
              const max = Math.max(...b.personnel.map(x => x.prev_score), 1);
              const branchAvg = b.personnel.length ? b.personnel.reduce((a, x) => a + x.prev_score, 0) / b.personnel.length : 0;
              return [
                <ListSection key={`h-${b.id}`} title={b.name} count={b.personnel.length} />,
                ...(b.personnel.length === 0
                  ? [<ListEmpty key={`e-${b.id}`}>Ekip yok.</ListEmpty>]
                  : [...b.personnel].sort((x, y) => y.prev_score - x.prev_score).map((p, i) => (
                    <ListItem key={`${b.id}-${i}`} href={`/supervisor/personnel?location_id=${b.id}`}
                      leading={<Avatar name={p.name} />}
                      title={p.name}
                      subtitle={
                        <span className="block mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <span className="block h-full bg-forest-400 rounded-full" style={{ width: `${Math.round((p.prev_score / max) * 100)}%` }} />
                        </span>
                      }
                      trailing={<span className="text-right">
                        <span className="block text-sm font-semibold text-slate-700 tabular-nums">{formatScore(p.prev_score)}</span>
                        <span className="block text-[12px] text-slate-400">{scoreVsAverageText(p.prev_score, branchAvg)}</span>
                      </span>}
                    />
                  ))),
              ];
            })}
          </List>
        </div>
      )}
    </Page>
  );
}
