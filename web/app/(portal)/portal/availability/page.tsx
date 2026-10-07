"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Save, Edit2, ChevronLeft, ChevronRight, Check, AlertCircle, X, CalendarCheck, Copy } from "lucide-react";
import Link from "next/link";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";

// ── Types ──────────────────────────────────────────────────────────────────
type Status = "available" | "preferred_not" | "unavailable";
interface DayData { status: Status; start: string; end: string; shiftId?: string | null; }
interface ShiftDef { id: string; name: string; start: string; end: string; base_points?: number; }

const DAYS      = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
// start/end boş = tüm gün uygun (motor aralık uygulamaz). Aralık sadece çalışan seçerse kaydedilir.
const DEFAULT_DAY: DayData = { status: "available", start: "", end: "" };
const CUSTOM_DEFAULT = { start: "08:00", end: "22:00" };

const S = {
  available:    { label: "Uygunum", short: "Uygun",  icon: <Check size={13}/>,       bg: "bg-emerald-500", text: "text-white", light: "bg-emerald-50", ltext: "text-emerald-700", border: "border-emerald-400", fill: "bg-emerald-400", dot: "bg-emerald-400", thumb: "" },
  preferred_not:{ label: "Tercih etmem", short: "Tercih etmem",   icon: <AlertCircle size={13}/>, bg: "bg-amber-400",   text: "text-white", light: "bg-amber-50",   ltext: "text-amber-700",   border: "border-amber-400",   fill: "bg-amber-400",   dot: "bg-amber-400",   thumb: "avail-amber" },
  unavailable:  { label: "Gelemem",  short: "Gelemem", icon: <X size={13}/>,           bg: "bg-rose-500",    text: "text-white", light: "bg-rose-50",    ltext: "text-rose-600",    border: "border-rose-400",    fill: "bg-rose-400",    dot: "bg-rose-400",    thumb: "" },
} as const;

// ── Utils ──────────────────────────────────────────────────────────────────
const TRACK_MAX = 1800; // 30 saat — ertesi gün 06:00'a kadar

function toMin(t: string) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}
// "26:00" formatı: ertesi gün 02:00 = 1560 dk → "26:00" olarak saklanır
function toTime(m: number) {
  const c = Math.max(0, Math.min(TRACK_MAX, Math.round(m / 15) * 15));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
}
// Ekranda gösterim: 26:00 → "02:00" + "+1" badge
function displayTime(m: number) {
  const mod = m % 1440;
  return `${String(Math.floor(mod / 60)).padStart(2, "0")}:${String(mod % 60).padStart(2, "0")}`;
}
// Shift def'lerin "02:00" gibi ertesi gün biten saatlerini "26:00" formatına çevirir
function shiftEndToAvailEnd(start: string, end: string): string {
  const s = toMin(start);
  const e = toMin(end);
  if (e <= s) return toTime(e + 1440);
  return end;
}

