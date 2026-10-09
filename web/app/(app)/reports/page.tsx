"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Lock, Unlock, Scale, Timer, Sparkles } from "lucide-react";
import FairnessReport from "@/components/reports/FairnessReport";
import OvertimeReport from "@/components/reports/OvertimeReport";
import TeamReport from "@/components/reports/TeamReport";
import { isModuleOn } from "@/lib/moduleVisibility";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const downloadClass = "inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors";


/** Özet'in ay seçicisinin yanında: puantaj (CSV), aylık Excel ve ay kilidi (bordro dönemi) */
function PayrollTools({ month }: { month: string }) {
  const [periodLock, setPeriodLock] = useState<any>(null); // null = kilitli değil
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState("");
  const locationId = () => { try { return JSON.parse(localStorage.getItem("optishift_manager_user") ?? "{}")?.location_id ?? ""; } catch { return ""; } };
  useEffect(() => {
    let r = "";
    try { r = JSON.parse(localStorage.getItem("optishift_manager_user") ?? "{}")?.role ?? ""; } catch { /* boş */ }
    void Promise.resolve().then(() => setRole(r));
  }, []);
  const load = useCallback(async () => {
    const id = locationId();
    if (!id) return;
    const d = await fetch(`/api/payroll-periods?location_id=${id}&month=${month}`).then(r => r.json()).catch(() => null);
    setPeriodLock(Array.isArray(d) && d.length > 0 ? d[0] : null);
  }, [month]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const lock = async () => {
    setBusy(true);
    try { const r = await fetch("/api/payroll-periods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location_id: locationId(), month }) }); if (r.ok) await load(); }
    finally { setBusy(false); }
  };
  const unlock = async () => {
    if (!periodLock?.id) return;
    setBusy(true);
    try { const r = await fetch(`/api/payroll-periods?id=${periodLock.id}`, { method: "DELETE" }); if (r.ok) await load(); }
    finally { setBusy(false); }
  };
  // Kilit ay bitmeden (son hafta hariç) gösterilmez: yeni kullanıcıya anlamsız
  const showLock = !!periodLock || month < currentMonth() || new Date().getDate() >= 24;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={() => { const id = locationId(); if (id) window.location.href = `/api/reports/timesheet?location_id=${id}&month=${month}`; }}
        title="Her kişinin her gün ne zaman girip çıktığı. Bordro ve muhasebe programına aktarmak için CSV dosyası." className={downloadClass}>
        <Download size={15} /> Puantaj
      </button>
      <button onClick={() => { const id = locationId(); if (id) window.location.href = `/api/reports/monthly?location_id=${id}&month=${month}&format=xlsx`; }}
        title="Kişi kişi aylık çalışma ve fazla mesai, Excel dosyası" className={downloadClass}>
        <Download size={15} /> Excel
      </button>
      {showLock && (periodLock ? (
        (role === "admin" || role === "supervisor")
          ? <button onClick={unlock} disabled={busy} title={`${periodLock.locked_by_name ?? "Sorumlu"} kilitledi. Giriş/çıkış ve düzenleme yapılamaz.`} className={downloadClass}><Lock size={14} /> Kilitli, aç</button>
          : <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500"><Lock size={13} /> Ay kilitli</span>
      ) : (
        <button onClick={lock} disabled={busy} title="Puantajı onayladıktan sonra ayı kilitleyin. Böylece geçmiş kayıtlar değiştirilemez." className={downloadClass}>
          <Unlock size={14} /> Ayı kilitle
        </button>
      ))}
    </div>
  );
}

// ─── Sayfa: sekmeli Raporlar ─────────────────────────────────────────────────
// ?tab=adalet derin linki desteklenir (eski /fairness adresi buraya yönlendirir).

const REPORT_TABS = [
  // Özet (lib/reports/teamReport) ilk ve varsayılan: ay başı bildirimi buraya açılır (?tab=ozet&month=).
  // 2026-10-09: eski Aylık Özet ve Çalışma Süresi sekmeleri Özet'te birleşti (puantaj ve Excel ay seçicinin yanında)
  { id: "ozet",    label: "Özet",             icon: Sparkles },
  { id: "adalet",  label: "Adalet Puanı",     icon: Scale },
  { id: "mesai",   label: "Fazla Mesai",      icon: Timer },
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
    return REPORT_TABS.some(x => x.id === t) ? (t as ReportTab) : "ozet"; // eski ?tab=saatler de Özet'e düşer
  });

  // Fazla mesai sekmesi sadece Fazla Mesai Takibi açıkken
  const [overtimeOn, setOvertimeOn] = useState(false);
  const [locId, setLocId] = useState("");
  useEffect(() => {
    const loc = localStorage.getItem("optishift_selected_location") || "";
    if (!loc) return;
    void Promise.resolve().then(() => setLocId(loc));
    let stale = false;
    fetch(`/api/locations?id=${loc}`).then(res => (res.ok ? res.json() : null)).then(d => {
      const rules = Array.isArray(d) ? d[0]?.rules : d?.rules;
      if (!stale) setOvertimeOn(isModuleOn(rules, "overtime_tracking_enabled"));
    }).catch(() => {});
    return () => { stale = true; };
  }, []);

  const selectTab = (key: ReportTab) => {
    setTab(key);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url);
  };

  return (
    <Page>
      <PageHeader title="Raporlar" />

      <Tabs items={REPORT_TABS.filter(t => t.id !== "mesai" || overtimeOn)} value={tab} onChange={selectTab} />

      {tab === "ozet" ? <TeamReport locationId={locId} initialMonth={searchParams.get("month")} tools={m => <PayrollTools month={m} />} />
        : tab === "mesai" && overtimeOn ? <OvertimeReport /> : <FairnessReport />}
    </Page>
  );
}
