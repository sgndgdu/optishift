"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import { useSupervisorAuth } from "@/hooks/useAuth";
import { getWeekStart } from "@/lib/date";
import { Building2, Users, Clock, AlertTriangle, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, ShieldCheck, RefreshCw, Scale } from "lucide-react";
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

          const personnelList: any[] = Array.isArray(personnelRes) ? personnelRes : [];
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
            max_weekly_hours: p.max_weekly_hours ?? 45,
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
  const totalPersonnel  = branches.reduce((a, b) => a + b.personnel_count, 0);
  const totalFlags      = branches.reduce((a, b) => a + b.compliance_flags.length, 0);
  const allPersonnel    = branches.flatMap(b => b.personnel.map(p => ({ ...p, branch: b.name })));
  const avgScore        = allPersonnel.length
    ? Math.round(allPersonnel.reduce((a, p) => a + p.prev_score, 0) / allPersonnel.length * 10) / 10
    : 0;

  if (!mounted) return <div className="h-screen" />;

  const planHref = (id: string) => `/supervisor/schedule?location_id=${id}`;

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Şube" value={branches.length} icon={Building2} />
        <StatCard label="Personel" value={totalPersonnel} icon={Users} />
        <StatCard label="Toplam saat" value={`${totalHours} sa`} icon={Clock} hint={`${totalShifts} vardiya`} />
        <StatCard label="Yasal uyumluluk" value={totalFlags > 0 ? `${totalFlags} uyarı` : "Temiz"}
          icon={totalFlags > 0 ? AlertTriangle : ShieldCheck} tone={totalFlags > 0 ? "danger" : "positive"}
          onClick={totalFlags > 0 ? () => setActiveTab("compliance") : undefined} />
      </div>

      <Tabs fill value={activeTab} onChange={setActiveTab} items={[
        { id: "summary",    label: "Şubeler" },
        { id: "compliance", label: "Uyumluluk", count: totalFlags },
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
              subtitle={`${b.personnel_count} kişi · ${b.scheduled_shifts} vardiya · ${b.total_hours} sa`}
              trailing={b.compliance_flags.length > 0
                ? <StatusPill tone="danger">{b.compliance_flags.length} uyarı</StatusPill>
                : <StatusPill tone="positive">Uyumlu</StatusPill>}
            />
          ))}
        </List>
      ) : activeTab === "compliance" ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Haftalık çalışma sınırının %90&apos;ına yaklaşan ya da aşan kişiler.</p>
          <List>
            {totalFlags === 0 ? <ListEmpty>Bu hafta hiçbir şubede uyarı yok.</ListEmpty>
              : branches.filter(b => b.compliance_flags.length > 0).flatMap(b => [
                <ListSection key={`h-${b.id}`} title={b.name} count={b.compliance_flags.length} />,
                ...b.compliance_flags.map((flag, i) => {
                  const over = flag.hours > flag.max_weekly_hours;
                  return (
                    <ListItem key={`${b.id}-${i}`} href={`/supervisor/personnel?location_id=${b.id}`}
                      leading={<Avatar name={flag.name} />}
                      title={flag.name}
                      subtitle={`Sınır ${flag.max_weekly_hours} sa`}
                      trailing={<StatusPill tone={over ? "danger" : "attention"}>{flag.hours} sa</StatusPill>}
                    />
                  );
                }),
              ])}
          </List>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Ortalama" value={avgScore} icon={Scale} />
            <StatCard label="En yüksek" value={allPersonnel.length ? Math.max(...allPersonnel.map(p => p.prev_score)) : "—"} icon={TrendingUp} />
            <StatCard label="En düşük" value={allPersonnel.length ? Math.min(...allPersonnel.map(p => p.prev_score)) : "—"} icon={TrendingDown} />
          </div>
          <List>
            {branches.flatMap(b => {
              const max = Math.max(...b.personnel.map(x => x.prev_score), 1);
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
                      trailing={<span className="text-sm font-semibold text-slate-700 tabular-nums">{p.prev_score}</span>}
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
