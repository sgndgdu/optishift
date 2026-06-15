"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSupervisorAuth } from "@/hooks/useAuth";
import { getWeekStart } from "@/lib/date";
import {
  BarChart3, Building2, Users, Clock, AlertTriangle,
  CheckCircle2, ChevronLeft, ChevronRight, TrendingUp,
  ShieldCheck, Download,
} from "lucide-react";

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
  const router = useRouter();
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

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
            <BarChart3 size={18} className="text-violet-600" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900">Raporlar</h1>
            <p className="text-xs text-slate-500">Çapraz şube haftalık analiz</p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 shrink-0"
        >
          Yenile
        </button>
      </div>

      {/* Week navigator */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 px-4 py-3">
        <button
          onClick={() => setWeekOffset(w => w - 1)}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ChevronLeft size={16} className="text-slate-600" />
        </button>
        <div className="text-center">
          <p className="text-sm font-black text-slate-900">{formatWeekLabel(getWeekStart(weekOffset))}</p>
          {weekOffset === 0 && <p className="text-[10px] text-primary font-bold">Bu Hafta</p>}
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="text-[10px] text-slate-400 hover:text-primary transition-colors">
              Bu haftaya dön
            </button>
          )}
        </div>
        <button
          onClick={() => setWeekOffset(w => w + 1)}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ChevronRight size={16} className="text-slate-600" />
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <KpiCard icon={<Building2 size={16} className="text-blue-600" />} bg="bg-blue-50"
          label="Şube" value={`${branches.length}`} href="/supervisor" />
        <KpiCard icon={<Users size={16} className="text-indigo-600" />} bg="bg-indigo-50"
          label="Personel" value={`${totalPersonnel}`} href="/supervisor/personnel" />
        <KpiCard icon={<Clock size={16} className="text-emerald-600" />} bg="bg-emerald-50"
          label="Toplam Saat" value={`${totalHours} sa`} sub={`${totalShifts} vardiya`} />
        <KpiCard
          icon={totalFlags > 0
            ? <AlertTriangle size={16} className="text-red-500" />
            : <ShieldCheck size={16} className="text-emerald-600" />}
          bg={totalFlags > 0 ? "bg-red-50" : "bg-emerald-50"}
          label="Yasal Uyumluluk"
          value={totalFlags > 0 ? `${totalFlags} uyarı` : "Temiz"}
          valueClass={totalFlags > 0 ? "text-red-600" : "text-emerald-700"}
          onClick={totalFlags > 0 ? () => setActiveTab("compliance") : undefined}
        />
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-2xl gap-1">
        {([
          { id: "summary",    label: "Şube Özeti" },
          { id: "compliance", label: `Uyumluluk${totalFlags > 0 ? ` (${totalFlags})` : ""}` },
          { id: "fairness",   label: `Adalet Puanı · Ort. ${avgScore}` },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === t.id ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">Yükleniyor...</div>
      ) : (
        <>
          {/* ── SUMMARY TAB ── */}
          {activeTab === "summary" && (
            <div className="space-y-3">
              {branches.length === 0 && (
                <EmptyState text="Şube bulunamadı" />
              )}
              {branches.map(branch => (
                <div key={branch.id} className="bg-white rounded-2xl border border-slate-100 p-5 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => router.push(`/supervisor/schedule?location_id=${branch.id}`)}>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                        <Building2 size={16} className="text-slate-500" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900">{branch.name}</p>
                        <p className="text-xs text-slate-500">{branch.personnel_count} personel</p>
                      </div>
                    </div>
                    {branch.compliance_flags.length > 0 && (
                      <span className="text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full shrink-0 cursor-pointer hover:bg-red-100"
                        onClick={e => { e.stopPropagation(); setActiveTab("compliance"); }}>
                        {branch.compliance_flags.length} uyarı
                      </span>
                    )}
                    {branch.compliance_flags.length === 0 && (
                      <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
                        Uyumlu
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <StatBox label="Vardiya" value={`${branch.scheduled_shifts}`} href={`/supervisor/schedule?location_id=${branch.id}`} />
                    <StatBox label="Toplam Saat" value={`${branch.total_hours} sa`} />
                    <StatBox
                      label="Ort. Puan"
                      value={branch.personnel.length
                        ? `${Math.round(branch.personnel.reduce((a, p) => a + p.prev_score, 0) / branch.personnel.length * 10) / 10}`
                        : "—"}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── COMPLIANCE TAB ── */}
          {activeTab === "compliance" && (
            <div className="space-y-4">
              {totalFlags === 0 ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 flex flex-col items-center gap-3 text-emerald-700">
                  <CheckCircle2 size={36} strokeWidth={1.5} />
                  <p className="text-sm font-bold">Tüm şubelerde yasal uyumluluk sağlandı</p>
                  <p className="text-xs text-emerald-600 text-center">Bu hafta hiçbir personel maksimum çalışma saatinin %90'ını aşmadı.</p>
                </div>
              ) : (
                branches.map(branch =>
                  branch.compliance_flags.length > 0 ? (
                    <div key={branch.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                      <div className="px-5 py-3 border-b border-slate-50 flex items-center gap-2 cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => router.push(`/supervisor/schedule?location_id=${branch.id}`)}>
                        <Building2 size={13} className="text-slate-400" />
                        <span className="text-xs font-bold text-slate-600 hover:underline">{branch.name}</span>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {branch.compliance_flags.map((flag, i) => {
                          const pct = Math.round((flag.hours / flag.max_weekly_hours) * 100);
                          const over = flag.hours > flag.max_weekly_hours;
                          return (
                            <div key={i} className="px-5 py-3 flex items-center justify-between gap-4">
                              <div className="min-w-0">
                                <Link href={`/supervisor/personnel?location_id=${branch.id}`} className="text-sm font-bold text-slate-800 hover:underline hover:text-primary">{flag.name}</Link>
                                <div className="mt-1.5 h-1.5 w-36 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${over ? "bg-red-500" : "bg-amber-400"}`}
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                  />
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`text-sm font-black ${over ? "text-red-600" : "text-amber-600"}`}>
                                  {flag.hours} sa
                                </p>
                                <p className="text-[10px] text-slate-400">limit: {flag.max_weekly_hours} sa ({pct}%)</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null
                )
              )}

              {/* Full personnel compliance table */}
              {totalFlags === 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-50">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tüm Personel — Bu Hafta</p>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {allPersonnel.map((p, i) => (
                      <div key={i} className="px-5 py-2.5 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                          <p className="text-[10px] text-slate-400">{p.branch}</p>
                        </div>
                        <p className="text-sm font-bold text-emerald-700 shrink-0">{p.weekly_hours} sa</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── FAIRNESS TAB ── */}
          {activeTab === "fairness" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <KpiCard icon={<TrendingUp size={16} className="text-violet-600" />} bg="bg-violet-50"
                  label="Ort. Puan" value={`${avgScore}`} />
                <KpiCard icon={<TrendingUp size={16} className="text-emerald-600" />} bg="bg-emerald-50"
                  label="En Yüksek"
                  value={allPersonnel.length ? `${Math.max(...allPersonnel.map(p => p.prev_score))}` : "—"} />
                <KpiCard icon={<TrendingUp size={16} className="text-amber-500" />} bg="bg-amber-50"
                  label="En Düşük"
                  value={allPersonnel.length ? `${Math.min(...allPersonnel.map(p => p.prev_score))}` : "—"} />
              </div>

              {branches.map(branch => (
                <div key={branch.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-50 flex items-center gap-2 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => router.push(`/supervisor/schedule?location_id=${branch.id}`)}>
                    <Building2 size={13} className="text-slate-400" />
                    <span className="text-xs font-bold text-slate-600 hover:underline">{branch.name}</span>
                  </div>
                  {branch.personnel.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-5">Personel yok</p>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {[...branch.personnel]
                        .sort((a, b) => b.prev_score - a.prev_score)
                        .map((p, i) => {
                          const max = Math.max(...branch.personnel.map(x => x.prev_score), 1);
                          const pct = max > 0 ? Math.round((p.prev_score / max) * 100) : 0;
                          return (
                            <div key={i} className="px-5 py-3 flex items-center gap-4">
                              <div className="w-5 text-[10px] font-bold text-slate-400 shrink-0">{i + 1}</div>
                              <div className="flex-1 min-w-0">
                                <Link href={`/supervisor/personnel?location_id=${branch.id}`} className="text-sm font-semibold text-slate-800 hover:underline hover:text-primary">{p.name}</Link>
                                <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-violet-400 rounded-full transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                              <p className="text-sm font-black text-violet-700 shrink-0 w-10 text-right">
                                {p.prev_score}
                              </p>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  icon, bg, label, value, sub, valueClass, href, onClick,
}: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  href?: string;
  onClick?: () => void;
}) {
  const isClickable = !!(href || onClick);
  const inner = (
    <>
      <div className={`w-8 h-8 ${bg} rounded-xl flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className={`text-xl font-black ${valueClass ?? "text-slate-900"}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 font-medium">{sub}</p>}
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`bg-white rounded-2xl border border-slate-100 p-4 block ${isClickable ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 p-4 ${isClickable ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
      onClick={onClick}>
      {inner}
    </div>
  );
}

function StatBox({ label, value, href }: { label: string; value: string; href?: string }) {
  if (href) {
    return (
      <Link href={href} className="bg-slate-50 rounded-xl px-3 py-2.5 block hover:bg-slate-100 transition-colors" onClick={e => e.stopPropagation()}>
        <p className="text-base font-black text-slate-900">{value}</p>
        <p className="text-[10px] text-slate-400 font-medium mt-0.5">{label}</p>
      </Link>
    );
  }
  return (
    <div className="bg-slate-50 rounded-xl px-3 py-2.5">
      <p className="text-base font-black text-slate-900">{value}</p>
      <p className="text-[10px] text-slate-400 font-medium mt-0.5">{label}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-12 flex flex-col items-center gap-3 text-slate-400">
      <BarChart3 size={36} strokeWidth={1.5} />
      <p className="text-sm font-semibold">{text}</p>
    </div>
  );
}
