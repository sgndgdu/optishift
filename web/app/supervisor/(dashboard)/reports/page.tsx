"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

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
  return (endMin - startMin) / 60;
}

// ─── types ─────────────────────────────────────────────────────────────────
interface BranchReport {
  id: string;
  name: string;
  personnel_count: number;
  scheduled_shifts: number;
  total_hours: number;
  compliance_flags: ComplianceFlag[];
  personnel: PersonnelRow[];
}

interface ComplianceFlag {
  name: string;
  hours: number;
  max_weekly_hours: number;
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
  const [activeTab, setActiveTab]   = useState<"summary" | "compliance" | "fairness">("summary");

  // ── data loading ────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!user?.org_id) return;
    setLoading(true);
    try {
      const weekStart = getWeekStart(weekOffset);

      const locRes = await fetch(`/api/locations?org_id=${user.org_id}`);
      const locs: any[] = await locRes.json();
      if (!Array.isArray(locs)) { setLoading(false); return; }

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

          // Build hours-per-person map
          const hoursMap: Record<string, number> = {};
          for (const s of shiftList) {
            const h = calcHours(s.start_time, s.end_time);
            hoursMap[s.personnel_id] = (hoursMap[s.personnel_id] ?? 0) + h;
          }

          const personnelRows: PersonnelRow[] = personnelList.map((p: any) => ({
            id: p.id,
            name: p.name,
            title: p.title,
            prev_score: p.prev_score ?? 0,
            weekly_hours: Math.round((hoursMap[p.id] ?? 0) * 10) / 10,
            // Tek kural (lib/legal): şube sınırı üst sınır, kişinin değeri sadece daha düşükse
            max_weekly_hours: effectiveWeeklyLimit(p.max_weekly_hours, branchMax),
          }));

          const complianceFlags: ComplianceFlag[] = personnelRows
            .filter(p => p.weekly_hours > p.max_weekly_hours * 0.9)
            .map(p => ({ name: p.name, hours: p.weekly_hours, max_weekly_hours: p.max_weekly_hours }));

          return {
            id: loc.id,
            name: loc.name,
            personnel_count: personnelList.length,
            scheduled_shifts: shiftList.length,
            total_hours: Math.round(
              Object.values(hoursMap).reduce((a, b) => a + b, 0) * 10
            ) / 10,
            compliance_flags: complianceFlags,
            personnel: personnelRows,
          };
        })
      );

      setBranches(reports);
    } finally {
      setLoading(false);
    }
  }, [user, weekOffset]);

  useEffect(() => { if (mounted && user) loadData(); }, [mounted, user, loadData]);

  // ── derived totals ───────────────────────────────────────────────────────
  const totalShifts     = branches.reduce((a, b) => a + b.scheduled_shifts, 0);
  const totalHours      = Math.round(branches.reduce((a, b) => a + b.total_hours, 0) * 10) / 10;
  const totalFlags      = branches.reduce((a, b) => a + b.compliance_flags.length, 0);
  const overCount       = branches.reduce((a, b) => a + b.compliance_flags.filter(f => f.hours > f.max_weekly_hours).length, 0);
  const nearCount       = totalFlags - overCount;

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
        <StatCard label="Toplam saat" value={`${trNum(totalHours)} sa`} icon={Clock} hint={`${totalShifts} vardiya`} />
        <StatCard label="Haftalık sınır" value={totalFlags === 0 ? "Sorun yok" : [overCount ? `${overCount} aştı` : null, nearCount ? `${nearCount} yaklaştı` : null].filter(Boolean).join(" · ")}
          icon={totalFlags > 0 ? AlertTriangle : ShieldCheck} tone={overCount > 0 ? "danger" : totalFlags > 0 ? "attention" : "positive"}
          onClick={totalFlags > 0 ? () => setActiveTab("compliance") : undefined} />
      </div>

      <Tabs fill value={activeTab} onChange={setActiveTab} items={[
        { id: "summary",    label: "Şubeler" },
        { id: "compliance", label: "Haftalık sınır", count: totalFlags },
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
              subtitle={`${b.personnel_count} kişi · ${b.scheduled_shifts} vardiya · ${trNum(b.total_hours)} sa`}
              trailing={b.compliance_flags.length > 0
                ? <StatusPill tone={b.compliance_flags.some(f => f.hours > f.max_weekly_hours) ? "danger" : "attention"}>{b.compliance_flags.length} kişi sınırda</StatusPill>
                : undefined}
            />
          ))}
        </List>
      ) : activeTab === "compliance" ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Bu hafta çalışma sınırını aşan (kırmızı) ya da %90&apos;ına yaklaşan (sarı) kişiler. Sınır, şubenin haftalık sınırıdır; yarı zamanlıda kişinin kendi sınırı.</p>
          <List>
            {totalFlags === 0 ? <ListEmpty>Bu hafta kimse sınıra yaklaşmadı.</ListEmpty>
              : branches.filter(b => b.compliance_flags.length > 0).flatMap(b => [
                <ListSection key={`h-${b.id}`} title={b.name} count={b.compliance_flags.length} />,
                ...b.compliance_flags.map((flag, i) => {
                  const over = flag.hours > flag.max_weekly_hours;
                  return (
                    <ListItem key={`${b.id}-${i}`} href={`/supervisor/personnel?location_id=${b.id}`}
                      leading={<Avatar name={flag.name} />}
                      title={flag.name}
                      subtitle={`${trNum(flag.hours)} sa çalışıyor · sınır ${trNum(flag.max_weekly_hours)} sa`}
                      trailing={<StatusPill tone={over ? "danger" : "attention"}>{over ? "Aştı" : "Yaklaştı"}</StatusPill>}
                    />
                  );
                }),
              ])}
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
                  ? [<ListEmpty key={`e-${b.id}`}>Personel yok.</ListEmpty>]
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
                        <span className="block text-[11px] text-slate-400">{scoreVsAverageText(p.prev_score, branchAvg)}</span>
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
