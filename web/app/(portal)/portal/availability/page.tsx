"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Save, Edit2, ChevronLeft, ChevronRight, Check, AlertCircle, X, CalendarCheck } from "lucide-react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────
type Status = "available" | "preferred_not" | "unavailable";
interface DayData { status: Status; start: string; end: string; shiftId?: string | null; }
interface ShiftDef { id: string; name: string; start: string; end: string; base_points?: number; }

const DAYS      = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const SHORT     = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const DEFAULT_DAY: DayData = { status: "available", start: "08:00", end: "22:00" };

const S = {
  available:    { label: "Müsaitim", short: "Müsait",  icon: <Check size={13}/>,       bg: "bg-emerald-500", text: "text-white", light: "bg-emerald-50", ltext: "text-emerald-700", border: "border-emerald-400", fill: "bg-emerald-400", dot: "bg-emerald-400", thumb: "" },
  preferred_not:{ label: "Esnek",    short: "Esnek",   icon: <AlertCircle size={13}/>, bg: "bg-amber-400",   text: "text-white", light: "bg-amber-50",   ltext: "text-amber-700",   border: "border-amber-400",   fill: "bg-amber-400",   dot: "bg-amber-400",   thumb: "avail-amber" },
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
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Saat</span>
          <button onClick={() => setHour(h => Math.min(maxHour, h + 1))}
            className="w-9 h-9 bg-white rounded-xl shadow-sm text-slate-600 font-black text-lg flex items-center justify-center active:scale-95 transition-transform">+</button>
          <div className="text-center min-w-[52px]">
            {nextDay && <div className="text-[8px] text-violet-500 font-bold mb-0.5">ertesi gün</div>}
            <div className={`text-3xl font-black tabular-nums leading-none ${nextDay ? "text-violet-700" : "text-slate-800"}`}>
              {String(dispHour).padStart(2, "0")}
            </div>
          </div>
          <button onClick={() => setHour(h => Math.max(0, h - 1))}
            className="w-9 h-9 bg-white rounded-xl shadow-sm text-slate-600 font-black text-lg flex items-center justify-center active:scale-95 transition-transform">−</button>
        </div>

        <span className="text-3xl font-black text-slate-300 mb-1">:</span>

        {/* Dakika — 4 pill */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Dakika</span>
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
          ? <span>Ertesi gün <span className="font-bold text-violet-600">{String(dispHour).padStart(2,"0")}:{String(min).padStart(2,"0")}</span></span>
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
      <div className="flex justify-between text-[9px] font-semibold mt-0.5">
        {["00:00","06:00","12:00","18:00","00:00","06:00"].map((t, i) => (
          <span key={i} className={i === 4 ? "text-slate-600 font-bold" : "text-slate-400"}>{t}</span>
        ))}
      </div>

      {/* Tıklanabilir zaman gösterimi */}
      <div className="flex items-end justify-between mt-3">
        <button onClick={() => setPicker(p => p === "start" ? null : "start")}
          className={`text-left rounded-xl px-2 py-1 -ml-2 transition-colors ${picker === "start" ? cfg.light : "hover:bg-slate-50"}`}>
          <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Başlangıç</div>
          <div className="text-2xl font-black text-slate-800 tabular-nums leading-none">{displayTime(sMin)}</div>
        </button>

        <div className={`text-[11px] font-bold px-2.5 py-1 rounded-full mb-0.5 ${cfg.light} ${cfg.ltext}`}>
          {durLabel}
        </div>

        <button onClick={() => setPicker(p => p === "end" ? null : "end")}
          className={`text-right rounded-xl px-2 py-1 -mr-2 transition-colors ${picker === "end" ? cfg.light : "hover:bg-slate-50"}`}>
          <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5 flex items-center justify-end gap-1">
            Bitiş
            {isNextDay && <span className="bg-violet-100 text-violet-600 text-[8px] font-bold px-1.5 py-0.5 rounded-full">+1</span>}
          </div>
          <div className={`text-2xl font-black tabular-nums leading-none ${isNextDay ? "text-violet-700" : "text-slate-800"}`}>
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
  const [loading,     setLoading]     = useState(false);
  const [fetchLoading,setFetchLoading]= useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [shiftDefs,   setShiftDefs]   = useState<ShiftDef[]>([]);
  const [maxYellow,   setMaxYellow]   = useState(1);
  const [collectionEnabled, setCollectionEnabled] = useState(true); // müsaitlik toplama kapalıysa giriş UI'ı gösterilmez
  const [yellowWarn,  setYellowWarn]  = useState<string | null>(null);

  const ws = weekStart(weekOffset);

  const load = useCallback(async () => {
    if (!user?.personnel_id) return;
    setFetchLoading(true);
    try {
      const r = await fetch(`/api/availability?personnel_id=${user.personnel_id}&week_start=${ws}`);
      const d = await r.json();
      if (typeof d.max_preferred_not_days === "number") setMaxYellow(d.max_preferred_not_days);
      if (d.exists && d.days) {
        setDays(d.days.map((x: any) => ({ status: x.status || "available", start: x.start || "08:00", end: x.end || "22:00" })));
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
        setYellowWarn(`Haftada en fazla ${maxYellow} gün "Esnek" seçebilirsin. Gelemeyeceğin günler için "Gelemem"i kullan.`);
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

  const confirmSave = async () => {
    setShowConfirm(false);
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
            start: d.status !== "unavailable" ? d.start : null,
            end:   d.status !== "unavailable" ? d.end   : null,
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

  // Müsaitlik toplama bu işletmede kapalı — giriş UI'ı yerine bilgi kartı
  if (!collectionEnabled) {
    return (
      <div className="p-5 animate-in fade-in duration-300">
        <div className="flex flex-col items-center text-center gap-3 bg-white border border-slate-200 rounded-2xl px-6 py-10 mt-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
            <CalendarCheck size={22} className="text-indigo-500" />
          </div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight">Bu işletmede vardiyaları müdürünüz planlıyor</h1>
          <p className="text-sm text-slate-500 max-w-xs">
            Müsaitlik girişi bu işletmede kapalı. Yayınlanan vardiyalarını Vardiyalar sayfasından görebilirsin.
          </p>
          <Link href="/portal/calendar"
            className="mt-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 rounded-xl transition-colors">
            Vardiyalarımı Gör
          </Link>
        </div>
      </div>
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
    <div className="p-5 space-y-5 animate-in fade-in duration-300">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Müsaitlik</h1>
          <p className="text-sm text-slate-500 mt-1">{weekLabel(ws)}</p>
        </div>
        <div className="flex items-center bg-slate-100 rounded-2xl p-1 shrink-0 gap-0.5">
          <button onClick={() => setWeekOffset(o => Math.max(0, o - 1))} disabled={weekOffset === 0}
            className="p-2 rounded-xl text-slate-500 hover:bg-white disabled:opacity-30 transition-all">
            <ChevronLeft size={15} />
          </button>
          <span className="text-xs font-bold text-slate-600 px-1.5 min-w-[72px] text-center">
            {weekOffset === 0 ? "Bu Hafta" : weekOffset === 1 ? "Gel. Hafta" : `+${weekOffset} Hafta`}
          </span>
          <button onClick={() => setWeekOffset(o => o + 1)}
            className="p-2 rounded-xl text-slate-500 hover:bg-white transition-all">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* ── Haftalık durum şeridi ───────────────────────────────────────────── */}
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d, i) => (
          <div key={i} className={`flex flex-col items-center gap-1 py-2 rounded-xl ${S[d.status].light}`}>
            <span className="text-[9px] font-bold text-slate-500">{SHORT[i]}</span>
            <span className="text-[8px] font-semibold text-slate-400 leading-tight">{weekDates[i]}</span>
            <div className={`w-2 h-2 rounded-full ${S[d.status].dot}`} />
          </div>
        ))}
      </div>

      {/* ── Gönderildi uyarısı ──────────────────────────────────────────────── */}
      {isSubmitted && !fetchLoading && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
          <Check size={18} className="text-emerald-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-emerald-800">Müsaitlik gönderildi</p>
            <p className="text-xs text-emerald-600">Düzenlemek için geri al butonuna bas.</p>
          </div>
          <button onClick={revoke} disabled={loading}
            className="text-xs font-bold text-emerald-700 bg-white border border-emerald-200 px-3 py-1.5 rounded-xl hover:bg-emerald-50 transition-colors shrink-0">
            {loading ? "…" : "Geri Al"}
          </button>
        </div>
      )}

      {/* ── Gün kartları ────────────────────────────────────────────────────── */}
      {fetchLoading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <div key={i} className="h-40 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className={`space-y-3 ${isSubmitted ? "opacity-60 pointer-events-none" : ""}`}>
          {yellowWarn && (
            <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-300 rounded-2xl text-xs font-semibold text-amber-800">
              <AlertCircle size={14} className="shrink-0 text-amber-500" />
              {yellowWarn}
            </div>
          )}
          <div className="flex items-center justify-between px-1 text-[11px] text-slate-400 font-medium">
            <span>Esnek (sarı) gün hakkı: <span className="font-bold text-amber-600">{days.filter(d => d.status === "preferred_not").length}/{maxYellow}</span></span>
            <span>Sarı günde çalışırsan ekstra puan kazanırsın</span>
          </div>
          {DAYS.map((name, i) => {
            const d = days[i];
            const cfg = S[d.status];
            return (
              <div key={i} className={`bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm`}>
                {/* Renkli üst şerit */}
                <div className={`h-1 w-full ${cfg.fill}`} />

                <div className="px-4 pt-3 pb-4">
                  {/* Başlık satırı */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className="shrink-0 min-w-[90px]">
                      <span className="font-black text-slate-800 text-[15px] block leading-tight">{name}</span>
                      <span className="text-[11px] font-semibold text-slate-400">{weekDates[i]}</span>
                    </div>
                    <div className="flex gap-1.5 flex-1">
                      {(["available","preferred_not","unavailable"] as Status[]).map(s => {
                        const c = S[s];
                        const active = d.status === s;
                        return (
                          <button key={s} onClick={() => setStatus(i, s)}
                            className={`flex items-center justify-center gap-1 flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
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

                  {/* Vardiya seçici — shift def'ler varsa göster */}
                  {shiftDefs.length > 0 && d.status !== "unavailable" && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {shiftDefs.map(def => {
                        const active = d.shiftId === def.id;
                        return (
                          <button key={def.id} onClick={() => setShift(i, def)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold transition-all border ${
                              active
                                ? `${cfg.bg} ${cfg.text} border-transparent shadow-sm`
                                : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                            }`}>
                            <span>{def.name}</span>
                            <span className={active ? "opacity-80" : "opacity-50"}>{def.start}–{def.end}</span>
                          </button>
                        );
                      })}
                      {d.shiftId && (
                        <button onClick={() => setDays(prev => prev.map((x, j) => j === i ? { ...x, shiftId: null } : x))}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold border bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100">
                          Özel saat
                        </button>
                      )}
                    </div>
                  )}

                  {/* Slider veya gelemem notu */}
                  {d.status !== "unavailable" ? (
                    <RangeSlider
                      start={d.start} end={d.end} status={d.status}
                      onChange={(s, e) => setTime(i, s, e)}
                    />
                  ) : (
                    <div className="flex items-center gap-2 bg-rose-50 rounded-xl px-3 py-2.5">
                      <X size={13} className="text-rose-400 shrink-0" />
                      <span className="text-xs font-semibold text-rose-500">Bu gün çalışmak mümkün değil.</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Gönder butonu — inline, nav bar clearance layout'un pb-24'ünden geliyor ── */}
      {!isSubmitted ? (
        <button onClick={() => setShowConfirm(true)} disabled={loading || fetchLoading}
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all disabled:opacity-50">
          {loading
            ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : <><Save size={17} /> Müsaitliği Gönder</>}
        </button>
      ) : (
        <button onClick={revoke} disabled={loading}
          className="w-full bg-white border-2 border-slate-200 text-slate-600 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
          {loading
            ? <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            : <><Edit2 size={17} /> Düzenlemek İçin Geri Al</>}
        </button>
      )}

      {/* ── Onay modal (document.body portalı) ─────────────────────────────── */}
      {showConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col justify-end"
          onClick={e => { if (e.target === e.currentTarget) setShowConfirm(false); }}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />

          {/* Sheet */}
          <div className="relative bg-white rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom-4 duration-300 max-h-[85vh] flex flex-col">
            {/* Pull handle */}
            <div className="flex justify-center pt-3 pb-0 shrink-0">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>

            {/* Başlık */}
            <div className="px-5 py-4 border-b border-slate-100 shrink-0">
              <h2 className="text-lg font-black text-slate-900">Müsaitliği Onayla</h2>
              <p className="text-sm text-slate-400 mt-0.5">{weekLabel(ws)}</p>
            </div>

            {/* Gün özeti */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {days.map((d, i) => {
                const cfg = S[d.status];
                return (
                  <div key={i} className={`flex items-center gap-3 px-3.5 py-3 rounded-xl ${cfg.light}`}>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${cfg.bg} ${cfg.text} shrink-0`}>
                      {cfg.icon}
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-bold text-slate-800 block leading-tight">{DAYS[i]}</span>
                      <span className="text-[11px] font-medium text-slate-400">{weekDates[i]}</span>
                    </div>
                    <span className={`text-xs font-semibold tabular-nums ${cfg.ltext}`}>
                      {d.status === "unavailable"
                        ? "Gelemiyorum"
                        : `${displayTime(toMin(d.start))} – ${displayTime(toMin(d.end))}${toMin(d.end) > 1440 ? " +1" : ""}`}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Aksiyon butonları */}
            <div className="px-5 py-4 flex gap-3 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowConfirm(false)}
                className="flex-1 bg-slate-100 text-slate-700 font-bold py-3.5 rounded-2xl active:bg-slate-200 transition-colors text-sm">
                Vazgeç
              </button>
              <button onClick={confirmSave}
                className="flex-[2] bg-emerald-500 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 active:bg-emerald-600 transition-colors text-sm">
                <Check size={17} /> Gönder
              </button>
            </div>
            <div style={{ paddingBottom: "env(safe-area-inset-bottom)" }} />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
