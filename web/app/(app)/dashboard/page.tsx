"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

// Ana Sayfa: tablo ve KPI kartı yerine "Günün Özeti ve Bekleyen İşler".
// Maddeleri lib/inbox.ts üretir; bu sayfa sadece veriyi toplar ve çizer.

import { addDays, businessToday, formatDateTR } from "@/lib/date";
import { useState, useEffect, useRef } from "react";
import { useManagerAuth } from "@/hooks/useAuth";
import {
  Users, AlertTriangle, Check, ArrowRight, CheckCircle2,
  CalendarClock, ClipboardList, Megaphone, UserPlus, BookOpen, Timer, Bell, ChevronDown, FileWarning, Store,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isModuleOn } from "@/lib/moduleVisibility";
import { buildInbox, greeting, type InboxItem, type NextWeekState } from "@/lib/inbox";
import { canPublishPlan, departmentScope } from "@/lib/userAccess";
import { Avatar } from "@/components/ui/Avatar";
import { StatusPill } from "@/components/ui/StatusPill";
import { AUTOPILOT_DEFAULT_HOUR, autopilotWhen } from "@/lib/autopilotRules";
import { industryFromRules } from "@/lib/templates";
import { cn } from "@/lib/utils";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { SuggestionsCard } from "@/components/dashboard/SuggestionsCard";
import { MonthlyGainCard } from "@/components/dashboard/MonthlyGainCard";
import type { Suggestion } from "@/lib/suggestions";

const ITEM_ICON: Record<string, any> = {
  "add-personnel": UserPlus,
  late:            AlertTriangle,
  fatigue:         AlertTriangle,
  approvals:       ClipboardList,
  accounts:        UserPlus,
  handover:        BookOpen,
  tasks:           CheckCircle2,
  "open-shifts":   Megaphone,
  "next-week":     CalendarClock,
  availability:    Bell,
  overtime:        Timer,
  certifications:  FileWarning,
  industry:        Store,
};

const SEVERITY_STYLE = {
  critical: { dot: "bg-red-500",   icon: "bg-red-50 text-red-600",     label: "Acil",      labelCls: "text-red-600" },
  today:    { dot: "bg-amber-500", icon: "bg-amber-50 text-amber-600", label: "Bugün",     labelCls: "text-amber-600" },
  week:     { dot: "bg-slate-300", icon: "bg-slate-100 text-slate-500", label: "Bu hafta içinde", labelCls: "text-slate-400" },
} as const;

const isPublishedRow = (s: any) => (!s.publication_status || s.publication_status === "published") && s.kind !== "on_call";

