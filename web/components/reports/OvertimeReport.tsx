"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { trNum } from "@/lib/format";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useManagerAuth } from "@/hooks/useAuth";
import { Clock, CheckCircle2, Plus, AlertTriangle, TrendingUp, RotateCcw } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListItem, ListEmpty } from "@/components/ui/List";
import Link from "next/link";
import { Sheet, DetailRow, sheetPrimaryClass, sheetSecondaryClass } from "@/components/ui/Sheet";
import { pageActionClass } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { Tabs } from "@/components/ui/Tabs";

const inputClass = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20";

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

/** Fazla mesai kayıtları, yıllık durum ve uyarılar. Raporlar › Fazla Mesai sekmesinde gösterilir (2026-10-05: ayrı sayfa kalktı). */
export default function OvertimeReport() {
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
      showToast(status === "approved" ? "Onaylandı ✓" : status === "rejected" ? "Reddedildi" : "Geri alındı, tekrar beklemede");
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
    if (!fPersonnel) { showToast("Kişi seçin"); return; }
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
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Haftalık fazla mesai eşiğini aşan çalışmalar. Kayıtlar yayınlanan plandan oluşturulur, kararlar Onaylar&apos;da verilir.</p>
        <button onClick={() => setShowForm(true)} className={pageActionClass}>
          <Plus size={16} />
          Elle kayıt
        </button>
      </div>

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Bekleyen"
          value={pending.length}
          icon={Clock}
          tone="attention"
        />
        <StatCard
          label="Bu ay onaylı"
          value={history.filter(r => r.status === "approved" && isThisMonth(r.created_at)).length}
          icon={CheckCircle2}
          tone="positive"
        />
        <StatCard
          label="Limite yakın"
          value={atLimitCount}
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          label="Bu ay maliyet"
          value={hasWages ? `₺${Math.round(monthCost).toLocaleString("tr-TR")}` : "—"}
          icon={TrendingUp}
          tone="neutral"
          hint={hasWages ? "Onaylı, ücret × 1,5" : "Saatlik ücret girilmemiş"}
        />
      </div>

      <Tabs value={tab} onChange={setTab} items={[
        { id: "pending", label: "Kayıtlar", count: pending.length },
        { id: "status", label: "Yıllık durum" },
        { id: "warnings", label: "Uyarılar", count: warnings.length },
      ] as const} />

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Yükleniyor…</div>
      ) : tab === "pending" ? (
        <PendingTab pending={pending} history={history} onDecision={handleDecision} onCompTime={handleCompTime} wageById={wageById} />
      ) : tab === "status" ? (
        <StatusTab personnel={personnel} maxYtd={maxYtd} />
      ) : (
        <WarningsTab warnings={warnings} />
      )}

      <Sheet open={showForm} onClose={() => setShowForm(false)} title="Yeni mesai kaydı"
        description="Plan dışında doğan mesaiyi elle eklemek için"
        footer={<>
          <button onClick={() => setShowForm(false)} className={sheetSecondaryClass}>Vazgeç</button>
          <button onClick={handleCreate} disabled={saving} className={sheetPrimaryClass}>{saving ? "Kaydediliyor…" : "Kaydet"}</button>
        </>}>
        <div className="space-y-4">
          <FormField label="Kişi">
            <select value={fPersonnel} onChange={e => setFPersonnel(e.target.value)} className={inputClass}>
              <option value="">— Seçin —</option>
              {personnel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FormField>
          <FormField label="Hafta başı (Pazartesi)">
            <input type="date" value={fWeek} onChange={e => setFWeek(e.target.value)} className={inputClass} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Planlanan (saat)">
              <input type="number" min={1} max={80} step={0.5} value={fScheduled} onChange={e => setFScheduled(Number(e.target.value))} className={inputClass} />
            </FormField>
            <FormField label="Fazla mesai (saat)">
              <input type="number" min={0.5} max={20} step={0.5} value={fOvertime} onChange={e => setFOvertime(Number(e.target.value))} className={inputClass} />
            </FormField>
          </div>
          <FormField label="Not (isteğe bağlı)">
            <input type="text" placeholder="Üretim hattı fazla mesaisi…" value={fNote} onChange={e => setFNote(e.target.value)} className={inputClass} />
          </FormField>
        </div>
      </Sheet>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-lg z-[100] animate-in slide-in-from-bottom-4 duration-200">
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
        detail: `${ytd.toFixed(0)} / ${maxYtd}, yasal sınır (İş K. m.41) geçildi`,
        personnelName: p.name,
      });
    } else if (pct >= 0.9) {
      list.push({
        id: `ytd-near-${p.id}`,
        level: "high",
        title: "Yıllık mesai limitine yaklaşıyor",
        detail: `${ytd.toFixed(0)} / ${maxYtd}, sınırın %${Math.round(pct * 100)}'inde`,
        personnelName: p.name,
      });
    }

    // Sık fazla mesai: son 4 haftada 3+ onaylı mesai kaydı
    const recentApproved = history.filter(
      r => r.personnel_id === p.id && r.status === "approved" &&
        r.created_at > Math.floor(Date.now() / 1000) - 28 * 86400
    );
    if (recentApproved.length >= 3) {
      list.push({
        id: `freq-${p.id}`,
        level: "info",
        title: "Sık fazla mesai",
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


const STATUS: Record<string, { label: string; tone: PillTone }> = {
  pending:  { label: "Bekliyor",   tone: "attention" },
  approved: { label: "Onaylandı",  tone: "positive" },
  rejected: { label: "Reddedildi", tone: "danger" },
};

// Personel onayı (İş K. m.41): kısa durum metni
function employeeStatus(r: any): { label: string; tone: PillTone } {
  if (r.employee_status === "accepted") return { label: r.compensation_type === "time_off" ? "Kabul etti · serbest zaman" : "Kabul etti · zamlı ücret", tone: "positive" };
  if (r.employee_status === "declined") return { label: "Kişi reddetti", tone: "danger" };
  return { label: "Kişinin onayı bekleniyor", tone: "neutral" };
}

function recordCost(r: any, wage?: number) {
  return wage && r.compensation_type !== "time_off" ? Math.round(r.overtime_hours * wage * 1.5) : null;
}

function recordSubtitle(r: any, wage?: number) {
  const cost = recordCost(r, wage);
  return [`${trNum(r.overtime_hours)} sa mesai`, cost !== null ? `≈ ₺${cost.toLocaleString("tr-TR")}` : null, r.week_start ? weekLabel(r.week_start) : null]
    .filter(Boolean).join(" · ");
}

function PendingTab({ pending, history, onDecision, onCompTime, wageById }: {
  pending: any[];
  history: any[];
  onDecision: (id: number, status: "approved" | "rejected" | "pending") => void;
  onCompTime: (id: number, used: boolean) => void;
  wageById: Record<string, number>;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const open = [...pending, ...history].find(r => r.id === openId) ?? null;
  const act = (fn: () => void) => { fn(); setOpenId(null); };

  return (
    <div className="space-y-6">
      <List>
        {/* Karar TEK yerde: Onaylar sayfası (izin, vardiya değiştirme, düzenleme ile aynı akış). Burada sadece görünür. */}
        {pending.length > 0 && (
          <li className="px-4 py-2.5 text-xs text-slate-500 bg-slate-50">
            Bekleyen kayıtlar <Link href="/requests" className="font-semibold text-forest-700 hover:underline">Onaylar</Link> sayfasında onaylanır.
          </li>
        )}
        {pending.length === 0 ? <ListEmpty>Onay bekleyen mesai yok.</ListEmpty> : pending.map(r => {
          return (
            <ListItem key={r.id} onClick={() => setOpenId(r.id)}
              leading={<Avatar name={r.personnel_name ?? "?"} />}
              title={r.personnel_name ?? "—"}
              subtitle={recordSubtitle(r, wageById[r.personnel_id])}
              trailing={r.employee_status === "declined" ? <StatusPill tone="danger">Reddetti</StatusPill>
                : r.employee_status === "accepted" ? <StatusPill tone="positive">Kabul etti</StatusPill>
                : undefined}
            />
          );
        })}
      </List>

      {history.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-slate-900">Geçmiş</h2>
          <List>
            {history.slice(0, 10).map(r => {
              const st = STATUS[r.status] ?? { label: r.status, tone: "neutral" as PillTone };
              return (
                <ListItem key={r.id} onClick={() => setOpenId(r.id)}
                  leading={<Avatar name={r.personnel_name ?? "?"} />}
                  title={r.personnel_name ?? "—"}
                  subtitle={recordSubtitle(r, wageById[r.personnel_id])}
                  trailing={<StatusPill tone={st.tone}>{st.label}</StatusPill>}
                />
              );
            })}
          </List>
        </section>
      )}

      {open && (() => {
        const st = STATUS[open.status] ?? { label: open.status, tone: "neutral" as PillTone };
        const emp = employeeStatus(open);
        const cost = recordCost(open, wageById[open.personnel_id]);
        const isCompTime = open.status === "approved" && open.compensation_type === "time_off";
        return (
          <Sheet open onClose={() => setOpenId(null)} title={open.personnel_name ?? "Mesai kaydı"}
            description={open.week_start ? `${weekLabel(open.week_start)} haftası` : undefined}
            footer={open.status === "pending" ? (
              <Link href="/requests" className={sheetPrimaryClass}>Onaylar&apos;da karar ver</Link>
            ) : <>
              {isCompTime && !open.comp_time_used_at && (
                <button onClick={() => act(() => onCompTime(open.id, true))} className={sheetSecondaryClass}
                  title="Serbest zaman iznini kullandırdığınızı işaretleyin, bakiyeden düşer">İzin kullandırıldı</button>
              )}
              <button onClick={() => act(() => onDecision(open.id, "pending"))} className={sheetSecondaryClass}
                title="Kayıt tekrar beklemeye düşer, yıllık toplam yeniden hesaplanır">
                <span className="inline-flex items-center gap-1.5"><RotateCcw size={14} /> Kararı geri al</span>
              </button>
            </>}>
            <DetailRow label="Durum"><StatusPill tone={st.tone}>{st.label}</StatusPill></DetailRow>
            <DetailRow label="Kişinin onayı"><StatusPill tone={emp.tone}>{emp.label}</StatusPill></DetailRow>
            <DetailRow label="Mesai">{open.overtime_hours} saat</DetailRow>
            <DetailRow label="Planlanan">{open.scheduled_hours}</DetailRow>
            {cost !== null && <DetailRow label="Tahmini maliyet">₺{cost.toLocaleString("tr-TR")} (ücret × 1,5)</DetailRow>}
            {isCompTime && <DetailRow label="Serbest zaman">{open.comp_time_used_at ? "Kullandırıldı" : `${open.overtime_hours * 1.5} saat izin hakkı`}</DetailRow>}
            {open.note && <DetailRow label="Not">{open.note}</DetailRow>}
            {open.created_at && <DetailRow label="Oluşturuldu">{timeAgo(open.created_at)}</DetailRow>}
          </Sheet>
        );
      })()}
    </div>
  );
}

const WARNING_TONE: Record<WarningLevel, { tone: PillTone; label: string }> = {
  critical: { tone: "danger", label: "Kritik" },
  high:     { tone: "attention", label: "Yüksek" },
  info:     { tone: "info", label: "Bilgi" },
};

function WarningsTab({ warnings }: { warnings: Warning[] }) {
  return (
    <List>
      {warnings.length === 0 ? <ListEmpty>Uyarı yok, herkes yasal sınırların içinde.</ListEmpty> : warnings.map(w => (
        <ListItem key={w.id}
          leading={<Avatar name={w.personnelName ?? "?"} />}
          title={w.personnelName ?? w.title}
          subtitle={`${w.title} · ${w.detail}`}
          trailing={<StatusPill tone={WARNING_TONE[w.level].tone}>{WARNING_TONE[w.level].label}</StatusPill>}
        />
      ))}
    </List>
  );
}

function StatusTab({ personnel, maxYtd }: { personnel: any[]; maxYtd: number }) {
  const sorted = [...personnel].sort((a, b) => (b.ytd_overtime_hours ?? 0) - (a.ytd_overtime_hours ?? 0));
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Bu yıl yapılan onaylı fazla mesai. Yasal sınır yılda {maxYtd} saat.</p>
      <List>
        {sorted.length === 0 ? <ListEmpty>Kimse bulunamadı.</ListEmpty> : sorted.map(p => {
          const ytd = p.ytd_overtime_hours ?? 0;
          const pct = Math.min((ytd / maxYtd) * 100, 100);
          return (
            <ListItem key={p.id}
              leading={<Avatar name={p.name ?? "?"} />}
              title={p.name}
              subtitle={<span className="block mt-1"><YtdBar hours={ytd} max={maxYtd} /></span>}
              trailing={pct >= 90 ? <StatusPill tone="danger">Limite yakın</StatusPill>
                : pct >= 67 ? <StatusPill tone="attention">Dikkat</StatusPill> : undefined}
            />
          );
        })}
      </List>
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
