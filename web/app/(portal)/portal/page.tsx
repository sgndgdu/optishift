"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Clock, Calendar as CalIcon, TrendingUp, BellRing, Check,
  MapPin, AlertCircle, Timer, ChevronRight,
  Zap, ClipboardList, PlayCircle, StopCircle,
} from "lucide-react";
import Link from "next/link";
import { usePortalAuth } from "@/hooks/useAuth";
import { getWeekStart, timeAgo } from "@/lib/date";
import { DAY_NAMES, DAY_SHORT as SHORT } from "@/lib/constants";
import { getNotifHref as _getNotifHref } from "@/lib/notif";

function shiftDur(s: any): number {
  if (!s?.start_time || !s?.end_time) return 8;
  const [sh, sm] = s.start_time.split(":").map(Number);
  const [eh, em] = s.end_time.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 1440;
  return Math.round(diff / 60 * 10) / 10;
}

function elapsedLabel(checkInAt: number): string {
  const diff = Date.now() - checkInAt * 1000;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}s ${m}dk` : `${m} dakika`;
}

export default function PortalDashboard() {
  const router = useRouter();
  const { user, mounted } = usePortalAuth();
  const [shifts,        setShifts]        = useState<any[]>([]);
  const [notifs,        setNotifs]        = useState<any[]>([]);
  const [handoverNotes, setHandoverNotes]  = useState<{ author: string; shift: string; note: string }[]>([]);
  const [checkoutModal, setCheckoutModal]  = useState<number | null>(null);
  const [handoverDraft, setHandoverDraft]  = useState("");
  const [handoverEnabled, setHandoverEnabled] = useState(true); // rules.handover_notes_enabled
  const [nextWeekAvail, setNextWeekAvail] = useState<boolean | null>(null);
  const [dataLoading,   setDataLoading]   = useState(true);
  const [crewName,      setCrewName]      = useState<string | null>(null);
  const [checkInLoading,setCheckInLoading]= useState(false);
  const [elapsed,       setElapsed]       = useState("");
  const [now,           setNow]           = useState(new Date());
  const [fairness,      setFairness]      = useState<any>(null); // /api/fairness/me — kendi puanı + etiket + döküm
  const [fairnessOpen,  setFairnessOpen]  = useState(false);

  // clock tick
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // data
  const loadData = useCallback(async () => {
    if (!user?.personnel_id) return;
    setDataLoading(true);
    const ws  = getWeekStart(0);
    const nws = getWeekStart(1);
    try {
      const [shiftData, notifData, availData, personnelData, fairnessData] = await Promise.all([
        fetch(`/api/shifts?personnel_id=${user.personnel_id}&week_start=${ws}`).then(r => r.json()),
        fetch(`/api/notifications?personnel_id=${user.personnel_id}`).then(r => r.json()),
        fetch(`/api/availability?personnel_id=${user.personnel_id}&week_start=${nws}`).then(r => r.json()),
        fetch(`/api/personnel?id=${user.personnel_id}`).then(r => r.json()).catch(() => null),
        fetch(`/api/fairness/me`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setFairness(fairnessData && !fairnessData.error ? fairnessData : null);
      setShifts(Array.isArray(shiftData) ? shiftData : []);
      setNotifs(Array.isArray(notifData) ? notifData.slice(0, 3) : []);
      setNextWeekAvail(availData?.exists ?? false);
      // Ekip adını yükle
      const pData = Array.isArray(personnelData) ? personnelData[0] : personnelData;
      if (pData?.crew_id && pData?.primary_location_id) {
        try {
          const crewData = await fetch(`/api/crews?location_id=${pData.primary_location_id}`).then(r => r.json());
          const myCrew = Array.isArray(crewData) ? crewData.find((c: any) => c.id === pData.crew_id) : null;
          setCrewName(myCrew?.name ?? null);
        } catch { /* ignore */ }
      }
    } catch {} finally { setDataLoading(false); }
  }, [user?.personnel_id]);
  useEffect(() => { loadData(); }, [loadData]);

  // Önceki vardiyanın devir notları — bugün vardiyam varsa göster
  useEffect(() => {
    if (!user?.personnel_id) return;
    fetch("/api/shifts/handover")
      .then(r => r.ok ? r.json() : { notes: [], enabled: true })
      .then(d => {
        setHandoverNotes(Array.isArray(d?.notes) ? d.notes : []);
        setHandoverEnabled(d?.enabled !== false);
      })
      .catch(() => {});
  }, [user]);

  // today
  const todayIdx   = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const todayShift = shifts.find(s => s.day === todayIdx) ?? null;

  // elapsed timer
  useEffect(() => {
    if (!todayShift?.check_in_at || todayShift?.check_out_at) { setElapsed(""); return; }
    const tick = () => setElapsed(elapsedLabel(todayShift.check_in_at));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [todayShift?.check_in_at, todayShift?.check_out_at]);

  const handleCheckIn = async (shiftId: number) => {
    const ts = Math.floor(Date.now() / 1000);
    setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, check_in_at: ts } : s));
    setCheckInLoading(true);
    try {
      const r = await fetch("/api/shifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check_in", shift_id: shiftId }),
      });
      if (!r.ok) setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, check_in_at: null } : s));
    } catch {
      setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, check_in_at: null } : s));
    } finally { setCheckInLoading(false); }
  };

  const handleCheckOut = async (shiftId: number, handoverNote?: string) => {
    const ts = Math.floor(Date.now() / 1000);
    setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, check_out_at: ts } : s));
    setCheckInLoading(true);
    setCheckoutModal(null);
    try {
      const r = await fetch("/api/shifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check_out", shift_id: shiftId, handover_note: handoverNote || undefined }),
      });
      if (!r.ok) setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, check_out_at: null } : s));
    } catch {
      setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, check_out_at: null } : s));
    } finally { setCheckInLoading(false); }
  };

  if (!mounted) return <div className="p-5 space-y-5" />;

  const getNotifHref = (n: any) => _getNotifHref(n) ?? "/portal/notifications";

  // computed
  const shiftDays     = new Set(shifts.map((s: any) => s.day));
  const totalHours    = shifts.reduce((acc: number, s: any) => acc + shiftDur(s), 0);
  const upcomingShifts = shifts.filter(s => s.day >= todayIdx).sort((a, b) => a.day - b.day);
  const unreadCount   = notifs.filter(n => !n.is_read).length;
  const isCheckedIn   = !!todayShift?.check_in_at && !todayShift?.check_out_at;
  const isCompleted   = !!todayShift?.check_out_at;
  const todayLabel    = now.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="p-5 pb-8 space-y-5 animate-in fade-in duration-300">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">{todayLabel}</p>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Merhaba, {user.name?.split(" ")[0]} 👋
          </h1>
        </div>
        <Link href="/portal/notifications"
          className="relative mt-1 p-2.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-colors">
          <BellRing size={22} />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 border-2 border-white rounded-full" />
          )}
        </Link>
      </div>

      {/* ── Hero: Bugün ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-primary via-indigo-600 to-slate-900 rounded-[2rem] p-6 text-white shadow-xl shadow-primary/20 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-indigo-400/20 rounded-full blur-2xl" />
        <div className="relative z-10">

          {/* label */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-indigo-200 text-xs font-bold bg-white/10 px-3 py-1.5 rounded-full border border-white/20">
                {isCheckedIn ? <Timer size={12} /> : <Clock size={12} />}
                {isCheckedIn ? "Şu an çalışıyorsun" : isCompleted ? "Vardiya bitti" : "Bugün"}
              </div>
              {crewName && (
                <div className="text-xs font-bold bg-white/10 px-3 py-1.5 rounded-full border border-white/20 text-white/80">
                  {crewName}
                </div>
              )}
            </div>
            {todayShift && (
              <span className={`text-[11px] font-bold px-3 py-1.5 rounded-full border ${
                isCompleted ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/30" :
                isCheckedIn ? "bg-amber-400/20 text-amber-200 border-amber-400/30 animate-pulse" :
                              "bg-white/10 text-white/80 border-white/20"
              }`}>
                {isCompleted ? "Tamamlandı ✓" : isCheckedIn ? "● Aktif" : "Onaylandı"}
              </span>
            )}
          </div>

          {/* content */}
          {dataLoading ? (
            <div className="animate-pulse space-y-2 mb-5">
              <div className="h-12 bg-white/10 rounded-xl w-3/4" />
              <div className="h-4 bg-white/10 rounded-xl w-1/2" />
            </div>
          ) : todayShift ? (
            <div className="mb-5">
              <div className="text-4xl font-black tracking-tight mb-1.5">
                {todayShift.start_time} – {todayShift.end_time}
              </div>
              {isCheckedIn && elapsed && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-1.5 h-1.5 bg-amber-300 rounded-full animate-pulse" />
                  <span className="text-sm font-bold text-amber-200">{elapsed} çalışıyorsun</span>
                </div>
              )}
              {isCompleted && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Check size={13} className="text-emerald-300" />
                  <span className="text-sm font-bold text-emerald-200">{shiftDur(todayShift)} saat çalıştın</span>
                </div>
              )}
              <p className="text-indigo-200/70 text-sm flex items-center gap-2">
                <span>{shiftDur(todayShift)} saatlik vardiya</span>
                {todayShift.location_name && (
                  <><span className="opacity-40">·</span><MapPin size={11} className="inline -mt-px" /> {todayShift.location_name}</>
                )}
              </p>
            </div>
          ) : (
            <div className="mb-5">
              <div className="text-2xl font-black mb-1 text-white/70">Bugün vardiya yok</div>
              {upcomingShifts.length > 0 ? (
                <p className="text-indigo-200/70 text-sm">
                  Sonraki: <span className="font-bold text-indigo-100">{DAY_NAMES[upcomingShifts[0].day]}, {upcomingShifts[0].start_time}</span>
                </p>
              ) : (
                <p className="text-indigo-200/60 text-sm">Bu hafta başka vardiya yok.</p>
              )}
            </div>
          )}

          {/* buttons */}
          <div className="flex gap-2.5">
            <button onClick={() => router.push("/portal/calendar")}
              className="flex-1 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-bold py-3 rounded-xl backdrop-blur-md transition-all flex items-center justify-center gap-1.5 active:scale-[0.97]">
              <CalIcon size={14} /> Takvim
            </button>
            {todayShift && !todayShift.check_in_at && !isCompleted && (
              <button onClick={() => handleCheckIn(todayShift.id)} disabled={checkInLoading}
                className="flex-[2] bg-emerald-400 hover:bg-emerald-300 text-white text-sm font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-60">
                <PlayCircle size={15} /> {checkInLoading ? "…" : "Vardiyayı Başlat"}
              </button>
            )}
            {todayShift && isCheckedIn && (
              <button onClick={() => { if (!handoverEnabled) { handleCheckOut(todayShift.id); return; } setHandoverDraft(""); setCheckoutModal(todayShift.id); }} disabled={checkInLoading}
                className="flex-[2] bg-amber-400 hover:bg-amber-300 text-white text-sm font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-60">
                <StopCircle size={15} /> {checkInLoading ? "…" : "Çıkış Yap"}
              </button>
            )}
            {(!todayShift || isCompleted) && (
              <button onClick={() => router.push("/portal/availability")}
                className="flex-[2] bg-white text-primary text-sm font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.97]">
                <Zap size={14} /> Müsaitlik Gir
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Önceki vardiyadan devir notu ─────────────────────────────────── */}
      {todayShift && !isCompleted && handoverNotes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-black text-amber-800 uppercase tracking-wider">📋 Önceki Vardiyadan Devir Notu</p>
          {handoverNotes.map((n, i) => (
            <div key={i} className="bg-white/70 rounded-xl px-3 py-2">
              <p className="text-sm text-slate-700 leading-relaxed">{n.note}</p>
              <p className="text-[10px] text-amber-600 font-semibold mt-1">{n.author} · {n.shift}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Check-out devir notu modalı ──────────────────────────────────── */}
      {checkoutModal !== null && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => setCheckoutModal(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="text-base font-black text-slate-900">Vardiyadan Çıkış</h3>
              <p className="text-xs text-slate-500 mt-1">Sonraki vardiyaya iletmek istediğin bir not var mı? (isteğe bağlı)</p>
            </div>
            <textarea
              value={handoverDraft}
              onChange={e => setHandoverDraft(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Örn: 3 no'lu pres arızalı, teknik servis çağrıldı. Sevkiyat paletleri hazır."
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-amber-400 focus:bg-white resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleCheckOut(checkoutModal)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Notsuz Çık
              </button>
              <button
                onClick={() => handleCheckOut(checkoutModal, handoverDraft)}
                disabled={!handoverDraft.trim()}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition-colors disabled:opacity-40"
              >
                Notu Bırak ve Çık
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bu Hafta mini takvim ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="text-sm font-black text-slate-800">Bu Hafta</span>
          {!dataLoading && (
            <span className="text-xs font-bold text-slate-400">
              {shifts.length} vardiya · {totalHours.toFixed(0)} saat
            </span>
          )}
        </div>
        <div className="px-3 pb-3 grid grid-cols-7 gap-1.5">
          {dataLoading
            ? Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
              ))
            : Array.from({ length: 7 }).map((_, i) => {
                const hasShift = shiftDays.has(i);
                const isToday  = i === todayIdx;
                const dayShift = shifts.find(s => s.day === i);
                return (
                  <div key={i} onClick={() => router.push("/portal/calendar")}
                    className={`flex flex-col items-center gap-1 py-2.5 px-0.5 rounded-xl cursor-pointer transition-all active:scale-95 ${
                      isToday  ? "bg-primary text-white shadow-md shadow-primary/25" :
                      hasShift ? "bg-indigo-50 text-indigo-700" :
                                 "bg-slate-50 text-slate-400"
                    }`}>
                    <span className={`text-[9px] font-bold uppercase tracking-wide ${isToday ? "text-indigo-200" : "opacity-60"}`}>
                      {SHORT[i]}
                    </span>
                    {hasShift ? (
                      <span className={`text-[9px] font-black leading-none ${isToday ? "text-white" : "text-indigo-600"}`}>
                        {dayShift?.start_time?.slice(0, 5) ?? ""}
                      </span>
                    ) : (
                      <div className={`w-1 h-1 rounded-full ${isToday ? "bg-white/40" : "bg-slate-300"}`} />
                    )}
                  </div>
                );
              })
          }
        </div>
      </div>

      {/* ── Hızlı Erişim ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { href: "/portal/availability", icon: <Zap size={18} />,         label: "Müsaitlik", color: "text-violet-600 bg-violet-50" },
          { href: "/portal/requests",     icon: <ClipboardList size={18}/>, label: "Talepler",  color: "text-amber-600  bg-amber-50"  },
          { href: "/portal/calendar",     icon: <CalIcon size={18} />,      label: "Takvim",    color: "text-emerald-600 bg-emerald-50"},
        ].map(item => (
          <Link key={item.href} href={item.href}
            className="flex flex-col items-center gap-2 bg-white rounded-2xl border border-slate-100 py-4 shadow-sm hover:shadow-md hover:border-slate-200 transition-all active:scale-[0.97]">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}>{item.icon}</div>
            <span className="text-xs font-bold text-slate-600">{item.label}</span>
          </Link>
        ))}
      </div>

      {/* ── Müsaitlik hatırlatıcı ────────────────────────────────────────── */}
      {nextWeekAvail === false && (
        <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3.5">
          <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
            <AlertCircle size={18} className="text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-violet-800">Gelecek hafta müsaitliğin eksik</p>
            <p className="text-xs text-violet-500 mt-0.5">Müdürün planlama yapabilmesi için gir.</p>
          </div>
          <Link href="/portal/availability"
            className="text-xs font-bold text-violet-700 bg-white border border-violet-200 px-3 py-2 rounded-xl whitespace-nowrap hover:bg-violet-50 transition-colors shrink-0">
            Gir →
          </Link>
        </div>
      )}

      {/* ── Yaklaşan Vardiyalar ──────────────────────────────────────────── */}
      {!dataLoading && upcomingShifts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-black text-slate-900 text-base">Yaklaşan Vardiyalar</h3>
            <Link href="/portal/calendar" className="text-xs font-bold text-primary flex items-center gap-0.5">
              Takvim <ChevronRight size={13} />
            </Link>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
            {upcomingShifts.slice(0, 3).map((s, idx) => {
              const dur = shiftDur(s);
              const isT = s.day === todayIdx;
              return (
                <Link key={s.id ?? idx} href="/portal/calendar" className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    isT ? "bg-primary text-white" : "bg-slate-100 text-slate-500"
                  }`}>
                    <span className="text-[10px] font-black">{SHORT[s.day]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${isT ? "text-primary" : "text-slate-800"}`}>
                      {DAY_NAMES[s.day]}{isT ? " · Bugün" : ""}
                    </p>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">{s.start_time} – {s.end_time}</p>
                  </div>
                  <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg shrink-0">{dur}s</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => fairness && setFairnessOpen(o => !o)}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left hover:shadow-md transition-shadow"
        >
          <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 mb-3">
            <TrendingUp size={18} />
          </div>
          <p className="text-2xl font-black text-slate-900 tracking-tight tabular-nums">
            {Math.round(((fairness?.score ?? user.prev_score) ?? 0) * 10) / 10}
          </p>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">Adalet Puanı</p>
          {fairness?.label && (
            <span className={`inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${
              fairness.label.level === "high" ? "bg-red-50 text-red-600"
              : fairness.label.level === "low" ? "bg-emerald-50 text-emerald-600"
              : "bg-slate-100 text-slate-500"
            }`}>{fairness.label.text}</span>
          )}
        </button>
        <Link href="/portal/calendar" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 block hover:shadow-md transition-shadow">
          <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 mb-3">
            <Clock size={18} />
          </div>
          {dataLoading ? (
            <div className="h-7 bg-slate-100 rounded animate-pulse w-16 mb-1" />
          ) : (
            <p className="text-2xl font-black text-slate-900 tracking-tight tabular-nums">
              {totalHours > 0 ? totalHours.toFixed(0) : "—"}
              {totalHours > 0 && <span className="text-sm text-slate-400 font-semibold ml-1">sa</span>}
            </p>
          )}
          <p className="text-xs text-slate-400 font-semibold mt-0.5">Bu Hafta</p>
        </Link>
      </div>

      {/* ── Adalet puanı dökümü (karta tıklayınca açılır) ────────────────── */}
      {fairnessOpen && fairness && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-900 text-sm">Puanın nasıl oluştu?</h3>
            <span className="text-[10px] text-slate-400 font-medium">Son 8 hafta · yeni haftalar daha ağır sayılır</span>
          </div>

          {fairness.history.length > 0 ? (
            <>
              {/* Haftalık yük mini grafiği */}
              <div className="flex items-end gap-1.5 h-16">
                {fairness.history.map((h: any) => {
                  const max = Math.max(...fairness.history.map((x: any) => x.burden_score), 1);
                  return (
                    <div key={h.week_start} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-indigo-100 rounded-md relative overflow-hidden" style={{ height: "100%" }}>
                        <div className="absolute bottom-0 w-full bg-indigo-400 rounded-md" style={{ height: `${(h.burden_score / max) * 100}%` }} />
                      </div>
                      <span className="text-[8px] text-slate-400 font-semibold">
                        {new Date(h.week_start + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "numeric" })}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Son haftanın kırılımı */}
              {(() => {
                const last = fairness.history[fairness.history.length - 1];
                return (
                  <div className="text-xs text-slate-500 space-y-1">
                    <p className="font-bold text-slate-700">Son hafta ({new Date(last.week_start + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}): {Math.round(last.burden_score * 10) / 10} yük puanı · {Math.round(last.total_hours * 10) / 10} saat</p>
                    <div className="flex flex-wrap gap-1.5">
                      {last.weekend_shifts > 0 && <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">{last.weekend_shifts} hafta sonu</span>}
                      {last.night_shifts > 0 && <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">{last.night_shifts} gece</span>}
                      {(last.pref_not_shifts ?? 0) > 0 && <span className="bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">{last.pref_not_shifts} sarı gün (telafili)</span>}
                      {last.clopening_count > 0 && <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">{last.clopening_count} kapanış→açılış</span>}
                      {fairness.hero_count > 0 && <span className="bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">🦸 {fairness.hero_count} kahramanlık</span>}
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <p className="text-xs text-slate-400">Henüz yayınlanmış bir haftan yok — ilk vardiya haftan yayınlanınca puanın burada oluşmaya başlar.</p>
          )}

          {/* Telafi / bonus olayları */}
          {fairness.adjustments.length > 0 && (
            <div className="border-t border-slate-100 pt-3 space-y-1.5">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Telafi Puanları</p>
              {fairness.adjustments.slice(0, 5).map((a: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 truncate mr-2">{a.note ?? (a.type === "change_comp" ? "Son dakika değişiklik telafisi" : "Manuel düzeltme")}</span>
                  <span className="font-bold text-emerald-600 shrink-0">+{a.points}</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-slate-300 leading-relaxed">
            Zor, uzun, hafta sonu ve gece vardiyaları{fairness.history.some((h: any) => "pref_not_shifts" in h) ? " — ve tercih etmediğin günlerde çalışmak —" : ""} daha çok puan getirir. Puanın yükseldiyse sonraki haftalarda sıra daha hafif vardiyalara sende olur.
          </p>
        </div>
      )}

      {/* ── Son Bildirimler ──────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-slate-900 text-base">Bildirimler</h3>
          <Link href="/portal/notifications" className="text-xs font-bold text-primary flex items-center gap-0.5">
            Tümünü Gör <ChevronRight size={13} />
          </Link>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {dataLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : notifs.length === 0 ? (
            <div className="py-8 flex flex-col items-center text-center">
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-2">
                <Check size={18} />
              </div>
              <p className="text-sm font-semibold text-slate-500">Yeni bildirim yok</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {notifs.map(n => (
                <Link key={n.id} href={getNotifHref(n)}
                  className={`flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 transition-colors ${!n.is_read ? "bg-indigo-50/40" : ""}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    n.type === "schedule" ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"
                  }`}>
                    {n.type === "schedule" ? <CalIcon size={14} /> : <AlertCircle size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold leading-tight ${!n.is_read ? "text-slate-800" : "text-slate-600"}`}>{n.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{n.message}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0 mt-0.5 whitespace-nowrap">{timeAgo(n.created_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