export default function DashboardPage() {
  const router = useRouter();
  const { user, mounted } = useManagerAuth();
  const [personnel, setPersonnel] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [todayShifts, setTodayShifts] = useState<any[]>([]);
  const [openShiftCount, setOpenShiftCount] = useState(0);
  const [openShiftNearest, setOpenShiftNearest] = useState<{ date: string; start: string } | null>(null);
  const [availMissing, setAvailMissing] = useState(0);
  const [nextWeek, setNextWeek] = useState<NextWeekState>("published");
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [pendingAccounts, setPendingAccounts] = useState(0);
  // Departman sorumlusu: hesap sahibi departmanın planını da oluşturduysa (lib/chefPlanNotice)
  const [deptPlan, setDeptPlan] = useState<{ title: string; detail: string; href?: string } | null>(null);
  // Yayın yetkisi olan sorumlu: gelecek hafta için planını onaya gönderen departmanlar (Bekleyen İşler'de söylenir)
  const [submittedDepts, setSubmittedDepts] = useState<string[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [handoverUnread, setHandoverUnread] = useState(0);
  const [certAttention, setCertAttention] = useState<{ expired: number; expiring: number }>({ expired: 0, expiring: 0 });
  const [remindState, setRemindState] = useState<"idle" | "sending" | "sent">("idle");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [rules, setRules] = useState<Record<string, unknown>>({});
  const [autopilot, setAutopilot] = useState<{ enabled: boolean; day: number; hour?: number; upcoming: boolean; last_draft_week: string | null } | null>(null);
  const [todayTasks, setTodayTasks] = useState<any[]>([]);
  const [fatigueAtRisk, setFatigueAtRisk] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showAllToday, setShowAllToday] = useState(false);
  const lateAutoCreated = useRef<Set<number>>(new Set());

  const getTodayWeekStart = () => {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  };
  const todayIdx = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();

  // Planlama hedefi: gelecek haftanın pazartesi tarihi
  const getNextWeekStart = () => {
    const [y, mo, d] = getTodayWeekStart().split("-").map(Number);
    const nextMonday = new Date(y, mo - 1, d + 7);
    return `${nextMonday.getFullYear()}-${String(nextMonday.getMonth() + 1).padStart(2, "0")}-${String(nextMonday.getDate()).padStart(2, "0")}`;
  };

  const loadData = async (u: typeof user) => {
    setLoading(true);
    const json = (url: string) => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
    const list = (d: any) => (Array.isArray(d) ? d : []);
    // Hazır çözümler (lib/suggestions) ayrı yüklenir: yedek araması diğer kartları bekletmesin
    if (u?.location_id) json(`/api/suggestions?location_id=${u.location_id}`).then(d => setSuggestions(list(d?.suggestions)));
    // Departman sorumlusu: okunmamış "departman planı hazırlandı" bildirimi Bekleyen İşler'de gösterilir
    if (departmentScope(u) && u?.personnel_id) {
      json(`/api/notifications?personnel_id=${u.personnel_id}`).then(d => {
        const n = list(d).find((x: any) => x.type === "dept_plan" && !x.is_read);
        setDeptPlan(n ? { title: n.title, detail: n.message, href: n.link ?? undefined } : null);
      });
    }
    if (canPublishPlan(u) && !departmentScope(u) && u?.location_id) {
      json(`/api/plan-submissions?location_id=${u.location_id}&week_start=${getNextWeekStart()}`).then(d => {
        const deps = Array.isArray(d?.departments) ? d.departments : [];
        setSubmittedDepts(deps.filter((x: any) => x.submitted).map((x: any) => x.submitted_by_name ? `${x.department_name} (${x.submitted_by_name})` : x.department_name));
      });
    }
    try {
      const loc = u.location_id;
      const weekStart = getTodayWeekStart();
      const canApproveAccounts = u.role === "admin" || u.role === "supervisor";
      const [personnelData, shiftsData, openShiftsData, availData, nextShiftsData, locData,
             leaves, swaps, edits, overtimes, accounts, autopilotData, unreadData, loans, ruleExceptions] = await Promise.all([
        json(`/api/personnel?location_id=${loc}`),
        json(`/api/shifts?location_id=${loc}&week_start=${weekStart}`),
        json(`/api/open-shifts?location_id=${loc}`),
        json(`/api/availability/team?location_id=${loc}&week_start=${getNextWeekStart()}`),
        json(`/api/shifts?location_id=${loc}&week_start=${getNextWeekStart()}`),
        json(`/api/locations?id=${loc}`),
        // Onaylar sayfasının "bekleyen" saydığı dört kalem (aynı filtreler requests/page.tsx'te)
        json(`/api/leave-requests?location_id=${loc}`),
        json(`/api/swap-requests?org_id=${u.org_id}&location_id=${loc}&status=peer_accepted`),
        json(`/api/shift-edit-requests?org_id=${u.org_id}&location_id=${loc}`),
        json(`/api/overtime?location_id=${loc}&status=pending`),
        canApproveAccounts ? json(`/api/users?approval_status=pending`) : Promise.resolve([]),
        json(`/api/autopilot?location_id=${loc}`),
        json(`/api/messages/unread-count`),
        json(`/api/open-shifts/loans?location_id=${loc}`),
        json(`/api/rule-exceptions?location_id=${loc}`),
      ]);
      setAutopilot(autopilotData && !autopilotData.error ? autopilotData : null);
      setUnreadMessages(typeof unreadData?.count === "number" ? unreadData.count : Number(unreadData?.count ?? 0) || 0);

      const next = list(nextShiftsData);
      setPersonnel(list(personnelData));
      // Canlı durum ve geç kalma sadece yayınlanmış vardiyalar için (taslağı personel görmedi)
      // Departman şefi sadece kendi ekibini görür (personel listesi zaten departmanına süzülü)
      const team = departmentScope(u) ? new Set(list(personnelData).map((p: any) => p.id)) : null;
      setTodayShifts(list(shiftsData).filter((s: any) => s.day === todayIdx && isPublishedRow(s) && (!team || team.has(s.personnel_id))));
      // Devir ilanında vardiya hâlâ sahibinde (boşluk yok); geçmiş tarihli ilanlar da sayılmaz
      const today = businessToday();
      const gaps = list(openShiftsData)
        .filter((s: any) => s.status === "open" && !s.source_assignment_id && s.date >= today)
        .sort((a: any, b: any) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`));
      setOpenShiftCount(gaps.length);
      setOpenShiftNearest(gaps[0] ? { date: gaps[0].date, start: gaps[0].start_time } : null);
      setAvailMissing(Array.isArray(availData?.personnel) ? availData.personnel.filter((p: any) => !p.submitted).length : 0);
      setNextWeek(
        next.length === 0 ? "none"
        : next.some((s: any) => !s.publication_status || s.publication_status === "published") ? "published"
        : "draft"
      );
      setPendingApprovals(
        list(leaves).filter((l: any) => l.status === "pending").length +
        list(swaps).filter((s: any) => s.status === "peer_accepted").length +
        list(edits).filter((e: any) => e.status === "pending").length +
        list(overtimes).filter((o: any) => o.status === "pending").length +
        list(loans).length +
        list(ruleExceptions).length
      );
      setPendingAccounts(list(accounts).length);

      const r = Array.isArray(locData) && locData[0]?.rules ? JSON.parse(locData[0].rules) : {};
      setRules(r);
      const [tasks, fatigue, handovers, certDocs] = await Promise.all([
        isModuleOn(r, "task_management_enabled") ? json(`/api/shift-tasks?location_id=${loc}&week_start=${weekStart}`) : null,
        isModuleOn(r, "fatigue_radar_enabled") ? json(`/api/fatigue-radar?location_id=${loc}`) : null,
        isModuleOn(r, "handover_log_enabled") ? json(`/api/shift-handovers?location_id=${loc}&status=unread`) : null,
        isModuleOn(r, "compliance_tracking_enabled") ? json(`/api/personnel-documents?location_id=${loc}&attention=1`) : null,
      ]);
      // Kişi bazında tekil: bir kişinin süresi dolmuş belgesi varsa "dolmuş" sayılır
      const certRows = list(certDocs);
      const expiredPeople = new Set(certRows.filter((d: any) => d.status === "expired").map((d: any) => d.personnel_id));
      const expiringPeople = new Set(certRows.filter((d: any) => d.status === "expiring" && !expiredPeople.has(d.personnel_id)).map((d: any) => d.personnel_id));
      setCertAttention({ expired: expiredPeople.size, expiring: expiringPeople.size });
      setTodayTasks(list(tasks).filter((t: any) => t.day === todayIdx));
      setFatigueAtRisk(Array.isArray(fatigue?.at_risk) ? fatigue.at_risk : []);
      setHandoverUnread(list(handovers).length);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // Hazır çözüm ya da asistan işlemi uygulanınca (lib/copilot/applyAction) Bekleyen İşler tazelenir
  useEffect(() => {
    if (!user?.location_id) return;
    const reload = () => loadData(user);
    window.addEventListener("optishift_data_changed", reload);
    return () => window.removeEventListener("optishift_data_changed", reload);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!mounted || !user) return;
    if (!user.location_id) { router.push("/onboarding"); return; }
    loadData(user);
    // Planlama motorunu arka planda uyandır: müdür buradan "Planı Oluştur"a geçene kadar ısınır
    fetch("/api/engine/warm").catch(() => {});

    // Otomatik uygunluk hatırlatması — vadesi geldiyse haftada bir kez tetiklenir
    // (cron yok; endpoint kendi içinde "vadesi geldi mi / bu hafta gönderildi mi" kontrolü yapar)
    const locId = localStorage.getItem("optishift_selected_location") || user.location_id;
    fetch("/api/availability/remind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location_id: locId, auto: true }),
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, user]);

  // Dakikada bir "now" güncelle (geç kalan tespiti için) + 60 sn'de bir canlı durumu yenile
  useEffect(() => {
    const tickClock = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tickClock);
  }, []);

  useEffect(() => {
    if (!user?.location_id) return;
    const refreshShifts = setInterval(async () => {
      try {
        const res = await fetch(`/api/shifts?location_id=${user.location_id}&week_start=${getTodayWeekStart()}`);
        const data = await res.json();
        if (Array.isArray(data)) setTodayShifts(data.filter((s: any) => s.day === todayIdx && isPublishedRow(s)));
      } catch {}
    }, 60_000);
    return () => clearInterval(refreshShifts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.location_id]);

  // Gelecek hafta uygunluğunu girmeyenlere hatırlatma bildirimi gönder
  const handleRemindAvailability = async () => {
    if (!user?.location_id || remindState !== "idle") return;
    setRemindState("sending");
    try {
      await fetch("/api/availability/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: user.location_id, week_start: getNextWeekStart() }),
      });
      setRemindState("sent");
    } catch {
      setRemindState("idle");
    }
  };

  const openShiftsEnabled = isModuleOn(rules, "open_shifts_enabled");
  const autoOpenOnLate    = rules.auto_open_shift_on_late !== false;
  const lateThresholdMin  = typeof rules.late_threshold_min === "number" ? rules.late_threshold_min : 30;
  const heroBonus         = rules.hero_bonus_enabled === false ? 0 : typeof rules.hero_bonus_points === "number" ? rules.hero_bonus_points : 6;
  const maxYtdOvertime    = typeof rules.max_ytd_overtime_hours === "number" ? rules.max_ytd_overtime_hours : 270;

  // Vardiya başlangıcından eşik süre (rules.late_threshold_min) geçmiş, henüz giriş yok → geç kalan
  // rules.checkin_required kapalıyken giriş bilgi amaçlıdır, eksikliği hiç kimseyi "geç kalan" yapmaz
  const isLate = (s: any): boolean => {
    if (!isModuleOn(rules, "checkin_required") || s.check_in_at || !s.start_time) return false;
    const [h, m] = s.start_time.split(":").map(Number);
    return now.getHours() * 60 + now.getMinutes() >= h * 60 + m + lateThresholdMin;
  };

  // Vardiyanın saate göre durumu: giriş kaydı tutulmayan şubede (checkin_required kapalı) "Bekleniyor"
  // vardiya bitse de kalıyor, bitmiş vardiyaya "Yerine bul" çıkıyordu (tam test 2026-10-05)
  const shiftPhase = (s: any): "before" | "during" | "after" => {
    if (!s.start_time || !s.end_time) return "before";
    const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const start = toMin(s.start_time); let end = toMin(s.end_time); if (end <= start) end += 1440;
    const cur = now.getHours() * 60 + now.getMinutes();
    return cur >= end ? "after" : cur >= start ? "during" : "before";
  };
  const checkinTracked = isModuleOn(rules, "checkin_required");

  // Gelmeyen personelin vardiyasını açık vardiyaya dönüştür: atama kişinin
  // takviminden düşer, ilan havuzuna girer, kişiye + ekibe bildirim gider.
  const convertToOpenShift = async (s: any, auto: boolean) => {
    if (lateAutoCreated.current.has(s.id) || !user?.location_id) return;
    lateAutoCreated.current.add(s.id);
    try {
      const res = await fetch("/api/open-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          convert_assignment_id: s.id,
          reason: auto ? "no_show" : "absence",
          hero_bonus_multiplier: heroBonus,
        }),
      });
      if (!res.ok) { lateAutoCreated.current.delete(s.id); return; }
      // Atama artık ilanda — canlı listeden düşür, açık vardiya sayısını güncelle
      setTodayShifts(prev => prev.filter((x: any) => x.id !== s.id));
      setOpenShiftCount(c => c + 1);
    } catch { lateAutoCreated.current.delete(s.id); }
  };

  // Geç kalanların vardiyasını otomatik ilana çevir (Ayarlar → Gelişmiş Seçenekler → Vardiya Girişi ve Canlı Durum).
  // Her dakika "now" ile yeniden değerlendirilir; aynı atama iki kez çevrilmez (lateAutoCreated).
  useEffect(() => {
    if (!openShiftsEnabled || !autoOpenOnLate) return;
    todayShifts.filter(s => !s.check_in_at && isLate(s)).forEach(s => convertToOpenShift(s, true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayShifts, now, rules]);

  if (!mounted || !user) return <div className="space-y-8" />;

  const lateShifts = todayShifts.filter(s => !s.check_in_at && isLate(s));

  const inbox = loading ? [] : buildInbox({
    now,
    personnelCount: personnel.length,
    lateCount: openShiftsEnabled && autoOpenOnLate ? 0 : lateShifts.length,
    nextWeek,
    canPublish: canPublishPlan(user),
    // Hazır çözümü gösterilen izin talepleri Bekleyen İşler'de ikinci kez sayılmaz
    pendingApprovals: Math.max(0, pendingApprovals - suggestions.filter(s => s.action.kind === "review_leave").length),
    pendingAccounts,
    deptPlan,
    submittedDepts,
    notJoined: personnel.filter((p: any) => p.user_id && p.is_temp_password && p.status !== "inactive").length,
    unreadMessages: isModuleOn(rules, "chat_enabled") ? unreadMessages : 0,
    availability: { enabled: isModuleOn(rules, "availability_collection_enabled"), missing: availMissing },
    openShifts:   {
      enabled: openShiftsEnabled, count: openShiftCount,
      soon: openShiftNearest ? openShiftNearest.date <= addDays(businessToday(), 1) : undefined,
      nearest: openShiftNearest ? `${formatDateTR(openShiftNearest.date)}, ${openShiftNearest.start}` : null,
    },
    overtime:     { enabled: isModuleOn(rules, "overtime_tracking_enabled"),
                    nearLimit: personnel.filter((p: any) => (p.ytd_overtime_hours ?? 0) >= maxYtdOvertime * 0.8).length },
    fatigue:      { enabled: isModuleOn(rules, "fatigue_radar_enabled"),
                    critical: fatigueAtRisk.filter((r: any) => r.riskLevel === "danger").length,
                    warning:  fatigueAtRisk.filter((r: any) => r.riskLevel !== "danger").length },
    handover:     { enabled: isModuleOn(rules, "handover_log_enabled"), unread: handoverUnread },
    tasks:        { enabled: isModuleOn(rules, "task_management_enabled"),
                    total: todayTasks.length, done: todayTasks.filter((t: any) => t.is_completed).length },
    certifications: { enabled: isModuleOn(rules, "compliance_tracking_enabled"), ...certAttention },
    // Şubenin sektörü seçiliyse maddeler sektörün diliyle ve önceliğiyle gelir
    nudges: industryFromRules(rules)?.nudges ?? null,
    // Geri alınamaz, işletme düzeyinde karar: görev sadece işletme sahibine çıkar (müdür ve bölge müdürüne değil)
    industrySelected: user?.role === "admin" ? industryFromRules(rules) !== null : undefined,
    autopilot: autopilot?.enabled ? {
      drafted: autopilot.last_draft_week === getNextWeekStart(),
      upcoming: autopilot.upcoming,
      when: autopilotWhen({ day: autopilot.day, hour: autopilot.hour ?? AUTOPILOT_DEFAULT_HOUR }),
    } : undefined,
  });

  // Sadeleştirme (2026-10-07): üstte tek bilgi; ekip sayısı Ekip'te, yayın ortalaması Raporlar'da
  const summary = [
    { icon: Users, text: todayShifts.length > 0 ? `Bugün ${todayShifts.length} kişi çalışıyor` : "Bugün kimse çalışmıyor" },
  ];

  const renderAction = (item: InboxItem) => {
    const a = item.action;
    const cls = "shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors";
    if ("href" in a) {
      return (
        <Link href={a.href} className={cn(cls, item.severity === "critical" ? "bg-primary text-white hover:bg-primary/90" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>
          {a.label} <ArrowRight size={13} />
        </Link>
      );
    }
    if (a.kind === "remind-availability") {
      return (
        <button onClick={handleRemindAvailability} disabled={remindState !== "idle"} className={cn(cls, "bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-70")}>
          {remindState === "sent" ? <><Check size={13} /> Gönderildi</> : remindState === "sending" ? "Gönderiliyor…" : <><Bell size={13} /> {a.label}</>}
        </button>
      );
    }
    const open = expanded[item.id] ?? item.severity === "critical";
    return (
      <button onClick={() => setExpanded(e => ({ ...e, [item.id]: !open }))} aria-expanded={open} className={cn(cls, "bg-slate-100 text-slate-700 hover:bg-slate-200")}>
        {a.label} <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />
      </button>
    );
  };

  return (
    <Page width="narrow" className="animate-in fade-in duration-500">
      {/* Günün özeti */}
      <div>
        <PageHeader eyebrow={now.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" })}
          title={`${greeting(now)}, ${user.name}`} />
        {!loading && (
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
            {summary.map(({ icon: Icon, text }) => (
              <span key={text} className="flex items-center gap-1.5 text-sm text-slate-600">
                <Icon size={15} className="text-slate-400" /> {text}
              </span>
            ))}
          </div>
        )}
      </div>

      <SuggestionsCard suggestions={suggestions} />
      <MonthlyGainCard locationId={user.location_id ?? null} />

      {/* Bekleyen işler */}
      <Card className="stripe-card border-0 shadow-none">
        <CardHeader className="border-b border-border/40 pb-4">
          <div className="flex items-center gap-2.5">
            <CardTitle className="text-base font-bold">Bekleyen İşler</CardTitle>
            {!loading && inbox.length > 0 && <Badge variant="secondary">{inbox.length}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : inbox.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center px-6">
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <Check size={28} className="text-emerald-500" strokeWidth={3} />
              </div>
              <p className="text-base font-bold text-slate-800">Her şey yolunda</p>
              <p className="text-sm text-slate-500 mt-1">Şu an bekleyen bir işiniz yok.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {inbox.map(item => {
                const Icon = ITEM_ICON[item.id] ?? ClipboardList;
                const sev = SEVERITY_STYLE[item.severity];
                const showRisk = item.id === "fatigue" && (expanded.fatigue ?? item.severity === "critical");
                return (
                  <li key={item.id} className="px-5 py-4">
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", sev.icon)}>
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800">{item.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          <span className={cn("font-bold", sev.labelCls)}>{sev.label}</span>
                          {item.detail && <> · {item.detail}</>}
                        </p>
                        {/* Telefonda düğme metnin altında, başlığı sıkıştırmasın */}
                        <div className="flex mt-2.5 sm:hidden">{renderAction(item)}</div>
                      </div>
                      <div className="hidden sm:flex">{renderAction(item)}</div>
                    </div>
                    {showRisk && (
                      <div className="mt-3 ml-[54px] space-y-2">
                        {fatigueAtRisk.map((r: any) => (
                          <div key={r.personnel_id} className={cn("flex items-start gap-2.5 p-2.5 rounded-lg border",
                            r.riskLevel === "danger" ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100")}>
                            <AlertTriangle size={14} className={cn("shrink-0 mt-0.5", r.riskLevel === "danger" ? "text-red-500" : "text-amber-500")} />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-800">{r.name}</p>
                              <p className="text-xs text-slate-500">{r.reasons.join(" · ")}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Bugün vardiyada — canlı durum */}
      {todayShifts.length > 0 && (() => {
        const checkedIn  = todayShifts.filter(s => s.check_in_at && !s.check_out_at);
        const checkedOut = todayShifts.filter(s => s.check_out_at);
        const waiting    = todayShifts.filter(s => !s.check_in_at && !isLate(s) && (checkinTracked || shiftPhase(s) === "before"));
        const untracked  = checkinTracked ? [] : todayShifts.filter(s => !s.check_in_at && shiftPhase(s) === "during");
        const ended      = checkinTracked ? [] : todayShifts.filter(s => !s.check_in_at && shiftPhase(s) === "after");
        // Sadeleştirme (2026-10-07): önce dikkat isteyenler (gelmedi, bekleniyor), ilk 5 satır; gerisi "Tümünü göster"
        const rank = (s: any) => (s.check_out_at ? 4 : s.check_in_at ? 2 : isLate(s) ? 0 : (checkinTracked ? "before" : shiftPhase(s)) === "after" ? 3 : (checkinTracked ? "before" : shiftPhase(s)) === "during" ? 2 : 1);
        const sorted = [...todayShifts].sort((a, b) => rank(a) - rank(b) || String(a.start_time).localeCompare(String(b.start_time)));
        const TODAY_LIMIT = 5;
        const visible = showAllToday ? sorted : sorted.slice(0, TODAY_LIMIT);
        return (
          <Card id="bugun" className="stripe-card border-0 shadow-none scroll-mt-6">
            <CardHeader className="border-b border-border/40 pb-4">
              <div className="flex items-center gap-2.5 flex-wrap">
                <CardTitle className="text-base font-bold">Bugün Çalışanlar</CardTitle>
                <div className="flex flex-wrap gap-3 ml-1">
                  {[
                    { label: "Vardiyada", value: checkedIn.length + untracked.length,  color: "text-emerald-600" },
                    { label: "Bekleniyor", value: waiting.length,    color: "text-amber-600" },
                    { label: "Geç",      value: lateShifts.length, color: "text-red-600" },
                    { label: "Vardiyası bitti", value: checkedOut.length + ended.length, color: "text-slate-400" },
                  ].filter(x => x.value > 0).map(({ label, value, color }) => (
                    <span key={label} className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                      <span className={`text-sm font-bold ${color}`}>{value}</span> {label}
                    </span>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Satır listesi (DESIGN.md §2): kişi başına kart değil, çizgiyle ayrılan satır */}
              <ul className="divide-y divide-slate-100">
                {visible.map((s: any) => {
                  const p            = personnel.find(px => px.id === s.personnel_id);
                  const isCheckedIn  = !!s.check_in_at;
                  const isCheckedOut = !!s.check_out_at;
                  const late         = isLate(s);
                  const phase        = checkinTracked ? "before" : shiftPhase(s);
                  const status = isCheckedOut ? { label: "Bitti", tone: "neutral" as const }
                    : isCheckedIn ? { label: "Vardiyada", tone: "positive" as const }
                    : late ? { label: "Gelmedi", tone: "danger" as const }
                    : phase === "after" ? { label: "Bitti", tone: "neutral" as const }
                    : phase === "during" ? { label: "Vardiyada", tone: "positive" as const }
                    : { label: "Bekleniyor", tone: "attention" as const };
                  return (
                    <li key={s.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                      <Avatar name={p?.name ?? "?"} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 truncate">{p?.name ?? s.personnel_id}</div>
                        <div className="text-xs text-slate-500">{s.start_time}–{s.end_time}</div>
                      </div>
                      <StatusPill tone={status.tone}>{status.label}</StatusPill>
                      {/* Telefonla "gelemiyorum" haberi: yerine kim geçsin penceresini doğrudan aç */}
                      {!isCheckedIn && !isCheckedOut && phase !== "after" && !(late && openShiftsEnabled && !autoOpenOnLate) && (
                        <button
                          onClick={() => router.push(`/schedule?week=this&gelemiyor=${s.id}&p=${encodeURIComponent(s.personnel_id)}&t=${encodeURIComponent(`${p?.name ?? ""} · ${s.start_time}–${s.end_time}`)}`)}
                          className="shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                          title="Yerine kim geçebilir? Uygun yedekler önerilir"
                        >
                          Yerine bul
                        </button>
                      )}
                      {!isCheckedIn && !isCheckedOut && late && openShiftsEnabled && !autoOpenOnLate && (
                        <button
                          onClick={() => convertToOpenShift(s, false)}
                          className="shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                          title="Vardiyayı ilana çıkarın, ekipten biri alabilir"
                        >
                          İlana çevir
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {sorted.length > TODAY_LIMIT && (
                <button onClick={() => setShowAllToday(v => !v)}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  {showAllToday ? "Daha az göster" : `Tümünü göster (${sorted.length})`}
                  <ChevronDown size={13} className={cn("transition-transform", showAllToday && "rotate-180")} />
                </button>
              )}
            </CardContent>
          </Card>
        );
      })()}
    </Page>
  );
}
