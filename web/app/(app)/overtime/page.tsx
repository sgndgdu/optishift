"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useManagerAuth } from "@/hooks/useAuth";
import { Clock, CheckCircle2, XCircle, Plus, X, AlertTriangle, TrendingUp, ChevronRight, User, Bell, ShieldAlert, Info, RotateCcw } from "lucide-react";

const LEGAL_MAX = 270; // İş Kanunu 41 — yıllık maksimum fazla mesai saati

function getMondayISO(d = new Date()) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function weekLabel(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  const fmt = (dt: Date) => dt.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  return `${fmt(d)} – ${fmt(end)}`;
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts * 1000;
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (h < 1) return "Az önce";
  if (h < 24) return `${h} saat önce`;
  if (d < 7) return `${d} gün önce`;
  return new Date(ts * 1000).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

function YtdBar({ hours, max }: { hours: number; max: number }) {
  const pct = Math.min((hours / max) * 100, 100);
  const color = pct >= 90 ? "bg-red-500" : pct >= 67 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">{hours.toFixed(0)}/{max}s</span>
    </div>
  );
}

export default function OvertimePage() {
  const router = useRouter();
  const { user, mounted } = useManagerAuth();

  const [tab, setTab] = useState<"pending" | "status" | "warnings">(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash === "#warnings") return "warnings";
    }
    return "pending";
  });
  const [pending, setPending] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [personnel, setPersonnel] = useState<any[]>([]);
  const [maxYtd, setMaxYtd] = useState(LEGAL_MAX);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  // Yeni kayıt formu
  const [showForm, setShowForm] = useState(false);
  const [fPersonnel, setFPersonnel] = useState("");
  const [fWeek, setFWeek] = useState(getMondayISO());
  const [fScheduled, setFScheduled] = useState<number>(45);
  const [fOvertime, setFOvertime] = useState<number>(3);
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const locId = useCallback(() =>
    user?.location_id || (typeof localStorage !== "undefined" ? localStorage.getItem("optishift_selected_location") || "" : ""),
    [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const lid = locId();
    try {
      const [pend, hist, pers, loc] = await Promise.all([
        fetch(`/api/overtime?location_id=${lid}&status=pending`).then(r => r.json()).catch(() => []),
        fetch(`/api/overtime?location_id=${lid}`).then(r => r.json()).catch(() => []),
        fetch(`/api/personnel?location_id=${lid}`).then(r => r.json()).catch(() => []),
        fetch(`/api/locations`).then(r => r.json()).catch(() => []),
      ]);
      setPending(Array.isArray(pend) ? pend : []);
      setHistory(Array.isArray(hist) ? hist.filter((r: any) => r.status !== "pending") : []);
      setPersonnel(Array.isArray(pers) ? pers.filter((p: any) => p.status !== "inactive") : []);

      const locData = Array.isArray(loc) ? loc.find((l: any) => l.id === lid) : null;
      if (locData?.rules?.max_ytd_overtime_hours) setMaxYtd(locData.rules.max_ytd_overtime_hours);
    } finally {
      setLoading(false);
    }
  }, [user, locId]);

  useEffect(() => {
    if (!mounted || !user) return;
    if (user.role !== "manager" && user.role !== "admin" && user.role !== "supervisor") {
      router.push("/dashboard");
      return;
    }
    load();
  }, [mounted, user, router, load]);

  // Konum değişince yenile
  useEffect(() => {
    const h = () => load();
    window.addEventListener("optishift_location_changed", h);
    return () => window.removeEventListener("optishift_location_changed", h);
  }, [load]);

  async function handleDecision(id: number, status: "approved" | "rejected" | "pending") {
    const res = await fetch("/api/overtime", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      showToast(status === "approved" ? "Onaylandı ✓" : status === "rejected" ? "Reddedildi" : "Geri alındı — tekrar beklemede");
      load();
    }
    else showToast("Bir hata oluştu");
  }

  async function handleCompTime(id: number, used: boolean) {
    const res = await fetch("/api/overtime", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: used ? "comp_time_used" : "comp_time_unused" }),
    });
    if (res.ok) { showToast(used ? "Serbest zaman kullandırıldı olarak işaretlendi" : "İşaret kaldırıldı"); load(); }
    else showToast("Bir hata oluştu");
  }

  async function handleCreate() {
    if (!fPersonnel) { showToast("Personel seçin"); return; }
    setSaving(true);
    const res = await fetch("/api/overtime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location_id: locId(),
        personnel_id: fPersonnel,
        week_start: fWeek,
        scheduled_hours: fScheduled,
        overtime_hours: fOvertime,
        note: fNote || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      showToast("Kayıt oluşturuldu");
      setShowForm(false);
      setFPersonnel(""); setFNote(""); setFOvertime(3); setFScheduled(45);
      load();
    } else {
      showToast("Bir hata oluştu");
    }
  }

  if (!mounted) return null;

  const atLimitCount = personnel.filter(p => (p.ytd_overtime_hours ?? 0) >= maxYtd * 0.9).length;

  // Mesai maliyeti: saat × saatlik ücret × 1,5 (%50 zamlı) — serbest zaman seçilenler hariç
  const wageById: Record<string, number> = {};
  for (const p of personnel) if (typeof p.hourly_wage === "number" && p.hourly_wage > 0) wageById[p.id] = p.hourly_wage;
  const monthCost = history
    .filter(r => r.status === "approved" && r.compensation_type !== "time_off" && isThisMonth(r.created_at) && wageById[r.personnel_id])
    .reduce((s, r) => s + r.overtime_hours * wageById[r.personnel_id] * 1.5, 0);
  const hasWages = Object.keys(wageById).length > 0;

  // Uyarı listesi — mevcut veriden türetilir, ek API çağrısı gerekmez
  const warnings = buildWarnings(personnel, history, maxYtd);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fazla Mesai</h1>
          <p className="text-sm text-slate-500 mt-0.5">Onay bekleyenler · YTD durum · Kayıt oluştur</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20"
        >
          <Plus size={16} />
          Yeni Kayıt
        </button>
      </div>

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Bekleyen Onay"
          value={pending.length}
          icon={<Clock size={18} className="text-amber-500" />}
          accent="amber"
        />
        <SummaryCard
          label="Bu Ay Onaylanan"
          value={history.filter(r => r.status === "approved" && isThisMonth(r.created_at)).length}
          icon={<CheckCircle2 size={18} className="text-emerald-500" />}
          accent="emerald"
        />
        <SummaryCard
          label="Limite Yakın"
          value={atLimitCount}
          icon={<AlertTriangle size={18} className="text-red-500" />}
          accent="red"
        />
        <SummaryCard
          label="Bu Ay Mesai Maliyeti"
          value={hasWages ? `₺${Math.round(monthCost).toLocaleString("tr-TR")}` : "—"}
          icon={<TrendingUp size={18} className="text-blue-500" />}
          accent="blue"
          hint={hasWages ? "onaylı · zamlı ücret ×1,5" : "personele saatlik ücret girin"}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {(["pending", "status", "warnings"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "pending" ? "Bekleyen Onaylar" : t === "status" ? "Personel Durumu" : "Uyarılar"}
            {t === "pending" && pending.length > 0 && (
              <span className="ml-2 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {pending.length}
              </span>
            )}
            {t === "warnings" && warnings.length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {warnings.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Yükleniyor…</div>
      ) : tab === "pending" ? (
        <PendingTab pending={pending} history={history} onDecision={handleDecision} onCompTime={handleCompTime} wageById={wageById} />
      ) : tab === "status" ? (
        <StatusTab personnel={personnel} maxYtd={maxYtd} />
      ) : (
        <WarningsTab warnings={warnings} />
      )}

      {/* Yeni Kayıt Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5 animate-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg">Yeni Mesai Kaydı</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <FormField label="Personel">
                <select
                  value={fPersonnel}
                  onChange={e => setFPersonnel(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                >
                  <option value="">— Seçin —</option>
                  {personnel.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Hafta Başlangıcı (Pazartesi)">
                <input
                  type="date"
                  value={fWeek}
                  onChange={e => setFWeek(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Planlanan Saat">
                  <input
                    type="number"
                    min={1} max={80} step={0.5}
                    value={fScheduled}
                    onChange={e => setFScheduled(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </FormField>
                <FormField label="Mesai Saati">
                  <input
                    type="number"
                    min={0.5} max={20} step={0.5}
                    value={fOvertime}
                    onChange={e => setFOvertime(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </FormField>
              </div>

              <FormField label="Not (opsiyonel)">
                <input
                  type="text"
                  placeholder="Üretim hattı fazla mesaisi…"
                  value={fNote}
                  onChange={e => setFNote(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </FormField>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                İptal
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-lg z-[100] animate-in slide-in-from-bottom-4 duration-200">
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Uyarı Üretici ───────────────────────────────────────────────────────────

type WarningLevel = "critical" | "high" | "info";
interface Warning {
  id: string;
  level: WarningLevel;
  title: string;
  detail: string;
  personnelName?: string;
}

function buildWarnings(personnel: any[], history: any[], maxYtd: number): Warning[] {
  const list: Warning[] = [];

  for (const p of personnel) {
    const ytd = p.ytd_overtime_hours ?? 0;
    const pct = ytd / maxYtd;

    if (ytd >= maxYtd) {
      list.push({
        id: `ytd-over-${p.id}`,
        level: "critical",
        title: "Yıllık mesai limiti aşıldı",
        detail: `${ytd.toFixed(0)} / ${maxYtd} saat — yasal sınır (İş K. m.41) geçildi`,
        personnelName: p.name,
      });
    } else if (pct >= 0.9) {
      list.push({
        id: `ytd-near-${p.id}`,
        level: "high",
        title: "Yıllık mesai limitine yaklaşıyor",
        detail: `${ytd.toFixed(0)} / ${maxYtd} saat — limitin %${Math.round(pct * 100)}'inde`,
        personnelName: p.name,
      });
    }

    // Yüksek mesai frekansı: son 4 haftada 3+ onaylı mesai kaydı
    const recentApproved = history.filter(
      r => r.personnel_id === p.id && r.status === "approved" &&
        r.created_at > Math.floor(Date.now() / 1000) - 28 * 86400
    );
    if (recentApproved.length >= 3) {
      list.push({
        id: `freq-${p.id}`,
        level: "info",
        title: "Yüksek mesai frekansı",
        detail: `Son 28 günde ${recentApproved.length} onaylı mesai kaydı`,
        personnelName: p.name,
      });
    }
  }

  // Sıralama: critical → high → info
  const order: Record<WarningLevel, number> = { critical: 0, high: 1, info: 2 };
  return list.sort((a, b) => order[a.level] - order[b.level]);
}

// ─── Alt Bileşenler ──────────────────────────────────────────────────────────

function SummaryCard({ label, value, icon, accent, hint }: { label: string; value: number | string; icon: React.ReactNode; accent: string; hint?: string }) {
  const bg: Record<string, string> = {
    amber: "bg-amber-50 border-amber-100",
    emerald: "bg-emerald-50 border-emerald-100",
    red: "bg-red-50 border-red-100",
    blue: "bg-blue-50 border-blue-100",
  };
  return (
    <div className={`rounded-2xl border p-4 ${bg[accent] ?? "bg-slate-50 border-slate-100"}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function PendingTab({ pending, history, onDecision, onCompTime, wageById }: {
  pending: any[];
  history: any[];
  onDecision: (id: number, status: "approved" | "rejected" | "pending") => void;
  onCompTime: (id: number, used: boolean) => void;
  wageById: Record<string, number>;
}) {
  return (
    <div className="space-y-6">
      {pending.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <CheckCircle2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Bekleyen onay yok</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pending.map(r => (
            <OvertimeRow key={r.id} record={r} onDecision={onDecision} wage={wageById[r.personnel_id]} />
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Geçmiş</p>
          <div className="space-y-2">
            {history.slice(0, 10).map(r => (
              <OvertimeRow key={r.id} record={r} readonly onUndo={onDecision} onCompTime={onCompTime} wage={wageById[r.personnel_id]} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OvertimeRow({ record: r, onDecision, readonly, onUndo, onCompTime, wage }: {
  record: any;
  onDecision?: (id: number, status: "approved" | "rejected") => void;
  readonly?: boolean;
  onUndo?: (id: number, status: "pending") => void;
  onCompTime?: (id: number, used: boolean) => void;
  wage?: number;
}) {
  const statusMap: Record<string, { label: string; cls: string }> = {
    pending:  { label: "Bekliyor",    cls: "bg-amber-50 text-amber-700 border-amber-200" },
    approved: { label: "Onaylandı",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    rejected: { label: "Reddedildi",  cls: "bg-red-50 text-red-600 border-red-200" },
  };
  const st = statusMap[r.status] ?? { label: r.status, cls: "bg-slate-100 text-slate-500 border-slate-200" };

  // Personel onayı (İş K. m.41) — kabulde telafi türü de gösterilir
  const compLabel = r.compensation_type === "time_off" ? "Serbest Zaman" : "Zamlı Ücret";
  const empChip =
    r.employee_status === "accepted"
      ? { label: `Personel kabul ✓ · ${compLabel}`, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
      : r.employee_status === "declined"
        ? { label: "Personel reddetti ✗", cls: "bg-red-50 text-red-600 border-red-200" }
        : { label: "Personel onayı bekleniyor", cls: "bg-slate-50 text-slate-500 border-slate-200" };

  const isCompTimeRecord = r.status === "approved" && r.compensation_type === "time_off";

  return (
    <div className="bg-white border border-slate-100 rounded-2xl px-5 py-4 flex items-center gap-4 hover:border-slate-200 transition-colors">
      <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
        <span className="text-sm font-bold text-indigo-600">{(r.personnel_name ?? "?").charAt(0).toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="font-semibold text-slate-900 text-sm">{r.personnel_name ?? "—"}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${empChip.cls}`}>{empChip.label}</span>
          {isCompTimeRecord && r.comp_time_used_at && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">İzin kullandırıldı ✓</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{r.week_start ? weekLabel(r.week_start) : "—"}</span>
          <span className="text-slate-300">·</span>
          <span><b className="text-slate-700">{r.overtime_hours}s</b> mesai</span>
          {wage && r.compensation_type !== "time_off" && (
            <>
              <span className="text-slate-300">·</span>
              <span title="mesai saati × saatlik ücret × 1,5 (%50 zamlı)">≈ <b className="text-slate-700">₺{Math.round(r.overtime_hours * wage * 1.5).toLocaleString("tr-TR")}</b></span>
            </>
          )}
          <span className="text-slate-300">·</span>
          <span>{r.scheduled_hours}s planlı</span>
          {r.created_at && <><span className="text-slate-300">·</span><span>{timeAgo(r.created_at)}</span></>}
        </div>
        {r.note && <p className="text-xs text-slate-400 mt-1 truncate">{r.note}</p>}
      </div>
      {!readonly && onDecision && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onDecision(r.id, "approved")}
            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
          >
            <CheckCircle2 size={13} />
            Onayla
          </button>
          <button
            onClick={() => onDecision(r.id, "rejected")}
            className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
          >
            <XCircle size={13} />
            Reddet
          </button>
        </div>
      )}
      {readonly && (r.status === "approved" || r.status === "rejected") ? (
        <div className="flex items-center gap-2 shrink-0">
          {isCompTimeRecord && !r.comp_time_used_at && onCompTime && (
            <button
              onClick={() => onCompTime(r.id, true)}
              title="Serbest zaman iznini kullandırdığını işaretle — bakiyeden düşer"
              className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
            >
              <CheckCircle2 size={13} />
              İzin Kullandırıldı
            </button>
          )}
          {onUndo && (
            <button
              onClick={() => onUndo(r.id, "pending")}
              title="Kararı geri al — kayıt tekrar beklemeye düşer, YTD yeniden hesaplanır"
              className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
            >
              <RotateCcw size={13} />
              Geri Al
            </button>
          )}
        </div>
      ) : readonly ? (
        <TrendingUp size={14} className="text-slate-300 shrink-0" />
      ) : null}
    </div>
  );
}

function WarningsTab({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <CheckCircle2 size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">Aktif uyarı yok</p>
        <p className="text-xs mt-1">Tüm personel yasal limitler içinde</p>
      </div>
    );
  }

  const cfg: Record<WarningLevel, { icon: React.ReactNode; bg: string; border: string; badge: string; badgeTxt: string; label: string }> = {
    critical: {
      icon: <ShieldAlert size={18} className="text-red-500 shrink-0" />,
      bg: "bg-red-50/60", border: "border-red-200",
      badge: "bg-red-100 text-red-700 border-red-300", badgeTxt: "Kritik", label: "KRİTİK",
    },
    high: {
      icon: <AlertTriangle size={18} className="text-amber-500 shrink-0" />,
      bg: "bg-amber-50/60", border: "border-amber-200",
      badge: "bg-amber-100 text-amber-700 border-amber-300", badgeTxt: "Yüksek", label: "YÜKSEK",
    },
    info: {
      icon: <Info size={18} className="text-blue-400 shrink-0" />,
      bg: "bg-blue-50/40", border: "border-blue-200",
      badge: "bg-blue-100 text-blue-700 border-blue-200", badgeTxt: "Bilgi", label: "BİLGİ",
    },
  };

  const groups = (["critical", "high", "info"] as WarningLevel[]).map(level => ({
    level,
    items: warnings.filter(w => w.level === level),
  })).filter(g => g.items.length > 0);

  return (
    <div className="space-y-5">
      {groups.map(({ level, items }) => {
        const c = cfg[level];
        return (
          <div key={level}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              {c.icon} {c.label} — {items.length} uyarı
            </p>
            <div className="space-y-2">
              {items.map(w => (
                <div key={w.id} className={`flex items-start gap-4 rounded-2xl border px-5 py-4 ${c.bg} ${c.border}`}>
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 border border-slate-100 shadow-sm">
                    <span className="text-xs font-bold text-slate-600">
                      {(w.personnelName ?? "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      {w.personnelName && (
                        <span className="font-bold text-slate-800 text-sm">{w.personnelName}</span>
                      )}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.badge}`}>
                        {c.badgeTxt}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-700">{w.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{w.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusTab({ personnel, maxYtd }: { personnel: any[]; maxYtd: number }) {
  const sorted = [...personnel].sort((a, b) => (b.ytd_overtime_hours ?? 0) - (a.ytd_overtime_hours ?? 0));

  if (sorted.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <User size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">Personel bulunamadı</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-50 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Personel</span>
        <span className="text-xs text-slate-400">YTD Limit: {maxYtd} saat</span>
      </div>
      <div className="divide-y divide-slate-50">
        {sorted.map(p => {
          const ytd = p.ytd_overtime_hours ?? 0;
          const pct = Math.min((ytd / maxYtd) * 100, 100);
          const isRed = pct >= 90;
          const isAmber = pct >= 67 && !isRed;

          return (
            <div key={p.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-indigo-600">{(p.name ?? "?").charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-semibold text-slate-800 truncate">{p.name}</span>
                  {isRed && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 shrink-0">
                      Limite Yakın
                    </span>
                  )}
                  {isAmber && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                      Dikkat
                    </span>
                  )}
                </div>
                <YtdBar hours={ytd} max={maxYtd} />
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-slate-900">{ytd.toFixed(0)}s</p>
                <p className="text-[10px] text-slate-400">YTD mesai</p>
              </div>
              <ChevronRight size={14} className="text-slate-300 shrink-0" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function isThisMonth(ts: number) {
  const d = new Date(ts * 1000);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}
