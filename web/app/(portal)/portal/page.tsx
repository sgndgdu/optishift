"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Clock, Check, Megaphone,
  MapPin, AlertCircle, Timer, ChevronRight,
  Zap, ClipboardList, PlayCircle, StopCircle,
} from "lucide-react";
import Link from "next/link";
import { usePortalAuth } from "@/hooks/useAuth";
import { getWeekStart, timeAgo, addDays, formatDateTR } from "@/lib/date";
import { DAY_NAMES, DAY_SHORT as SHORT } from "@/lib/constants";

import { useAvailabilityEnabled, useOpenShiftsEnabled, useShiftWords } from "@/hooks/useShiftWords";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { Sheet, sheetPrimaryClass, sheetSecondaryClass } from "@/components/ui/Sheet";
import { coworkersOf } from "@/lib/coworkers";
import { netWorkMinutes } from "@/lib/legal";
function shiftDur(s: any): number {
  if (!s?.start_time || !s?.end_time) return 8;
  const [sh, sm] = s.start_time.split(":").map(Number);
  const [eh, em] = s.end_time.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 1440;
  // Çalışma süresi mola düşülerek (lib/legal)
  return Math.round(netWorkMinutes(diff, s.break_minutes) / 60 * 10) / 10;
}

function elapsedLabel(checkInAt: number): string {
  // Giriş saati cihaz saatinden ileride görünebilir (saat farkı): sayaç eksiye düşmez
  const diff = Math.max(0, Date.now() - checkInAt * 1000);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}s ${m}dk` : `${m} dakika`;
}

export default function PortalDashboard() {
  const words = useShiftWords();
  // Şubede uygunluk toplama kapalıysa uygunluk kısayolu ve "eksik" uyarısı gösterilmez
  const availEnabled = useAvailabilityEnabled();
  const openShiftsEnabled = useOpenShiftsEnabled();
  // Açık ilan yoksa kısayol gösterilmez
  const [openShiftCount, setOpenShiftCount] = useState(0);
  useEffect(() => {
    if (!openShiftsEnabled) return;
    let stale = false;
    fetch("/api/open-shifts?mine=1").then(r => (r.ok ? r.json() : [])).then(d => {
      if (!stale) setOpenShiftCount(Array.isArray(d) ? d.filter((o: any) => o.status === "open" && !(o.problems?.length)).length : 0);
    }).catch(() => {});
    return () => { stale = true; };
  }, [openShiftsEnabled]);
  const router = useRouter();
  const { user, mounted } = usePortalAuth();
  const [shifts,        setShifts]        = useState<any[]>([]);
  const [onCalls,       setOnCalls]       = useState<any[]>([]);
  const [handoverNotes, setHandoverNotes]  = useState<{ author: string; shift: string; note: string }[]>([]);
  const [checkoutModal, setCheckoutModal]  = useState<number | null>(null);
  const [handoverDraft, setHandoverDraft]  = useState("");
  const [handoverEnabled, setHandoverEnabled] = useState(true); // rules.handover_notes_enabled (eski, broadcast)
  const [handoverLogEnabled, setHandoverLogEnabled] = useState(false); // rules.handover_log_enabled (yeni, zorunlu okuma)
  const [pendingHandoverModal, setPendingHandoverModal] = useState<{ shiftId: number; handover: { id: number; note: string; author_name: string; created_at: number } } | null>(null);
  const [shiftTasks, setShiftTasks] = useState<any[]>([]); // rules.task_management_enabled — bugünkü vardiyanın görev listesi
  const [taskToggleBusy, setTaskToggleBusy] = useState<number | null>(null);
  const [nextWeekAvail, setNextWeekAvail] = useState<boolean | null>(null);
  // Gelecek hafta: şubenin planı yayınlandı mı, ve benim ilk vardiyam (bu hafta başka vardiya yoksa kartta gösterilir)
  const [nextWeekPublished, setNextWeekPublished] = useState(false);
  const [nextWeekFirst, setNextWeekFirst] = useState<any | null>(null);
  const [teamWeek, setTeamWeek] = useState<any[]>([]); // bu haftanın ekip vardiyaları (çalıştığı şubeler)
  const [dataLoading,   setDataLoading]   = useState(true);
  const [checkInLoading,setCheckInLoading]= useState(false);
  const [checkInError,  setCheckInError]  = useState("");
  const [elapsed,       setElapsed]       = useState("");
  const [now,           setNow]           = useState(new Date());
  const [emergencyOpen,    setEmergencyOpen]    = useState(false);
  const [emergencyMsg,     setEmergencyMsg]     = useState("");
  const [emergencySending, setEmergencySending] = useState(false);
  const [emergencySent,    setEmergencySent]    = useState(false);
  const qrAutoCheckinDone = useRef(false);

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
      const [shiftData, availData] = await Promise.all([
        fetch(`/api/shifts?personnel_id=${user.personnel_id}&week_start=${ws}&include_on_call=1`).then(r => r.json()),
        fetch(`/api/availability?personnel_id=${user.personnel_id}&week_start=${nws}`).then(r => r.json()),
      ]);
      // Bu ve gelecek hafta, çalıştığı TÜM şubelerde yayınlanmış plan (/api/shifts/team): bugün kimle çalışıyorum,
      // gelecek haftanın planı çıktı mı (iki şubede çalışan için ikisine de bakılır)
      const [teamNow, teamNext] = await Promise.all([
        fetch(`/api/shifts/team?week_start=${ws}`).then(r => r.json()).catch(() => null),
        fetch(`/api/shifts/team?week_start=${nws}`).then(r => r.json()).catch(() => null),
      ]);
      setTeamWeek(Array.isArray(teamNow?.shifts) ? teamNow.shifts : []);
      const nextRows = (Array.isArray(teamNext?.shifts) ? teamNext.shifts : []).map((s: any) => ({ ...s, week_start: nws }));
      setNextWeekPublished(nextRows.length > 0);
      setNextWeekFirst(nextRows.filter((s: any) => s.personnel_id === user.personnel_id).sort((a: any, b: any) => a.day - b.day)[0] ?? null);
      // İcap nöbeti ayrı: giriş/çıkış ve görev listesi sadece normal vardiyada
      const rows = Array.isArray(shiftData) ? shiftData : [];
      setShifts(rows.filter((s: any) => s.kind !== "on_call"));
      setOnCalls(rows.filter((s: any) => s.kind === "on_call"));
      setNextWeekAvail(availData?.exists ?? false);
    } catch {} finally { setDataLoading(false); }
  }, [user?.personnel_id, user?.location_id]);
  useEffect(() => { loadData(); }, [loadData]);

  // Önceki vardiyanın devir notları — bugün vardiyam varsa göster
  useEffect(() => {
    if (!user?.personnel_id) return;
    fetch("/api/shifts/handover")
      .then(r => r.ok ? r.json() : { notes: [], enabled: true })
      .then(d => {
        setHandoverNotes(Array.isArray(d?.notes) ? d.notes : []);
        setHandoverEnabled(d?.enabled !== false);
        setHandoverLogEnabled(d?.handover_log_enabled === true);
      })
      .catch(() => {});
  }, [user]);

  // today
  const todayIdx   = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const todayShift = shifts.find(s => s.day === todayIdx) ?? null;
  const todayOnCall = onCalls.find(s => s.day === todayIdx) ?? null;

  // elapsed timer
  useEffect(() => {
    if (!todayShift?.check_in_at || todayShift?.check_out_at) { setElapsed(""); return; }
    const tick = () => setElapsed(elapsedLabel(todayShift.check_in_at));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [todayShift?.check_in_at, todayShift?.check_out_at]);

  // Görev/Kontrol Listeleri (rules.task_management_enabled) — toggle kapalıyken
  // ya da bu vardiya için şablon tanımlanmamışsa liste boş döner, kart hiç görünmez.
  useEffect(() => {
    if (!todayShift?.id) { setShiftTasks([]); return; }
    fetch(`/api/shift-tasks?shift_assignment_id=${todayShift.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setShiftTasks(Array.isArray(d) ? d : []))
      .catch(() => setShiftTasks([]));
  }, [todayShift?.id]);

  const handleToggleTask = async (taskId: number, isCompleted: boolean) => {
    setTaskToggleBusy(taskId);
    setShiftTasks(prev => prev.map(t => t.id === taskId ? { ...t, is_completed: isCompleted } : t));
    try {
      await fetch("/api/shift-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, is_completed: isCompleted }),
      });
    } finally {
      setTaskToggleBusy(null);
    }
  };

  const handleEmergencyAlert = async () => {
    setEmergencySending(true);
    try {
      const r = await fetch("/api/emergency-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: emergencyMsg }),
      });
      if (r.ok) {
        setEmergencySent(true);
        setTimeout(() => { setEmergencyOpen(false); setEmergencySent(false); setEmergencyMsg(""); }, 2000);
      }
    } finally { setEmergencySending(false); }
  };

  const getGeoPosition = (): Promise<{ lat: number; lon: number } | null> =>
    new Promise(resolve => {
      if (!("geolocation" in navigator)) { resolve(null); return; }
      const timer = setTimeout(() => resolve(null), 6000);
      navigator.geolocation.getCurrentPosition(
        pos => { clearTimeout(timer); resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }); },
        () => { clearTimeout(timer); resolve(null); },
        { enableHighAccuracy: true, timeout: 5500 }
      );
    });

  const handleCheckIn = async (shiftId: number, acknowledgeHandoverId?: number) => {
    setCheckInLoading(true);
    setCheckInError("");
    try {
      const pos = await getGeoPosition();
      const r = await fetch("/api/shifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check_in", shift_id: shiftId, lat: pos?.lat, lon: pos?.lon,
          acknowledge_handover_id: acknowledgeHandoverId,
        }),
      });
      if (r.ok) {
        const ts = Math.floor(Date.now() / 1000);
        setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, check_in_at: ts } : s));
        setPendingHandoverModal(null);
      } else if (r.status === 428) {
        // rules.handover_log_enabled: bekleyen bir devir-teslim notu var — giriş
        // gerçekleşmedi, önce notu okuyup "Teslim Aldım" demesi gerekiyor.
        const data = await r.json().catch(() => ({}));
        if (data?.pending_handover) setPendingHandoverModal({ shiftId, handover: data.pending_handover });
        else setCheckInError(data.error || "Giriş kaydedilemedi.");
      } else {
        const err = await r.json().catch(() => ({}));
        setCheckInError(err.error || "Giriş kaydedilemedi.");
      }
    } catch {
      setCheckInError("Giriş kaydedilemedi.");
    } finally { setCheckInLoading(false); }
  };

  const handleAcknowledgeAndCheckIn = () => {
    if (!pendingHandoverModal) return;
    handleCheckIn(pendingHandoverModal.shiftId, pendingHandoverModal.handover.id);
  };

  const handleCheckOut = async (shiftId: number, handoverNote?: string) => {
    const ts = Math.floor(Date.now() / 1000);
    setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, check_out_at: ts } : s));
    setCheckInLoading(true);
    setCheckoutModal(null);
    const trimmedNote = handoverNote?.trim();
    try {
      // rules.handover_log_enabled açıksa not YENİ Devir-Teslim Defteri'ne gider
      // (ayrı bir POST — hedef vardiya otomatik belirlenir), eski handover_note
      // alanına hiç yazılmaz. Kapalıysa davranış eskisiyle birebir aynıdır.
      if (trimmedNote && handoverLogEnabled) {
        await fetch("/api/shift-handovers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shift_id: shiftId, note: trimmedNote }),
        }).catch(() => {});
      }
      const r = await fetch("/api/shifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check_out", shift_id: shiftId,
          handover_note: !handoverLogEnabled ? (trimmedNote || undefined) : undefined,
        }),
      });
      if (!r.ok) setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, check_out_at: null } : s));
    } catch {
      setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, check_out_at: null } : s));
    } finally { setCheckInLoading(false); }
  };

  // QR ile giriş: şube panosundaki QR kod /portal?qr=1'e yönlendirir. Bugün vardiyan
  // varsa ve henüz giriş yapmadıysan, sayfa açılır açılmaz otomatik giriş dener.
  useEffect(() => {
    if (qrAutoCheckinDone.current) return;
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).has("qr")) return;
    if (!todayShift || todayShift.check_in_at || todayShift.check_out_at || dataLoading) return;
    qrAutoCheckinDone.current = true;
    handleCheckIn(todayShift.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayShift, dataLoading]);

  if (!mounted) return <div className="p-5 space-y-5" />;

  // computed
  const totalHours    = shifts.reduce((acc: number, s: any) => acc + shiftDur(s), 0);
  const upcomingShifts = shifts.filter(s => s.day >= todayIdx).sort((a, b) => a.day - b.day);
  const isCheckedIn   = !!todayShift?.check_in_at && !todayShift?.check_out_at;
  const isCompleted   = !!todayShift?.check_out_at;
  const todayLabel    = now.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
  // Seninle çalışanlar (lib/coworkers): departman adı ekip verisinde
  const matesOf = (sh: any) => coworkersOf(teamWeek.find(t => t.id === sh.id) ?? sh, teamWeek, user?.personnel_id);
  const todayMates: string[] = todayShift ? matesOf(todayShift) : [];
  const multiBranch = new Set(teamWeek.map(t => t.location_id)).size > 1 || new Set(shifts.map(s => s.location_id)).size > 1;
  // Sağ sütun: bugünden sonraki vardiyalar (en fazla 4)
  const nextShifts = shifts.filter(s => s.day > todayIdx).sort((a, b) => a.day - b.day).slice(0, 4);

  return (
    <Page className="animate-in fade-in duration-300">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <PageHeader eyebrow={todayLabel} title={`Merhaba, ${user?.name?.split(" ")[0] ?? ""} 👋`} />

      {/* Geniş ekranda iki sütun: solda bugün ve hafta, sağda yapılacaklar ve bildirimler */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
      <div className="space-y-6 min-w-0">

      {/* ── Hero: Bugün ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-primary via-forest-600 to-slate-900 rounded-2xl p-6 text-white shadow-xl shadow-primary/20 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-forest-400/20 rounded-full blur-2xl" />
        <div className="relative z-10">

          {/* label */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-forest-200 text-xs font-semibold bg-white/10 px-3 py-1.5 rounded-full border border-white/20">
                {isCheckedIn ? <Timer size={12} /> : <Clock size={12} />}
                {isCheckedIn ? "Şu an çalışıyorsunuz" : isCompleted ? `${words.Shift} bitti` : "Bugün"}
              </div>
            </div>
            {/* Sadece durum değişince: başlamamış vardiyada "Onaylandı" yazıyordu (yayınlanmış her vardiya zaten öyle) */}
            {todayShift && (isCompleted || isCheckedIn) && (
              <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                isCompleted ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/30" :
                              "bg-amber-400/20 text-amber-200 border-amber-400/30 animate-pulse"
              }`}>
                {isCompleted ? "Tamamlandı ✓" : "● Vardiyada"}
              </span>
            )}
          </div>

          {todayOnCall && !dataLoading && (
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-violet-300/40 bg-violet-400/20 px-3 py-1 text-xs font-semibold text-violet-50"
              title="Nöbet: evde beklersiniz, çağrılırsanız gelirsiniz. Ne kadar çalıştığınızı sorumlunuz kaydeder.">
              Bugün nöbetçisin · {todayOnCall.start_time}–{todayOnCall.end_time}
            </div>
          )}
          {/* content */}
          {dataLoading ? (
            <div className="animate-pulse space-y-2 mb-5">
              <div className="h-12 bg-white/10 rounded-xl w-3/4" />
              <div className="h-4 bg-white/10 rounded-xl w-1/2" />
            </div>
          ) : todayShift ? (
            <div className="mb-5">
              <div className="text-4xl font-bold tracking-tight mb-1.5">
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
              <p className="text-forest-200/70 text-sm flex items-center gap-2 flex-wrap">
                <span>{shiftDur(todayShift)} saatlik {words.shift}</span>
                {todayShift.department_name && <><span className="opacity-40">·</span><span>{todayShift.department_name}</span></>}
                {todayShift.location_name && (
                  <><span className="opacity-40">·</span><MapPin size={11} className="inline -mt-px" /> {todayShift.location_name}</>
                )}
              </p>
              {todayMates.length > 0 && (
                <p className="text-sm text-forest-100 mt-2">
                  <span className="text-forest-200/70">Bugün sizinle:</span> {todayMates.slice(0, 5).join(", ")}{todayMates.length > 5 ? ` +${todayMates.length - 5}` : ""}
                </p>
              )}
            </div>
          ) : (
            <div className="mb-5">
              <div className="text-2xl font-bold mb-1 text-white/70">Bugün {words.shift} yok</div>
              {upcomingShifts.length > 0 ? (
                <p className="text-forest-200/70 text-sm">
                  Sonraki: <span className="font-bold text-forest-100">{DAY_NAMES[upcomingShifts[0].day]}, {upcomingShifts[0].start_time}{multiBranch && upcomingShifts[0].location_name ? ` · ${upcomingShifts[0].location_name}` : ""}</span>
                </p>
              ) : nextWeekFirst ? (
                <p className="text-forest-200/70 text-sm">
                  Sonraki: <span className="font-bold text-forest-100">{formatDateTR(addDays(nextWeekFirst.week_start, Number(nextWeekFirst.day)))}, {nextWeekFirst.start_time}</span>
                </p>
              ) : (
                // Asıl soru "sonraki vardiyam ne zaman": plan yoksa bunu söyle
                <p className="text-forest-200/70 text-sm">
                  {nextWeekPublished ? `Bu hafta ve gelecek hafta ${words.shift} yok.` : "Gelecek haftanın planı henüz yayınlanmadı. Yayınlanınca bildirim gelir."}
                </p>
              )}
            </div>
          )}

          {checkInError && (
            <div className="bg-red-500/20 border border-red-300/40 text-white text-xs font-semibold rounded-xl px-3 py-2 mb-2.5">
              {checkInError}
            </div>
          )}
          {/* buttons */}
          <div className="flex gap-2.5">
            {todayShift && !todayShift.check_in_at && !isCompleted && (
              <button onClick={() => handleCheckIn(todayShift.id)} disabled={checkInLoading}
                className="flex-[2] bg-emerald-400 hover:bg-emerald-300 text-white text-sm font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-60">
                <PlayCircle size={15} /> {checkInLoading ? "…" : "Vardiyayı Başlat"}
              </button>
            )}
            {todayShift && isCheckedIn && (
              <button onClick={() => { if (!handoverEnabled && !handoverLogEnabled) { handleCheckOut(todayShift.id); return; } setHandoverDraft(""); setCheckoutModal(todayShift.id); }} disabled={checkInLoading}
                className="flex-[2] bg-amber-400 hover:bg-amber-300 text-white text-sm font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-60">
                <StopCircle size={15} /> {checkInLoading ? "…" : "Vardiyayı Bitir"}
              </button>
            )}
            {/* Uygunluk kapalıysa yok; eksikse aşağıdaki uyarı zaten aynı yere götürüyor */}
            {(!todayShift || isCompleted) && availEnabled === true && nextWeekAvail !== false && !nextWeekPublished && (
              <button onClick={() => router.push("/portal/availability")}
                className="flex-[2] bg-white text-primary text-sm font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.97]">
                <Zap size={14} /> Uygunluk Gir
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Önceki vardiyadan devir notu ─────────────────────────────────── */}
      {todayShift && !isCompleted && handoverNotes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-semibold text-amber-800">📋 Önceki Vardiyadan Devir Notu</p>
          {handoverNotes.map((n, i) => (
            <div key={i} className="bg-white/70 rounded-xl px-3 py-2">
              <p className="text-sm text-slate-700 leading-relaxed">{n.note}</p>
              <p className="text-xs text-amber-600 font-semibold mt-1">{n.author} · {n.shift}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Görevlerim (rules.task_management_enabled) ──────────────────── */}
      {todayShift && shiftTasks.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <ClipboardList size={14} /> Görevlerim
            <span className="ml-auto text-slate-400 font-bold normal-case">
              {shiftTasks.filter(t => t.is_completed).length}/{shiftTasks.length}
            </span>
          </p>
          {shiftTasks.map(t => (
            <button
              key={t.id}
              onClick={() => handleToggleTask(t.id, !t.is_completed)}
              disabled={taskToggleBusy === t.id}
              className="w-full flex items-center gap-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-60"
            >
              <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${t.is_completed ? "bg-emerald-500 border-emerald-500" : "border-slate-300"}`}>
                {t.is_completed && <Check size={12} className="text-white" />}
              </span>
              <span className={`text-sm font-medium ${t.is_completed ? "text-slate-400 line-through" : "text-slate-700"}`}>{t.task_description}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Bekleyen devir-teslim notu — girişi engeller, kapatılamaz ─── */}
      {pendingHandoverModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-2 text-amber-600">
              <AlertCircle size={20} />
              <h3 className="text-base font-bold text-slate-900">Devir-Teslim Notu</h3>
            </div>
            <p className="text-xs text-slate-500">
              Giriş yapmadan önce sizden önceki vardiyanın bıraktığı notu okuyup teslim almanız gerekiyor.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
              <p className="text-sm text-slate-800 leading-relaxed">{pendingHandoverModal.handover.note}</p>
              <p className="text-xs text-amber-600 font-semibold mt-2">
                {pendingHandoverModal.handover.author_name} · {timeAgo(pendingHandoverModal.handover.created_at)}
              </p>
            </div>
            <button
              onClick={handleAcknowledgeAndCheckIn}
              disabled={checkInLoading}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-60"
            >
              {checkInLoading ? "…" : "Okudum, Teslim Aldım"}
            </button>
          </div>
        </div>
      )}

      {/* ── Çıkış devir notu ──────────────────────────────────────────── */}
      <Sheet open={checkoutModal !== null} onClose={() => setCheckoutModal(null)} title="Vardiyadan çıkış"
        description="Sonraki vardiyaya iletmek istediğiniz bir not var mı? (isteğe bağlı)"
        footer={checkoutModal !== null && <>
          <button onClick={() => handleCheckOut(checkoutModal)} className={sheetSecondaryClass}>Notsuz çık</button>
          <button onClick={() => handleCheckOut(checkoutModal, handoverDraft)} disabled={!handoverDraft.trim()} className={sheetPrimaryClass}>Notu bırak ve çık</button>
        </>}>
        <textarea
          value={handoverDraft}
          onChange={e => setHandoverDraft(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Örn: 3 no'lu pres arızalı, teknik servis çağrıldı. Sevkiyat paletleri hazır."
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
        />
      </Sheet>

      </div>
      <div className="space-y-6 min-w-0">
      {/* ── Yaklaşan vardiyalar: nerede, kimle ─────────────────────────── */}
      {!dataLoading && nextShifts.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            {/* Sadeleştirme (2026-10-07): "Bu Hafta" şeridi kalktı, haftanın toplamı burada */}
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-800">Yaklaşan {words.shift}larınız</span>
              <span className="block text-xs font-semibold text-slate-400">Bu hafta {shifts.length} {words.shift} · {totalHours.toFixed(0)} saat</span>
            </span>
            <Link href="/portal/calendar" className="text-xs font-semibold text-primary flex items-center gap-0.5">Tümü <ChevronRight size={13} /></Link>
          </div>
          <div className="divide-y divide-slate-50">
            {nextShifts.map(s => {
              const mates = matesOf(s);
              return (
                <Link key={s.id} href="/portal/calendar" className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="w-11 shrink-0 text-center rounded-xl py-1 bg-slate-100 text-slate-600">
                    <p className="text-xs font-semibold">{SHORT[s.day]}</p>
                    <p className="text-sm font-bold leading-none mt-0.5">{Number(addDays(s.week_start, Number(s.day)).slice(8))}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 tabular-nums">{s.start_time}–{s.end_time}</p>
                    {multiBranch && s.location_name && <p className="text-xs font-semibold text-violet-700 truncate">{s.location_name}</p>}
                    {mates.length > 0 && <p className="text-xs text-slate-500 truncate">Sizinle: {mates.slice(0, 4).join(", ")}{mates.length > 4 ? ` +${mates.length - 4}` : ""}</p>}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Kısayollar: alt menüden çıkarılan sayfalar + acil durum ──────── */}
      <div className="flex flex-wrap gap-2">
        {/* Uygunluk uyarı kutusu çıkıyorsa kısayol tekrar etmez */}
        {availEnabled === true && !(nextWeekAvail === false && !nextWeekPublished) && (
          <Link href="/portal/availability"
            className="inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            <Clock size={13} /> Uygunluk
          </Link>
        )}
        {openShiftsEnabled && openShiftCount > 0 && (
          <Link href="/portal/open-shifts"
            className="inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            <Megaphone size={13} /> {words.OpenShifts} ({openShiftCount})
          </Link>
        )}
      </div>

      <Sheet open={emergencyOpen} onClose={() => { if (!emergencySending) setEmergencyOpen(false); }}
        title={emergencySent ? "Bildirim gönderildi" : "Acil durum bildir"}
        description={emergencySent ? "Bildirim sorumlularınıza ulaştı." : "İş yerindeki kaza, yangın, sağlık sorunu gibi gerçek acil durumlar için. Bütün sorumlularınıza hemen bildirim gider."}
        footer={emergencySent ? (
          <button onClick={() => setEmergencyOpen(false)} className={sheetSecondaryClass}>Kapat</button>
        ) : <>
          <button onClick={() => setEmergencyOpen(false)} disabled={emergencySending} className={sheetSecondaryClass}>Vazgeç</button>
          <button onClick={handleEmergencyAlert} disabled={emergencySending}
            className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50">
            {emergencySending ? "Gönderiliyor…" : "Bildir"}
          </button>
        </>}>
        {!emergencySent && (
          <p className="text-xs text-slate-500 mb-2">
            Vardiyaya gelemeyecek ya da geç kalacaksanız bunu{" "}
            <Link href="/portal/requests" className="font-semibold text-primary hover:underline">Talepler › Yeni talep</Link>{" "}
            ile bildirin.
          </p>
        )}
        {!emergencySent && (
          <textarea
            value={emergencyMsg}
            onChange={e => setEmergencyMsg(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Örn: İş yerinde biri yaralandı, hemen gelin."
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
          />
        )}
      </Sheet>

      {/* ── Uygunluk hatırlatıcı ────────────────────────────────────────── */}
      {availEnabled === true && nextWeekAvail === false && !nextWeekPublished && (
        <div className="flex items-center gap-3 bg-ember-50 border border-ember-200 rounded-2xl px-4 py-3.5">
          <div className="w-9 h-9 bg-ember-100 rounded-xl flex items-center justify-center shrink-0">
            <AlertCircle size={18} className="text-ember-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-ember-800">Gelecek hafta için uygunluğunuzu girin</p>
            <p className="text-xs text-ember-600 mt-0.5">Gelemeyeceğiniz günleri işaretleyin. Bütün günler uygunsa da bir kez kaydedin.</p>
          </div>
          <Link href="/portal/availability"
            className="text-xs font-semibold text-ember-700 bg-white border border-ember-200 px-4 min-h-[44px] inline-flex items-center rounded-xl whitespace-nowrap hover:bg-ember-50 transition-colors shrink-0">
            Aç
          </Link>
        </div>
      )}

      {/* Bildirimler listesi kalktı (sadeleştirme 2026-10-07): üstteki zil aynı işi yapıyor */}
      {/* Acil durum: gerçek acil durumlar için, sayfanın en altında sade bir bağlantı */}
      <div className="flex justify-center pt-2">
        <button onClick={() => setEmergencyOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-semibold text-slate-400 hover:text-red-600 transition-colors">
          <AlertCircle size={13} /> Acil durum bildir
        </button>
      </div>
      </div>
      </div>
    </Page>
  );
}
