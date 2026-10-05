"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { trNum } from "@/lib/format";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Download, ChevronLeft, ChevronRight, RefreshCw, Lock, Unlock, Clock, Scale, Users, TrendingUp, Wallet } from "lucide-react";
import FairnessReport from "@/components/reports/FairnessReport";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/ui/StatusPill";
import { Tabs } from "@/components/ui/Tabs";

interface ReportRow {
  personnel_id: string;
  name: string;
  title: string;
  shift_count: number;
  total_hours: number;
  overtime_hours: number;
  overtime_cost: number | null;
}

function getMonthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
}

function prevMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const downloadClass = "inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors";

// Liste bu kadar kişiden uzunsa katlanır (telefonda sayfa 6 ekran boyuna çıkıyordu); tamamı Excel'de
const ROW_PREVIEW = 8;

function WorkHoursReport() {
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [showAllRows, setShowAllRows] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodLock, setPeriodLock] = useState<any>(null); // null = kilitli değil
  const [lockActionLoading, setLockActionLoading] = useState(false);
  const [role, setRole] = useState<string>("");

  const getLocationId = () => {
    try {
      const u = JSON.parse(localStorage.getItem("optishift_manager_user") ?? "{}");
      return u?.location_id ?? "";
    } catch { return ""; }
  };

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("optishift_manager_user") ?? "{}");
      setRole(u?.role ?? "");
    } catch { /* empty */ }
  }, []);

  const loadPeriodLock = useCallback(async (m: string) => {
    const location_id = getLocationId();
    if (!location_id) return;
    try {
      const res = await fetch(`/api/payroll-periods?location_id=${location_id}&month=${m}`);
      const data = await res.json();
      setPeriodLock(Array.isArray(data) && data.length > 0 ? data[0] : null);
    } catch { /* empty */ }
  }, []);

  useEffect(() => { loadPeriodLock(month); }, [month, loadPeriodLock]);

  const handleLockPeriod = async () => {
    const location_id = getLocationId();
    if (!location_id) return;
    setLockActionLoading(true);
    try {
      const res = await fetch("/api/payroll-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id, month }),
      });
      if (res.ok) await loadPeriodLock(month);
    } finally { setLockActionLoading(false); }
  };

  const handleUnlockPeriod = async () => {
    if (!periodLock?.id) return;
    setLockActionLoading(true);
    try {
      const res = await fetch(`/api/payroll-periods?id=${periodLock.id}`, { method: "DELETE" });
      if (res.ok) await loadPeriodLock(month);
    } finally { setLockActionLoading(false); }
  };

  const loadReport = useCallback(async (m: string) => {
    const location_id = getLocationId();
    if (!location_id) { setError("Şube bulunamadı."); return; }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/monthly?location_id=${location_id}&month=${m}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Hata oluştu"); return; }
      setRows(data.rows ?? []);
    } catch {
      setError("Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReport(month); }, [month, loadReport]);

  const handleExport = () => {
    if (rows.length === 0) return;
    const location_id = getLocationId();
    if (!location_id) return;
    // Excel sunucu tarafında (exceljs) üretilir — aynı /api/reports/monthly endpoint'i,
    // ?format=xlsx ile aynı veriyi indirilebilir dosya olarak döner.
    window.location.href = `/api/reports/monthly?location_id=${location_id}&month=${month}&format=xlsx`;
  };

  const totalShifts = rows.reduce((s, r) => s + r.shift_count, 0);
  const totalHours = Math.round(rows.reduce((s, r) => s + r.total_hours, 0) * 10) / 10;
  const totalOvertime = Math.round(rows.reduce((s, r) => s + r.overtime_hours, 0) * 10) / 10;
  const totalOvertimeCost = rows.reduce((s, r) => s + (r.overtime_cost ?? 0), 0);
  const visibleRows = showAllRows ? rows : rows.slice(0, ROW_PREVIEW);
  const hasCost = rows.some(r => r.overtime_cost !== null && r.overtime_cost !== undefined);

  return (
    <div className="space-y-6">
      {/* Ay + indirmeler: tek satır. İndirmeler ikincil (DESIGN.md §5: bu görünümde birincil eylem yok) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => setMonth(prevMonth(month))} aria-label="Önceki ay" title="Önceki ay"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors">
            <ChevronLeft size={18} />
          </button>
          <p className="min-w-[7.5rem] text-center text-base font-bold text-slate-900">{getMonthLabel(month)}</p>
          <button onClick={() => setMonth(nextMonth(month))} disabled={month >= currentMonth()} aria-label="Sonraki ay" title="Sonraki ay"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { const lid = getLocationId(); if (lid) window.location.href = `/api/reports/timesheet?location_id=${lid}&month=${month}`; }}
            title="Kişi-gün bazlı giriş/çıkış puantajı, bordro ve muhasebe aktarımı için CSV"
            className={downloadClass}
          >
            <Download size={15} /> Puantaj
          </button>
          <button onClick={handleExport} disabled={rows.length === 0 || loading} title="Aylık özet, Excel dosyası" className={downloadClass}>
            <Download size={15} /> Excel
          </button>
        </div>
      </div>

      {/* Puantaj dönem kilidi: tek satır */}
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3">
        {periodLock ? <Lock size={16} className="shrink-0 text-slate-500" /> : <Unlock size={16} className="shrink-0 text-amber-600" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{periodLock ? "Dönem kilitli" : "Dönem açık"}</p>
          <p className="text-xs text-slate-500">
            {periodLock
              ? `${periodLock.locked_by_name ?? "Sorumlu"} kilitledi. Giriş/çıkış ve düzenleme yapılamaz.`
              : "Puantajı onaylayınca kilitleyin, geçmiş veri değişmesin."}
          </p>
        </div>
        {periodLock ? (
          (role === "admin" || role === "supervisor") && (
            <button onClick={handleUnlockPeriod} disabled={lockActionLoading} className={cn(downloadClass, "shrink-0")}>
              Kilidi Aç
            </button>
          )
        ) : (
          <button onClick={handleLockPeriod} disabled={lockActionLoading} className={cn(downloadClass, "shrink-0")}>
            <Lock size={14} /> Kilitle
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <div className={`grid grid-cols-2 ${hasCost ? "md:grid-cols-4" : "md:grid-cols-3"} gap-3`}>
          <StatCard label="Personel" value={rows.length} icon={Users} />
          <StatCard label="Toplam çalışma" value={`${trNum(totalHours)} sa`} icon={Clock} />
          <StatCard label="Fazla mesai" value={`${trNum(totalOvertime)} sa`} icon={TrendingUp} tone={totalOvertime > 0 ? "attention" : "neutral"} />
          {hasCost && (
            <StatCard label="Mesai maliyeti" value={`₺${totalOvertimeCost.toLocaleString("tr-TR")}`} icon={Wallet}
              tone={totalOvertimeCost > 0 ? "danger" : "neutral"} hint="Saat × ücret × 1,5" />
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
            <RefreshCw size={18} className="animate-spin" />
            <span className="text-sm">Yükleniyor…</span>
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-500">{error}</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-slate-500">Bu ay için yayınlanan vardiya bulunamadı.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="text-left px-3 sm:px-5 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Ad Soyad</th>
                <th className="hidden sm:table-cell text-left px-5 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Unvan</th>
                <th className="hidden sm:table-cell text-right px-5 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Vardiya</th>
                <th className="text-right px-3 sm:px-5 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Saat</th>
                <th className="text-right px-3 sm:px-5 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Mesai</th>
                {hasCost && <th className="text-right px-3 sm:px-5 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Maliyet</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {visibleRows.map((row, i) => (
                <tr key={row.personnel_id} className={`hover:bg-slate-50/50 transition-colors ${i % 2 === 0 ? "" : "bg-slate-50/20"}`}>
                  <td className="px-3 sm:px-5 py-3 font-medium text-slate-900">
                    {row.name}
                    {/* Telefonda Unvan/Vardiya sütunları gizli: ismin altında kısa özet */}
                    <span className="sm:hidden block text-xs font-normal text-slate-400">{row.title ? `${row.title} · ` : ""}{row.shift_count} vardiya</span>
                  </td>
                  <td className="hidden sm:table-cell px-5 py-3 text-slate-500">{row.title || "—"}</td>
                  <td className="hidden sm:table-cell px-5 py-3 text-right text-slate-700">{row.shift_count}</td>
                  <td className="px-3 sm:px-5 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">{trNum(row.total_hours)} sa</td>
                  <td className="px-3 sm:px-5 py-3 text-right whitespace-nowrap">
                    {row.overtime_hours > 0 ? (
                      <StatusPill tone="attention">
                        +{trNum(row.overtime_hours)} sa
                      </StatusPill>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  {hasCost && (
                    <td className="px-3 sm:px-5 py-3 text-right text-slate-700 whitespace-nowrap">
                      {row.overtime_cost ? `₺${row.overtime_cost.toLocaleString("tr-TR")}` : <span className="text-slate-400">—</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="px-3 sm:px-5 py-3 font-bold text-slate-900">Toplam <span className="font-normal text-slate-400">({rows.length} kişi)</span></td>
                <td className="hidden sm:table-cell" />
                <td className="hidden sm:table-cell px-5 py-3 text-right font-bold text-slate-900">{totalShifts}</td>
                <td className="px-3 sm:px-5 py-3 text-right font-bold text-slate-900 whitespace-nowrap">{trNum(totalHours)} sa</td>
                <td className="px-3 sm:px-5 py-3 text-right font-bold text-amber-700 whitespace-nowrap">{totalOvertime > 0 ? `+${trNum(totalOvertime)} sa` : "—"}</td>
                {hasCost && <td className="px-3 sm:px-5 py-3 text-right font-bold text-red-700 whitespace-nowrap">{totalOvertimeCost > 0 ? `₺${totalOvertimeCost.toLocaleString("tr-TR")}` : "—"}</td>}
              </tr>
            </tfoot>
          </table>
        )}
        {!loading && !error && rows.length > ROW_PREVIEW && (
          <button onClick={() => setShowAllRows(v => !v)}
            className="w-full py-3 text-sm font-bold text-forest-600 hover:bg-forest-50 border-t border-slate-100 transition-colors">
            {showAllRows ? "Daha az göster" : `Tümünü göster (${rows.length} kişi)`}
          </button>
        )}
      </div>

      <p className="text-xs text-slate-400 text-center">
        Fazla mesai hesabı: şube ayarlarındaki haftalık eşiği aşan çalışma süresi. Maliyet = mesai saati × saatlik ücret × 1,5 (%50 zamlı).
      </p>
    </div>
  );
}

// ─── Sayfa: sekmeli Raporlar ─────────────────────────────────────────────────
// ?tab=adalet derin linki desteklenir (eski /fairness adresi buraya yönlendirir).

const REPORT_TABS = [
  { id: "saatler", label: "Çalışma Saatleri", icon: Clock },
  { id: "adalet",  label: "Adalet Puanı",     icon: Scale },
] as const;
type ReportTab = typeof REPORT_TABS[number]["id"];

// useSearchParams (?tab=adalet, /fairness yönlendirmesi) Suspense sınırı ister
export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsPageInner />
    </Suspense>
  );
}

function ReportsPageInner() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<ReportTab>(() => {
    const t = searchParams.get("tab");
    return REPORT_TABS.some(x => x.id === t) ? (t as ReportTab) : "saatler";
  });

  const selectTab = (key: ReportTab) => {
    setTab(key);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url);
  };

  return (
    <Page>
      <PageHeader title="Raporlar" />

      <Tabs items={REPORT_TABS} value={tab} onChange={selectTab} />

      {tab === "saatler" ? <WorkHoursReport /> : <FairnessReport />}
    </Page>
  );
}
