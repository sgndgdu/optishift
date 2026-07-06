"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import { BarChart2, Download, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

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

export default function ReportsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [locationName, setLocationName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getLocationId = () => {
    try {
      const u = JSON.parse(localStorage.getItem("optishift_manager_user") ?? "{}");
      return u?.location_id ?? "";
    } catch { return ""; }
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
      setLocationName(data.location ?? "");
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
  const hasCost = rows.some(r => r.overtime_cost !== null && r.overtime_cost !== undefined);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <BarChart2 size={20} className="text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Çalışma Saati Raporu</h1>
            <p className="text-sm text-slate-500">Personel bazında aylık özet — sadece yayınlanan vardiyalar</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { const lid = getLocationId(); if (lid) window.location.href = `/api/reports/timesheet?location_id=${lid}&month=${month}`; }}
            title="Kişi-gün bazlı giriş/çıkış puantajı — bordro ve muhasebe aktarımı için CSV"
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
          >
            <Download size={15} />
            Puantaj (CSV)
          </button>
          <button
            onClick={handleExport}
            disabled={rows.length === 0 || loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={15} />
            Excel İndir
          </button>
        </div>
      </div>

      {/* Month Navigator */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
        <button
          onClick={() => setMonth(prevMonth(month))}
          className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-lg font-bold text-slate-900">{getMonthLabel(month)}</p>
          {locationName && <p className="text-xs text-slate-500 mt-0.5">{locationName}</p>}
        </div>
        <button
          onClick={() => setMonth(nextMonth(month))}
          disabled={month >= currentMonth()}
          className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Summary Cards */}
      {rows.length > 0 && (
        <div className={`grid ${hasCost ? "grid-cols-4" : "grid-cols-3"} gap-4`}>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{rows.length}</p>
            <p className="text-xs text-slate-500 mt-1">Personel</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{totalHours}<span className="text-sm font-medium text-slate-400"> sa</span></p>
            <p className="text-xs text-slate-500 mt-1">Toplam Çalışma</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
            <p className={`text-2xl font-bold ${totalOvertime > 0 ? "text-amber-600" : "text-slate-900"}`}>
              {totalOvertime}<span className="text-sm font-medium text-slate-400"> sa</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">Fazla Mesai</p>
          </div>
          {hasCost && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
              <p className={`text-2xl font-bold ${totalOvertimeCost > 0 ? "text-red-600" : "text-slate-900"}`}>
                ₺{totalOvertimeCost.toLocaleString("tr-TR")}
              </p>
              <p className="text-xs text-slate-500 mt-1">Mesai Maliyeti (×1,5)</p>
            </div>
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
            <BarChart2 size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Bu ay için yayınlanan vardiya bulunamadı.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Ad Soyad</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Unvan</th>
                <th className="text-right px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Vardiya</th>
                <th className="text-right px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Toplam Saat</th>
                <th className="text-right px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Fazla Mesai</th>
                {hasCost && <th className="text-right px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Maliyet</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((row, i) => (
                <tr key={row.personnel_id} className={`hover:bg-slate-50/50 transition-colors ${i % 2 === 0 ? "" : "bg-slate-50/20"}`}>
                  <td className="px-5 py-3.5 font-medium text-slate-900">{row.name}</td>
                  <td className="px-5 py-3.5 text-slate-500">{row.title || "—"}</td>
                  <td className="px-5 py-3.5 text-right text-slate-700">{row.shift_count}</td>
                  <td className="px-5 py-3.5 text-right font-semibold text-slate-900">{row.total_hours} sa</td>
                  <td className="px-5 py-3.5 text-right">
                    {row.overtime_hours > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                        +{row.overtime_hours} sa
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  {hasCost && (
                    <td className="px-5 py-3.5 text-right text-slate-700">
                      {row.overtime_cost ? `₺${row.overtime_cost.toLocaleString("tr-TR")}` : <span className="text-slate-400">—</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="px-5 py-3.5 font-bold text-slate-900" colSpan={2}>Toplam</td>
                <td className="px-5 py-3.5 text-right font-bold text-slate-900">{totalShifts}</td>
                <td className="px-5 py-3.5 text-right font-bold text-slate-900">{totalHours} sa</td>
                <td className="px-5 py-3.5 text-right font-bold text-amber-700">{totalOvertime > 0 ? `+${totalOvertime} sa` : "—"}</td>
                {hasCost && <td className="px-5 py-3.5 text-right font-bold text-red-700">{totalOvertimeCost > 0 ? `₺${totalOvertimeCost.toLocaleString("tr-TR")}` : "—"}</td>}
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <p className="text-xs text-slate-400 text-center">
        Fazla mesai hesabı: lokasyon ayarlarındaki haftalık eşiği aşan çalışma süresi. Maliyet = mesai saati × saatlik ücret × 1,5 (%50 zamlı).
      </p>
    </div>
  );
}