function weekStart(offset: number) {
  const now = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff + offset * 7);
  const y = mon.getFullYear();
  const m = String(mon.getMonth() + 1).padStart(2, "0");
  const d = String(mon.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function weekLabel(ws: string) {
  const s = new Date(ws + "T00:00:00"), e = new Date(ws + "T00:00:00");
  e.setDate(e.getDate() + 6);
  return `${s.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })} – ${e.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}`;
}

// ── Saat seçici kart ────────────────────────────────────────────────────────
function TimePicker({ currentMin, isEnd, statusCfg, onApply, onClose }: {
  currentMin: number; isEnd: boolean;
  statusCfg: typeof S[Status];
  onApply: (m: number) => void;
  onClose: () => void;
}) {
  const maxHour = isEnd ? 29 : 23;
  const [hour, setHour] = useState(Math.floor(currentMin / 60));
  const [min,  setMin]  = useState(Math.round((currentMin % 60) / 15) * 15 % 60);

  const nextDay    = hour >= 24;
  const dispHour   = nextDay ? hour - 24 : hour;
  const totalMin   = hour * 60 + min;

  return (
    <div className={`mt-2 rounded-2xl border-2 p-4 ${statusCfg.light} ${statusCfg.border} animate-in slide-in-from-bottom-4 duration-200`}>
      <div className="flex items-center justify-center gap-4 mb-4">

        {/* Saat */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Saat</span>
          <button onClick={() => setHour(h => Math.min(maxHour, h + 1))}
            className="w-9 h-9 bg-white rounded-xl shadow-sm text-slate-600 font-bold text-lg flex items-center justify-center active:scale-95 transition-transform">+</button>
          <div className="text-center min-w-[52px]">
            {nextDay && <div className="text-[8px] text-ember-500 font-bold mb-0.5">ertesi gün</div>}
            <div className={`text-3xl font-bold tabular-nums leading-none ${nextDay ? "text-ember-700" : "text-slate-800"}`}>
              {String(dispHour).padStart(2, "0")}
            </div>
          </div>
          <button onClick={() => setHour(h => Math.max(0, h - 1))}
            className="w-9 h-9 bg-white rounded-xl shadow-sm text-slate-600 font-bold text-lg flex items-center justify-center active:scale-95 transition-transform">−</button>
        </div>

        <span className="text-3xl font-bold text-slate-300 mb-1">:</span>

        {/* Dakika — 4 pill */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Dakika</span>
          <div className="grid grid-cols-2 gap-1.5">
            {[0, 15, 30, 45].map(m => (
              <button key={m} onClick={() => setMin(m)}
                className={`w-12 h-9 rounded-xl text-sm font-bold transition-all ${
                  min === m ? `${statusCfg.bg} text-white shadow-sm` : "bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                }`}>
                {String(m).padStart(2, "0")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Önizleme */}
      <div className="text-center text-xs text-slate-400 font-medium mb-3">
        {nextDay
          ? <span>Ertesi gün <span className="font-bold text-ember-600">{String(dispHour).padStart(2,"0")}:{String(min).padStart(2,"0")}</span></span>
          : <span className="font-bold text-slate-600">{String(dispHour).padStart(2,"0")}:{String(min).padStart(2,"0")}</span>
        }
      </div>

      <div className="flex gap-2">
        <button onClick={onClose}
          className="flex-1 bg-white border border-slate-200 text-slate-500 font-bold py-2.5 rounded-xl text-sm">
          İptal
        </button>
        <button onClick={() => onApply(totalMin)}
          className={`flex-[2] ${statusCfg.bg} text-white font-bold py-2.5 rounded-xl text-sm shadow-sm`}>
          Uygula
        </button>
      </div>
    </div>
  );
}

// ── Dual-handle Range Slider (30 saat — ertesi gün 06:00'a kadar) ──────────
function RangeSlider({ start, end, status, onChange }: {
  start: string; end: string; status: Status;
  onChange: (s: string, e: string) => void;
}) {
  const [picker, setPicker] = useState<"start" | "end" | null>(null);

  const sMin      = toMin(start || "08:00");
  const eMin      = toMin(end   || "22:00");
  const isNextDay = eMin > 1440;
  const dur       = eMin - sMin;
  const cfg       = S[status];
  const durLabel  = dur > 0 ? `${Math.floor(dur / 60)}s ${dur % 60 > 0 ? dur % 60 + "dk" : ""}`.trim() : "—";
  const startPct  = (sMin / TRACK_MAX) * 100;
  const endPct    = (eMin / TRACK_MAX) * 100;
  const midPct    = (1440 / TRACK_MAX) * 100;

  return (
    <div className="pt-2 pb-1 px-1">
      {/* Track */}
      <div className="relative h-10">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-2 bg-slate-200 rounded-full">
          <div className={`absolute h-full rounded-full ${cfg.fill}`}
            style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }} />
          <div className="absolute top-[-4px] bottom-[-4px] w-[2px] bg-slate-400 rounded-full opacity-50"
            style={{ left: `${midPct}%` }} />
        </div>
        <input type="range" min={0} max={TRACK_MAX - 30} step={15} value={sMin}
          style={{ zIndex: sMin >= TRACK_MAX - 60 ? 5 : 3 }}
          className={`avail-range ${cfg.thumb}`}
          onInput={e => { const v = Number((e.target as HTMLInputElement).value); if (v < eMin) { onChange(toTime(v), end); setPicker(null); }}} />
        <input type="range" min={15} max={TRACK_MAX} step={15} value={eMin}
          style={{ zIndex: sMin >= TRACK_MAX - 60 ? 3 : 5 }}
          className={`avail-range ${cfg.thumb}`}
          onInput={e => { const v = Number((e.target as HTMLInputElement).value); if (v > sMin) { onChange(start, toTime(v)); setPicker(null); }}} />
      </div>

      {/* Saat işaretleri */}
      <div className="flex justify-between text-xs font-semibold mt-0.5">
        {["00:00","06:00","12:00","18:00","00:00","06:00"].map((t, i) => (
          <span key={i} className={i === 4 ? "text-slate-600 font-bold" : "text-slate-400"}>{t}</span>
        ))}
      </div>

      {/* Tıklanabilir zaman gösterimi */}
      <div className="flex items-end justify-between mt-3">
        <button onClick={() => setPicker(p => p === "start" ? null : "start")}
          className={`text-left rounded-xl px-2 py-1 -ml-2 transition-colors ${picker === "start" ? cfg.light : "hover:bg-slate-50"}`}>
          <div className="text-xs font-semibold text-slate-400 mb-0.5">Başlangıç</div>
          <div className="text-2xl font-bold text-slate-800 tabular-nums leading-none">{displayTime(sMin)}</div>
        </button>

        <div className={`text-xs font-semibold px-2.5 py-1 rounded-full mb-0.5 ${cfg.light} ${cfg.ltext}`}>
          {durLabel}
        </div>

        <button onClick={() => setPicker(p => p === "end" ? null : "end")}
          className={`text-right rounded-xl px-2 py-1 -mr-2 transition-colors ${picker === "end" ? cfg.light : "hover:bg-slate-50"}`}>
          <div className="text-xs font-semibold text-slate-400 mb-0.5 flex items-center justify-end gap-1">
            Bitiş
            {isNextDay && <StatusPill tone="info">+1</StatusPill>}
          </div>
          <div className={`text-2xl font-bold tabular-nums leading-none ${isNextDay ? "text-ember-700" : "text-slate-800"}`}>
            {displayTime(eMin)}
          </div>
        </button>
      </div>

      {/* Picker kartı */}
      {picker === "start" && (
        <TimePicker
          currentMin={sMin} isEnd={false} statusCfg={cfg}
          onApply={m => { if (m < eMin) onChange(toTime(m), end); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "end" && (
        <TimePicker
          currentMin={eMin} isEnd={true} statusCfg={cfg}
          onApply={m => { if (m > sMin) onChange(start, toTime(m)); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function PortalAvailability() {
  const router = useRouter();
  const [user,        setUser]        = useState<any>(null);
  const [mounted,     setMounted]     = useState(false);
  const [days,        setDays]        = useState<DayData[]>(Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY })));
  const [weekOffset,  setWeekOffset]  = useState(1);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [weekPublished, setWeekPublished] = useState(false); // plan yayınlandıysa uygunluk artık planı etkilemez
  const [loading,     setLoading]     = useState(false);
  const [fetchLoading,setFetchLoading]= useState(false);
  const [shiftDefs,   setShiftDefs]   = useState<ShiftDef[]>([]);
  const [maxYellow,   setMaxYellow]   = useState(1);
  const [collectionEnabled, setCollectionEnabled] = useState(true); // uygunluk toplama kapalıysa giriş UI'ı gösterilmez
  const [yellowWarn,  setYellowWarn]  = useState<string | null>(null);
  // Saat seçenekleri varsayılan kapalı: sadece "Saat sınırı ekle" denen ya da saati olan günde açılır
  const [expanded,    setExpanded]    = useState<Set<number>>(new Set());
  const [copyMsg,     setCopyMsg]     = useState<string | null>(null);

  const ws = weekStart(weekOffset);

  const load = useCallback(async () => {
    if (!user?.personnel_id) return;
    setFetchLoading(true);
    try {
      const pub = user.location_id
        ? await fetch(`/api/shifts?location_id=${user.location_id}&week_start=${ws}`).then(x => x.json()).catch(() => [])
        : [];
      setWeekPublished(Array.isArray(pub) && pub.some((x: any) => x.kind !== "on_call"));
      const r = await fetch(`/api/availability?personnel_id=${user.personnel_id}&week_start=${ws}`);
      const d = await r.json();
      if (typeof d.max_preferred_not_days === "number") setMaxYellow(d.max_preferred_not_days);
      if (d.exists && d.days) {
        setDays(d.days.map((x: any) => ({ status: x.status || "available", start: x.start || "", end: x.end || "" })));
        setIsSubmitted(true);
      } else {
        setDays(Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY })));
        setIsSubmitted(false);
      }
    } catch {
      setDays(Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY })));
      setIsSubmitted(false);
    }
    setFetchLoading(false);
  }, [user?.personnel_id, ws]);

  useEffect(() => {
    try {
      const p = localStorage.getItem("optishift_portal_user");
      if (p) {
        const u = JSON.parse(p);
        setUser(u);
        if (u?.location_id) {
          fetch(`/api/locations?id=${u.location_id}`)
            .then(r => r.json())
            .then(d => {
              const loc = Array.isArray(d) ? d[0] : d;
              if (loc?.shift_definitions) {
                const raw = typeof loc.shift_definitions === "string"
                  ? JSON.parse(loc.shift_definitions)
                  : loc.shift_definitions;
                setShiftDefs(Array.isArray(raw) ? raw : []);
              }
              if (loc?.rules) {
                try {
                  const rules = typeof loc.rules === "string" ? JSON.parse(loc.rules) : loc.rules;
                  setCollectionEnabled(rules?.availability_collection_enabled !== false);
                } catch { /* varsayılan: açık */ }
              }
            })
            .catch(() => {});
        }
      }
      setMounted(true);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!user) { router.push("/login"); return; }
    load();
  }, [mounted, user, load, router]);

  const setStatus = (i: number, s: Status) => {
    // Sarı gün hakkı: haftada en fazla maxYellow gün "Esnek" seçilebilir
    if (s === "preferred_not") {
      const usedYellow = days.filter((d, j) => j !== i && d.status === "preferred_not").length;
      if (usedYellow >= maxYellow) {
        setYellowWarn(`Haftada en fazla ${maxYellow} gün "Tercih etmem" seçebilirsiniz. Gelemeyeceğiniz günler için "Gelemem"i seçin.`);
        setTimeout(() => setYellowWarn(null), 4000);
        return;
      }
    }
    setDays(prev => prev.map((d, j) => j === i ? { ...d, status: s } : d));
  };
  const setTime = (i: number, s: string, e: string) =>
    setDays(prev => prev.map((d, j) => j === i ? { ...d, start: s, end: e, shiftId: null } : d));
  const setShift = (i: number, def: ShiftDef) =>
    setDays(prev => prev.map((d, j) => j === i
      ? { ...d, start: def.start, end: shiftEndToAvailEnd(def.start, def.end), shiftId: def.id }
      : d));

  // Geçen haftanın uygunluğunu bu haftaya kopyala (gönderilmeden önce düzenlenebilir)
  // Geçen hafta girilmiş uygunluk yoksa "Geçen haftanın aynısı" gösterilmez (ilk hafta)
  const [hasPrevWeek, setHasPrevWeek] = useState(false);
  useEffect(() => {
    if (!user?.personnel_id) return;
    let stale = false;
    fetch(`/api/availability?personnel_id=${user.personnel_id}&week_start=${weekStart(weekOffset - 1)}`)
      .then(r => (r.ok ? r.json() : null)).then(d => { if (!stale) setHasPrevWeek(!!d?.exists); }).catch(() => {});
    return () => { stale = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.personnel_id, weekOffset]);

  const copyLastWeek = async () => {
    if (!user?.personnel_id) return;
    try {
      const r = await fetch(`/api/availability?personnel_id=${user.personnel_id}&week_start=${weekStart(weekOffset - 1)}`);
      const d = await r.json();
      if (d?.exists && Array.isArray(d.days)) {
        setDays(d.days.map((x: any) => ({ status: x.status || "available", start: x.start || "", end: x.end || "" })));
        setCopyMsg("Geçen haftanın uygunluğu kopyalandı. Kontrol edip gönderin.");
      } else {
        setCopyMsg("Geçen hafta için girilmiş uygunluk yok.");
      }
    } catch {
      setCopyMsg("Kopyalanamadı, tekrar deneyin.");
    }
    setTimeout(() => setCopyMsg(null), 4000);
  };

  const confirmSave = async () => {
    setLoading(true);
    try {
      await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personnel_id: user.personnel_id,
          week_start: ws,
          days: days.map(d => ({
            status: d.status,
            start: d.status !== "unavailable" && d.start ? d.start : null,
            end:   d.status !== "unavailable" && d.end   ? d.end   : null,
          })),
        }),
      });
      setIsSubmitted(true);
    } catch {}
    setLoading(false);
  };

  const revoke = async () => {
    setLoading(true);
    try {
      await fetch(`/api/availability?personnel_id=${user.personnel_id}&week_start=${ws}`, { method: "DELETE" });
      setIsSubmitted(false);
      setDays(Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY })));
    } catch {}
    setLoading(false);
  };

  if (!mounted) return null;

  // Uygunluk toplama bu işletmede kapalı — giriş UI'ı yerine bilgi kartı
  if (!collectionEnabled) {
    return (
      <Page className="animate-in fade-in duration-300">
        <PageHeader title="Uygunluk" />
        <div className="flex flex-col items-center text-center gap-3 bg-white border border-slate-200 rounded-2xl px-6 py-10">
          <div className="w-12 h-12 rounded-2xl bg-forest-50 flex items-center justify-center">
            <CalendarCheck size={22} className="text-forest-500" />
          </div>
          <p className="text-lg font-bold text-slate-900 tracking-tight">Bu işletmede vardiyaları sorumlunuz planlıyor</p>
          <p className="text-sm text-slate-500 max-w-xs">
            Uygunluk girişi bu işletmede kapalı. Yayınlanan vardiyalarınızı Vardiyalar sayfasından görebilirsiniz.
          </p>
          <Link href="/portal/calendar"
            className="mt-2 text-sm font-bold text-white bg-forest-600 hover:bg-forest-700 px-5 py-2.5 rounded-xl transition-colors">
            Vardiyalarımı Gör
          </Link>
        </div>
      </Page>
    );
  }

  // Her gün için tarih hesapla (ws = Pazartesi tarihi, YYYY-MM-DD)
  const [wsY, wsM, wsD] = ws.split("-").map(Number);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(wsY, wsM - 1, wsD + i);
    return date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Page className="animate-in fade-in duration-300">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <PageHeader title="Uygunluk" description={weekLabel(ws)} actions={
        <div className="flex items-center bg-slate-100 rounded-2xl p-1 shrink-0 gap-0.5">
          <button onClick={() => setWeekOffset(o => Math.max(0, o - 1))} disabled={weekOffset === 0}
            className="p-2 rounded-xl text-slate-500 hover:bg-white disabled:opacity-30 transition-all">
            <ChevronLeft size={15} />
          </button>
          <span className="text-xs font-semibold text-slate-600 px-1.5 min-w-[72px] text-center">
            {weekOffset === 0 ? "Bu hafta" : weekOffset === 1 ? "Gelecek hafta" : `${weekOffset} hafta sonra`}
          </span>
          <button onClick={() => setWeekOffset(o => o + 1)}
            className="p-2 rounded-xl text-slate-500 hover:bg-white transition-all">
            <ChevronRight size={15} />
          </button>
        </div>
      } />

      {/* ── Plan yayınlandı: uygunluk artık planı değiştirmez ─────────────────── */}
      {weekPublished && !fetchLoading && (
        <div className="flex items-center gap-3 bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3">
          <CalendarCheck size={18} className="text-sky-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-sky-800">Bu haftanın planı yayınlandı</p>
            <p className="text-xs text-sky-700">Değişiklik için Talepler&apos;den izin ya da vardiya değiştirme isteyebilirsiniz.</p>
          </div>
          <Link href="/portal/requests"
            className="text-xs font-semibold text-sky-700 bg-white border border-sky-200 px-3 py-1.5 rounded-xl hover:bg-sky-50 transition-colors shrink-0">
            Talepler
          </Link>
        </div>
      )}

      {/* ── Gönderildi uyarısı ──────────────────────────────────────────────── */}
      {isSubmitted && !weekPublished && !fetchLoading && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
          <Check size={18} className="text-emerald-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-emerald-800">Uygunluk gönderildi</p>
            <p className="text-xs text-emerald-600">Değiştirmek isterseniz aşağıdaki &quot;Düzenle&quot;ye basın.</p>
          </div>
        </div>
      )}

      {/* ── Gün kartları ────────────────────────────────────────────────────── */}
      {fetchLoading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <div key={i} className="h-40 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className={`space-y-3 ${isSubmitted || weekPublished ? "opacity-60 pointer-events-none" : ""}`}>
          {yellowWarn && (
            <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-300 rounded-2xl text-xs font-semibold text-amber-800">
              <AlertCircle size={14} className="shrink-0 text-amber-500" />
              {yellowWarn}
            </div>
          )}
          <p className="text-xs text-slate-500 px-1">
            Başlangıçta bütün günler uygun olarak işaretlidir. Sadece gelemeyeceğiniz ya da çalışmayı tercih etmediğiniz günleri değiştirin.
          </p>
          <div className="flex items-center justify-between gap-2 px-1">
            {hasPrevWeek ? (
            <button onClick={copyLastWeek}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              <Copy size={13} /> Geçen haftanın aynısı
            </button>
            ) : <span />}
            <span className="text-xs text-slate-400 font-medium text-right">
              &quot;Tercih etmem&quot; hakkı: <span className="font-bold text-amber-600">{days.filter(d => d.status === "preferred_not").length}/{maxYellow}</span>
            </span>
          </div>
          {copyMsg && <p className="text-xs font-semibold text-forest-700 px-1">{copyMsg}</p>}
          {/* 7 gün tek liste (DESIGN.md §2): gün başına ayrı kart yok */}
          <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
          {DAYS.map((name, i) => {
            const d = days[i];
            const cfg = S[d.status];
            return (
              <li key={i}>
                <div className="px-4 py-3">
                  {/* Başlık satırı */}
                  {/* Gün adı üstte, üç seçenek altta tam genişlik (telefonda 3. düğme kenara sıkışıyordu) */}
                  <div className={`space-y-2 ${d.status !== "unavailable" && (expanded.has(i) || d.start) ? "mb-4" : ""}`}>
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-slate-900 text-sm leading-tight">{name}</span>
                      <span className="text-xs font-semibold text-slate-400">{weekDates[i]}</span>
                    </div>
                    <div className="flex gap-1.5">
                      {(["available","preferred_not","unavailable"] as Status[]).map(s => {
                        const c = S[s];
                        const active = d.status === s;
                        return (
                          <button key={s} onClick={() => setStatus(i, s)}
                            className={`flex items-center justify-center gap-1 flex-1 min-h-[44px] px-1 rounded-xl text-xs font-semibold transition-all ${
                              active
                                ? `${c.bg} ${c.text} shadow-sm`
                                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            }`}>
                            {c.icon}
                            <span>{c.short}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Saat seçimi: Tüm gün (varsayılan) · belirli vardiya · özel saat. İstenirse açılır. */}
                  {d.status !== "unavailable" && !expanded.has(i) && !d.start && (
                    <button onClick={() => setExpanded(prev => new Set(prev).add(i))}
                      className="mt-1 min-h-[44px] text-xs font-semibold text-slate-500 hover:text-primary">
                      + Saat sınırı ekle
                    </button>
                  )}
                  {d.status !== "unavailable" && (expanded.has(i) || !!d.start) && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {(() => {
                        const chip = (active: boolean) => `flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                          active ? `${cfg.bg} ${cfg.text} border-transparent shadow-sm` : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"}`;
                        return (
                          <>
                            <button onClick={() => setTime(i, "", "")} className={chip(!d.start)}>Tüm gün</button>
                            {shiftDefs.map(def => {
                              const active = d.shiftId === def.id;
                              return (
                                <button key={def.id} onClick={() => setShift(i, def)} className={chip(active)}>
                                  <span>{def.name}</span>
                                  <span className={active ? "opacity-80" : "opacity-50"}>{def.start}–{def.end}</span>
                                </button>
                              );
                            })}
                            <button onClick={() => { if (!d.start || d.shiftId) setTime(i, d.start || CUSTOM_DEFAULT.start, d.end || CUSTOM_DEFAULT.end); }}
                              className={chip(!!d.start && !d.shiftId)}>
                              Özel saat
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  )}
                  {d.status !== "unavailable" && d.start && (
                    <p className="text-xs text-slate-500 mb-1">
                      {d.status === "available"
                        ? "Bu aralığın dışına vardiya yazılmaz."
                        : "Mümkünse bu aralığın dışına vardiya yazılmaz."}
                    </p>
                  )}

                  {/* Saat aralığı (özel saat ya da vardiya seçildiyse) */}
                  {d.status !== "unavailable" && d.start && (
                    <RangeSlider
                      start={d.start} end={d.end} status={d.status}
                      onChange={(s, e) => setTime(i, s, e)}
                    />
                  )}
                </div>
              </li>
            );
          })}
          </ul>
        </div>
      )}

      {/* ── Gönder butonu — inline, nav bar clearance layout'un pb-24'ünden geliyor ── */}
      {weekPublished ? null : !isSubmitted ? (
        <button onClick={confirmSave} disabled={loading || fetchLoading}
          className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50">
          {loading
            ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : <><Save size={17} /> Uygunluğu Gönder</>}
        </button>
      ) : (
        <button onClick={revoke} disabled={loading}
          className="w-full bg-white border border-slate-200 text-slate-700 font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
          {loading
            ? <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            : <><Edit2 size={17} /> Düzenle</>}
        </button>
      )}

    </Page>
  );
}
