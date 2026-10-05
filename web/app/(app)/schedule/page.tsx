"use client";
import { effectiveWeeklyLimit } from "@/lib/legal";
import { trNum } from "@/lib/format";
import { departmentInBranch, plannedInBranch } from "@/lib/branchRotation";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useRef, useCallback, Fragment, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bell, ChevronLeft, ChevronRight, Check, AlertCircle,
  Download, Zap, Send, X, Plus, BookOpen, Sparkles, Copy,
  Undo2, Redo2, Search, Trash2, CalendarCheck, MoreHorizontal, BarChart2, CalendarPlus,
  History, CheckCircle2, RefreshCw, ChevronDown, MessageCircle, AlertTriangle, Pin, PinOff, Lock,
} from "lucide-react";
import Link from "next/link";
import { TimeRangeSlider, minToHHMM, hhmmToMin } from "@/components/schedule/TimeRangeSlider";
import GenerateWizard from "@/components/schedule/GenerateWizard";
import WeekCopilot, { type WeekAlert } from "@/components/schedule/WeekCopilot";
import { buildInsights, buildWeekSnapshot, crossTrainingInsight, explainAssignment, findProblems, type DayState, type Insight, type InsightTarget, type WeekBudgets, type WeekSnapshot } from "@/lib/copilot";
import { weekStates, type WorkCycleConfig } from "@/lib/workCycle";
import { isUnreliable, reliabilityNote, type Reliability } from "@/lib/reliability";
import { cn } from "@/lib/utils";
import type { ShiftDefinition, LocationEvent } from "@/lib/types";
import { calcAssignmentPoints, fairnessBarColor, type Rules as FairnessRules, formatScore, scoreVsAverageText } from "@/lib/fairness";
import { getHolidaysForDate } from "@/lib/holidays";
import { addDays, businessToday, getWeekStart } from "@/lib/date";
import { DAY_NAMES, DAY_SHORT } from "@/lib/constants";
import { CURVES, callDemand, type CallForecastInput, type CurveKey } from "@/lib/erlang";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCenter,
} from "@dnd-kit/core";
import { DroppableCell, DraggableShift } from "@/components/schedule/DragDrop";
import QuickSetup from "@/components/schedule/QuickSetup";
import { isModuleOn } from "@/lib/moduleVisibility";
import { canPublishPlan, departmentScope, hasPerm, parseAccess, type UserAccess } from "@/lib/userAccess";
import { departmentLabel, hasSubDepartments, leafDepartments, sortDepartments } from "@/lib/departments";
import { confirmDespiteViolations, violationText, type ViolationResponse } from "@/lib/ruleViolations";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Sheet, sheetPrimaryClass, sheetSecondaryClass } from "@/components/ui/Sheet";
import { Tabs } from "@/components/ui/Tabs";

const DAYS = DAY_SHORT;

function getWeekLabel(offset: number): { label: string; dates: string[] } {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }));
  }

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const start = monday.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
  const end = sunday.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  return { label: `${start} – ${end}`, dates };
}

/**
 * Bir hücrenin canlı puanı — resmi formül (lib/fairness.ts calcAssignmentPoints).
 * Vardiya tanımı ±10 dk toleransla eşleştirilir; eşleşmezse base_points=5 varsayılır.
 * Kesin puan yayında calcWeeklyPoints ile hesaplanır.
 */
function cellBurden(
  startMin: number, endMin: number, day: number,
  am: AvailMap, pid: string,
  rules: FairnessRules, defs: ShiftDefinition[],
): number {
  const def = matchShiftDef(startMin, endMin, defs);
  const r = calcAssignmentPoints({
    day,
    start_time: minToHHMM(startMin),
    end_time: minToHHMM(endMin % 1440),
    base_points: def?.base_points ?? 5,
    is_night: def?.is_night ?? false,
    is_pref_not: am[pid]?.[day]?.status === "preferred_not",
  }, rules);
  return Math.round(r.points * 10) / 10;
}

/** Bir hücrenin başlangıç/bitiş dakikalarını shift tanımlarıyla eşleştirir (±10 dk tolerans). */
function matchShiftDef(startMin: number, endMin: number, defs: ShiftDefinition[]): ShiftDefinition | null {
  for (const d of defs) {
    if (d.on_call) continue; // icap ayrı tutulur (onCallMap), normal hücre onunla eşleşmez
    const ds = hhmmToMin(d.start);
    let de = hhmmToMin(d.end);
    if (de <= ds) de += 1440;
    if (Math.abs(startMin - ds) <= 10 && Math.abs(endMin - de) <= 10) return d;
  }
  return null;
}

/** "26:00" gibi gece geçişi formatını "02:00" olarak normalize eder */
function normTime(t: string): string {
  if (!t) return t;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || h < 24) return t;
  return `${String(h % 24).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
}

const AVAIL_BG: Record<string, string> = {
  available:     "bg-emerald-50/80",
  preferred_not: "bg-amber-50",
  unavailable:   "bg-red-50",
};

function wmoIcon(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2)  return "🌤️";
  if (code <= 3)  return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 55) return "🌦️";
  if (code <= 65) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌧️";
  if (code <= 86) return "🌨️";
  return "⛈️";
}

function getWeekIsoDates(weekStart: string): string[] {
  if (!weekStart) return Array(7).fill("");
  const [y, m, d] = weekStart.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(y, m - 1, d + i); // yerel tarih — UTC dönüşümü yok
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
}

function eventCoversDate(ev: LocationEvent, isoDate: string): boolean {
  if (ev.scope === "week") return false;
  if (ev.end_date) return isoDate >= ev.date && isoDate <= ev.end_date;
  return ev.date === isoDate;
}

const EVENT_TYPE_CONFIG: Record<string, { emoji: string; color: string; label: string }> = {
  kampanya: { emoji: "🎯", color: "bg-ember-50 text-ember-700 border-ember-200", label: "Kampanya"  },
  etkinlik: { emoji: "🎉", color: "bg-blue-50 text-blue-700 border-blue-200",       label: "Etkinlik"  },
  denetim:  { emoji: "📋", color: "bg-orange-50 text-orange-700 border-orange-200", label: "Denetim"   },
  kapali:   { emoji: "🔒", color: "bg-red-50 text-red-700 border-red-200",          label: "Kapalı"    },
  diger:    { emoji: "📌", color: "bg-slate-100 text-slate-600 border-slate-200",   label: "Diğer"     },
};


// pinned: müdür elle düzeltti; Planı Oluştur bu hücreye dokunmaz (DB: shift_assignments.pinned)
type CellData = { startMin: number; endMin: number; points: number; pinned?: boolean; id?: number };
type CellMap  = Record<string, CellData>;
type AvailDay = { status: string; start?: string | null; end?: string | null };
type AvailMap = Record<string, Record<number, AvailDay>>;

/**
 * Ekrandaki plandan (kaydedilmemiş hücreler dahil) haftanın durumu. Plan Asistanı ve yayın
 * öncesi kontrol aynı nesneyi ve aynı kuralları (lib/copilot) kullanır.
 */
function scheduleSnapshot(a: {
  cellMap: CellMap; onCallMap: Record<string, { defId: string }>; shiftDefs: ShiftDefinition[];
  /** Aynı gündeki ek vardiyalar (takas/açık vardiyadan; tabloda salt okunur) */
  extraCells?: Record<string, CellData[]>;
  /** Kişilerin başka şubedeki vardiyaları */
  elsewhere?: { personnel_id: string; day: number; start_time: string; end_time: string; location_name: string }[];
  demandMatrix: Record<string, Record<number, number>>;
  deptDemandMatrix: Record<string, Record<string, Record<number, number>>>;
  availMap: AvailMap; personnel: any[]; locRules: FairnessRules; clopeningMinRest: number;
  availCollectionEnabled: boolean; prevWeekNightIds: Set<string>;
  approvedLeaves: { personnel_id: string; start_date: string; end_date: string; type: string }[];
  weekStart: string;
}): WeekSnapshot {
  const r = a.locRules as Record<string, unknown>;
  const num = (k: string, d: number) => (typeof r[k] === "number" ? (r[k] as number) : d);
  const hhmm = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const cells: [string, CellData][] = [
    ...Object.entries(a.cellMap),
    ...Object.entries(a.extraCells ?? {}).flatMap(([key, list]) => list.map(c => [key, c] as [string, CellData])),
  ];
  const assignments = cells.map(([key, c]) => {
    const lastDash = key.lastIndexOf("-");
    // Hücre vardiya tanımına başlangıç saatiyle bağlanır (±10 dk)
    const def = a.shiftDefs.find(d => { if (d.on_call) return false; const [h, m] = d.start.split(":").map(Number); return Math.abs(h * 60 + m - c.startMin) <= 10; });
    return {
      personnel_id: key.slice(0, lastDash), day: Number(key.slice(lastDash + 1)), shift_id: def?.id ?? "custom",
      start_time: hhmm(c.startMin), end_time: hhmm(c.endMin), publication_status: "draft",
      kind: "regular" as "regular" | "on_call",
    };
  }).concat(Object.entries(a.onCallMap).flatMap(([key, v]) => {
    const def = a.shiftDefs.find(d => d.id === v.defId);
    const lastDash = key.lastIndexOf("-");
    return def ? [{
      personnel_id: key.slice(0, lastDash), day: Number(key.slice(lastDash + 1)), shift_id: def.id,
      start_time: def.start, end_time: def.end, publication_status: "draft", kind: "on_call" as "regular" | "on_call",
    }] : [];
  })).concat((a.elsewhere ?? []).map(e => ({
    personnel_id: e.personnel_id, day: Number(e.day), shift_id: "elsewhere",
    start_time: e.start_time, end_time: e.end_time, publication_status: "published", kind: "regular" as "regular" | "on_call",
    elsewhere: e.location_name,
  })));
  // Departman varsa talep departman tablolarının toplamıdır (bkz. CLAUDE.md §3.B)
  const matrices = Object.keys(a.deptDemandMatrix).length > 0 ? Object.values(a.deptDemandMatrix) : [a.demandMatrix];
  const demand: Record<string, Record<string, number>> = {};
  for (const m of matrices) {
    for (const [sid, row] of Object.entries(m ?? {})) {
      for (const [day, n] of Object.entries(row ?? {})) {
        demand[sid] ??= {};
        demand[sid][day] = (demand[sid][day] ?? 0) + (Number(n) || 0);
      }
    }
  }
  const availability: Record<string, DayState[]> = {};
  const availabilityWindows: Record<string, ({ start: string; end: string } | null)[]> = {};
  for (const [pid, days] of Object.entries(a.availMap)) {
    availability[pid] = [0, 1, 2, 3, 4, 5, 6].map(d => (days[d]?.status ?? "available") as DayState);
    availabilityWindows[pid] = [0, 1, 2, 3, 4, 5, 6].map(d => {
      const x = days[d];
      return x?.start && x?.end ? { start: x.start, end: x.end } : null;
    });
  }
  return buildWeekSnapshot({
    weekStart: a.weekStart,
    today: businessToday(),
    shiftDefs: a.shiftDefs,
    demand,
    rules: {
      maxWeeklyHours: num("max_weekly_hours", 45),
      minRestHours: num("min_rest_hours", 11),
      maxConsecutiveDays: num("max_consecutive_days", 6),
      clopeningMinRestHours: a.clopeningMinRest,
      balancingPeriodWeeks: num("balancing_period_weeks", 0),
      nightLegalWarning: isModuleOn(a.locRules, "night_legal_warning_enabled"),
      availabilityCollection: a.availCollectionEnabled,
    },
    personnel: a.personnel.map(p => ({
      id: p.id, name: p.name,
      roles: Array.isArray(p.roles) ? p.roles : (() => { try { return JSON.parse(p.roles || "[]"); } catch { return []; } })(),
      score: Number(p.prev_score) || 0,
      maxWeeklyHours: p.max_weekly_hours ?? null,
      nightRestriction: p.night_restriction ?? null,
      workedNightLastWeek: a.prevWeekNightIds.has(p.id),
    })),
    assignments,
    leaves: a.approvedLeaves,
    availability,
    availabilityWindows,
  });
}

interface Popover {
  personnelId: string;
  day: number;
  x: number;
  y: number;
  startMin: number;
  endMin: number;
  /** Saat kaydırıcısı açık mı (tanımlı vardiyaya uymayan özel saat) */
  custom?: boolean;
}

// useSearchParams (Ana Sayfa'dan ?week=next) Suspense sınırı ister
export default function SchedulePage() {
  return (
    <Suspense fallback={null}>
      <SchedulePageInner />
    </Suspense>
  );
}

function SchedulePageInner() {
  const searchParams = useSearchParams();
  const [mounted, setMounted]                      = useState(false);
  // ?week=next → gelecek hafta açılır (Ana Sayfa "Planı Oluştur" bağlantısı)
  // ?week=next ya da Perşembe ve sonrası: bu haftanın çoğu geçti, planlanacak olan gelecek hafta
  const [weekOffset, setWeekOffset]               = useState(() => {
    const w = searchParams.get("week");
    if (w === "next") return 1;
    if (w === "this") return 0;
    // Raporlardan gelen bağlantı: aynı hafta (bu haftaya göre kaç hafta ileri/geri)
    if (w && /^-?\d{1,2}$/.test(w)) return Number(w);
    return (new Date().getDay() + 6) % 7 >= 3 ? 1 : 0;
  });
  const weekStart = useMemo(() => mounted ? getWeekStart(weekOffset) : "", [weekOffset, mounted]);
  const weekLabel = useMemo(() => mounted ? getWeekLabel(weekOffset).label : "", [weekOffset, mounted]);
  // dates, weekStart'tan türetilir — ayrı state tutmak senkron sorununa yol açıyor

  const [activeLocationId, setActiveLocationId]   = useState("");
  const [personnel, setPersonnel]                 = useState<any[]>([]);
  const [departments, setDepartments]             = useState<any[]>([]);
  const [cellMap, setCellMap]                     = useState<CellMap>({});
  // Aynı kişi-gün için ek vardiyalar (takas/açık vardiya/çakışma); tablo tek hücre düzenler, bunlar salt okunur gösterilir
  const [extraCells, setExtraCells]               = useState<Record<string, CellData[]>>({});
  // Paylaşılan personel: aynı haftada başka şubelerdeki vardiyalar (tabloda gri, değiştirilemez; Plan Kontrolü saate katar)
  const [elsewhere, setElsewhere] = useState<{ personnel_id: string; day: number; start_time: string; end_time: string; location_name: string }[]>([]);
  const [forceAssignMap, setForceAssignMap]       = useState<Record<string, { status: string; multiplier: number }>>({});
  const [availMap, setAvailMap]                   = useState<AvailMap>({});
  const [clopeningMinRest, setClopeningMinRest]   = useState(13); // bu saatin altı "clopening" (kapanış→açılış) sayılır
  const [locRules, setLocRules]                   = useState<FairnessRules>({}); // tam rules objesi — canlı yük hesabı (cellBurden) için
  const [fatigueRiskMap, setFatigueRiskMap]       = useState<Record<string, { riskLevel: string; reasons: string[] }>>({}); // rules.fatigue_radar_enabled — personel satırındaki risk ikonu için
  const [scoredWeekBurden, setScoredWeekBurden]   = useState<Record<string, number>>({}); // bu haftanın score_history'deki yükü — çift sayım düzeltmesi
  const [availCollectionEnabled, setAvailCollectionEnabled] = useState(true); // kapalıysa sorumlu tek başına planlar, uygunluk uyarıları susturulur
  const [popover, setPopover]                     = useState<Popover | null>(null);
  const [loading, setLoading]                     = useState(false);
  const [generating, setGenerating]               = useState(false);
  const [publishLoading, setPublishLoading]       = useState(false);
  const [publishSuccess, setPublishSuccess]       = useState(false);
  const [error, setError]                         = useState<string | null>(null);
  const [toast, setToast]                         = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  // Personel İhtiyacı önerisi (/api/demand-suggestion): sihirbaz açılınca alınır, uygulanana kadar kaydedilmez
  const [demandSuggestion, setDemandSuggestion]   = useState<{ matrix: Record<string, Record<number, number>>; source: "history" | "starter"; notes: string[]; history_weeks: number } | null>(null);
  // İcap nöbetleri: normal hücreden ayrı (aynı gün ikisi birden olabilir). Anahtar `${personelId}-${gün}`
  const [onCallMap, setOnCallMap]                 = useState<Record<string, { defId: string; pinned?: boolean; id?: number }>>({});
  // İcapta çağrılma kayıtları (yayınlanmış hafta): assignment_id → kayıtlar
  const [callouts, setCallouts]                   = useState<{ id: number; assignment_id: number; start_time: string; end_time: string; note: string | null }[]>([]);
  const [calloutModal, setCalloutModal]           = useState<{ assignmentId: number; title: string } | null>(null);
  const [calloutForm, setCalloutForm]             = useState({ start: "", end: "", note: "" });
  const [calloutBusy, setCalloutBusy]             = useState(false);
  // Çağrı merkezi: Erlang C ile ihtiyaç (lib/erlang), girdiler rules.call_forecast'ta saklanır
  const [callFormOpen, setCallFormOpen]           = useState(false);
  const [callForm, setCallForm]                   = useState<CallForecastInput>({ dailyCalls: [0, 0, 0, 0, 0, 0, 0], curve: "office", ahtSec: 240, slPercent: 80, slSeconds: 20, shrinkagePercent: 30 });
  const [callSummary, setCallSummary]             = useState<string | null>(null);
  // "Gelemiyor" (hastalık/acil) penceresi: yayınlanmış vardiya için akıllı yedek (lib/openShiftCandidates)
  const [absence, setAbsence] = useState<{ assignmentId: number; personId: string; title: string } | null>(null);
  const [absenceCands, setAbsenceCands] = useState<{ personnel_id: string; name: string; warnings: string[]; reasons: string[]; other_branch?: string }[] | null>(null);
  const [absenceReason, setAbsenceReason] = useState<"sick" | "emergency" | "no_show">("sick");
  const [absenceBusy, setAbsenceBusy] = useState(false);
  // Güvenilirlik notları (lib/reliability; giriş verisi yoksa boş): personelId → "Son 8 haftada 2 kez gelmedi"
  const [reliabilityNotes, setReliabilityNotes]   = useState<Record<string, string>>({});
  // Öğrenilen tercihler (lib/implicitPrefs): personelId → [{gün, vardiya, not}]
  const [learnedPrefs, setLearnedPrefs]           = useState<Record<string, { day: number; shiftId: string | null; note: string }[]>>({});
  // "Ya şöyle olursa?" senaryosu: kaydetmeden motoru çöz, mevcut planla karşılaştır
  const [scnOpen, setScnOpen]                     = useState(false);
  const [scnAbsent, setScnAbsent]                 = useState<{ pid: string; days: number[] }>({ pid: "", days: [0, 1, 2, 3, 4, 5, 6] });
  const [scnExtra, setScnExtra]                   = useState(0);
  const [scnDemandPct, setScnDemandPct]           = useState(0);
  const [scnBusy, setScnBusy]                     = useState(false);
  type ScnSide = { error?: string; snap?: WeekSnapshot; problems?: Insight[]; extraShifts?: number; cost?: number };
  const [scnResult, setScnResult]                 = useState<{ base: ScnSide; scn: ScnSide } | null>(null);
  const [keepPinned, setKeepPinned]               = useState(true); // Planı Oluştur: elle düzeltilenleri koru
  // En az değişiklik: mevcut planı olabildiğince koru (yayınlanmış haftada varsayılan açık; sihirbaz açılınca ayarlanır)
  const [minimizeChanges, setMinimizeChanges]     = useState(false);
  const [changedCount, setChangedCount]           = useState<number | null>(null);
  const [reloadTick, setReloadTick]               = useState(0); // optishift_location_changed: haftayı yeniden yükle
  const [wizardOpen, setWizardOpen]               = useState(false); // "Planı Oluştur" sihirbazı (components/schedule/GenerateWizard)
  const [engineScores, setEngineScores]           = useState<Record<string, number>>({}); // personnel_id → OR-Tools total score
  const [shiftDefs, setShiftDefs]                 = useState<ShiftDefinition[]>([]);
  const [dbShiftCount, setDbShiftCount]           = useState(0); // DB'den yüklenen vardiya sayısı (yayınlandı göstergesi için)
  const [demandMatrix, setDemandMatrix]           = useState<Record<string, Record<number, number>>>({}); // shiftDefId → {day → count} (lokasyon geneli, OR-Tools fallback)
  const [forecastMatrix, setForecastMatrix]       = useState<Record<string, Record<number, number>>>({}); // rules.forecasting_enabled — shiftDefId → {day → tahmini kişi sayısı}
  const [deptDemandMatrix, setDeptDemandMatrix]   = useState<Record<string, Record<string, Record<number, number>>>>({}); // deptId → shiftDefId → {day → count}
  const [fairnessOpen, setFairnessOpen]           = useState(false);
  const [isDraftWeek, setIsDraftWeek]             = useState(false);
  const [saveState, setSaveState]                 = useState<"idle" | "saving" | "saved">("idle");
  const [dirty, setDirty]                         = useState(false); // yayınlanmamış lokal değişiklik var mı
  const [editUnlocked, setEditUnlocked]           = useState(false); // yayınlanmış hafta için kilit açık mı
  const [unlockModal, setUnlockModal]             = useState(false); // kilit açma modalı
  const [editRequestStatus, setEditRequestStatus] = useState<"idle" | "sending" | "pending" | "approved" | "rejected">("idle");
  const [editRequestId, setEditRequestId]         = useState<number | null>(null);
  const [editRequestNote, setEditRequestNote]     = useState<string | null>(null);
  const [editRequestReviewer, setEditRequestReviewer] = useState<string | null>(null);
  const editRequestCheckedRef = useRef<string | null>(null); // `${locId}-${weekStart}` — double-fetch önler
  const [actionsOpen, setActionsOpen]             = useState(false); // ⋯ İşlemler menüsü
  const [advancedOpen, setAdvancedOpen]           = useState(false); // İşlemler › Gelişmiş
  const [viewerRole] = useState<string | null>(() => {
    try { return JSON.parse(localStorage.getItem("optishift_manager_user") || "{}").role ?? null; } catch { return null; }
  });
  // Kişi bazında yetki (lib/userAccess): "Planı hazırlama" yoksa plan sadece görüntülenir; "Planı yayınlama"
  // yayınlar ve yayınlanmış haftayı değiştirir (sunucu: proxy + lib/access canEditPublishedWeek)
  const [viewerAccess] = useState<{ role: string | null; access: UserAccess | null }>(() => {
    try {
      const u = JSON.parse(localStorage.getItem("optishift_manager_user") || "{}");
      return { role: u.role ?? null, access: parseAccess(u.access) };
    } catch { return { role: null, access: null }; }
  });
  const viewOnly = !hasPerm(viewerAccess, "prepare");
  const chefDept = departmentScope(viewerAccess);
  const canPublish = canPublishPlan(viewerAccess);
  // Otomatik pilot (lib/autopilot): bu haftanın taslağını sistem mi hazırladı
  const [autopilotDraftWeek, setAutopilotDraftWeek] = useState<string | null>(null);
  // İsim altındaki Adalet Puanı çubuğu varsayılan gizli (Adalet panelinden açılır, tarayıcıda hatırlanır)
  const [showScores, setShowScores] = useState(() => {
    try { return localStorage.getItem("optishift_show_scores") === "1"; } catch { return false; }
  });
  const toggleScores = () => setShowScores(v => {
    try { localStorage.setItem("optishift_show_scores", v ? "0" : "1"); } catch {}
    return !v;
  });
  // Telefonda tablo tek gün gösterir; varsayılan bugün
  const [mobileDay, setMobileDay] = useState(() => (weekOffset === 0 ? (new Date().getDay() + 6) % 7 : 0));
  // Plan Kontrolü / yayın uyarısından "oraya git": kişinin satırına kaydırır, hücreyi kısa süre vurgular
  const [flash, setFlash] = useState<InsightTarget | null>(null);
  const jumpTo = (t: InsightTarget) => {
    if (t.day !== undefined) setMobileDay(t.day);
    setFlash(t);
    setTimeout(() => {
      const el = t.personId
        ? document.querySelector(`[data-person-row="${t.personId}"]`)
        : document.querySelector("[data-schedule-grid]");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    setTimeout(() => setFlash(null), 3000);
  };
  const [copyLoading, setCopyLoading]             = useState(false);
  const [confirmCopy, setConfirmCopy]             = useState(false);
  const [violationModal, setViolationModal]       = useState<{ problems: Insight[]; onConfirm: () => void } | null>(null);
  const [approvedLeaves, setApprovedLeaves]       = useState<{ personnel_id: string; start_date: string; end_date: string; type: string }[]>([]); // Plan Asistanı + yayın kontrolü: izinli gün ataması
  const [prevWeekNightIds, setPrevWeekNightIds]   = useState<Set<string>>(new Set()); // geçen hafta gece çalışanlar — ardışık hafta gece yasağı kontrolü
  const [demandTemplates, setDemandTemplates]     = useState<Record<string, { flat?: Record<string, Record<number, number>>; departments?: Record<string, Record<string, Record<number, number>>> }>>({}); // kaydedilmiş hafta şablonları
  const [tplName, setTplName]                     = useState("");
  const [tplOpen, setTplOpen]                     = useState(false); // ilk kullanımda şablon çubuğu kapalı
  const [tplBusy, setTplBusy]                     = useState(false);
  const [seniorViolations, setSeniorViolations]   = useState<{ shift: string; day: number }[]>([]);
  const [excludedCompliance, setExcludedCompliance] = useState<{ id: string; name: string; doc_type: string; expiry_date: string }[]>([]);
  // Sertifika Kalkanı: belgesi geçersiz olduğu için bu haftalık planda düşürülen roller (/api/generate revoked_skills)
  const [revokedSkills, setRevokedSkills] = useState<{ id: string; name: string; skill: string; document: string; reason: "expired" | "missing" }[]>([]);
  const [personnelFilter, setPersonnelFilter]     = useState('');
  const [canUndo, setCanUndo]                     = useState(false);
  const [canRedo, setCanRedo]                     = useState(false);
  const [demandOpen, setDemandOpen]               = useState(false);
  const [collapsedDepts, setCollapsedDepts]       = useState<Set<string>>(new Set());
  const [proposalModal, setProposalModal]         = useState<{
    personnelId: string; name: string;
    currentDate: string; currentStart: string; currentEnd: string;
  } | null>(null);
  const [proposalDay, setProposalDay]             = useState(0);
  const [proposalStartMin, setProposalStartMin]   = useState(0);
  const [proposalEndMin, setProposalEndMin]       = useState(480);
  const [proposalNote, setProposalNote]           = useState("");
  const [proposalSending, setProposalSending]     = useState(false);
  const [currentRevision, setCurrentRevision]     = useState<number | null>(null);
  const [activeDragData, setActiveDragData]       = useState<{ id: string; type: string; person?: any } | null>(null);

  // Takvim etkinlikleri + hava durumu
  const [events, setEvents]                       = useState<LocationEvent[]>([]);
  const [weather, setWeather]                     = useState<Record<string, { icon: string; temp: number }>>({});
  const [locationLatLon, setLocationLatLon]       = useState<{ lat: number; lon: number } | null>(null);
  const [addEventModal, setAddEventModal]         = useState<{ date: string; dayLabel: string; initScope?: "day" | "week" } | null>(null);
  const [newEventTitle, setNewEventTitle]         = useState("");
  const [newEventType, setNewEventType]           = useState("kampanya");
  const [newEventScope, setNewEventScope]         = useState<"day" | "week">("day");
  const [newEventEndDate, setNewEventEndDate]     = useState("");
  const [newEventNote, setNewEventNote]           = useState("");
  const [eventSaving, setEventSaving]             = useState(false);

  // Undo/Redo stacks — refs to avoid stale closure issues
  const undoStack = useRef<CellMap[]>([]);
  const redoStack = useRef<CellMap[]>([]);
  // Otomatik kayıt: sadece kullanıcı eylemiyle değişen cellMap kaydedilir (hafta yüklemesi değil)
  const userEditRef = useRef(false);


  const showToast = (msg: string, type: "success" | "error" | "info" = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Kullanıcı eylemi ile cellMap değişimi — undo geçmişine kaydeder + otomatik kaydı tetikler
  const pushCellMap = (newMap: CellMap) => {
    undoStack.current = [...undoStack.current.slice(-29), cellMap];
    redoStack.current = [];
    userEditRef.current = true;
    setDirty(true);
    setCellMap(newMap);
    setCanUndo(true);
    setCanRedo(false);
  };

  const undo = useCallback(() => {
    if (!undoStack.current.length) return;
    const prev = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    userEditRef.current = true;
    setDirty(true);
    setCellMap(current => {
      redoStack.current = [current, ...redoStack.current.slice(0, 29)];
      return prev;
    });
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    if (!redoStack.current.length) return;
    const next = redoStack.current[0];
    redoStack.current = redoStack.current.slice(1);
    userEditRef.current = true;
    setDirty(true);
    setCellMap(current => {
      undoStack.current = [...undoStack.current.slice(-29), current];
      return next;
    });
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  // Init: mounted + location + tarihler (tümü client-only)
  useEffect(() => {
    setMounted(true);
    // Planlama motorunu arka planda uyandır (uyuyorsa ilk oluşturma ~25 sn gecikir)
    fetch("/api/engine/warm").catch(() => {});

    let locId = "";
    try {
      const saved = localStorage.getItem("optishift_selected_location");
      if (saved) { locId = saved; }
      else {
        const u = localStorage.getItem("optishift_manager_user");
        if (u) locId = JSON.parse(u).location_id || "";
      }
    } catch {}
    setActiveLocationId(locId);

    const handleLocChange = () => {
      const cur = localStorage.getItem("optishift_selected_location") || "";
      setActiveLocationId(cur);
      setCellMap({});
      setError(null);
      // Aynı şubede kayıt (Hızlı Kurulum: personel/vardiya eklendi) da haftayı yeniden yükler
      setReloadTick(t => t + 1);
    };
    window.addEventListener("optishift_location_changed", handleLocChange);
    return () => window.removeEventListener("optishift_location_changed", handleLocChange);
  }, []);

  // Load personnel + availability + existing shifts
  useEffect(() => {
    if (!activeLocationId) return;
    const weekStart = getWeekStart(weekOffset);
    // Hafta hızlı değiştirilince eski yükleme sonradan bitip yeni haftanın ekranına
    // eski haftanın planını yazabiliyordu: yerini yenisi alan yükleme hiçbir state yazmaz
    let stale = false;
    (async () => {
      setLoading(true);
      try {
        const [pRes, aRes, sRes, locRes, deptRes, evRes, pubRes, shRes] = await Promise.all([
          fetch(`/api/personnel?location_id=${activeLocationId}`),
          fetch(`/api/availability/team?location_id=${activeLocationId}&week_start=${weekStart}`),
          fetch(`/api/shifts?location_id=${activeLocationId}&week_start=${weekStart}&include_on_call=1`),
          fetch(`/api/locations?id=${activeLocationId}`),
          fetch(`/api/departments?location_id=${activeLocationId}`),
          fetch(`/api/events?location_id=${activeLocationId}&week_start=${weekStart}`),
          fetch(`/api/schedule/publications?location_id=${activeLocationId}&week_start=${weekStart}`),
          fetch(`/api/score-history?location_id=${activeLocationId}&weeks=52`),
        ]);
        const pData = await pRes.json();
        const aData = await aRes.json();
        const sData = await sRes.json();
        const locData = await locRes.json();
        const deptData = await deptRes.json();
        if (stale) return;
        const deptArr = Array.isArray(deptData) ? deptData : [];
        // Departman şefi sadece kendi departmanının ve alt departmanlarının satırlarını görür (lib/userAccess, lib/departments)
        const visibleDepts = chefDept ? deptArr.filter((d: any) => d.id === chefDept || d.parent_id === chefDept) : deptArr;
        setDepartments(visibleDepts);

        // Per-departman kapasite matrislerini yükle
        const deptDemands: Record<string, Record<string, Record<number, number>>> = {};
        for (const dept of visibleDepts) {
          if (dept.demand_matrix) {
            try {
              const raw = typeof dept.demand_matrix === "string" ? JSON.parse(dept.demand_matrix) : dept.demand_matrix;
              if (raw && typeof raw === "object") deptDemands[dept.id] = raw;
            } catch { /* ignore */ }
          }
        }
        setDeptDemandMatrix(deptDemands);

        // Shift tanımlarını yükle
        let weekDefs: ShiftDefinition[] = [];
        if (Array.isArray(locData) && locData[0]?.shift_definitions) {
          try {
            const rawDefs = typeof locData[0].shift_definitions === "string"
              ? JSON.parse(locData[0].shift_definitions)
              : locData[0].shift_definitions;
            weekDefs = Array.isArray(rawDefs) ? rawDefs : [];
          } catch { weekDefs = []; }
        }
        setShiftDefs(weekDefs);

        // Kapasite matrisini yükle
        if (Array.isArray(locData) && locData[0]?.demand_matrix) {
          try {
            const rawDemand = typeof locData[0].demand_matrix === "string"
              ? JSON.parse(locData[0].demand_matrix)
              : locData[0].demand_matrix;
            const matrix = rawDemand && typeof rawDemand === "object" ? rawDemand : {};
            setDemandMatrix(matrix);
          } catch { setDemandMatrix({}); }
        } else {
          setDemandMatrix({});
        }

        // Kaydedilmiş hafta şablonlarını yükle (normal/bakım/kampanya)
        try {
          const rawTpl = Array.isArray(locData) && locData[0]?.demand_templates
            ? (typeof locData[0].demand_templates === "string" ? JSON.parse(locData[0].demand_templates) : locData[0].demand_templates)
            : {};
          setDemandTemplates(rawTpl && typeof rawTpl === "object" ? rawTpl : {});
        } catch { setDemandTemplates({}); }

        // Tam kural objesi + clopening eşiği + uygunluk toplama (locations.rules)
        let clopeningRest = 13;
        let collectAvail = true;
        let parsedRules: FairnessRules = {};
        if (Array.isArray(locData) && locData[0]?.rules) {
          try {
            const r = typeof locData[0].rules === "string" ? JSON.parse(locData[0].rules) : locData[0].rules;
            if (r && typeof r === "object") parsedRules = r;
            if (typeof r?.clopening_min_rest_hours === "number") clopeningRest = r.clopening_min_rest_hours;
            collectAvail = isModuleOn(r, "availability_collection_enabled");
          } catch { /* varsayılanlar */ }
        }
        setClopeningMinRest(clopeningRest);
        setAvailCollectionEnabled(collectAvail);
        setLocRules(parsedRules);

        // Talep tahmini (rules.forecasting_enabled) — kapasite matrisi hücrelerinde ipucu gösterir
        if (isModuleOn(parsedRules, "forecasting_enabled")) {
          try {
            const fRes = await fetch(`/api/forecast?location_id=${activeLocationId}&week_start=${weekStart}`);
            const fData = await fRes.json();
            setForecastMatrix(fData && typeof fData === "object" && !fData.error ? fData : {});
          } catch { setForecastMatrix({}); }
        } else {
          setForecastMatrix({});
        }

        // Onaylı izinler: Plan Asistanı ve yayın kontrolü izinli güne atamayı yakalar
        try {
          const lr = await fetch(`/api/leave-requests?location_id=${activeLocationId}`);
          const lData = await lr.json();
          setApprovedLeaves(Array.isArray(lData) ? lData.filter((l: any) => l.status === "approved") : []);
        } catch { setApprovedLeaves([]); }

        // Yorgunluk ve Kaza Risk Radarı (rules.fatigue_radar_enabled) — personel satırındaki risk ikonu için
        if (isModuleOn(parsedRules, "fatigue_radar_enabled")) {
          try {
            const frRes = await fetch(`/api/fatigue-radar?location_id=${activeLocationId}`);
            const frData = await frRes.json();
            const map: Record<string, { riskLevel: string; reasons: string[] }> = {};
            if (Array.isArray(frData?.at_risk)) {
              for (const r of frData.at_risk) map[r.personnel_id] = { riskLevel: r.riskLevel, reasons: r.reasons };
            }
            setFatigueRiskMap(map);
          } catch { setFatigueRiskMap({}); }
        } else {
          setFatigueRiskMap({});
        }

        // Arka arkaya iki hafta gece yasağı açıksa geçen haftanın gece çalışanlarını yükle
        if (isModuleOn(parsedRules, "consecutive_night_weeks_enabled")) {
          try {
            const prevWs = addDays(weekStart, -7);
            const pr = await fetch(`/api/shifts?location_id=${activeLocationId}&week_start=${prevWs}`);
            const prevRows = await pr.json();
            const ids = new Set<string>();
            if (Array.isArray(prevRows)) {
              for (const r of prevRows) {
                if (r.publication_status !== "published" || !r.start_time || !r.end_time) continue;
                const [sh, sm] = String(r.start_time).split(":").map(Number);
                const [eh, em] = String(r.end_time).split(":").map(Number);
                if ([sh, sm, eh, em].some(Number.isNaN)) continue;
                const startMin = sh * 60 + sm;
                let endMin = eh * 60 + em;
                if (endMin <= startMin) endMin += 1440;
                if (startMin >= 22 * 60 || endMin > 24 * 60) ids.add(r.personnel_id);
              }
            }
            setPrevWeekNightIds(ids);
          } catch { setPrevWeekNightIds(new Set()); }
        } else {
          setPrevWeekNightIds(new Set());
        }

        // Koordinatlar (hava durumu için)
        const rawLat = Array.isArray(locData) ? locData[0]?.latitude : null;
        const rawLon = Array.isArray(locData) ? locData[0]?.longitude : null;
        setLocationLatLon(rawLat && rawLon ? { lat: rawLat, lon: rawLon } : null);

        // Etkinlikler
        const evData = await evRes.json();
        setEvents(Array.isArray(evData) ? evData : []);

        // Bu haftanın score_history yükü (yayınlanmışsa) — çift sayım düzeltmesi için
        try {
          const shData = await shRes.json();
          const swb: Record<string, number> = {};
          if (shData && typeof shData === "object" && !Array.isArray(shData)) {
            for (const [pid, entries] of Object.entries(shData)) {
              if (!Array.isArray(entries)) continue;
              // Bu hafta ve SONRAKİ yayınlanmış haftalar: prev_score onları da içerir; bu haftaya
              // bakarken ileri tarihli haftaların yükü sayılmaz (taslak hafta 2 kat görünmesin)
              swb[pid] = entries
                .filter((e: any) => typeof e.week_start === "string" && e.week_start >= weekStart)
                .reduce((sum: number, e: any) => sum + (Number(e.burden_score) || 0), 0);
            }
          }
          setScoredWeekBurden(swb);
        } catch { setScoredWeekBurden({}); }

        // Mevcut yayın revizyonu
        const pubData = await pubRes.json();
        if (stale) return;
        if (Array.isArray(pubData) && pubData.length > 0) {
          const maxRev = Math.max(...pubData.map((p: any) => p.revision ?? 0));
          setCurrentRevision(maxRev);
        } else {
          setCurrentRevision(null);
        }

        // Vardiya yapmayan yönetici (personnel.schedulable = false) satır olarak görünmez; o hafta elle vardiyası varsa görünür
        const assignedIds = new Set<string>(Array.isArray(sData) ? sData.map((x: any) => x.personnel_id) : []);
        // Şube rotasyonunda bu hafta başka şubede olan kişi de satır olarak görünmez (lib/branchRotation)
        // Paylaşılan personel tabloda bu şubedeki departmanının altında görünür (lib/branchRotation departmentInBranch)
        const branchDeptIds = new Set<string>(deptArr.map((d: any) => d.id));
        setPersonnel(Array.isArray(pData) ? pData.filter((p: any) => p.status === "active"
          && ((p.schedulable !== false && plannedInBranch(p.branch_rotation, activeLocationId, weekStart)) || assignedIds.has(p.id)))
          .map((p: any) => ({ ...p, department_id: departmentInBranch(p, branchDeptIds) })) : []);

        const newAvailMap: AvailMap = {};
        if (aData.personnel) {
          for (const p of aData.personnel) {
            if (p.submitted && Array.isArray(p.days)) {
              newAvailMap[p.personnel_id] = {};
              p.days.forEach((d: any, i: number) => {
                newAvailMap[p.personnel_id][i] = {
                  status: d.status ?? "available",
                  start: d.start ?? null,
                  end: d.end ?? null,
                };
              });
            }
            // submitted=false → availMap'e eklemiyoruz → hücrede ? gösterilecek
          }
        }
        setAvailMap(newAvailMap);

        const newCellMap: CellMap = {};
        const newExtra: Record<string, CellData[]> = {};
        const newOnCall: Record<string, { defId: string; pinned?: boolean; id?: number }> = {};
        const newForceMap: Record<string, { status: string; multiplier: number }> = {};
        if (Array.isArray(sData)) {
          let hasDraft = false;
          // Departman şefi sadece kendi ekibinin vardiyalarını görür (sayaçlar da ona göre)
          const teamIds = chefDept && Array.isArray(pData) ? new Set<string>(pData.map((p: any) => p.id)) : null;
          for (const s of sData) {
            if (teamIds && !teamIds.has(s.personnel_id)) continue;
            if (s.kind === "on_call") {
              newOnCall[`${s.personnel_id}-${s.day}`] = { defId: s.shift_id, id: s.id, ...(s.pinned ? { pinned: true } : {}) };
              if (s.publication_status === "draft") hasDraft = true;
              continue;
            }
            if (s.start_time && s.end_time) {
              const key = `${s.personnel_id}-${s.day}`;
              const startMin = hhmmToMin(s.start_time);
              const rawEnd   = hhmmToMin(s.end_time);
              const endMin   = rawEnd <= startMin ? rawEnd + 1440 : rawEnd; // gece geçişi
              const cellData: CellData = { startMin, endMin, points: cellBurden(startMin, endMin, s.day, newAvailMap, s.personnel_id, parsedRules, weekDefs), id: s.id, ...(s.pinned ? { pinned: true } : {}) };
              if (newCellMap[key]) { (newExtra[key] ??= []).push(cellData); continue; }
              newCellMap[key] = cellData;
              if (s.publication_status === "draft") hasDraft = true;
              if (s.force_assigned && s.force_acceptance_status) {
                newForceMap[key] = { status: s.force_acceptance_status, multiplier: s.force_bonus_multiplier ?? 5 };
              }
            }
          }
          setIsDraftWeek(hasDraft);
        }
        setForceAssignMap(newForceMap);
        setCellMap(newCellMap);
        setExtraCells(newExtra);
        setOnCallMap(newOnCall);
        if (Object.keys(newOnCall).length > 0) {
          fetch(`/api/on-call-callouts?location_id=${activeLocationId}&week_start=${weekStart}`)
            .then(r => (r.ok ? r.json() : []))
            .then(d => { if (!stale) setCallouts(Array.isArray(d) ? d : []); })
            .catch(() => {});
        } else setCallouts([]);
        setDbShiftCount(Object.keys(newCellMap).length + Object.values(newExtra).flat().length + Object.keys(newOnCall).length);
        // Hafta yüklemesi kullanıcı düzenlemesi değildir — otomatik kayıt tetiklenmesin
        userEditRef.current = false;
        setDirty(false);
        setSaveState("idle");
        setCollapsedDepts(new Set());
        setEditUnlocked(false);
        setEditRequestStatus("idle");
        setEditRequestId(null);
        setEditRequestNote(null);
        setEditRequestReviewer(null);
        editRequestCheckedRef.current = null;
      } catch {}
      if (!stale) setLoading(false);
    })();
    return () => { stale = true; };
  }, [activeLocationId, weekOffset, reloadTick, chefDept]);

  // Haftanın draft satırlarını DB ile senkronlar (otomatik kayıt ve Planı Oluştur aynı yolu kullanır)
  const onCallRows = (oc: Record<string, { defId: string; pinned?: boolean }>) =>
    Object.entries(oc).flatMap(([key, v]) => {
      const def = shiftDefs.find(d => d.id === v.defId);
      if (!def) return [];
      const lastDash = key.lastIndexOf("-");
      return [{
        personnel_id: key.slice(0, lastDash), day: parseInt(key.slice(lastDash + 1)),
        shift_id: def.id, start_time: def.start, end_time: def.end, pinned: v.pinned === true, kind: "on_call" as const,
      }];
    });

  // Kayıtlar sıraya alınır: sihirbazın beklenen kaydı ile 1,2 sn'lik otomatik kayıt aynı anda
  // "sil + yeniden yaz" yapınca kopya taslak satırlar oluşuyordu (yayında kopyalar taslak kalıyordu)
  // Kuyruktaki otomatik kayıt, veriyi kuyruğa girdiği anda değil çalıştığı anda en güncel halinden alır
  // (yoksa uzun süren bir kayıt beklerken eski render'ın verisi en son yazılıp icapları siliyordu)
  // İhtiyaç tablosu kayıtları sıralı gider ve her biri gönderildiği andaki EN GÜNCEL tabloyu yazar: hızlı art arda
  // girişte geç dönen eski kayıt yenisinin üstüne yazıyordu (pub testi 2026-10-04). Plan oluşturma bunları bekler.
  const demandSaveChain = useRef<Promise<void>>(Promise.resolve());
  const latestDemandRef = useRef({ flat: demandMatrix, depts: deptDemandMatrix });
  useEffect(() => { latestDemandRef.current = { flat: demandMatrix, depts: deptDemandMatrix }; }, [demandMatrix, deptDemandMatrix]);
  const queueDemandSave = (send: () => Promise<unknown>) => {
    const run = demandSaveChain.current.then(send).then(() => undefined);
    demandSaveChain.current = run.catch(() => undefined);
    return run;
  };
  const saveChainRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const latestPlanRef = useRef<{ cellMap: CellMap; onCallMap: Record<string, { defId: string; pinned?: boolean }> }>({ cellMap: {}, onCallMap: {} });
  useEffect(() => { latestPlanRef.current = { cellMap, onCallMap }; }, [cellMap, onCallMap]);
  const saveDraftWeek = (map?: CellMap, oc?: Record<string, { defId: string; pinned?: boolean }>): Promise<boolean> => {
    const run = saveChainRef.current.then(() =>
      saveDraftWeekNow(map ?? latestPlanRef.current.cellMap, oc ?? latestPlanRef.current.onCallMap));
    saveChainRef.current = run.catch(() => false);
    return run;
  };
  // Departman planı onayı (/api/plan-submissions): şef "Onaya Gönder", yönetici departmanların durumunu görür
  type DeptPlanStatus = { department_id: string; department_name: string; chef_name: string | null; submitted: boolean; submitted_by_name: string | null };
  const [deptStatus, setDeptStatus] = useState<DeptPlanStatus[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const loadDeptStatus = useCallback(() => {
    if (!activeLocationId || !weekStart) return;
    fetch(`/api/plan-submissions?location_id=${activeLocationId}&week_start=${weekStart}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setDeptStatus(Array.isArray(d?.departments) ? d.departments : []))
      .catch(() => {});
  }, [activeLocationId, weekStart]);
  useEffect(() => { if (departments.length > 0) loadDeptStatus(); }, [loadDeptStatus, departments.length]);
  const myDeptStatus = chefDept ? deptStatus.find(d => d.department_id === chefDept) : undefined;
  const submitForApproval = async () => {
    setSubmitting(true);
    try {
      await saveDraftWeek();
      const r = await fetch("/api/plan-submissions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: activeLocationId, week_start: weekStart }),
      });
      if (r.ok) { showToast("Plan sorumlunuza onaya gönderildi.", "success"); loadDeptStatus(); }
      else showToast((await r.json().catch(() => ({}))).error ?? "Gönderilemedi", "error");
    } finally { setSubmitting(false); }
  };
  const lastSavedBodyRef = useRef<string>("");
  const saveDraftWeekNow = async (map: CellMap, oc: Record<string, { defId: string; pinned?: boolean }>): Promise<boolean> => {
    const body = JSON.stringify({
          action: "sync_draft_week",
          location_id: activeLocationId,
          week_start: weekStart,
          shifts: Object.entries(map).map(([key, val]) => {
            const lastDash = key.lastIndexOf("-");
            return {
              personnel_id: key.slice(0, lastDash),
              day:          parseInt(key.slice(lastDash + 1)),
              // shift_id olmadan publish puanlaması vardiya zorluğunu (base_points) bulamaz
              shift_id:     matchShiftDef(val.startMin, val.endMin, shiftDefs)?.id ?? "custom",
              start_time:   minToHHMM(val.startMin),
              end_time:     minToHHMM(val.endMin),
              pinned:       val.pinned === true,
            };
          }).concat(onCallRows(oc) as never[]),
        });
    // Aynı içerik az önce kaydedildiyse tekrar yazma (sihirbaz kaydı + otomatik kayıt çakışması)
    if (body === lastSavedBodyRef.current) { userEditRef.current = false; setSaveState("saved"); return true; }
    setSaveState("saving");
    try {
      const res = await fetch("/api/shifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) { setSaveState("idle"); return false; }
      lastSavedBodyRef.current = body;
      userEditRef.current = false;
      setSaveState("saved");
      // Şefin değişikliği sunucuda önceki onay kaydını düşürür; ekranda da yansısın
      if (chefDept) setDeptStatus(prev => prev.map(d => (d.department_id === chefDept ? { ...d, submitted: false } : d)));
      const n = Object.keys(map).length + Object.keys(oc).length;
      setIsDraftWeek(n > 0);
      setDbShiftCount(n);
      return true;
    } catch {
      setSaveState("idle");
      return false;
    }
  };

  // Otomatik pilot durumu: şube değişince bir kez
  useEffect(() => {
    if (!activeLocationId) return;
    let stale = false;
    fetch(`/api/autopilot?location_id=${activeLocationId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (stale || !d) return;
        setAutopilotDraftWeek(d.enabled ? d.last_draft_week ?? null : null);
      })
      .catch(() => {});
    return () => { stale = true; };
  }, [activeLocationId]);

  // Güvenilirlik: şube değişince bir kez
  useEffect(() => {
    if (!activeLocationId) return;
    let stale = false;
    fetch(`/api/reliability?location_id=${activeLocationId}`)
      .then(r => (r.ok ? r.json() : {}))
      .then((d: Record<string, Reliability>) => {
        if (stale) return;
        const notes: Record<string, string> = {};
        for (const [pid, r] of Object.entries(d ?? {})) {
          const n = reliabilityNote(r);
          if (n && isUnreliable(r)) notes[pid] = n;
        }
        setReliabilityNotes(notes);
      })
      .catch(() => {});
    return () => { stale = true; };
  }, [activeLocationId]);

  useEffect(() => {
    if (!activeLocationId || !weekStart) return;
    let stale = false;
    fetch(`/api/implicit-prefs?location_id=${activeLocationId}&week_start=${weekStart}`)
      .then(r => (r.ok ? r.json() : {}))
      .then((d: Record<string, { day: number; shiftId: string | null; note: string }[]>) => { if (!stale) setLearnedPrefs(d && typeof d === "object" ? d : {}); })
      .catch(() => {});
    return () => { stale = true; };
  }, [activeLocationId, weekStart]);

  // Paylaşılan personelin başka şubelerdeki vardiyaları (hafta/şube değişince)
  useEffect(() => {
    if (!activeLocationId || !weekStart) return;
    let stale = false;
    fetch(`/api/shifts/elsewhere?location_id=${activeLocationId}&week_start=${weekStart}`)
      .then(r => r.json()).then(d => { if (!stale) setElsewhere(Array.isArray(d) ? d : []); })
      .catch(() => { if (!stale) setElsewhere([]); });
    return () => { stale = true; };
  }, [activeLocationId, weekStart, reloadTick]);

  // Sihirbazı aç: yayınlanmış haftada ve şeflerin onaya gönderdiği planlar varken "mevcut planı koru" varsayılan açık
  // (pub testi: sahip sadece şefsiz departmanı planlamak isterken şeflerin planları silinip yeniden yazılıyordu)
  const openWizard = () => {
    if (personnel.length === 0) {
      showToast("Önce personel ekleyin: Hızlı Kurulum'daki 'Personel ekle' adımından başlayabilirsiniz.", "info");
      return;
    }
    setDemandAutoFilled(false);
    setMinimizeChanges(dbShiftCount > 0 && (!isDraftWeek || (!chefDept && deptStatus.some(d => d.submitted))));
    setChangedCount(null);
    setWizardOpen(true);
  };

  // Sihirbaz açılınca (ve ekip değişince) ihtiyaç önerisini al; departmanlı şubede öneri yok
  useEffect(() => {
    if (!wizardOpen || !activeLocationId || !weekStart || departments.length > 0) return;
    let stale = false;
    fetch(`/api/demand-suggestion?location_id=${activeLocationId}&week_start=${weekStart}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!stale) setDemandSuggestion(d && d.matrix ? d : null); })
      .catch(() => {});
    return () => { stale = true; };
  }, [wizardOpen, activeLocationId, weekStart, departments.length, personnel.length]);

  const openCallForm = () => {
    const saved = (locRules as Record<string, unknown>).call_forecast as Partial<CallForecastInput> | undefined;
    if (saved && Array.isArray(saved.dailyCalls)) setCallForm(f => ({ ...f, ...saved }));
    setCallFormOpen(true);
  };
  const applyCallForecast = async () => {
    if (!activeLocationId) return;
    const res = callDemand(shiftDefs.filter(d => !d.on_call), callForm);
    setDemandMatrix(res.matrix);
    const pk = res.peak;
    setCallSummary(pk && pk.agents > 0
      ? `En yoğun saat: ${DAY_NAMES[pk.day]} ${String(pk.hour).padStart(2, "0")}:00, ${pk.agents} temsilci (mola payı dahil).`
      : "Çağrı girilmedi, ihtiyaç 0.");
    try {
      // rules REPLACE edildiği için taze kurallar üzerine yazılır
      const locRes = await fetch(`/api/locations?id=${activeLocationId}`);
      const locData = await locRes.json();
      const raw = Array.isArray(locData) ? locData[0]?.rules : null;
      const fresh = typeof raw === "string" ? JSON.parse(raw) : (raw ?? {});
      await fetch(`/api/locations?id=${activeLocationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demand_matrix: res.matrix, rules: { ...fresh, call_forecast: callForm } }),
      });
      showToast("Çağrı yoğunluğuna göre ihtiyaç tabloya yazıldı.", "success");
    } catch { showToast("Kaydedilemedi.", "error"); }
  };

  const applyDemandSuggestion = async (auto = false) => {
    if (!demandSuggestion || !activeLocationId) return;
    setDemandMatrix(demandSuggestion.matrix);
    try {
      await fetch(`/api/locations?id=${activeLocationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demand_matrix: demandSuggestion.matrix }),
      });
      if (!auto) showToast("Öneri tabloya uygulandı, istediğiniz hücreyi değiştirebilirsiniz.", "success");
    } catch { showToast("Öneri kaydedilemedi.", "error"); }
  };

  // Tablo tamamen boşsa öneri kendiliğinden doldurulur: boş tabloyla motor herkesi haftalık
  // sınırına kadar yazar (gizli işçilik maliyeti). Sahip sayıları görüp düzeltebilir.
  const [demandAutoFilled, setDemandAutoFilled] = useState(false);
  useEffect(() => {
    if (!wizardOpen || !demandSuggestion || departments.length > 0 || demandAutoFilled) return;
    const empty = Object.values(demandMatrix).every(row => Object.values(row ?? {}).every(v => !v));
    const hasAny = Object.values(demandSuggestion.matrix).some(row => Object.values(row ?? {}).some(v => v > 0));
    if (!empty || !hasAny) return;
    setDemandAutoFilled(true);
    applyDemandSuggestion(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardOpen, demandSuggestion, departments.length]);

  // ── Otomatik taslak kaydı (OPTI-024) ──────────────────────────────────────
  // Kullanıcı düzenlemesinden 1.2 sn sonra haftanın draft satırları DB ile
  // senkronlanır. Yayınlanmış haftada otomatik kayıt yapılmaz — değişiklikler
  // "Yayınla" düğmesine kadar lokal kalır (portal eski planı göstermeye devam eder).
  useEffect(() => {
    if (!userEditRef.current || !activeLocationId || !weekStart) return;
    const isPublishedWeek = dbShiftCount > 0 && !isDraftWeek;
    if (isPublishedWeek) return;
    // Süre dolduğunda hâlâ kaydedilmemiş düzenleme var mı (sihirbaz az önce kaydetmiş olabilir)
    const t = setTimeout(() => { if (userEditRef.current) saveDraftWeek(); }, 1200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellMap, onCallMap, activeLocationId, weekStart]);

  // Kaydedilmemiş düzenleme (bekleyen taslak kaydı ya da yayınlı haftada yerel değişiklik)
  // varken sayfa kapanır/yenilenirse ya da şube değiştirilirse uyar
  useEffect(() => {
    const skip = () => (window as Window & { __optishiftSkipUnloadGuard?: boolean }).__optishiftSkipUnloadGuard;
    const handler = (e: BeforeUnloadEvent) => {
      if (!userEditRef.current || skip()) return;
      e.preventDefault(); e.returnValue = "";
    };
    const beforeLocChange = (e: Event) => { if (userEditRef.current) e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    window.addEventListener("optishift_before_location_change", beforeLocChange);
    return () => {
      window.removeEventListener("beforeunload", handler);
      window.removeEventListener("optishift_before_location_change", beforeLocChange);
    };
  }, []);

  // Hava durumu — Open-Meteo (ücretsiz, key yok)
  useEffect(() => {
    if (!locationLatLon || !weekStart) { setWeather({}); return; }
    const { lat, lon } = locationLatLon;
    const startDate = new Date(weekStart + "T00:00:00");
    const today = new Date();
    const diffDays = Math.floor((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < -7 || diffDays > 9) { setWeather({}); return; }
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max&timezone=Europe%2FIstanbul&forecast_days=16`
    )
      .then(r => r.json())
      .then((data: any) => {
        const map: Record<string, { icon: string; temp: number }> = {};
        (data.daily?.time ?? []).forEach((d: string, i: number) => {
          map[d] = { icon: wmoIcon(data.daily.weathercode[i] ?? 0), temp: Math.round(data.daily.temperature_2m_max[i] ?? 0) };
        });
        setWeather(map);
      })
      .catch(() => setWeather({}));
  }, [locationLatLon, weekStart]);


  // ── Düzenleme onay talebi polling (status = "pending" olduğu sürece) ──────────
  useEffect(() => {
    if (editRequestStatus !== "pending" || !activeLocationId || !weekStart) return;
    const interval = setInterval(async () => {
      try {
        const r = await fetch(`/api/schedule/edit-requests?location_id=${activeLocationId}&week_start=${weekStart}`);
        const d = await r.json();
        if (d?.status === "approved") {
          setEditRequestStatus("approved");
          setEditRequestNote(d.note ?? null);
          setEditRequestReviewer(d.reviewed_by_name ?? null);
          setEditRequestId(d.id);
          setEditUnlocked(true);
          setUnlockModal(false);
          showToast(`Düzenleme onaylandı${d.reviewed_by_name ? " (" + d.reviewed_by_name + ")" : ""}! Değişiklik yapabilirsiniz.`, "success");
        } else if (d?.status === "rejected") {
          setEditRequestStatus("rejected");
          setEditRequestNote(d.note ?? null);
          setEditRequestReviewer(d.reviewed_by_name ?? null);
          setEditRequestId(d.id);
          showToast("Düzenleme talebi reddedildi.", "error");
        } else if (d?.status === "completed") {
          setEditRequestStatus("idle");
        }
      } catch { /* ignore */ }
    }, 8000);
    return () => clearInterval(interval);
  }, [editRequestStatus, activeLocationId, weekStart]);

  // ── Yayınlanmış haftada sayfa yüklenince mevcut talep durumunu geri yükle ────
  useEffect(() => {
    if (!activeLocationId || !weekStart || dbShiftCount === 0 || isDraftWeek || editUnlocked) return;
    const key = `${activeLocationId}-${weekStart}`;
    if (editRequestCheckedRef.current === key) return;
    editRequestCheckedRef.current = key;

    fetch(`/api/schedule/edit-requests?location_id=${activeLocationId}&week_start=${weekStart}`)
      .then(r => r.json())
      .then((d: any) => {
        if (!d) return;
        const age = Math.floor(Date.now() / 1000) - (d.reviewed_at ?? d.created_at ?? 0);
        if (d.status === "pending") {
          setEditRequestId(d.id);
          setEditRequestStatus("pending"); // polling devreye girer
        } else if (d.status === "approved" && age < 1800) {
          // Son 30 dakikada onaylandı — kilit otomatik açılır
          setEditRequestId(d.id);
          setEditRequestStatus("approved");
          setEditRequestNote(d.note ?? null);
          setEditRequestReviewer(d.reviewed_by_name ?? null);
          setEditUnlocked(true);
          showToast(`Düzenleme onayı aktif${d.reviewed_by_name ? " (" + d.reviewed_by_name + ")" : ""}. Değişiklik yapabilirsiniz.`, "info");
        } else if (d.status === "rejected" && age < 3600) {
          setEditRequestId(d.id);
          setEditRequestStatus("rejected");
          setEditRequestNote(d.note ?? null);
          setEditRequestReviewer(d.reviewed_by_name ?? null);
        }
      })
      .catch(() => {});
  }, [activeLocationId, weekStart, dbShiftCount, isDraftWeek, editUnlocked]);

  // Poll availability every 30 s so manager sees updates without refresh
  useEffect(() => {
    if (!activeLocationId || !weekStart) return;
    const tick = async () => {
      try {
        const r = await fetch(`/api/availability/team?location_id=${activeLocationId}&week_start=${weekStart}`);
        const data = await r.json();
        if (data?.personnel) {
          const newAvailMap: AvailMap = {};
          for (const p of data.personnel) {
            if (p.submitted && Array.isArray(p.days)) {
              newAvailMap[p.personnel_id] = {};
              p.days.forEach((d: any, i: number) => {
                newAvailMap[p.personnel_id][i] = {
                  status: d.status ?? "available",
                  start: d.start ?? null,
                  end: d.end ?? null,
                };
              });
            }
          }
          setAvailMap(newAvailMap);
        }
      } catch {}
    };
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [activeLocationId, weekStart]);

  // Close popover on outside click
  useEffect(() => {
    if (!popover) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-popover]")) setPopover(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popover]);

  // ⋯ İşlemler menüsünü dışarı tıklayınca kapat
  useEffect(() => {
    if (!actionsOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-actions-menu]")) setActionsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setActionsOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", onKey); };
  }, [actionsOpen]);

  // Popover klavye kısayolları — cellMap'i closure içinde okur (popover açıkken stale değil)
  useEffect(() => {
    if (!popover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') setPopover(null);
      if (e.key === 'Enter') handlePopoverSave();
      const cellExists = !!cellMap[`${popover.personnelId}-${popover.day}`];
      if ((e.key === 'Delete' || e.key === 'Backspace') && cellExists) handlePopoverDelete();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popover]);

  // Ctrl+Z / Ctrl+Y global klavye kısayolları
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // weekStart/weekLabel/dates computed in useEffect (client-only — Date.now & locale sensitive)

  // dates her zaman weekStart'tan türetilir — ayrı state yoktur
  const dates = useMemo(() => {
    if (!weekStart) return DAYS.map(() => "");
    const [y, m, d] = weekStart.split("-").map(Number);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(y, m - 1, d + i);
      return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
    });
  }, [weekStart]);

  // Computed per-person scores (live, based on cellMap)
  // Çift sayım düzeltmesi: prev_score bu haftanın ve sonraki yayınlanmış haftaların yükünü
  // içerir; canlı hücre puanını eklemeden önce düşülür (puan = bu haftaya kadar birikim + bu hafta).
  const personScores = personnel.map(p => {
    const weekPoints = Object.entries(cellMap)
      .filter(([k]) => k.startsWith(`${p.id}-`))
      .reduce((sum, [, v]) => sum + v.points, 0);
    const base = (p.prev_score || 0) - (scoredWeekBurden[p.id] ?? 0);
    return { id: p.id, name: p.name, score: Math.round((base + weekPoints) * 10) / 10 };
  });
  const maxScore = Math.max(...personScores.map(s => s.score), 1);
  // Çubuk rengi takım ortalamasına göre (Raporlar → Adalet ile aynı kural)
  const avgScore = personScores.length ? personScores.reduce((t, s) => t + s.score, 0) / personScores.length : 0;

  // Canlı TL maliyet bütçesi — hourly_wage tanımlı personelin saatlerini eşik-altı normal + eşik-üstü ×1.5 mesai olarak fiyatlar
  const laborCost = useMemo(() => {
    const otThreshold = typeof (locRules as Record<string, unknown>)?.overtime_threshold_hours === "number"
      ? (locRules as Record<string, number>).overtime_threshold_hours : 45;
    let total = 0;
    let missingWage = 0;
    for (const p of personnel) {
      const hours = [...Object.entries(cellMap), ...Object.entries(extraCells).flatMap(([k, l]) => l.map(v => [k, v] as [string, CellData]))]
        .filter(([k]) => k.startsWith(`${p.id}-`))
        .reduce((sum, [, v]) => sum + (v.endMin - v.startMin) / 60, 0);
      if (hours === 0) continue;
      if (typeof p.hourly_wage !== "number" || p.hourly_wage <= 0) { missingWage++; continue; }
      const baseHours = Math.min(hours, otThreshold);
      const otHours = Math.max(0, hours - otThreshold);
      total += baseHours * p.hourly_wage + otHours * p.hourly_wage * 1.5;
    }
    // İcap: bekleme saati değil, icap başına sabit ücret (vardiya tanımında)
    for (const v of Object.values(onCallMap)) {
      const pay = shiftDefs.find(d => d.id === v.defId)?.on_call_pay;
      if (typeof pay === "number" && pay > 0) total += pay;
    }
    return { total: Math.round(total), missingWage };
  }, [personnel, cellMap, extraCells, onCallMap, shiftDefs, locRules]);
  const weeklyLaborBudgetTry = typeof (locRules as Record<string, unknown>)?.weekly_labor_budget_try === "number"
    ? (locRules as Record<string, number>).weekly_labor_budget_try : 0;
  const laborBudgetExceeded = weeklyLaborBudgetTry > 0 && laborCost.total > weeklyLaborBudgetTry;

  // Hafta durumu (OPTI-024): tek birincil aksiyon + pasif durum çipi bu türevlerden beslenir
  const cellCount = Object.keys(cellMap).length;
  const isPublishedWeek = dbShiftCount > 0 && !isDraftWeek;

  // Cell click → open popover
  const handleCellClick = (e: React.MouseEvent, personnelId: string, day: number) => {
    e.stopPropagation();
    const existing = cellMap[`${personnelId}-${day}`];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const popoverWidth  = 288;
    const popoverHeight = 260; // tahmini yükseklik
    let x = rect.left;
    let y = rect.bottom + 6;
    // Sağa taşma
    if (x + popoverWidth > window.innerWidth - 16) {
      x = Math.max(8, window.innerWidth - popoverWidth - 16);
    }
    // Alta taşma — popover'ı hücrenin üstüne aç
    if (y + popoverHeight > window.innerHeight - 16) {
      y = Math.max(8, rect.top - popoverHeight - 6);
    }
    // Boş hücre şubenin ilk vardiyasıyla açılır (eskiden 09:00-17:00 geliyordu, hiçbir vardiyaya uymuyordu)
    const firstDef = shiftDefs.find(d => !d.on_call);
    let defStart = 9 * 60, defEnd = 17 * 60;
    if (firstDef) { defStart = hhmmToMin(firstDef.start); defEnd = hhmmToMin(firstDef.end); if (defEnd <= defStart) defEnd += 1440; }
    const startMin = existing?.startMin ?? defStart;
    const endMin = existing?.endMin ?? defEnd;
    setPopover({
      personnelId,
      day,
      x,
      y,
      startMin,
      endMin,
      custom: !shiftDefs.length || (!!existing && !matchShiftDef(startMin, endMin, shiftDefs)),
    });
  };

  const handlePopoverSave = () => {
    if (!popover) return;
    const key = `${popover.personnelId}-${popover.day}`;
    pushCellMap({
      ...cellMap,
      [key]: {
        startMin: popover.startMin,
        endMin:   popover.endMin,
        points:   cellBurden(popover.startMin, popover.endMin, popover.day, availMap, popover.personnelId, locRules, shiftDefs),
        pinned:   true,
      },
    });
    setPopover(null);
  };

  const openAbsence = (assignmentId: number, personId: string, title: string) => {
    setAbsence({ assignmentId, personId, title });
    setAbsenceCands(null);
    setAbsenceReason("sick");
    fetch(`/api/open-shifts/candidates?assignment_id=${assignmentId}`)
      .then(r => r.json())
      .then(d => setAbsenceCands(Array.isArray(d?.candidates) ? d.candidates : []))
      .catch(() => setAbsenceCands([]));
  };

  // Ana Sayfa'daki "Planı Oluştur" (?wizard=1): hafta ve ekip yüklenince sihirbaz doğrudan açılır, bir kez
  const wizardFromUrl = useRef(false);
  useEffect(() => {
    if (wizardFromUrl.current || loading || !activeLocationId || personnel.length === 0) return;
    if (searchParams.get("wizard") !== "1") return;
    wizardFromUrl.current = true;
    const t = setTimeout(() => openWizard(), 0);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, activeLocationId, personnel.length]);

  // Ana Sayfa'dan "Gelemiyor" (?gelemiyor=<atama>&p=<kişi>&t=<başlık>): pencere doğrudan açılır, bir kez
  const absenceFromUrl = useRef(false);
  useEffect(() => {
    if (absenceFromUrl.current) return;
    const id = Number(searchParams.get("gelemiyor"));
    if (!id) return;
    // Effect içinde senkron setState yerine bir sonraki tur (React Compiler kuralı)
    const t = setTimeout(() => {
      absenceFromUrl.current = true;
      openAbsence(id, searchParams.get("p") ?? "", searchParams.get("t") ?? "");
    }, 0);
    return () => clearTimeout(t);
  }, [searchParams]);

  const resolveAbsence = async (mode: "assign" | "top" | "all", pick?: { personnel_id: string; name: string }) => {
    if (!absence) return;
    setAbsenceBusy(true);
    try {
      const person = personnel.find((p: { id: string }) => p.id === absence.personId);
      const reasonText = absenceReason === "sick" ? "hastalık nedeniyle gelemiyor" : absenceReason === "emergency" ? "acil bir durum nedeniyle gelemiyor" : "vardiyaya gelmedi";
      const res = await fetch("/api/open-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          convert_assignment_id: absence.assignmentId,
          reason: absenceReason === "no_show" ? "no_show" : undefined,
          note: `${person?.name ?? "Personel"} ${reasonText}`,
          notify: mode === "assign" ? "none" : mode,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(d.error ?? "İşlem yapılamadı", "error"); return; }
      if (mode === "assign" && pick) {
        const send = (force: boolean) => fetch("/api/open-shifts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: d.id, claimed_by: pick.personnel_id, claimed_by_name: pick.name, assigned_by_manager: true, force }),
        });
        let r2 = await send(false);
        let d2: ViolationResponse = await r2.json().catch(() => ({}));
        if (r2.status === 409 && d2.can_force && d2.violations?.length && confirmDespiteViolations(d2.violations, `${pick.name} yine de atansın mı?`)) {
          r2 = await send(true);
          d2 = await r2.json().catch(() => ({}));
        }
        if (!r2.ok) { showToast(`Açık vardiya oluştu ama atanamadı (${violationText(d2, "hata")}). Açık Vardiyalar'dan atayın.`, "error"); }
        else showToast(`${pick.name} vardiyaya atandı ve bilgilendirildi.`, "success");
      } else if (mode === "top") {
        const names: string[] = Array.isArray(d.notified) ? d.notified : [];
        showToast(names.length ? `${names.join(", ")} kişilerine teklif gitti; ilk kabul eden alır.` : "Uygun aday bulunamadı; vardiya açık ilanda.", names.length ? "success" : "info");
      } else {
        showToast("Vardiya açık ilana çıktı, tüm ekibe duyuruldu.", "success");
      }
      setAbsence(null);
      setReloadTick(t => t + 1);
    } finally { setAbsenceBusy(false); }
  };

  // Motoru bir kez çöz (senaryolu ya da senaryosuz) ve mevcut planla aynı özet/kurallardan geçir (lib/copilot)
  const solveScenario = async (sc: { absentPid: string; absentDays: number[]; extra: number; pct: number } | null) => {
    const scenario = sc ? {
      absent: sc.absentPid ? [{ personnel_id: sc.absentPid, days: sc.absentDays }] : [],
      extra_staff: sc.extra, demand_change_pct: sc.pct,
    } : { absent: [], extra_staff: 0, demand_change_pct: 0 };
    await demandSaveChain.current; // ihtiyaç tablosunun bekleyen kayıtları motordan önce yazılsın
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId: activeLocationId, week_start: weekStart, scenario }),
    });
    const data = await res.json();
    if (data.error) return { error: String(data.error) } as ScnSide;
    const cells: CellMap = {};
    const oc: Record<string, { defId: string }> = {};
    for (const a of data.assignments || []) {
      if (a.kind === "on_call") { const d = shiftDefs[a.shiftId]; if (d) oc[`${a.personnelId}-${a.day}`] = { defId: d.id }; continue; }
      if (!a.start_time || !a.end_time) continue;
      const st = hhmmToMin(a.start_time); const raw = hhmmToMin(a.end_time);
      cells[`${a.personnelId}-${a.day}`] = { startMin: st, endMin: raw <= st ? raw + 1440 : raw, points: 0 };
    }
    const pct = sc?.pct ?? 0;
    const scale = (m: Record<string, Record<number, number>>) => Object.fromEntries(Object.entries(m).map(([k, row]) =>
      [k, Object.fromEntries(Object.entries(row).map(([d, n]) => [d, Math.max(0, Math.round(Number(n) * (1 + pct / 100)))]))]));
    const extraPeople = Array.from({ length: sc?.extra ?? 0 }, (_, i) => ({ id: `SCN-${i + 1}`, name: `Yeni personel ${i + 1}`, status: "active", prev_score: 0 }));
    const scnAvail: AvailMap = { ...availMap };
    if (sc?.absentPid) {
      scnAvail[sc.absentPid] = { ...(availMap[sc.absentPid] ?? {}) };
      for (const d of sc.absentDays) scnAvail[sc.absentPid][d] = { status: "unavailable" };
    }
    const snap = scheduleSnapshot({
      cellMap: cells, onCallMap: oc, shiftDefs,
      demandMatrix: scale(demandMatrix), deptDemandMatrix: Object.fromEntries(Object.entries(deptDemandMatrix).map(([k, m]) => [k, scale(m)])),
      availMap: scnAvail, personnel: [...personnel, ...extraPeople], locRules, clopeningMinRest, availCollectionEnabled,
      prevWeekNightIds, approvedLeaves, weekStart,
    });
    let cost = 0;
    for (const [k, c] of Object.entries(cells)) {
      const pid = k.slice(0, k.lastIndexOf("-"));
      const w = personnel.find((p: { id: string; hourly_wage?: number }) => p.id === pid)?.hourly_wage;
      if (typeof w === "number" && w > 0) cost += ((c.endMin - c.startMin) / 60) * w;
    }
    return { snap, problems: findProblems(snap, {}), extraShifts: Object.keys(cells).filter(k => k.startsWith("SCN-")).length, cost: Math.round(cost) } as ScnSide;
  };

  const runScenario = async () => {
    if (!activeLocationId) return;
    setScnBusy(true);
    setScnResult(null);
    try {
      // Adil karşılaştırma: aynı motorla senaryosuz ve senaryolu çözüm (mevcut yarım plan değil)
      const [base, scn] = await Promise.all([
        solveScenario(null),
        solveScenario({ absentPid: scnAbsent.pid, absentDays: scnAbsent.days, extra: scnExtra, pct: scnDemandPct }),
      ]);
      setScnResult({ base, scn });
    } catch { setScnResult({ base: { error: "Çözülemedi" }, scn: { error: "Senaryo çözülemedi." } }); }
    finally { setScnBusy(false); }
  };

  const reloadCallouts = async () => {
    const r = await fetch(`/api/on-call-callouts?location_id=${activeLocationId}&week_start=${weekStart}`);
    const d = r.ok ? await r.json() : [];
    setCallouts(Array.isArray(d) ? d : []);
  };
  const saveCallout = async () => {
    if (!calloutModal) return;
    setCalloutBusy(true);
    try {
      const r = await fetch("/api/on-call-callouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_id: calloutModal.assignmentId, start_time: calloutForm.start, end_time: calloutForm.end, note: calloutForm.note }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { showToast(d.error ?? "Kaydedilemedi", "error"); return; }
      showToast("Çağrı kaydedildi; çalışma süresine ve mesaiye sayılır.", "success");
      setCalloutForm({ start: "", end: "", note: "" });
      await reloadCallouts();
    } finally { setCalloutBusy(false); }
  };
  const deleteCallout = async (id: number) => {
    const r = await fetch(`/api/on-call-callouts?id=${id}`, { method: "DELETE" });
    if (r.ok) await reloadCallouts(); else showToast("Silinemedi", "error");
  };

  // İcap seçimi normal vardiyadan bağımsız; elle seçilen icap korunur (pinned)
  const handlePopoverSetOnCall = (defId: string | null) => {
    if (!popover) return;
    const key = `${popover.personnelId}-${popover.day}`;
    userEditRef.current = true;
    setDirty(true);
    setOnCallMap(prev => {
      const next = { ...prev };
      if (defId) next[key] = { defId, pinned: true };
      else delete next[key];
      return next;
    });
  };

  const handlePopoverTogglePin = () => {
    if (!popover) return;
    const key = `${popover.personnelId}-${popover.day}`;
    if (!cellMap[key]) return;
    pushCellMap({ ...cellMap, [key]: { ...cellMap[key], pinned: !cellMap[key].pinned } });
    setPopover(null);
  };

  const handlePopoverDelete = () => {
    if (!popover) return;
    const key = `${popover.personnelId}-${popover.day}`;
    const newMap = { ...cellMap };
    delete newMap[key];
    pushCellMap(newMap);
    setPopover(null);
  };

  // Otomatik planlama (/api/generate). Mevcut vardiyaların üzerine yazılacağı uyarısı
  // sihirbazın Kontrol adımında gösterilir (UX-7).
  const runGenerate = async () => {
    setGenerating(true);
    setError(null);
    // Elle düzeltilen (korunan) hücreler ve geçmiş günlerin vardiyaları motora sabit olarak gider,
    // gerisi yeniden çözülür (motor bugünden önceki günlere yeni vardiya yazmaz)
    const today = businessToday();
    const isPastKey = (key: string) => addDays(weekStart, parseInt(key.slice(key.lastIndexOf("-") + 1))) < today;
    const keep = (key: string, v: { pinned?: boolean }) => (keepPinned && !!v.pinned) || isPastKey(key);
    const pinned = Object.entries(cellMap).filter(([k, v]) => keep(k, v));
    const pinnedOnCall = Object.entries(onCallMap).filter(([k, v]) => keep(k, v));
    const fixed_assignments = [...pinned.map(([key, val]) => {
      const lastDash = key.lastIndexOf("-");
      return {
        personnel_id: key.slice(0, lastDash),
        day:          parseInt(key.slice(lastDash + 1)),
        shift_id:     matchShiftDef(val.startMin, val.endMin, shiftDefs)?.id ?? "custom",
        start_time:   minToHHMM(val.startMin),
        end_time:     minToHHMM(val.endMin),
      };
    }), ...onCallRows(Object.fromEntries(pinnedOnCall))];
    // Mevcut plan (korunanlar hariç, onlar zaten sabit): motor gereksiz yer değiştirmeyi cezalandırır
    const current_assignments = minimizeChanges
      ? Object.entries(cellMap).filter(([k, v]) => !keep(k, v)).flatMap(([key, val]) => {
          const def = matchShiftDef(val.startMin, val.endMin, shiftDefs);
          if (!def) return [];
          const lastDash = key.lastIndexOf("-");
          return [{ personnel_id: key.slice(0, lastDash), day: parseInt(key.slice(lastDash + 1)), shift_id: def.id }];
        })
      : [];
    const before = { ...cellMap };
    setChangedCount(null);
    try {
      await demandSaveChain.current; // ihtiyaç tablosunun bekleyen kayıtları motordan önce yazılsın
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId: activeLocationId, week_start: weekStart, fixed_assignments, current_assignments }),
      });
      const data = await res.json();
      setExcludedCompliance(data.excluded_compliance ?? []);
      setRevokedSkills(data.revoked_skills ?? []);
      if (data.error) { setError(data.error); return; }
      const newCellMap: CellMap = {};
      const newOnCall: Record<string, { defId: string; pinned?: boolean }> = {};
      for (const a of (data.assignments || [])) {
        if (a.kind === "on_call") {
          const def = shiftDefs[a.shiftId];
          if (def) newOnCall[`${a.personnelId}-${a.day}`] = { defId: def.id };
          continue;
        }
        if (a.start_time && a.end_time) {
          const key      = `${a.personnelId}-${a.day}`;
          const startMin = hhmmToMin(a.start_time);
          const rawEnd   = hhmmToMin(a.end_time);
          const endMin   = rawEnd <= startMin ? rawEnd + 1440 : rawEnd; // gece geçişi
          newCellMap[key] = { startMin, endMin, points: cellBurden(startMin, endMin, a.day, availMap, a.personnelId, locRules, shiftDefs) };
        }
      }
      // Korunan hücreler aynen kalır (özel saatliler motor çıktısında yok)
      for (const [key, val] of pinned) newCellMap[key] = val;
      for (const [key, val] of pinnedOnCall) newOnCall[key] = val;
      // Kaç hücre değişti (eklenen + silinen + saati değişen)
      if (Object.keys(before).length > 0) {
        const keys = new Set([...Object.keys(before), ...Object.keys(newCellMap)]);
        let n = 0;
        for (const k of keys) {
          const a = before[k], b = newCellMap[k];
          if (!a || !b || a.startMin !== b.startMin || a.endMin !== b.endMin) n++;
        }
        setChangedCount(n);
      }
      pushCellMap(newCellMap);
      setOnCallMap(newOnCall);
      setDbShiftCount(0); // OR-Tools taslağı — henüz yayınlanmadı
      // Engine'in base_points tabanlı puanlarını sakla — publish sırasında prev_score güncellemesinde kullanılır
      setEngineScores(data.scores ?? {});
      setSeniorViolations(data.senior_violations ?? []);
      // Taslak hemen kaydedilir: sihirbaz "kaydedildi" dediğinde plan DB'de olmalı
      // (eskiden 1,2 sn'lik otomatik kayda kalıyordu, hemen çıkan kullanıcı planı kaybediyordu)
      if (!(await saveDraftWeek(newCellMap, newOnCall))) {
        setError("Plan oluşturuldu ama kaydedilemedi. Bağlantınızı kontrol edip bir hücreyi düzenleyin, otomatik kaydedilir.");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  };

  // Publish → write to DB + notify (with optional violation override)
  const doPublish = async () => {
    setViolationModal(null);
    setPublishLoading(true);
    setPublishSuccess(false);
    try {
      const shiftRes = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shifts: buildShiftsPayload("published"), force: true }),
      });
      const shiftData = await shiftRes.json();

      if (!shiftRes.ok && shiftRes.status !== 409) {
        showToast("Vardiyalar kaydedilirken hata: " + (shiftData.error || "Bilinmeyen hata"), "error");
        return;
      }
      // 409 artık sadece uyarı — force=true olduğu için vardiyalar yine de kaydedildi
      if (shiftRes.status === 409 && shiftData.details?.length > 0) {
        const names = shiftData.details.map((d: string) => {
          const match = d.match(/^(P\w+) için (.+)/);
          if (!match) return null;
          const p = personnel.find((p: any) => p.id === match[1]);
          return p?.name ?? null;
        }).filter(Boolean);
        const unique = [...new Set(names)];
        showToast(
          unique.length > 0
            ? `Tüm vardiyalar yayınlandı. (${unique.join(", ")} için 11s dinlenme uyarısı)`
            : "Tüm vardiyalar yayınlandı.",
          "info"
        );
      }

      const pubRes2 = await fetch("/api/schedule/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: activeLocationId,
          week_start:  weekStart,
          ...(Object.keys(engineScores).length > 0 && { scores: engineScores }),
        }),
      });
      const pubData2 = await pubRes2.json().catch(() => ({}));
      if (typeof pubData2.revision === "number") setCurrentRevision(pubData2.revision);

      setPublishSuccess(true);
      setIsDraftWeek(false);
      setDbShiftCount(Object.keys(cellMap).length);
      setDirty(false);
      // Edit request'i "completed" olarak işaretle — DB'de temizlik
      if (editRequestId) {
        fetch("/api/schedule/edit-requests", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editRequestId, status: "completed" }),
        }).catch(() => {});
      }
      setEditUnlocked(false);
      setEditRequestStatus("idle");
      setEditRequestId(null);
      setEditRequestNote(null);
      setEditRequestReviewer(null);
      editRequestCheckedRef.current = null;
      userEditRef.current = false;
      setSaveState("idle");
      setTimeout(() => setPublishSuccess(false), 4000);
    } catch {
      showToast("Yayınlama sırasında hata oluştu.", "error");
    } finally {
      setPublishLoading(false);
    }
  };

  const handlePublish = () => {
    if (Object.keys(cellMap).length === 0) {
      showToast("Yayınlanacak vardiya yok. Önce vardiya ekleyin veya otomatik oluşturun.", "error");
      return;
    }
    // Yayın öncesi kontrol her zaman (engellemez, gösterir). Güvenilirlik kural ihlali değil, bilgi: sadece Plan Kontrolü'nde
    const problems = findProblems(weekSnapshot, weekBudgets).filter(p => p.id !== "reliability");
    if (problems.length > 0) {
      setViolationModal({ problems, onConfirm: doPublish });
    } else {
      doPublish();
    }
  };

  // Request availability — varsayılan: müdürün baktığı haftanın sonraki haftası (UX-5 fix).
  // Sihirbaz, planlanan haftanın kendisi için ister (targetOffset = weekOffset).
  // Ana Sayfa'daki "Hatırlat" ile aynı uç nokta: sadece uygunluğunu girmemiş kişilere gider
  const handleRequestAvailability = async (targetOffset: number = weekOffset + 1) => {
    try {
      const res = await fetch("/api/availability/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: activeLocationId, week_start: getWeekStart(targetOffset) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      showToast(data.sent > 0 ? `${data.sent} kişiye uygunluk hatırlatması gönderildi.` : "Herkes uygunluğunu girmiş.", "success");
    } catch {
      showToast("Uygunluk isteği gönderilirken hata oluştu.", "error");
    }
  };



  // Yayınlanmış plan düzenleme onayı — supervisor'a gönder ve polling başlat
  const handleSendEditRequest = async () => {
    if (!activeLocationId || !weekStart) return;
    setEditRequestStatus("sending");
    try {
      const res = await fetch("/api/schedule/edit-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: activeLocationId, week_start: weekStart }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditRequestId(data.id);
      setEditRequestStatus("pending"); // polling useEffect otomatik başlar
    } catch {
      setEditRequestStatus("idle");
      showToast("Onay talebi gönderilemedi.", "error");
    }
  };

  const handleSendProposal = async () => {
    if (!proposalModal || !activeLocationId || !weekStart) return;
    setProposalSending(true);
    try {
      const proposed_start = minToHHMM(proposalStartMin);
      const proposed_end   = minToHHMM(proposalEndMin, proposalEndMin >= 1440);
      const proposed_date  = isoDates[proposalDay];
      const res = await fetch("/api/schedule/shift-proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personnel_id:  proposalModal.personnelId,
          location_id:   activeLocationId,
          week_start:    weekStart,
          current_date:  proposalModal.currentDate,
          current_start: proposalModal.currentStart,
          current_end:   proposalModal.currentEnd,
          proposed_date,
          proposed_start,
          proposed_end,
          note: proposalNote.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      showToast(`${proposalModal.name} adlı personele vardiya teklifi gönderildi.`, "success");
      setProposalModal(null);
      setProposalNote("");
    } catch {
      showToast("Teklif gönderilemedi.", "error");
    } finally {
      setProposalSending(false);
    }
  };

  const handleDemandSave = async (silent = false, matrix?: Record<string, Record<number, number>>) => {
    if (!activeLocationId) return;
    const locId = activeLocationId;
    try {
      await queueDemandSave(() => fetch(`/api/locations?id=${locId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demand_matrix: matrix ?? latestDemandRef.current.flat }),
      }));
      if (!silent) showToast("Personel ihtiyacı kaydedildi.", "success");
    } catch {
      if (!silent) showToast("Personel ihtiyacı kaydedilemedi.", "error");
    }
  };

  // ── Hafta şablonları: mevcut Kapasite Planı'nı isimle kaydet / kayıtlı şablonu uygula ──
  const handleTemplateSave = async () => {
    const name = tplName.trim();
    if (!name || !activeLocationId) return;
    setTplBusy(true);
    try {
      const next = {
        ...demandTemplates,
        [name]: departments.length > 0 ? { departments: deptDemandMatrix } : { flat: demandMatrix },
      };
      const r = await fetch(`/api/locations?id=${activeLocationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demand_templates: next }),
      });
      if (r.ok) {
        setDemandTemplates(next);
        setTplName("");
        showToast(`"${name}" tablosu kaydedildi.`);
      } else showToast("Tablo kaydedilemedi.", "error");
    } catch { showToast("Tablo kaydedilemedi.", "error"); }
    finally { setTplBusy(false); }
  };

  const handleTemplateApply = async (name: string) => {
    const t = demandTemplates[name];
    if (!t || !activeLocationId) return;
    setTplBusy(true);
    try {
      if (departments.length > 0 && t.departments) {
        setDeptDemandMatrix(t.departments);
        for (const [deptId, matrix] of Object.entries(t.departments)) {
          if (!departments.some(d => d.id === deptId)) continue; // silinmiş departmanı atla
          await fetch(`/api/departments?id=${deptId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ demand_matrix: matrix }),
          });
        }
      } else if (t.flat) {
        setDemandMatrix(t.flat);
        await fetch(`/api/locations?id=${activeLocationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ demand_matrix: t.flat }),
        });
      } else {
        showToast("Bu kayıtlı tablo mevcut yapıyla uyumlu değil (departman düzeni değişmiş).", "error");
        return;
      }
      showToast(`"${name}" tablosu uygulandı, Planı Oluştur bu sayıları kullanır.`);
    } catch { showToast("Tablo uygulanamadı.", "error"); }
    finally { setTplBusy(false); }
  };

  const handleTemplateDelete = async (name: string) => {
    if (!activeLocationId) return;
    const next = { ...demandTemplates };
    delete next[name];
    setDemandTemplates(next);
    try {
      await fetch(`/api/locations?id=${activeLocationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demand_templates: next }),
      });
    } catch { /* sessiz */ }
  };

  // İhtiyaç tablosu kısayolu: satırdaki ilk sayıyı haftanın boş günlerine kopyalar (42 kutuyu tek tek doldurmamak için)
  const fillRow = (row: Record<number, number> | undefined): Record<number, number> | null => {
    const first = Array.from({ length: 7 }, (_, d) => row?.[d] ?? 0).find(v => v > 0);
    if (!first) return null;
    return Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, (row?.[d] ?? 0) > 0 ? row![d] : first]));
  };
  const fillDemandRow = (defId: string) => {
    const filled = fillRow(demandMatrix[defId]);
    if (!filled) return;
    const next = { ...demandMatrix, [defId]: filled };
    setDemandMatrix(next);
    handleDemandSave(true, next);
  };
  const fillDeptDemandRow = (deptId: string, defId: string) => {
    const filled = fillRow(deptDemandMatrix[deptId]?.[defId]);
    if (!filled) return;
    const deptNext = { ...(deptDemandMatrix[deptId] ?? {}), [defId]: filled };
    setDeptDemandMatrix(prev => ({ ...prev, [deptId]: deptNext }));
    handleDeptDemandSave(deptId, deptNext);
  };
  const canFillRow = (row: Record<number, number> | undefined) => {
    const vals = Array.from({ length: 7 }, (_, d) => row?.[d] ?? 0);
    return vals.some(v => v > 0) && vals.some(v => v === 0);
  };

  const handleDeptDemandSave = async (deptId: string, override?: Record<string, Record<number, number>>) => {
    try {
      await queueDemandSave(() => fetch(`/api/departments?id=${deptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demand_matrix: override ?? latestDemandRef.current.depts[deptId] ?? {} }),
      }));
    } catch { /* sessiz hata */ }
  };

  // Gece vardiyası sezgisi — motorla aynı: 22:00+ başlayan veya gece yarısını aşan
  const isNightCell = (c: CellData) => c.startMin >= 22 * 60 || c.endMin > 24 * 60;

  // Kural kontrolleri lib/copilot/checks.ts'te (yayın penceresi ve Plan Asistanı ortak)

  const buildShiftsPayload = (pubStatus: "draft" | "published") =>
    Object.entries(cellMap).map(([key, val]) => {
      const lastDash = key.lastIndexOf("-");
      return {
        personnel_id:       key.slice(0, lastDash),
        location_id:        activeLocationId,
        week_start:         weekStart,
        day:                parseInt(key.slice(lastDash + 1)),
        // shift_id olmadan publish puanlaması vardiya zorluğunu (base_points) bulamaz
        shift_id:           matchShiftDef(val.startMin, val.endMin, shiftDefs)?.id ?? "custom",
        start_time:         minToHHMM(val.startMin),
        end_time:           minToHHMM(val.endMin),
        publication_status: pubStatus,
      };
    }).concat(onCallRows(onCallMap).map(r => ({ ...r, location_id: activeLocationId, week_start: weekStart, publication_status: pubStatus })) as never[]);

  // Taslağı personele inceleme için gönder — durum draft kalır, sadece bildirim gider


  // Geçen haftanın planını bu haftaya kopyala
  const handleCopyPrevWeek = () => {
    if (Object.keys(cellMap).length > 0) {
      setConfirmCopy(true);
    } else {
      doCopyPrevWeek();
    }
  };

  const doCopyPrevWeek = async () => {
    setConfirmCopy(false);
    setCopyLoading(true);
    try {
      const prevWeekStart = getWeekStart(weekOffset - 1);
      const res = await fetch(`/api/shifts?location_id=${activeLocationId}&week_start=${prevWeekStart}`);
      const data = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        showToast("Geçen haftaya ait kopyalanacak vardiya bulunamadı.", "error");
        return;
      }

      // CellMap'i doldur
      const newCellMap: CellMap = {};
      for (const s of data) {
        if (s.start_time && s.end_time) {
          const key      = `${s.personnel_id}-${s.day}`;
          const startMin = hhmmToMin(s.start_time);
          const rawEnd   = hhmmToMin(s.end_time);
          const endMin   = rawEnd <= startMin ? rawEnd + 1440 : rawEnd;
          newCellMap[key] = { startMin, endMin, points: cellBurden(startMin, endMin, s.day, availMap, s.personnel_id, locRules, shiftDefs) };
        }
      }
      pushCellMap(newCellMap);
      setEngineScores({});
      // Kalıcı kayıt otomatik taslak senkronuna bırakılır (OPTI-024)
      showToast(`${Object.keys(newCellMap).length} vardiya geçen haftadan kopyalandı.`, "success");
    } catch {
      showToast("Kopyalama sırasında hata oluştu.", "error");
    } finally {
      setCopyLoading(false);
    }
  };

  // Satır hızlı işlemleri: tüm uygun günleri doldur / temizle
  const fillPersonRow = (personId: string) => {
    if (!shiftDefs.length) { showToast("Önce Ayarlar'dan vardiya tanımlayın.", "error"); return; }
    const def = shiftDefs[0];
    const ds = hhmmToMin(def.start);
    let de = hhmmToMin(def.end);
    if (de <= ds) de += 1440;
    const newMap = { ...cellMap };
    let added = 0;
    const person = personnel.find((p: any) => p.id === personId);
    for (let day = 0; day < 7; day++) {
      const key = `${personId}-${day}`;
      const isWeekOff = person?.weekly_off_day !== null && person?.weekly_off_day !== undefined && Number(person.weekly_off_day) === day;
      if (!newMap[key] && availMap[personId]?.[day]?.status !== 'unavailable' && !isWeekOff) {
        newMap[key] = { startMin: ds, endMin: de, points: cellBurden(ds, de, day, availMap, personId, locRules, shiftDefs), pinned: true };
        added++;
      }
    }
    if (added === 0) { showToast("Eklenecek uygun gün bulunamadı.", "info"); return; }
    pushCellMap(newMap);
  };

  const clearPersonRow = (personId: string) => {
    const newMap = { ...cellMap };
    let removed = 0;
    for (let day = 0; day < 7; day++) {
      if (newMap[`${personId}-${day}`]) { delete newMap[`${personId}-${day}`]; removed++; }
    }
    if (removed === 0) { showToast("Silinecek vardiya yok.", "info"); return; }
    pushCellMap(newMap);
  };

  // Popover klavye kısayolları: Escape / Enter / Delete
  // (Effect popover değişince yeniden bağlanır — popover ve hasExisting değişkenlerine bağımlı)

  // Factor 10: küçük odaklı ajan — sadece planı açıklar, başka bir şey yapmaz


  // ── Etkinlik yönetimi ─────────────────────────────────────────────────────
  const deleteEvent = async (id: number) => {
    try {
      await fetch(`/api/events?id=${id}`, { method: "DELETE" });
      setEvents(prev => prev.filter(e => e.id !== id));
    } catch {}
  };

  const saveEvent = async () => {
    if (!newEventTitle.trim() || !addEventModal || !activeLocationId) return;
    setEventSaving(true);
    const eventDate   = newEventScope === "week" ? weekStart : addEventModal.date;
    const eventEndDate = newEventScope === "day" && newEventEndDate && newEventEndDate > eventDate ? newEventEndDate : undefined;
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: activeLocationId,
          date:        eventDate,
          end_date:    eventEndDate,
          title:       newEventTitle.trim(),
          type:        newEventType,
          scope:       newEventScope,
          note:        newEventNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.id) {
        setEvents(prev => [...prev, {
          id: data.id, org_id: "", location_id: activeLocationId,
          date: eventDate, end_date: eventEndDate, title: newEventTitle.trim(),
          type: newEventType as LocationEvent["type"],
          scope: newEventScope,
          note: newEventNote.trim() || undefined,
        }]);
        setAddEventModal(null);
        setNewEventTitle(""); setNewEventType("kampanya"); setNewEventNote(""); setNewEventScope("day"); setNewEventEndDate("");
      }
    } catch {}
    setEventSaving(false);
  };

  // Her gün×shift için kaç kişi atandığını hesapla (coverage gap için)
  const assignedCounts: Record<string, Record<number, number>> = {};
  for (const [key, cell] of Object.entries(cellMap)) {
    const lastDash = key.lastIndexOf("-");
    const pId = key.slice(0, lastDash);
    const day = parseInt(key.slice(lastDash + 1));
    const matchedDef = matchShiftDef(cell.startMin, cell.endMin, shiftDefs);
    if (matchedDef) {
      if (!assignedCounts[matchedDef.id]) assignedCounts[matchedDef.id] = {};
      assignedCounts[matchedDef.id][day] = (assignedCounts[matchedDef.id][day] || 0) + 1;
    }
    void pId;
  }
  for (const [key, v] of Object.entries(onCallMap)) {
    const day = parseInt(key.slice(key.lastIndexOf("-") + 1));
    (assignedCounts[v.defId] ??= {})[day] = (assignedCounts[v.defId][day] || 0) + 1;
  }

  // Departman bazlı atanan kişi sayıları
  const deptAssignedCounts: Record<string, Record<string, Record<number, number>>> = {};
  for (const [key, cell] of Object.entries(cellMap)) {
    const lastDash = key.lastIndexOf("-");
    const pId = key.slice(0, lastDash);
    const day = parseInt(key.slice(lastDash + 1));
    const matchedDef = matchShiftDef(cell.startMin, cell.endMin, shiftDefs);
    if (matchedDef) {
      const person = personnel.find(p => p.id === pId);
      const deptId = person?.department_id || '__none__';
      if (!deptAssignedCounts[deptId]) deptAssignedCounts[deptId] = {};
      if (!deptAssignedCounts[deptId][matchedDef.id]) deptAssignedCounts[deptId][matchedDef.id] = {};
      deptAssignedCounts[deptId][matchedDef.id][day] = (deptAssignedCounts[deptId][matchedDef.id][day] || 0) + 1;
    }
  }

  // ShiftBoard için toplam talep (tüm dept matrislerinin toplamı; yoksa lokasyon geneli).
  // Departman VARLIĞINA bakılır, dolu olup olmamasına değil: lokasyonda departman satırları
  // varsa talep her zaman departments.demand_matrix üzerinden yönetilir (bkz. CLAUDE.md §3.B).
  // Aksi halde departmanlar henüz demand girilmemişken (hepsi boş), departmanlar eklenmeden
  // önce girilmiş eski/artık lokasyon-geneli matris "hayalet" talep olarak görünürdü —
  // hem UI'da hem /api/generate'e giden payload'da bu tutarsızlığa yol açıyordu.
  const hasDeptDemand = departments.length > 0;
  // Alt departmanlar (lib/departments): ihtiyaç en alttaki departmanlarda; alt departmanı olanın kendi tablosu sayılmaz
  const demandDepts = leafDepartments(sortDepartments(departments));
  const groupDeptIds = new Set<string>(departments.filter(d => hasSubDepartments(departments, d.id)).map(d => d.id));
  const effectiveDemandMatrix: Record<string, Record<number, number>> = hasDeptDemand
    ? Object.entries(deptDemandMatrix).filter(([id]) => !groupDeptIds.has(id)).map(([, m]) => m).reduce<Record<string, Record<number, number>>>((acc, matrix) => {
        for (const [defId, days] of Object.entries(matrix)) {
          if (!acc[defId]) acc[defId] = {};
          for (const [day, count] of Object.entries(days)) {
            const d = parseInt(day);
            acc[defId][d] = (acc[defId][d] || 0) + (count as number);
          }
        }
        return acc;
      }, {})
    : demandMatrix;

  const isoDates = getWeekIsoDates(weekStart);

  const popoverPerson = popover ? personnel.find(p => p.id === popover.personnelId) : null;
  const hasExisting   = popover ? !!cellMap[`${popover.personnelId}-${popover.day}`] : false;
  const popoverHours  = popover ? Math.round((popover.endMin - popover.startMin) / 60 * 10) / 10 : 0;

  // Popover anlık kural kontrolleri
  const popoverWarnings: { type: 'error' | 'warn'; msg: string }[] = [];
  if (popover && popoverPerson) {
    // Haftalık saat limit kontrolü
    const existKey   = `${popover.personnelId}-${popover.day}`;
    const existHours = cellMap[existKey] ? (cellMap[existKey].endMin - cellMap[existKey].startMin) / 60 : 0;
    const weekBase   = Object.entries(cellMap)
      .filter(([k]) => k.startsWith(`${popover.personnelId}-`))
      .reduce((sum, [, v]) => sum + (v.endMin - v.startMin) / 60, 0) - existHours;
    const projHours = weekBase + (popover.endMin - popover.startMin) / 60;
    const maxH = effectiveWeeklyLimit(popoverPerson.max_weekly_hours, (() => { const v = (locRules as Record<string, unknown>)?.max_weekly_hours; return typeof v === "number" ? v : 45; })());
    if (projHours > maxH) {
      popoverWarnings.push({ type: 'error', msg: `Haftalık limit aşılacak: ${Math.round(projHours * 10) / 10}s / ${maxH}s` });
    }
    // 11 saatlik dinlenme — önceki gün
    const prevCell = popover.day > 0 ? cellMap[`${popover.personnelId}-${popover.day - 1}`] : null;
    if (prevCell) {
      const gapFromPrev = (popover.startMin + 1440) - prevCell.endMin;
      if (gapFromPrev < 11 * 60) {
        popoverWarnings.push({ type: 'error', msg: `Önceki vardiyadan ${Math.round(gapFromPrev / 60 * 10) / 10}s dinlenme (min 11s)` });
      }
      // Gececi→Sabahçı uyarısı
      if (prevCell.endMin >= 23 * 60 && popover.startMin <= 12 * 60) {
        popoverWarnings.push({ type: 'warn', msg: 'Önceki gece vardiyasından sonra sabah ataması (gececi→sabahçı)' });
      }
    }
    // 11 saatlik dinlenme — ertesi gün
    const nextCell = popover.day < 6 ? cellMap[`${popover.personnelId}-${popover.day + 1}`] : null;
    if (nextCell) {
      const gapToNext = (nextCell.startMin + 1440) - popover.endMin;
      if (gapToNext < 11 * 60) {
        popoverWarnings.push({ type: 'error', msg: `Ertesi gün başlangıcına ${Math.round(gapToNext / 60 * 10) / 10}s dinlenme kalır (min 11s)` });
      }
    }
    // Uygunluk durumu
    const pAvail = availMap[popover.personnelId];
    const dayAvail = pAvail?.[popover.day];
    if (dayAvail?.status === 'unavailable') {
      popoverWarnings.push({ type: 'error', msg: 'Bu gün kesinlikle uygun değil (kırmızı)' });
    } else if (dayAvail?.status === 'preferred_not') {
      popoverWarnings.push({ type: 'warn', msg: 'Bu günü "tercih etmem" dedi: mümkünse çalışmak istemiyor' });
    } else if (!pAvail && availCollectionEnabled) {
      popoverWarnings.push({ type: 'warn', msg: 'Uygunluk bilgisi girilmemiş' });
    }
  }

  // Uygunluk bilgisi girilmemiş personel sayısı
  // Not: uygunluk girilmemesi otomatik oluşturmayı ENGELLEMEZ — motor eksik
  // uygunluğu "tamamen uygun" kabul eder (get_avail default). Bu sayaç sadece bilgilendirme amaçlıdır.
  const noAvailCount = personnel.filter(p => !availMap[p.id]).length;

  // Haftanın durumu: ekrandaki (henüz kaydedilmemiş olanlar dahil) plandan. Plan Asistanı ve
  // yayın öncesi kontrol aynı nesneyi ve aynı kuralları (lib/copilot) kullanır.
  // Kişi × 7 gün: her render'da hesaplamak ucuz
  const weekSnapshot = scheduleSnapshot({ cellMap, onCallMap, extraCells, shiftDefs, demandMatrix, deptDemandMatrix, availMap, personnel, locRules,
    clopeningMinRest, availCollectionEnabled, prevWeekNightIds, approvedLeaves, weekStart, elsewhere });

  const weekBudgets: WeekBudgets = {
    unreliable: reliabilityNotes,
    // Tek bütçe: işçilik maliyeti (₺; mesai ×1,5 dahil). Saat bazlı mesai bütçesi kaldırıldı.
    labor: { total: laborCost.total, budget: weeklyLaborBudgetTry },
  };
  const crossTraining = crossTrainingInsight(weekSnapshot, shiftDefs);
  const weekInsights = crossTraining ? [...buildInsights(weekSnapshot, weekBudgets), crossTraining] : buildInsights(weekSnapshot, weekBudgets);

  // Kapasite matrisi ile mevcut personel sayısı çelişiyor mu? (herkes günde yalnızca
  // 1 vardiyaya girebildiği için bir günün toplam talebi o gün uygun personel sayısını
  // aşarsa OR-Tools kesinlikle çözüm bulamaz — bunu motor çağrılmadan önce tespit edip
  // kullanıcıya somut bir uyarı gösteriyoruz.
  const capacityWarnings = useMemo(() => {
    const warnings: string[] = [];
    const isUnavailable = (personId: string, day: number) => availMap[personId]?.[day]?.status === 'unavailable';

    const sumDayTotals = (matrix: Record<string, Record<number, number>>) => {
      const totals: Record<number, number> = {};
      for (const days of Object.values(matrix)) {
        for (const [day, count] of Object.entries(days)) {
          const d = parseInt(day);
          totals[d] = (totals[d] || 0) + (Number(count) || 0);
        }
      }
      return totals;
    };

    // Haftalık saat: istenen vardiyaların toplam saati, ekibin haftalık sınırlarının toplamını aşarsa motor plan
    // bulamaz (motor brüt saati sayar, lib/legal effectiveWeeklyLimit). Pub testi: kontrol "karşılanabilir" deyip
    // motor nedensiz "plan bulunamadı" diyordu.
    const ruleMax = Number((locRules as Record<string, unknown>).max_weekly_hours ?? 45) || 45;
    const defHours = (defId: string) => {
      const def = shiftDefs.find(d => d.id === defId);
      if (!def || def.on_call) return 0;
      const [sh, sm] = def.start.split(":").map(Number); const [eh, em] = def.end.split(":").map(Number);
      let mins = eh * 60 + em - (sh * 60 + sm); if (mins <= 0) mins += 24 * 60;
      return mins / 60;
    };
    const weeklyCheck = (matrix: Record<string, Record<number, number>>, members: any[], label: string) => {
      let need = 0, shiftsNeeded = 0;
      for (const [defId, days] of Object.entries(matrix)) for (const c of Object.values(days)) { need += (Number(c) || 0) * defHours(defId); shiftsNeeded += Number(c) || 0; }
      if (need <= 0 || members.length === 0) return;
      const cap = members.reduce((a, p) => a + effectiveWeeklyLimit(p.max_weekly_hours, ruleMax), 0);
      if (need > cap) {
        warnings.push(`${label}haftada ${trNum(need)} saatlik vardiya isteniyor, ${members.length} kişi haftalık sınırla en fazla ${trNum(cap)} saat çalışabilir. Kişi ekleyin ya da sayıları azaltın.`);
      } else if (need > cap * 0.95) {
        warnings.push(`${label}haftada ${trNum(need)} saatlik vardiya isteniyor, ${members.length} kişinin haftalık sınırı toplam ${trNum(cap)} saat. Sınıra çok yakın: vardiya süreleri farklı olduğu için plan bulunamayabilir.`);
      } else if (shiftsNeeded > members.length * 6) {
        warnings.push(`${label}haftada ${shiftsNeeded} vardiya isteniyor, ${members.length} kişi haftada en fazla 6 gün çalışabilir (${members.length * 6} vardiya).`);
      }
    };

    if (hasDeptDemand) {
      for (const [deptId, matrix] of Object.entries(deptDemandMatrix)) {
        if (hasSubDepartments(departments, deptId)) continue;
        weeklyCheck(matrix, personnel.filter(p => p.department_id === deptId), `${departmentLabel(departments, departments.find(d => d.id === deptId)) || deptId}: `);
        const members = personnel.filter(p => (p.department_id || '__none__') === deptId);
        const deptName = departmentLabel(departments, departments.find(d => d.id === deptId)) || deptId;
        const dayTotals = sumDayTotals(matrix);
        for (const [dayStr, total] of Object.entries(dayTotals)) {
          const d = parseInt(dayStr);
          if (total <= 0) continue;
          const availableCount = members.filter(p => !isUnavailable(p.id, d)).length;
          if (total > availableCount) {
            warnings.push(`${DAYS[d]} · ${deptName}: ${total} kişi isteniyor, bu departmanda ${availableCount} uygun personel var (toplam ${members.length} kişi).`);
          }
        }
      }
    } else if (Object.keys(demandMatrix).length > 0) {
      weeklyCheck(demandMatrix, personnel, "");
      const dayTotals = sumDayTotals(demandMatrix);
      for (const [dayStr, total] of Object.entries(dayTotals)) {
        const d = parseInt(dayStr);
        if (total <= 0) continue;
        const availableCount = personnel.filter(p => !isUnavailable(p.id, d)).length;
        if (total > availableCount) {
          warnings.push(`${DAYS[d]}: ${total} kişi isteniyor, ${availableCount} uygun personel var (toplam ${personnel.length} kişi).`);
        }
      }
    }
    // Zorunlu yetkinlik ön-kontrolü: talep edilen vardiyada gerekli yetkinliğe sahip
    // yeterli uygun kişi yoksa motor çözüm bulamaz — kullanıcıyı önceden uyar
    const parseRoles = (p: any): string[] => {
      if (Array.isArray(p.roles)) return p.roles;
      try { return JSON.parse(p.roles || "[]"); } catch { return []; }
    };
    for (const def of shiftDefs) {
      // Departman şefi şube geneli yetkinlik kuralından sorumlu değil (lib/generatePlan de uygulamaz)
      const reqs = chefDept ? [] : def.required_skills ?? [];
      if (reqs.length === 0) continue;
      const activeMatrix = hasDeptDemand
        ? Object.values(deptDemandMatrix).reduce((acc, m) => {
            for (const [sid, days] of Object.entries(m)) {
              acc[sid] = acc[sid] ?? {};
              for (const [d, c] of Object.entries(days)) acc[sid][Number(d)] = (acc[sid][Number(d)] ?? 0) + Number(c || 0);
            }
            return acc;
          }, {} as Record<string, Record<number, number>>)
        : demandMatrix;
      const days = activeMatrix[def.id] ?? {};
      for (const req of reqs) {
        const skilled = personnel.filter(p => parseRoles(p).includes(req.skill));
        for (const [dayStr, count] of Object.entries(days)) {
          const d = parseInt(dayStr);
          if (Number(count) <= 0) continue;
          const availSkilled = skilled.filter(p => !isUnavailable(p.id, d)).length;
          if (availSkilled < req.count) {
            warnings.push(`${DAYS[d]} · ${def.name}: en az ${req.count} "${req.skill}" yetkinlikli kişi gerekli, o gün yalnızca ${availSkilled} uygun kişi var.`);
          }
        }
      }
    }
    return warnings;
  }, [hasDeptDemand, deptDemandMatrix, demandMatrix, personnel, departments, availMap, shiftDefs, locRules, chefDept]);

  // Kapasite Planı hücrelerinde "bu gün en fazla kaç kişi girilebilir" ipucu için —
  // departman verilmezse lokasyon geneli, verilirse sadece o departmanın personeli sayılır.
  const maxAvailableFor = (day: number, deptId?: string) => {
    const pool = deptId ? personnel.filter(p => p.department_id === deptId) : personnel;
    return pool.filter(p => availMap[p.id]?.[day]?.status !== 'unavailable').length;
  };

  // Bir kişi günde yalnızca 1 vardiyaya girebildiği için, bir hücrenin gerçek üst
  // sınırı o günün toplam uygun kişisinden AYNI departmanın o gündeki diğer
  // vardiyalarına zaten girilmiş sayı düşülerek bulunur (kalan kapasite) —
  // aksi halde "Sabah:5, Akşam:5" gibi tek tek sınır içinde görünen ama toplamda
  // imkansız girişler kırmızı uyarı almadan geçebilirdi.
  const remainingCapacityFor = (day: number, currentDefId: string, deptId?: string) => {
    const totalAvail = maxAvailableFor(day, deptId);
    const matrix = deptId ? (deptDemandMatrix[deptId] ?? {}) : demandMatrix;
    const usedByOtherShifts = shiftDefs.reduce((sum, d) => {
      if (d.id === currentDefId) return sum;
      return sum + (matrix[d.id]?.[day] ?? 0);
    }, 0);
    return totalAvail - usedByOtherShifts;
  };

  // Personel filtresi
  const filteredPersonnel = personnelFilter.trim()
    ? personnel.filter(p => p.name.toLowerCase().includes(personnelFilter.toLowerCase()))
    : personnel;

  // Departman bazlı gruplandırılmış tablo satırları
  type TableRow =
    | { kind: 'header'; dept: { id: string; name: string } }
    | { kind: 'person'; person: any };

  const tableRows: TableRow[] = [];
  if (departments.length > 0) {
    const byDept: Record<string, any[]> = {};
    for (const p of filteredPersonnel) {
      const key = p.department_id || '__none__';
      if (!byDept[key]) byDept[key] = [];
      byDept[key].push(p);
    }
    for (const dept of sortDepartments(departments)) {
      const ppl = byDept[dept.id] || [];
      if (personnelFilter && ppl.length === 0) continue;
      // Alt departmanı olan ve kendisinde kimse olmayan departman başlık olarak çizilmez (alt departmanlar adıyla gelir)
      if (groupDeptIds.has(dept.id) && ppl.length === 0) continue;
      tableRows.push({ kind: 'header', dept: { id: dept.id, name: departmentLabel(departments, dept) } });
      for (const p of ppl) tableRows.push({ kind: 'person', person: p });
    }
    const none = byDept['__none__'] || [];
    if (none.length > 0) {
      tableRows.push({ kind: 'header', dept: { id: '__none__', name: 'Diğer' } });
      for (const p of none) tableRows.push({ kind: 'person', person: p });
    }
  } else {
    for (const p of filteredPersonnel) tableRows.push({ kind: 'person', person: p });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const handleDragStart = (event: any) => {
    const { active } = event;
    const type = active.data?.current?.type || "grid";
    const personId = active.data?.current?.personId || active.id.split('-')[0];
    const person = personnel.find(p => p.id === personId);
    
    setActiveDragData({
      id: active.id,
      type,
      person
    });
  };

  const handleDragCancel = () => setActiveDragData(null);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragData(null);
    const { active, over } = event;
    if (!over) return;
    
    const sourceId = active.id as string;
    const targetId = over.id as string;
    
    if (sourceId === targetId) return;

    const newMap = { ...cellMap };

    // Tablo içi taşıma: kaynak ve hedef kimliği `${personel_id}-${gün}` (DraggableShift / DroppableCell).
    // (Eski ShiftBoard pano görünümünün person-/assigned-/shift- dalı pano silinince kaldırıldı.)
    const sourceCell = cellMap[sourceId];
    if (!sourceCell) return;

    const lastDash = targetId.lastIndexOf("-");
    const targetPId = targetId.slice(0, lastDash);
    const targetDay = parseInt(targetId.slice(lastDash + 1));
    const targetAvail = availMap[targetPId]?.[targetDay];
    const targetPerson = personnel.find(p => p.id === targetPId);

    if (targetAvail?.status === "unavailable") {
      showToast("Hedef gün izinli, vardiya taşınamaz.", "error");
      return;
    }
    if (targetPerson?.weekly_off_day !== null && targetPerson?.weekly_off_day !== undefined && Number(targetPerson.weekly_off_day) === targetDay) {
       showToast("Hedef gün personelin haftalık izni, vardiya taşınamaz.", "error");
       return;
    }

    newMap[targetId] = {
      ...sourceCell,
      points: cellBurden(sourceCell.startMin, sourceCell.endMin, targetDay, availMap, targetPId, locRules, shiftDefs),
      pinned: true,
    };
    delete newMap[sourceId];
    
    pushCellMap(newMap);
  };

  const demandEmpty =
    Object.values(demandMatrix).every(row => Object.values(row ?? {}).every(v => !v)) &&
    Object.values(deptDemandMatrix).every(d => Object.values(d ?? {}).every(row => Object.values(row ?? {}).every(v => !v)));

  // Personel İhtiyacı tablosu: hem sihirbazın 1. adımında hem de isteğe bağlı panelde kullanılır
  const demandTableEl = (
loading ? (
              <div className="p-4 space-y-2 border-t border-slate-100">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : shiftDefs.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm border-t border-slate-100">Vardiya tanımlı değil. Yukarıdaki Hızlı Kurulum bandından ekleyin.</div>
            ) : (
              <div className="overflow-x-auto">
                {/* Hafta şablonları: normal / bakım duruşu / kampanya haftası gibi planları kaydet, tek tıkla uygula */}
                {departments.length === 0 && (locRules as Record<string, unknown>).industry === "callcenter" && (
                  <div className="px-5 py-3 border-t border-slate-100 bg-sky-50/50">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <p className="flex-1 text-xs font-bold text-sky-900">Çağrı yoğunluğundan hesapla (Erlang C)</p>
                      {!callFormOpen && (
                        <button onClick={openCallForm} className="text-xs font-bold px-3 py-2 rounded-lg text-sky-800 border border-sky-200 hover:bg-sky-100">Hesapla</button>
                      )}
                    </div>
                    {callSummary && !callFormOpen && <p className="text-[11px] text-sky-800 mt-1">{callSummary}</p>}
                    {callFormOpen && (
                      <div className="mt-2 space-y-2 text-[11px] text-slate-700">
                        <div className="grid grid-cols-7 gap-1">
                          {DAYS.map((d, i) => (
                            <label key={d} className="flex flex-col items-center gap-0.5 font-semibold">
                              {d}
                              <input type="number" min={0} value={callForm.dailyCalls[i] || ""} placeholder="0" aria-label={`${d} günlük çağrı`}
                                onChange={e => setCallForm(f => ({ ...f, dailyCalls: f.dailyCalls.map((v, j) => j === i ? Math.max(0, Number(e.target.value) || 0) : v) }))}
                                className="w-full min-w-0 border border-slate-200 rounded-md px-1 py-1 text-center bg-white" />
                            </label>
                          ))}
                        </div>
                        <p className="text-slate-400">Günlük beklenen çağrı sayısı</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-2 items-center">
                          <label className="flex items-center gap-1">Yoğunluk
                            <select value={callForm.curve} onChange={e => setCallForm(f => ({ ...f, curve: e.target.value as CurveKey }))}
                              className="border border-slate-200 rounded-md px-1 py-1 bg-white">
                              {Object.entries(CURVES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                            </select>
                          </label>
                          <label className="flex items-center gap-1">Ort. görüşme
                            <input type="number" min={10} value={callForm.ahtSec} onChange={e => setCallForm(f => ({ ...f, ahtSec: Math.max(10, Number(e.target.value) || 0) }))}
                              className="w-16 border border-slate-200 rounded-md px-1 py-1 bg-white" /> sn
                          </label>
                          <label className="flex items-center gap-1">Hedef: çağrıların %
                            <input type="number" min={1} max={99} value={callForm.slPercent} onChange={e => setCallForm(f => ({ ...f, slPercent: Number(e.target.value) || 80 }))}
                              className="w-12 border border-slate-200 rounded-md px-1 py-1 bg-white" />&apos;i
                            <input type="number" min={1} value={callForm.slSeconds} onChange={e => setCallForm(f => ({ ...f, slSeconds: Number(e.target.value) || 20 }))}
                              className="w-12 border border-slate-200 rounded-md px-1 py-1 bg-white" /> sn içinde
                          </label>
                          <label className="flex items-center gap-1">Mola/izin payı %
                            <input type="number" min={0} max={80} value={callForm.shrinkagePercent} onChange={e => setCallForm(f => ({ ...f, shrinkagePercent: Math.max(0, Number(e.target.value) || 0) }))}
                              className="w-12 border border-slate-200 rounded-md px-1 py-1 bg-white" />
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setCallFormOpen(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50">Vazgeç</button>
                          <button onClick={() => { applyCallForecast(); setCallFormOpen(false); }}
                            className="px-3 py-1.5 rounded-lg bg-sky-700 text-white font-bold hover:bg-sky-800">Hesapla ve tabloya yaz</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {demandSuggestion && departments.length === 0 && (() => {
                  const same = shiftDefs.every(def => Array.from({ length: 7 }, (_, d) => d)
                    .every(d => (demandMatrix[def.id]?.[d] ?? 0) === (demandSuggestion.matrix[def.id]?.[d] ?? 0)));
                  if (same) return null;
                  return (
                    <div className={cn("px-5 py-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3", demandEmpty ? "bg-forest-50/70" : "bg-white")}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-forest-800 flex items-center gap-1.5">
                          <Sparkles size={13} className="text-forest-600 shrink-0" />
                          {demandSuggestion.source === "history"
                            ? `Öneri: son ${demandSuggestion.history_weeks} yayınlanmış haftanın ortalaması`
                            : "Başlangıç önerisi: açık her gün, her vardiyaya 1 kişi"}
                        </p>
                        {demandSuggestion.notes.map(n => <p key={n} className="text-[11px] text-slate-500 mt-0.5">{n}</p>)}
                      </div>
                      <button onClick={() => applyDemandSuggestion()}
                        className={cn("shrink-0 text-xs font-bold px-3 py-2 rounded-lg transition-colors",
                          demandEmpty ? "bg-forest-600 text-white hover:bg-forest-700" : "text-forest-700 border border-forest-200 hover:bg-forest-50")}>
                        {demandEmpty ? "Tabloya uygula" : "Öneriyle değiştir"}
                      </button>
                    </div>
                  );
                })()}
                {/* İlk kullanımda (şablon yok) çubuk gizli; tablonun altındaki "Şablon olarak kaydet" açar */}
                {(Object.keys(demandTemplates).length > 0 || tplOpen) && (
                <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-t border-b border-slate-100 bg-slate-50/40">
                  <span className="text-[10px] font-bold text-slate-400 shrink-0">Kayıtlı tablolar</span>
                  {Object.keys(demandTemplates).length === 0 && (
                    <span className="text-[11px] text-slate-400">Bu tabloyu isim vererek kaydedin (örn. &quot;Normal&quot;, &quot;Kampanya Haftası&quot;), sonraki haftalarda tek tıkla uygulayın.</span>
                  )}
                  {Object.keys(demandTemplates).map(name => (
                    <span key={name} className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg pl-2 pr-1 py-1">
                      <button
                        onClick={() => handleTemplateApply(name)}
                        disabled={tplBusy}
                        title="Bu kayıtlı tabloyu uygula"
                        className="text-[11px] font-bold text-forest-600 hover:text-forest-800 disabled:opacity-40"
                      >
                        {name}
                      </button>
                      <button
                        onClick={() => handleTemplateDelete(name)}
                        title="Kayıtlı tabloyu sil"
                        className="text-slate-300 hover:text-red-500 transition-colors p-0.5"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  <span className="flex items-center gap-1.5 ml-auto">
                    <input
                      value={tplName}
                      onChange={e => setTplName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleTemplateSave(); }}
                      placeholder="Tablo adı (örn. Bayram haftası)…"
                      className="w-32 text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-forest-400"
                    />
                    <button
                      onClick={handleTemplateSave}
                      disabled={!tplName.trim() || tplBusy}
                      className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-forest-600 text-white hover:bg-forest-700 transition-colors disabled:opacity-40 shrink-0"
                    >
                      Mevcut Planı Kaydet
                    </button>
                  </span>
                </div>
                )}
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2.5 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-44">Vardiya</th>
                      {DAYS.map((d, i) => {
                        const isWeekend = i === 5 || i === 6;
                        return (
                          <th key={d} className={cn("text-center py-2.5 px-2 text-[11px] font-bold uppercase tracking-widest min-w-[52px]", isWeekend ? "text-forest-500 bg-forest-50/40" : "text-slate-400")}>
                            <div>{d}</div>
                            <div className={cn("text-[10px] font-semibold mt-0.5", isWeekend ? "text-forest-300" : "text-slate-300")}>{dates[i]}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {departments.length === 0 ? (
                      shiftDefs.map(def => (
                        <tr key={def.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="py-2.5 px-5">
                            <span className="text-sm font-semibold text-slate-700">{def.name}</span>
                            <span className="text-[10px] text-slate-400 ml-2">{def.start}–{def.end}</span>
                            <span className="text-[10px] text-slate-300 ml-2">· maks {personnel.length} kişi</span>
                            {canFillRow(demandMatrix[def.id]) && !(isPublishedWeek && !editUnlocked) && !viewOnly && (
                              <button type="button" onClick={() => fillDemandRow(def.id)} title="İlk girdiğiniz sayıyı haftanın boş günlerine kopyalar"
                                className="ml-2 text-[10px] font-bold text-forest-600 hover:text-forest-800 hover:underline">Boşları doldur</button>
                            )}
                          </td>
                          {Array.from({ length: 7 }, (_, day) => {
                            const val = demandMatrix[def.id]?.[day] ?? 0;
                            const assigned = assignedCounts[def.id]?.[day] ?? 0;
                            const isWeekend = day === 5 || day === 6;
                            const maxAvail = remainingCapacityFor(day, def.id);
                            const maxAvailDisplay = Math.max(0, maxAvail);
                            const overLimit = val > 0 && val > maxAvail;
                            const coverState = val === 0 ? "empty" : assigned < val ? "under" : assigned === val ? "ok" : "over";
                            return (
                              <td key={day} className={cn("py-2 px-2 text-center", isWeekend && "bg-forest-50/20")}>
                                <div className="flex flex-col items-center gap-0.5">
                                  <input
                                    type="number" min={0} max={maxAvailDisplay}
                                    value={val === 0 ? "" : val}
                                    placeholder="—"
                                    disabled={(isPublishedWeek && !editUnlocked) || viewOnly}
                                    onChange={e => {
                                      const n = Math.max(0, parseInt(e.target.value) || 0);
                                      setDemandMatrix(prev => ({ ...prev, [def.id]: { ...(prev[def.id] ?? {}), [day]: n } }));
                                    }}
                                    onBlur={() => handleDemandSave(true)}
                                    title={`Bu vardiya için kalan kapasite: ${maxAvailDisplay} kişi`}
                                    className={cn(
                                      "w-11 h-8 text-center text-sm font-bold border rounded-lg focus:outline-none focus:ring-2 bg-white placeholder-slate-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-slate-50",
                                      overLimit ? "border-red-300 focus:ring-red-300 text-red-600 bg-red-50/40" : "border-slate-200 focus:ring-forest-300 text-forest-700"
                                    )}
                                  />
                                  {overLimit ? (
                                    <span className="text-[10px] font-bold leading-tight text-red-500">maks {maxAvailDisplay}</span>
                                  ) : val > 0 && cellCount > 0 ? (
                                    // Atanan/gereken sadece plan varken anlamlı (boş haftada her kutu kırmızı "0/1" oluyordu)
                                    <span className={cn(
                                      "text-[10px] font-bold leading-tight",
                                      coverState === "under" && "text-red-500",
                                      coverState === "ok"    && "text-emerald-600",
                                      coverState === "over"  && "text-sky-500",
                                    )}>{assigned}/{val}</span>
                                  ) : forecastMatrix[def.id]?.[day] != null ? (
                                    <span className="text-[10px] font-bold leading-tight text-sky-400" title="Geçmiş haftalara dayalı tahmin">~{forecastMatrix[def.id][day]}</span>
                                  ) : null}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    ) : (
                      demandDepts.map(dept => {
                        const deptHeadcount = personnel.filter(p => p.department_id === dept.id).length;
                        return (
                        <Fragment key={dept.id}>
                          <tr className="border-t border-slate-200 bg-slate-50/70">
                            <td colSpan={8} className="px-5 py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-0.5 h-4 rounded-full bg-forest-400 shrink-0" />
                                <span className="text-xs font-bold text-slate-700">{departmentLabel(departments, dept)}</span>
                                <span className="text-[10px] font-normal text-slate-400">· maks {deptHeadcount} kişi</span>
                              </div>
                            </td>
                          </tr>
                          {shiftDefs.map(def => {
                            const deptRow = deptDemandMatrix[dept.id]?.[def.id] ?? {};
                            return (
                              <tr key={`${dept.id}-${def.id}`} className="border-b border-slate-50 hover:bg-slate-50/50">
                                <td className="py-2.5 pl-8 pr-4">
                                  <span className="text-[12px] font-semibold text-slate-600">{def.name}</span>
                                  <span className="text-[10px] text-slate-300 ml-1.5">{def.start}–{def.end}</span>
                                  {canFillRow(deptRow) && !(isPublishedWeek && !editUnlocked) && !viewOnly && (
                                    <button type="button" onClick={() => fillDeptDemandRow(dept.id, def.id)} title="İlk girdiğiniz sayıyı haftanın boş günlerine kopyalar"
                                      className="ml-2 text-[10px] font-bold text-forest-600 hover:text-forest-800 hover:underline">Boşları doldur</button>
                                  )}
                                </td>
                                {Array.from({ length: 7 }, (_, day) => {
                                  const val = deptRow[day] ?? 0;
                                  const assigned = deptAssignedCounts[dept.id]?.[def.id]?.[day] ?? 0;
                                  const isWeekend = day === 5 || day === 6;
                                  const maxAvail = remainingCapacityFor(day, def.id, dept.id);
                                  const maxAvailDisplay = Math.max(0, maxAvail);
                                  const overLimit = val > 0 && val > maxAvail;
                                  const coverState = val === 0 ? "empty" : assigned < val ? "under" : assigned === val ? "ok" : "over";
                                  return (
                                    <td key={day} className={cn("py-2 px-2 text-center", isWeekend && "bg-forest-50/20")}>
                                      <div className="flex flex-col items-center gap-0.5">
                                        <input
                                          type="number" min={0} max={maxAvailDisplay}
                                          value={val === 0 ? "" : val}
                                          placeholder="—"
                                          disabled={(isPublishedWeek && !editUnlocked) || viewOnly}
                                          onChange={e => {
                                            const n = Math.max(0, parseInt(e.target.value) || 0);
                                            setDeptDemandMatrix(prev => ({
                                              ...prev,
                                              [dept.id]: { ...(prev[dept.id] ?? {}), [def.id]: { ...(prev[dept.id]?.[def.id] ?? {}), [day]: n } },
                                            }));
                                          }}
                                          onBlur={() => handleDeptDemandSave(dept.id)}
                                          title={`${dept.name}: bu vardiya için kalan kapasite: ${maxAvailDisplay} kişi`}
                                          className={cn(
                                            "w-11 h-8 text-center text-sm font-bold border rounded-lg focus:outline-none focus:ring-2 bg-white placeholder-slate-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-slate-50",
                                            overLimit ? "border-red-300 focus:ring-red-300 text-red-600 bg-red-50/40" : "border-slate-200 focus:ring-forest-300 text-forest-700"
                                          )}
                                        />
                                        {overLimit ? (
                                          <span className="text-[10px] font-bold leading-tight text-red-500">maks {maxAvailDisplay}</span>
                                        ) : val > 0 && cellCount > 0 ? (
                                          <span className={cn(
                                            "text-[10px] font-bold leading-tight",
                                            coverState === "under" && "text-red-500",
                                            coverState === "ok"    && "text-emerald-600",
                                            coverState === "over"  && "text-sky-500",
                                          )}>{assigned}/{val}</span>
                                        ) : forecastMatrix[def.id]?.[day] != null ? (
                                          <span className="text-[10px] font-bold leading-tight text-sky-400" title="Geçmiş haftalara dayalı tahmin">~{forecastMatrix[def.id][day]}</span>
                                        ) : null}
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
                {Object.keys(demandTemplates).length === 0 && !tplOpen && (
                  <button onClick={() => setTplOpen(true)}
                    className="px-5 py-2.5 text-[11px] font-bold text-forest-600 hover:text-forest-800 transition-colors">
                    Bu tabloyu kaydet (sonra tek dokunuşla uygula)
                  </button>
                )}
              </div>
            )
  );

  // Departmanlı şubede departmanı seçilmemiş kişi otomatik plana alınmaz (lib/generatePlan)
  // Alt departmanı olan departmana doğrudan bağlı kişi de alt departman seçilene kadar plana alınmaz
  const noDeptPeople = departments.length > 0 ? personnel.filter((p: { department_id?: string | null }) => !p.department_id || groupDeptIds.has(p.department_id)) : [];

  // Haftanın uyarıları tek şeritte (components/schedule/WeekAlerts)
  const weekAlerts: WeekAlert[] = [
    ...(error ? [{ id: "error", tone: "danger" as const, title: error, action: { label: "Kapat", onClick: () => setError(null) } }] : []),
    ...(capacityWarnings.length > 0 ? [{
      id: "capacity", tone: "danger" as const,
      title: "Personel ihtiyacı, mevcut personel sayısını aşıyor",
      detail: <><ul className="list-disc list-inside space-y-0.5">{capacityWarnings.slice(0, 6).map((w, i) => <li key={i}>{w}</li>)}</ul><p className="mt-1">Bu günlerde herkes uygun olsa bile otomatik planlama çözüm bulamaz. Sayıları azaltın.</p></>,
      action: { label: "Tabloyu Aç", onClick: () => setDemandOpen(true) },
    }] : []),
    ...(isPublishedWeek && !editUnlocked && editRequestStatus === "rejected" ? [{
      id: "edit-rejected", tone: "danger" as const,
      title: `Düzenleme talebi reddedildi${editRequestReviewer ? ` (${editRequestReviewer})` : ""}`,
      detail: editRequestNote ? <>&ldquo;{editRequestNote}&rdquo;</> : undefined,
      action: { label: "Tekrar İste", onClick: () => { setEditRequestStatus("idle"); setUnlockModal(true); } },
    }] : []),
    ...(seniorViolations.length > 0 ? [{
      id: "senior", tone: "warning" as const,
      title: "Bazı vardiyalarda kıdemli personel yok",
      detail: <>{seniorViolations.map(v => `${["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"][v.day]} ${v.shift}`).join(", ")}</>,
    }] : []),
    ...(revokedSkills.length > 0 ? [{
      id: "revoked-skills", tone: "warning" as const,
      title: `${new Set(revokedSkills.map(r => r.id)).size} kişi belge nedeniyle bazı görevlere atanmadı`,
      detail: <>{revokedSkills.map(r => `${r.name}: ${r.skill} (${r.document} ${r.reason === "expired" ? "süresi dolmuş" : "girilmemiş"})`).join(" · ")}</>,
    }] : []),
    ...(noDeptPeople.length > 0 ? [{
      id: "no-department", tone: "warning" as const,
      title: `${noDeptPeople.length} kişinin departmanı seçilmemiş, otomatik plana alınmıyor`,
      detail: <>{noDeptPeople.map((p: { name: string }) => p.name).join(", ")}. Ekip sayfasından departman seçin.</>,
      action: { label: "Ekip", onClick: () => { window.location.href = "/personnel"; } },
    }] : []),
    ...(excludedCompliance.length > 0 ? [{
      id: "compliance", tone: "warning" as const,
      title: `${excludedCompliance.length} kişi geçersiz belge nedeniyle plana alınmadı`,
      detail: <>{excludedCompliance.map(p => `${p.name} (${p.doc_type})`).join(", ")}</>,
    }] : []),
    ...(isPublishedWeek && !editUnlocked && editRequestStatus === "pending" ? [{
      id: "edit-pending", tone: "info" as const,
      title: "Düzenleme onayı hesap sahibinde bekleniyor",
      action: { label: "Detay", onClick: () => setUnlockModal(true) },
    }] : []),
    ...(isPublishedWeek && editUnlocked && editRequestStatus === "approved" ? [{
      id: "edit-approved", tone: "success" as const,
      title: `Düzenleme modu açık${editRequestReviewer ? ` (${editRequestReviewer} onayladı)` : ""}`,
      detail: "Yayınlayınca kapanır.",
    }] : []),
  ];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {mounted && (
        <div className="space-y-4">

          {/* ── Sayfa başlığı ── */}
          <PageHeader title="Vardiya Planı" description="Bir kutuya tıklayarak vardiya ekleyin, değişiklikler otomatik kaydedilir." />

          {/* ── Üst bant ── */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Hafta navigasyonu */}
            <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <button onClick={() => setWeekOffset(o => o - 1)} disabled={weekOffset <= 0} className="p-2.5 hover:bg-slate-50 text-slate-600 transition-colors disabled:opacity-25 disabled:cursor-not-allowed">
                <ChevronLeft size={16} />
              </button>
              <span className="px-3 text-xs md:text-sm font-bold text-slate-800 whitespace-nowrap min-w-[140px] md:min-w-[200px] text-center">{weekLabel}</span>
              <button onClick={() => setWeekOffset(o => o + 1)} className="p-2.5 hover:bg-slate-50 text-slate-600 transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Durum çipi */}
            {!loading && (
              cellCount === 0 && dbShiftCount === 0 ? (
                <StatusPill tone="neutral">Boş hafta</StatusPill>
              ) : isPublishedWeek && !dirty ? (
                <StatusPill tone="positive">
                  <Check size={11} /> Yayınlandı{currentRevision !== null && currentRevision > 0 ? ` · ${currentRevision}. güncelleme` : ""}
                </StatusPill>
              ) : isPublishedWeek && dirty ? (
                <StatusPill tone="attention">Yayınlanmamış değişiklik</StatusPill>
              ) : (
                <StatusPill tone="info" title="Personel taslağı göremez">Taslak</StatusPill>
              )
            )}

            {/* Otomatik kayıt göstergesi */}
            {!isPublishedWeek && saveState !== "idle" && (
              <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 whitespace-nowrap">
                {saveState === "saving" ? "Kaydediliyor…" : <><Check size={11} className="text-emerald-500" /> Kaydedildi</>}
              </span>
            )}

            {/* Canlı TL maliyet bütçesi */}
            {laborCost.total > 0 && (
              <span
                title={
                  (laborBudgetExceeded ? `Bütçe ₺${weeklyLaborBudgetTry.toLocaleString("tr-TR")} aşıldı. ` : "") +
                  (laborCost.missingWage > 0 ? `${laborCost.missingWage} personelin saatlik ücreti tanımsız, hesaba dahil değil.` : "Bu haftanın planlanan işçilik maliyeti.")
                }
                className={cn(
                  "px-2.5 py-1 text-[11px] font-bold rounded-lg whitespace-nowrap flex items-center gap-1",
                  laborBudgetExceeded ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                )}
              >
                <span className="font-semibold opacity-70">Maliyet</span> ₺{laborCost.total.toLocaleString("tr-TR")}
                {laborBudgetExceeded && " ⚠️"}
              </span>
            )}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* Personel filtresi */}
              {personnel.length > 5 && (
                <div className="hidden sm:flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-sm">
                  <Search size={13} className="text-slate-400 shrink-0" />
                  <input
                    type="text" value={personnelFilter} onChange={e => setPersonnelFilter(e.target.value)}
                    placeholder="Personel ara…"
                    className="w-28 text-sm text-slate-700 placeholder-slate-400 bg-transparent outline-none"
                  />
                  {personnelFilter && <button onClick={() => setPersonnelFilter('')} className="text-slate-400 hover:text-slate-600"><X size={12} /></button>}
                </div>
              )}

              {/* Adalet dağılımı toggle */}
              <button
                onClick={() => setFairnessOpen(o => !o)} title="Adalet Dağılımı" aria-label="Adalet Dağılımı"
                className={cn("px-3 py-2 rounded-xl border text-xs md:text-sm font-bold flex items-center gap-1.5 shadow-sm transition-colors", fairnessOpen ? "bg-forest-50 border-forest-200 text-forest-600" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50")}
              >
                <BarChart2 size={15} /> Adalet
              </button>

              {/* ⋯ İşlemler menüsü */}
              <div className="relative" data-actions-menu>
                <button
                  onClick={() => setActionsOpen(o => !o)}
                  className="px-3 py-2 text-xs md:text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <MoreHorizontal size={15} /> İşlemler
                </button>
                {actionsOpen && <div className="fixed inset-0 z-40 bg-black/20 sm:hidden" aria-hidden />}
                {actionsOpen && (
                  // Telefonda alttan açılan liste (üstteki düğmeye hizalı menü dar ekranda soldan taşıyordu)
                  <div className="fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-y-auto bg-white border-t border-slate-200 rounded-t-2xl shadow-2xl pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-64 sm:max-h-[70vh] sm:border sm:rounded-xl sm:shadow-lg sm:z-40 sm:py-1.5 sm:pb-1.5">
                    {cellCount > 0 && !(isPublishedWeek && !editUnlocked) && (
                      <button onClick={() => { setActionsOpen(false); openWizard(); }} disabled={generating}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        <Zap size={13} className="text-forest-500" /> Planı Yeniden Oluştur
                      </button>
                    )}
                    <button onClick={() => { setActionsOpen(false); setDemandOpen(o => !o); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                      <BookOpen size={13} className="text-slate-400" /> {demandOpen ? "Personel İhtiyacını Gizle" : "Personel İhtiyacı Tablosu"}
                    </button>
                    <button onClick={() => { setActionsOpen(false); handleCopyPrevWeek(); }} disabled={copyLoading}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      <Copy size={13} className="text-slate-400" /> {copyLoading ? "Kopyalanıyor…" : "Geçen Haftayı Kopyala"}
                    </button>
                    {availCollectionEnabled && (
                      <button onClick={() => { setActionsOpen(false); handleRequestAvailability(); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                        <Bell size={13} className="text-amber-500" /> Uygunluk İste
                      </button>
                    )}
                    <a href={`/api/export/schedule?location_id=${activeLocationId}&week_start=${weekStart}`} download onClick={() => setActionsOpen(false)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                      <Download size={13} className="text-slate-400" /> Excel İndir
                    </a>
                    <div className="my-1 border-t border-slate-100" />
                    <button onClick={undo} disabled={!canUndo} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      <Undo2 size={13} className="text-slate-400" /> Geri Al <span className="ml-auto text-[10px] text-slate-300 hidden sm:inline">Ctrl+Z</span>
                    </button>
                    <button onClick={redo} disabled={!canRedo} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      <Redo2 size={13} className="text-slate-400" /> Yeniden Yap <span className="ml-auto text-[10px] text-slate-300 hidden sm:inline">Ctrl+Y</span>
                    </button>
                    <div className="my-1 border-t border-slate-100" />
                    {/* Seyrek kullanılanlar: varsayılan kapalı */}
                    <button onClick={() => setAdvancedOpen(o => !o)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 transition-colors">
                      <ChevronDown size={13} className={cn("text-slate-400 transition-transform", !advancedOpen && "-rotate-90")} /> Gelişmiş
                    </button>
                    {advancedOpen && (
                      <div className="pl-3">
                      {personnel.length > 0 && shiftDefs.length > 0 && (
                        <button onClick={() => { setActionsOpen(false); setScnResult(null); setScnOpen(true); }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                          <Sparkles size={13} className="text-sky-500" /> Ya şöyle olursa?
                        </button>
                      )}
                      <button onClick={() => { setActionsOpen(false); setAddEventModal({ date: weekStart, dayLabel: "Bu Hafta", initScope: "week" }); setNewEventScope("week"); setNewEventTitle(""); setNewEventType("kampanya"); setNewEventNote(""); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                        <CalendarPlus size={13} className="text-emerald-500" /> Not ekle
                      </button>
                      <Link href="/schedule/archive" onClick={() => setActionsOpen(false)}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                        <History size={13} className="text-slate-400" /> Yayın Arşivi
                      </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Birincil aksiyon: boş hafta → Planı Oluştur, taslak → Yayınla, yayınlanmış → Düzenle */}
              {viewOnly ? (
                <span className="px-3 py-2 text-xs font-bold text-slate-500 bg-slate-100 rounded-xl">Sadece görüntüleme</span>
              ) : !canPublish && isPublishedWeek ? (
                <span className="px-3 py-2 text-xs font-bold text-slate-500 bg-slate-100 rounded-xl">Yayınlandı</span>
              ) : isPublishedWeek && !editUnlocked ? (
                <button onClick={() => setEditUnlocked(true)}
                  className="px-4 py-2 text-xs md:text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-sm">
                  <Lock size={14} /> Düzenle
                </button>
              ) : cellCount === 0 && !isPublishedWeek ? (
                <button onClick={() => openWizard()} disabled={generating || loading}
                  className="px-4 py-2 text-xs md:text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50">
                  <Sparkles size={14} /> Planı Oluştur
                </button>
              ) : !canPublish ? (
                chefDept && cellCount > 0 ? (
                  myDeptStatus?.submitted ? (
                    <span className="px-3 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">✓ Onaya gönderildi</span>
                  ) : (
                    <button onClick={submitForApproval} disabled={submitting}
                      className="px-4 py-2 text-xs md:text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50">
                      <Send size={14} /> {submitting ? "Gönderiliyor…" : "Onaya Gönder"}
                    </button>
                  )
                ) : (
                  <span className="px-3 py-2 text-xs font-bold text-slate-500 bg-slate-100 rounded-xl" title="Planı yayınlama yetkiniz yok">Yayını sorumlunuz yapar</span>
                )
              ) : (
                <button onClick={handlePublish} disabled={publishLoading}
                  className="px-4 py-2 text-xs md:text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50">
                  <Send size={14} /> {publishLoading ? "Yayınlanıyor…" : isPublishedWeek ? "Güncellemeyi Yayınla" : "Yayınla"}
                </button>
              )}
            </div>
          </div>

          {/* ── Departman planları: şeflerin onaya gönderdiği bölümler (yönetici görür) ── */}
          {!loading && !chefDept && !isPublishedWeek && deptStatus.some(d => d.chef_name) && (() => {
            // Şefi olmayan departmanların planı yöneticide: boşsa "Hepsi hazır" denmez (pub testi: Kasa boş kalıyordu)
            const chefOf = (id: string) => {
              const parent = departments.find(x => x.id === id)?.parent_id;
              return deptStatus.some(s => s.chef_name && (s.department_id === id || s.department_id === parent));
            };
            const ownDepts = demandDepts.filter(d => !chefOf(d.id));
            const plannedIds = new Set(Object.keys(cellMap).map(k => personnel.find(p => p.id === k.slice(0, k.lastIndexOf("-")))?.department_id));
            const chefsReady = deptStatus.filter(d => d.chef_name).every(d => d.submitted);
            const ownReady = ownDepts.every(d => plannedIds.has(d.id));
            return (
              <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold text-slate-700">Departman planları:</span>
                {deptStatus.filter(d => d.chef_name).map(d => (
                  <StatusPill key={d.department_id} tone={d.submitted ? "positive" : "attention"}>
                    {d.department_name} {d.submitted ? "hazır ✓" : `bekleniyor (${d.chef_name})`}
                  </StatusPill>
                ))}
                {ownDepts.map(d => (
                  <StatusPill key={d.id} tone={plannedIds.has(d.id) ? "positive" : "attention"}>
                    {departmentLabel(departments, d)} {plannedIds.has(d.id) ? "planlı ✓" : "boş (sorumlusu yok, sizde)"}
                  </StatusPill>
                ))}
                {chefsReady && ownReady ? (
                  <span className="text-xs font-semibold text-emerald-700">Hepsi hazır. Kontrol edip yayınlayabilirsiniz.</span>
                ) : chefsReady && (
                  <span className="text-xs text-slate-500">Sorumlusu olmayan bölümleri Planı Oluştur ile ekleyin: sorumluların planları korunur.</span>
                )}
              </div>
            );
          })()}

          {/* ── Otomatik pilotun hazırladığı taslak: müdüre kalan iş kontrol + Yayınla ── */}
          {!loading && autopilotDraftWeek === weekStart && !isPublishedWeek && cellCount > 0 && (
            <div className="bg-forest-50 border border-forest-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <Sparkles size={16} className="text-forest-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 text-sm">
                <p className="font-bold text-forest-800">
                  Bu plan otomatik hazırlandı
                </p>
                <p className="text-forest-700/80 text-xs mt-0.5">
                  {canPublish
                    ? <>Uyarılara göz atın, gerekirse bir kutuya tıklayıp düzeltin, sonra Yayınla&apos;ya basın. Personel yayınlanınca görür.</>
                    : <>Uyarılara göz atın, gerekirse bir kutuya tıklayıp düzeltin, sonra Onaya Gönder&apos;e basın. Sorumlunuz kontrol edip yayınlar.</>}
                </p>
              </div>
            </div>
          )}

          {/* ── Uyarılar: tek şerit ── */}
          {/* Haftanın tek uyarı kartı: işlem uyarıları + Plan Asistanı (lib/copilot) */}
          <WeekCopilot
            alerts={weekAlerts}
            snapshot={!loading && shiftDefs.length > 0 && personnel.length > 0 ? weekSnapshot : null}
            insights={weekInsights}
            onAction={a => (a === "remind-availability" ? handleRequestAvailability() : setDemandOpen(true))}
            onJump={jumpTo}
          />
          {!loading && (shiftDefs.length === 0 || personnel.length === 0) && (
            <QuickSetup
              locationId={activeLocationId}
              shiftDefsCount={shiftDefs.length}
              personnelCount={personnel.length}
              demandFilled={[demandMatrix, ...Object.values(deptDemandMatrix)].some(m => Object.values(m ?? {}).some(row => Object.values(row ?? {}).some(v => Number(v) > 0)))}
              onOpenDemand={() => openWizard()}
            />
          )}
          {publishSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 font-semibold flex items-center gap-2">
              <Check size={16} /> Vardiya programı yayınlandı! Personellere bildirim gönderildi.
            </div>
          )}
          {toast && (
            <div className={cn(
              "rounded-xl px-4 py-3 text-sm font-semibold flex items-center gap-2",
              toast.type === "success" && "bg-emerald-50 border border-emerald-200 text-emerald-700",
              toast.type === "error"   && "bg-red-50 border border-red-200 text-red-700",
              toast.type === "info"    && "bg-blue-50 border border-blue-200 text-blue-700",
            )}>
              {toast.type === "success" && <Check size={16} />}
              {toast.type === "error"   && <AlertCircle size={16} />}
              {toast.msg}
            </div>
          )}

          {/* ── Haftalık notlar ── */}
          {(() => {
            const weekNotes = events.filter(e => e.scope === "week" && e.date === weekStart);
            if (!weekNotes.length) return null;
            return (
              <div className="flex flex-wrap gap-2">
                {weekNotes.map(ev => (
                  <div key={ev.id} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium group", EVENT_TYPE_CONFIG[ev.type]?.color ?? "bg-slate-100 text-slate-600 border-slate-200")}>
                    <span>{EVENT_TYPE_CONFIG[ev.type]?.emoji ?? "📌"}</span>
                    <span className="font-bold">{ev.title}</span>
                    {ev.note && <span className="opacity-60">({ev.note})</span>}
                    <span className="text-[9px] opacity-50">haftalık</span>
                    <button onClick={() => deleteEvent(ev.id)} className="opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110" title="Sil"><X size={11} /></button>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── Personel İhtiyacı (isteğe bağlı panel; İşlemler menüsünden açılır) ── */}
          {demandOpen && !wizardOpen && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3 bg-slate-50/60">
                <p className="flex-1 text-[11px] font-bold text-slate-500">Personel İhtiyacı · kaç kişi gerekli?</p>
                <button onClick={() => setDemandOpen(false)} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Kapat"><X size={14} /></button>
              </div>
              {demandTableEl}
            </div>
          )}

          {/* ── Kopyalama onay diyalogu ── */}
          {confirmCopy && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-800">Bu haftada mevcut vardiyalar var</p>
                <p className="text-xs text-amber-700 mt-0.5">{Object.keys(cellMap).length} adet vardiya üzerine yazılacak.</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setConfirmCopy(false)} className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">İptal</button>
                <button onClick={doCopyPrevWeek} className="px-3 py-1.5 text-xs font-bold text-white bg-forest-600 rounded-lg hover:bg-forest-700 transition-colors">Evet, Kopyala</button>
              </div>
            </div>
          )}

          {/* ── Kural ihlali uyarı ── */}
          {violationModal && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-4 flex flex-col sm:flex-row items-start gap-3">
              <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5 hidden sm:block" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-red-800 mb-1 flex items-center gap-2">
                  <AlertCircle size={16} className="text-red-500 shrink-0 sm:hidden" />
                  Yayınlamadan önce bakın
                </p>
                <ul className="space-y-2">
                  {violationModal.problems.map(pr => (
                    <li key={pr.id}>
                      <p className={cn("text-xs font-bold", pr.severity === "critical" ? "text-red-800" : "text-amber-800")}>{pr.title}</p>
                      <ul className="text-xs text-red-700 space-y-0.5 list-disc list-inside">
                        {pr.lines.slice(0, 5).map((l, li) => {
                          const tg = pr.targets?.[li];
                          return <li key={l}>{tg ? <button type="button" onClick={() => { setViolationModal(null); jumpTo(tg); }} className="underline decoration-dotted text-left">{l}</button> : l}</li>;
                        })}
                        {pr.lines.length > 5 && <li className="list-none text-red-500">ve {pr.lines.length - 5} satır daha</li>}
                      </ul>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-red-500 mt-2">Yayınlamadan önce düzeltmeniz önerilir.</p>
              </div>
              <div className="flex gap-2 shrink-0 sm:flex-col w-full sm:w-auto">
                <button onClick={violationModal.onConfirm} className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap">Yine de Yayınla</button>
                <button onClick={() => {
                  // İlk düzeltilebilir soruna götürür (eskiden sadece pencereyi kapatıyordu)
                  const first = violationModal.problems.flatMap(pr => pr.targets ?? []).find(Boolean);
                  setViolationModal(null);
                  if (first) jumpTo(first);
                }} className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap">Düzelt</button>
              </div>
            </div>
          )}

          {/* ── Personel Haftalık Planı (Grid) ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative">
            {loading && (
              <div className="absolute inset-0 bg-white/70 z-20 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-forest-200 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            )}
            {/* Telefonda tablo tek gün gösterir: gün seçici (kırmızı nokta = eksik personel) */}
            {personnel.length > 0 && (
              <div className="sm:hidden grid grid-cols-7 gap-1 p-2 bg-slate-50/80 border-b border-slate-100">
                {Array.from({ length: 7 }, (_, i) => {
                  const need = Object.values(effectiveDemandMatrix).reduce((sum, dm) => sum + (dm[i] ?? 0), 0);
                  const got = Object.values(assignedCounts).reduce((sum, dm) => sum + (dm[i] ?? 0), 0);
                  return (
                    <button key={i} onClick={() => setMobileDay(i)}
                      className={cn("relative flex flex-col items-center py-1.5 rounded-lg text-[10px] font-bold transition-colors",
                        mobileDay === i ? "bg-forest-700 text-white" : "bg-white text-slate-600 border border-slate-200")}>
                      {DAYS[i]}
                      <span className={cn("text-[9px] font-semibold", mobileDay === i ? "text-forest-100" : "text-slate-400")}>{dates[i]?.split(" ")[0]}</span>
                      {need > 0 && got < need && isoDates[i] >= businessToday() && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500" />}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="overflow-x-auto relative" data-schedule-grid>
              <table className="w-full sm:min-w-[700px] border-collapse">
                <thead>
                  <tr className="bg-white border-b-2 border-slate-200">
                    <th className="sticky left-0 bg-white z-30 px-2 sm:px-3 py-3 text-left w-32 sm:w-44 align-bottom">
                      <span className="text-[10px] font-bold text-slate-400">
                        Personel {filteredPersonnel.length > 0 && <span className="font-normal text-slate-300">({filteredPersonnel.length})</span>}
                      </span>
                      {/* Gün başlığındaki sayı ve (açıksa) isim altındaki çubuk ne anlatıyor */}
                      <span className="block text-[9px] font-medium text-slate-400 normal-case tracking-normal mt-0.5">Gün altı: atanan / gereken kişi</span>
                      {showScores && <span className="block text-[9px] font-medium text-slate-400 normal-case tracking-normal">Çubuk: Adalet Puanı</span>}
                    </th>
                    {Array.from({ length: 7 }, (_, i) => {
                      const isWeekend = i === 5 || i === 6;
                      const isoDate = isoDates[i];
                      // TURKISH_HOLIDAYS bir dizi: eskiden sözlük gibi okunduğu için tatil hiç görünmüyordu
                      const holiday = getHolidaysForDate(isoDate)[0]?.name;
                      const dayEvents = events.filter(ev => ev.scope === "day" && eventCoversDate(ev, isoDate));
                      const totalNeeded = Object.values(effectiveDemandMatrix).reduce((sum, dm) => sum + (dm[i] ?? 0), 0);
                      const totalAssigned = Object.values(assignedCounts).reduce((sum, dm) => sum + (dm[i] ?? 0), 0);
                      return (
                        <th key={i} className={cn("py-2 px-1 text-center min-w-[80px] align-top", isWeekend ? "bg-forest-50/50" : "", mobileDay !== i && "hidden sm:table-cell")}>
                          <div className={cn("text-[11px] font-bold", isWeekend ? "text-forest-600" : "text-slate-700")}>{DAYS[i]}</div>
                          <div className={cn("text-[10px] mt-0.5 font-semibold", isWeekend ? "text-forest-400" : "text-slate-400")}>{dates[i]}</div>
                          {holiday && (
                            <div className="mt-1 text-[9px] bg-red-50 text-red-600 border border-red-100 rounded px-1 py-0.5 leading-tight font-semibold truncate" title={holiday}>
                              🎌 {holiday.length > 12 ? holiday.slice(0, 10) + "…" : holiday}
                            </div>
                          )}
                          {dayEvents.map(ev => (
                            <div key={ev.id} className={cn("mt-0.5 text-[9px] rounded px-1 py-0.5 leading-tight font-semibold truncate border", EVENT_TYPE_CONFIG[ev.type]?.color ?? "bg-slate-50 text-slate-500 border-slate-100")} title={ev.title}>
                              {EVENT_TYPE_CONFIG[ev.type]?.emoji} {ev.title.length > 9 ? ev.title.slice(0, 7) + "…" : ev.title}
                            </div>
                          ))}
                          <button
                            onClick={() => { setAddEventModal({ date: isoDate, dayLabel: `${DAYS[i]} ${dates[i]}` }); setNewEventScope("day"); setNewEventTitle(""); setNewEventType("kampanya"); setNewEventNote(""); setNewEventEndDate(""); }}
                            className="mt-0.5 text-[9px] text-slate-200 hover:text-forest-400 transition-colors block w-full text-center" title="Not ekle" aria-label="Not ekle"
                          >
                            <CalendarPlus size={9} className="inline" />
                          </button>
                          {weather[isoDate] && (
                            <div className="text-[10px] text-slate-400 font-medium mt-0.5">{weather[isoDate].icon} {weather[isoDate].temp}°</div>
                          )}
                          {totalNeeded > 0 && cellCount > 0 && (
                            <div className="mt-1 w-fit mx-auto">
                              <StatusPill tone={totalAssigned < totalNeeded ? "danger" : totalAssigned === totalNeeded ? "positive" : "info"}
                                title={`${totalAssigned} kişi atandı, ${totalNeeded} kişi gerekiyor`}>{totalAssigned}/{totalNeeded}</StatusPill>
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length === 0 && !loading && (
                    <tr>
                      <td colSpan={8} className="py-16 text-slate-400 text-sm">
                        {/* Telefonda tablo ekrandan geniş: mesaj görünür alanda kalsın */}
                        <div className="sticky left-0 w-[calc(100vw-4rem)] sm:w-auto text-center px-4">
                          {personnel.length === 0 ? "Henüz personel eklenmemiş. Yukarıdaki Hızlı Kurulum'dan ekleyebilirsiniz." : "Arama sonucu bulunamadı."}
                        </div>
                      </td>
                    </tr>
                  )}
                  {tableRows.map((row, _idx) => {
                    if (row.kind === 'header') {
                      const deptId = row.dept.id;
                      const isCollapsed = collapsedDepts.has(deptId);
                      const byDeptCount: Record<string, any[]> = {};
                      for (const p of filteredPersonnel) {
                        const k = p.department_id || '__none__';
                        if (!byDeptCount[k]) byDeptCount[k] = [];
                        byDeptCount[k].push(p);
                      }
                      return (
                        <tr key={`dept-${deptId}`} className="border-t-2 border-slate-200">
                          <td colSpan={8} className="px-4 py-2 bg-slate-50">
                            <button
                              onClick={() => setCollapsedDepts(prev => {
                                const next = new Set(prev);
                                if (next.has(deptId)) next.delete(deptId); else next.add(deptId);
                                return next;
                              })}
                              className="flex items-center gap-2 hover:text-slate-900 transition-colors group"
                            >
                              <ChevronDown size={13} className={cn("text-slate-400 transition-transform duration-200 group-hover:text-slate-600", isCollapsed && "-rotate-90")} />
                              <div className="w-2 h-2 rounded-full bg-forest-400 shrink-0" />
                              <span className="text-xs font-bold text-slate-700">{row.dept.name}</span>
                              <span className="text-[10px] text-slate-400 font-semibold">{byDeptCount[deptId]?.length ?? 0} kişi</span>
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    const p = row.person;
                    const deptId = p.department_id || '__none__';
                    if (collapsedDepts.has(deptId)) return null;

                    const pScore = personScores.find(s => s.id === p.id);
                    const score = pScore?.score ?? 0;
                    const scoreBarWidth = maxScore > 0 ? `${Math.min(100, (score / maxScore) * 100)}%` : "0%";

                    return (
                      <tr key={p.id} data-person-row={p.id} className="border-t border-slate-100 hover:bg-slate-50/40 transition-colors group h-14">
                        <td className="sticky left-0 bg-white group-hover:bg-slate-50/40 z-10 px-2 sm:px-3 py-2 h-14">
                          <div className="flex items-center gap-2">
                            <div className="hidden sm:flex w-7 h-7 rounded-full bg-forest-100 text-forest-700 text-xs font-bold flex items-center justify-center shrink-0">
                              {p.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-slate-800 truncate leading-tight flex items-center gap-1">
                                <span className="truncate">{p.name}</span>
                                {fatigueRiskMap[p.id] && (
                                  <span title={`Risk: ${fatigueRiskMap[p.id].reasons.join(" / ")}`} className="shrink-0">
                                    <AlertTriangle
                                      size={12}
                                      className={fatigueRiskMap[p.id].riskLevel === "danger" ? "text-red-500" : "text-amber-500"}
                                    />
                                  </span>
                                )}
                              </div>
                              {showScores && <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="h-1.5 bg-slate-100 rounded-full w-10 overflow-hidden">
                                  <div className={cn("h-full rounded-full", fairnessBarColor(score, avgScore))} style={{ width: scoreBarWidth }} />
                                </div>
                                <span className="text-[10px] text-slate-400 tabular-nums" title="Adalet Puanı: son haftalarda aldığı yük (yüksek = daha yüklü)">{Math.round(score * 10) / 10}</span>
                              </div>}
                            </div>
                            <div className="hidden sm:flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button onClick={() => fillPersonRow(p.id)} title="Tüm uygun günleri doldur" className="p-1 text-slate-300 hover:text-forest-500 transition-colors">
                                <CalendarCheck size={13} />
                              </button>
                              <button onClick={() => clearPersonRow(p.id)} title="Temizle" className="p-1 text-slate-300 hover:text-red-400 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        </td>
                        {Array.from({ length: 7 }, (_, day) => {
                          const cellKey = `${p.id}-${day}`;
                          const cell = cellMap[cellKey];
                          const avail = availMap[p.id]?.[day];
                          const isWeeklyOff = p.weekly_off_day !== null && p.weekly_off_day !== undefined && Number(p.weekly_off_day) === day;
                          const isWeekend = day === 5 || day === 6;
                          const isUnavailable = avail?.status === 'unavailable' || isWeeklyOff;
                          const isPrefNot = avail?.status === 'preferred_not';
                          const noAvailInfo = !availMap[p.id];
                          const forceData = cell ? forceAssignMap[cellKey] : null;
                          const matchedDef = cell ? matchShiftDef(cell.startMin, cell.endMin, shiftDefs) : null;

                          const oc = onCallMap[cellKey];
                          const ocDef = oc ? shiftDefs.find(d => d.id === oc.defId) : null;
                          const tdClass = cn(
                            "py-1 px-1 h-14 align-middle",
                            isWeekend && "bg-forest-50/20",
                            // Plan Kontrolü'nden "oraya git": hücre kısa süre vurgulanır
                            flash && flash.personId === p.id && (flash.day === undefined || flash.day === day) && "ring-2 ring-inset ring-amber-400 bg-amber-50",
                            mobileDay !== day && "hidden sm:table-cell",
                          );
                          const ocCallMin = oc?.id ? callouts.filter(c => c.assignment_id === oc.id)
                            .reduce((t, c) => { const a = hhmmToMin(c.start_time); let b = hhmmToMin(c.end_time); if (b <= a) b += 1440; return t + b - a; }, 0) : 0;
                          const readOnlyWeek = isPublishedWeek && !editUnlocked;
                          const onCallChip = ocDef ? (
                            <div
                              onClick={readOnlyWeek
                                ? (oc?.id ? () => { setCalloutForm({ start: "", end: "", note: "" }); setCalloutModal({ assignmentId: oc.id!, title: `${p.name} · ${DAYS[day]} · ${ocDef.name}` }); } : undefined)
                                : (e: React.MouseEvent) => handleCellClick(e, p.id, day)}
                              title={readOnlyWeek
                                ? "Nöbet: çağrıldıysa çalıştığı saati girmek için tıklayın"
                                : `Nöbet ${ocDef.start}–${ocDef.end}: evden, çağrılırsa gelir. Çalışma saatine sayılmaz.`}
                              className="mt-0.5 mx-auto w-full max-w-[84px] text-[9px] font-bold rounded-md px-1 py-0.5 text-center truncate bg-violet-50 text-violet-700 border border-dashed border-violet-300 cursor-pointer hover:border-violet-500"
                            >
                              {ocCallMin > 0
                                ? `Nöbet · ${(Math.round(ocCallMin / 6) / 10).toLocaleString("tr-TR")} s çağrıldı`
                                : `Nöbet · ${ocDef.name}`}
                            </div>
                          ) : null;

                          // Aynı gün ek vardiya: tabloda düzenlenemez, çakışma olarak kırmızı gösterilir.
                          // Yayınlı haftada tıklanınca "Gelemiyor" penceresi açılır (yedeğe ver / ilana çıkar).
                          const extras = extraCells[cellKey] ?? [];
                          const extraChip = extras.length > 0 ? extras.map(x => {
                            const xDef = matchShiftDef(x.startMin, x.endMin, shiftDefs);
                            const label = `${normTime(minToHHMM(x.startMin))}–${normTime(minToHHMM(x.endMin, x.endMin >= 1440))}`;
                            return (
                              <div key={x.id ?? label}
                                onClick={readOnlyWeek && x.id ? () => openAbsence(x.id!, p.id, `${p.name} · ${DAY_NAMES[day]} ${label}`) : undefined}
                                title="Aynı gün ikinci vardiya: dinlenme ve haftalık saat kurallarına uymayabilir. Yayınlı haftada tıklayıp başkasına verebilirsiniz."
                                className={cn("mt-0.5 mx-auto w-full max-w-[84px] rounded-lg px-1 py-0.5 text-center border bg-red-50 border-red-300", readOnlyWeek && x.id && "cursor-pointer hover:border-red-500")}
                              >
                                <div className="text-[10px] font-bold text-red-700 truncate">⚠ {xDef?.name ?? "2. vardiya"}</div>
                                <div className="text-[9px] text-red-500">{label}</div>
                              </div>
                            );
                          }) : null;

                          // Başka şubedeki vardiya: gri, sadece bilgi (o şubenin planında değiştirilir)
                          const away = elsewhere.filter(e => e.personnel_id === p.id && Number(e.day) === day);
                          const awayChip = away.length > 0 ? away.map((e, ai) => (
                            <div key={`away-${ai}`} title={`${e.location_name} şubesinde vardiyası var; orada değiştirilir`}
                              className="mt-0.5 mx-auto w-full max-w-[84px] rounded-lg px-1 py-0.5 text-center border bg-slate-100 border-slate-200">
                              <div className="text-[10px] font-bold text-slate-600 truncate">{e.location_name}</div>
                              <div className="text-[9px] text-slate-500">{normTime(e.start_time)}–{normTime(e.end_time)}</div>
                            </div>
                          )) : null;

                          if ((isPublishedWeek && !editUnlocked) || viewOnly || (!canPublish && isPublishedWeek)) {
                            const cellIsNight = cell ? isNightCell(cell) : false;
                            return (
                              <td key={day} className={tdClass}>
                                {cell ? (
                                  <div
                                    onClick={cell.id && !viewOnly && canPublish ? () => openAbsence(cell.id!, p.id, `${p.name} · ${DAY_NAMES[day]} ${normTime(minToHHMM(cell.startMin))}–${normTime(minToHHMM(cell.endMin, cell.endMin >= 1440))}`) : undefined}
                                    title={cell.id ? "Gelemiyorsa tıklayın: uygun yedek önerilir" : undefined}
                                    className={cn(
                                    "mx-auto w-full max-w-[84px] rounded-lg px-1 py-1 text-center border",
                                    cell.id && "cursor-pointer hover:shadow-sm",
                                    forceData ? "bg-amber-50 border-amber-200" : cellIsNight ? "bg-indigo-50 border-indigo-200/70" : "bg-forest-50 border-forest-200/70"
                                  )}>
                                    {matchedDef && <div className={cn("text-[11px] font-bold truncate", forceData ? "text-amber-700" : cellIsNight ? "text-indigo-700" : "text-forest-700")}>{matchedDef.name}</div>}
                                    <div className={cn("text-[9px]", forceData ? "text-amber-500" : cellIsNight ? "text-indigo-400" : "text-forest-400")}>
                                      {normTime(minToHHMM(cell.startMin))}–{normTime(minToHHMM(cell.endMin, cell.endMin >= 1440))}
                                    </div>
                                  </div>
                                ) : !ocDef ? (
                                  <div className="flex items-center justify-center h-full">
                                    <span className="text-slate-200 text-xs">—</span>
                                  </div>
                                ) : null}
                                {extraChip}{awayChip}
                                {onCallChip}
                              </td>
                            );
                          }

                          const cellIsNight = cell ? isNightCell(cell) : false;
                          return (
                            <DroppableCell key={day} id={cellKey} className={tdClass}>
                              {cell ? (
                                <DraggableShift id={cellKey} disabled={false}>
                                  <div
                                    onClick={(e: React.MouseEvent) => handleCellClick(e, p.id, day)}
                                    title={cell.pinned ? "Elle düzenlendi: Planı Oluştur bu vardiyayı korur" : undefined}
                                    className={cn(
                                      "relative mx-auto w-full max-w-[84px] rounded-lg px-1 py-1 text-center border cursor-pointer transition-all hover:shadow-sm",
                                      forceData ? "bg-amber-50 border-amber-300 hover:border-amber-400" : cellIsNight ? "bg-indigo-50 border-indigo-200/70 hover:border-indigo-400" : "bg-forest-50 border-forest-200/70 hover:border-forest-400"
                                    )}
                                  >
                                    {cell.pinned && (
                                      <Pin size={10} aria-label="Korunuyor" className="absolute top-0.5 right-0.5 text-forest-600 rotate-45" />
                                    )}
                                    <div className={cn("text-[11px] font-bold truncate", forceData ? "text-amber-700" : cellIsNight ? "text-indigo-700" : "text-forest-700")}>
                                      {matchedDef ? matchedDef.name : "Özel"}
                                    </div>
                                    <div className={cn("text-[9px]", forceData ? "text-amber-500" : cellIsNight ? "text-indigo-400" : "text-forest-400")}>
                                      {normTime(minToHHMM(cell.startMin))}–{normTime(minToHHMM(cell.endMin, cell.endMin >= 1440))}
                                    </div>
                                    {forceData && (
                                      <div className="text-[8px] text-amber-600 font-semibold">
                                        {forceData.status === "pending" ? "⏳" : forceData.status === "accepted" ? "✓" : "✗"}
                                      </div>
                                    )}
                                  </div>
                                </DraggableShift>
                              ) : isWeeklyOff ? (
                                <div className="w-full h-11 rounded-lg bg-amber-50 border border-amber-100 flex flex-col items-center justify-center gap-0.5">
                                  <span className="text-[9px] font-bold text-amber-400">Haftalık</span>
                                  <span className="text-[9px] font-bold text-amber-400">İzin</span>
                                </div>
                              ) : isUnavailable ? (
                                <div className="w-full h-11 rounded-lg bg-red-50 border border-red-200 flex flex-col items-center justify-center gap-0.5" title="Kesinlikle uygun değil">
                                  <X size={12} className="text-red-400" />
                                  <span className="text-[9px] font-bold text-red-400">Uygun Değil</span>
                                </div>
                              ) : isPrefNot ? (
                                <button
                                  onClick={(e: React.MouseEvent) => handleCellClick(e, p.id, day)}
                                  className="w-full h-11 rounded-lg bg-amber-50 border border-amber-300 hover:border-amber-400 hover:bg-amber-100 transition-all flex flex-col items-center justify-center gap-0.5 group"
                                  title={avail?.start && avail.end ? `Tercih etmiyor, ${avail.start}–${avail.end} arası gelebilir` : "Tercih etmiyor (gerekirse gelebilir)"}
                                >
                                  <span className="text-[10px] font-bold text-amber-600">~ Tercih Etmiyor</span>
                                  {avail?.start && avail.end && (
                                    <span className="text-[9px] text-amber-400">{avail.start}–{avail.end}</span>
                                  )}
                                  <Plus size={10} className="text-amber-400 opacity-0 group-hover:opacity-100 absolute transition-opacity" />
                                </button>
                              ) : avail?.status === 'available' ? (
                                <button
                                  onClick={(e: React.MouseEvent) => handleCellClick(e, p.id, day)}
                                  className="w-full h-11 rounded-lg bg-emerald-50 border border-emerald-200 hover:border-emerald-400 hover:bg-emerald-100 transition-all flex flex-col items-center justify-center gap-0.5 group"
                                  title={avail?.start && avail.end ? `Uygun, ${avail.start}–${avail.end}` : "Uygun"}
                                >
                                  <span className="text-[10px] font-bold text-emerald-600 group-hover:opacity-0 transition-opacity">✓ Uygun</span>
                                  {avail?.start && avail.end && (
                                    <span className="text-[9px] text-emerald-400 group-hover:opacity-0 transition-opacity">{avail.start}–{avail.end}</span>
                                  )}
                                  <Plus size={13} className="text-emerald-500 opacity-0 group-hover:opacity-100 absolute transition-opacity" />
                                </button>
                              ) : (
                                <button
                                  onClick={(e: React.MouseEvent) => handleCellClick(e, p.id, day)}
                                  className="w-full h-11 rounded-lg border-2 border-dashed border-slate-200 text-slate-300 hover:border-forest-300 hover:text-forest-400 hover:bg-forest-50/30 transition-all flex items-center justify-center"
                                  title={availCollectionEnabled ? "Uygunluk girilmemiş, vardiya ekle" : "Vardiya ekle"}
                                >
                                  <Plus size={13} />
                                </button>
                              )}
                              {extraChip}{awayChip}
                              {onCallChip}
                            </DroppableCell>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>

          {/* ── Plan hazırlanıyor katmanı (sihirbaz dışı çağrılar için) ── */}
          {generating && !wizardOpen && (
            <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 pointer-events-none">
              <div className="w-12 h-12 rounded-2xl bg-forest-100 flex items-center justify-center">
                <Zap size={22} className="text-forest-600 animate-pulse" />
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-slate-800">Plan hazırlanıyor</p>
                <p className="text-sm text-slate-400 mt-0.5">5–15 saniye sürebilir…</p>
              </div>
            </div>
          )}

          {/* ── Planı Oluştur sihirbazı ── */}
          {wizardOpen && (
            <GenerateWizard
              weekLabel={weekLabel}
              demandTable={demandTableEl}
              demandEmpty={demandEmpty}
              demandAutoFilled={demandAutoFilled}
              pastDayCount={[0, 1, 2, 3, 4, 5, 6].filter(d => addDays(weekStart, d) < businessToday()).length}
              capacityWarnings={capacityWarnings}
              personnelCount={personnel.length}
              availabilityEnabled={availCollectionEnabled}
              noAvailCount={noAvailCount}
              onRemindAvailability={() => handleRequestAvailability(weekOffset)}
              existingCellCount={cellCount}
              pinnedCount={Object.values(cellMap).filter(c => c.pinned).length}
              minimizeChanges={minimizeChanges}
              onMinimizeChangesChange={setMinimizeChanges}
              changedCount={changedCount}
              keepPinned={keepPinned}
              onKeepPinnedChange={setKeepPinned}
              generating={generating}
              error={error}
              generatedCount={cellCount}
              seniorViolationCount={seniorViolations.length}
              excludedCount={excludedCompliance.length}
              onGenerate={runGenerate}
              onPublish={canPublish ? handlePublish : undefined}
              onClose={() => setWizardOpen(false)}
            />
          )}

          {/* ── Ya şöyle olursa? (senaryo, kaydedilmez) ── */}
          {scnOpen && (() => {
            const short = (snap: WeekSnapshot) => snap.coverage.reduce((t, c) => t + (c.demand != null && c.assigned < c.demand ? c.demand - c.assigned : 0), 0);
            const crit = (x: ScnSide) => (x.problems ?? []).filter(p => p.severity === "critical").length;
            const cmp = (a: number, b: number) => (b < a ? true : b > a ? false : null);
            const Row = ({ label, a, b, better }: { label: string; a: string; b: string; better?: boolean | null }) => (
              <tr className="border-t border-slate-100">
                <td className="py-1.5 pr-3 text-slate-500">{label}</td>
                <td className="py-1.5 pr-3 font-semibold text-slate-700">{a}</td>
                <td className={cn("py-1.5 font-bold", better === true ? "text-emerald-700" : better === false ? "text-red-600" : "text-slate-800")}>{b}</td>
              </tr>
            );
            return (
              <Sheet open onClose={() => { if (!scnBusy) setScnOpen(false); }} size="lg" title="Ya şöyle olursa?" description={`${weekLabel} · kaydedilmez, sadece dener`}>
                <div className="space-y-4">
                  <div className="space-y-3 text-xs text-slate-700">
                    <div>
                      <p className="font-semibold mb-1">Biri izne çıkarsa</p>
                      <select value={scnAbsent.pid} onChange={e => setScnAbsent(a => ({ ...a, pid: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                        <option value="">Kimse</option>
                        {personnel.map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {scnAbsent.pid && (
                        <div className="flex gap-1 mt-1.5">
                          {DAYS.map((d, i) => {
                            const on = scnAbsent.days.includes(i);
                            return <button key={d} onClick={() => setScnAbsent(a => ({ ...a, days: on ? a.days.filter(x => x !== i) : [...a.days, i] }))}
                              className={cn("flex-1 py-1 rounded-md font-bold border", on ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200")}>{d}</button>;
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 font-semibold">Yeni personel
                        <input type="number" min={0} max={10} value={scnExtra} onChange={e => setScnExtra(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
                          className="w-14 border border-slate-200 rounded-lg px-2 py-1 bg-white" /> kişi
                      </label>
                      <label className="flex items-center gap-2 font-semibold">İhtiyaç
                        <select value={scnDemandPct} onChange={e => setScnDemandPct(Number(e.target.value))} className="border border-slate-200 rounded-lg px-2 py-1 bg-white">
                          {[-30, -20, -10, 0, 10, 20, 30, 50].map(v => <option key={v} value={v}>{v > 0 ? `+%${v}` : v < 0 ? `-%${-v}` : "aynı"}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>
                  <button onClick={runScenario} disabled={scnBusy || (!scnAbsent.pid && scnExtra === 0 && scnDemandPct === 0)}
                    className="w-full py-2.5 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-40">
                    {scnBusy ? "Çözülüyor…" : "Senaryoyu çöz"}
                  </button>
                  {scnResult && (scnResult.scn.error || scnResult.base.error) && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      {scnResult.scn.error ? `Bu senaryoda plan kurulamıyor: ${scnResult.scn.error}` : `Karşılaştırma planı kurulamadı: ${scnResult.base.error}`}
                    </p>
                  )}
                  {scnResult?.base.snap && scnResult.scn.snap && (() => {
                    const b = scnResult.base as Required<ScnSide>; const x = scnResult.scn as Required<ScnSide>;
                    return (
                      <div className="space-y-3">
                        <table className="w-full text-xs">
                          <thead><tr><th className="text-left text-slate-400 font-semibold pb-1"></th><th className="text-left text-slate-400 font-semibold pb-1">Senaryosuz</th><th className="text-left text-slate-400 font-semibold pb-1">Senaryo</th></tr></thead>
                          <tbody>
                            <Row label="Vardiya / saat" a={`${b.snap.totalShifts} / ${b.snap.totalHours} s`} b={`${x.snap.totalShifts} / ${x.snap.totalHours} s`} />
                            <Row label="Eksik kişi (ihtiyaca göre)" a={String(short(b.snap))} b={String(short(x.snap))} better={cmp(short(b.snap), short(x.snap))} />
                            <Row label="Acil sorun" a={String(crit(b))} b={String(crit(x))} better={cmp(crit(b), crit(x))} />
                            <Row label="Maliyet (ücretli personel)" a={`₺${b.cost.toLocaleString("tr-TR")}`} b={`₺${x.cost.toLocaleString("tr-TR")}`} />
                            {scnExtra > 0 && <Row label="Yeni personelin vardiyası" a="—" b={`${x.extraShifts} vardiya`} />}
                          </tbody>
                        </table>
                        {x.problems.length > 0 ? (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-semibold text-slate-500">Senaryoda dikkat</p>
                            {x.problems.slice(0, 5).map(pr => (
                              <p key={pr.id} className={cn("text-xs", pr.severity === "critical" ? "text-red-700" : "text-amber-700")}>• {pr.title}</p>
                            ))}
                          </div>
                        ) : <p className="text-xs text-emerald-700">Senaryoda kural sorunu görünmüyor.</p>}
                        <p className="text-[11px] text-slate-400">İki sütun da aynı motorla baştan kuruldu; mevcut planınız değişmedi. Uygulamak isterseniz ilgili değişikliği yapıp Planı Oluştur&apos;u çalıştırın.</p>
                      </div>
                    );
                  })()}
                </div>
              </Sheet>
            );
          })()}

          {/* ── Gelemiyor: akıllı yedek ── */}
          {absence && (
            <Sheet open onClose={() => { if (!absenceBusy) setAbsence(null); }} title="Gelemiyor · yerine kim geçsin?" description={absence.title}
              footer={<>
                <button disabled={absenceBusy} onClick={() => resolveAbsence("all")} className={sheetSecondaryClass}>Herkese duyur</button>
                <button disabled={absenceBusy || !absenceCands?.length} onClick={() => resolveAbsence("top")} className={sheetPrimaryClass}>İlk 3&apos;e teklif gönder</button>
              </>}>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {([["sick", "Hastalık"], ["emergency", "Acil durum"], ["no_show", "Gelmedi"]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setAbsenceReason(k)}
                      className={cn("text-xs px-3 min-h-[36px] rounded-lg font-semibold border", absenceReason === k ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200")}>{l}</button>
                  ))}
                </div>
                {absenceCands === null ? (
                  <p className="text-xs text-slate-400">Uygun kişiler hesaplanıyor…</p>
                ) : absenceCands.length === 0 ? (
                  <p className="text-xs text-slate-500">O gün uygun kimse yok (vardiyası, izni ya da &quot;gelemem&quot; günü olmayan). Vardiyayı açık ilana çıkarabilirsiniz.</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-slate-500">Önerilen yedekler</p>
                    {[...absenceCands.filter(c => !c.other_branch).slice(0, 5), ...absenceCands.filter(c => c.other_branch)].map((c, i, arr) => (
                      <Fragment key={c.personnel_id}>
                      {c.other_branch && !arr[i - 1]?.other_branch && <p className="text-[11px] font-semibold text-slate-500 pt-1">Diğer şubelerden</p>}
                      <div className={cn("rounded-xl border px-3 py-2", c.warnings.length ? "border-amber-200 bg-amber-50/50" : "border-slate-200")}>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-400 w-4">{i + 1}</span>
                          <span className="flex-1 text-sm font-semibold text-slate-800">{c.name}{c.other_branch && <span className="font-normal text-slate-400"> · {c.other_branch}</span>}</span>
                          {/* Başka şubenin çalışanını sadece patron/bölge müdürü atar; şube müdürü ilanla duyurur */}
                          {(!c.other_branch || viewerRole === "admin" || viewerRole === "supervisor") ? (
                            <button disabled={absenceBusy} onClick={() => resolveAbsence("assign", c)}
                              className="text-xs font-bold px-2.5 py-1 rounded-lg bg-forest-600 text-white hover:bg-forest-700 disabled:opacity-40">Ata</button>
                          ) : <span className="text-[10px] text-slate-400 text-right leading-tight">İlana çıkarınca<br />ona da duyurulur</span>}
                        </div>
                        {c.reasons.slice(0, 2).map(r => <p key={r} className="text-[11px] text-slate-500 ml-6">✓ {r}</p>)}
                        {c.warnings.map(w => <p key={w} className="text-[11px] text-amber-700 ml-6">! {w}</p>)}
                      </div>
                      </Fragment>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-500">Teklifte ilk kabul eden vardiyayı alır ve ek puan kazanır; diğer şubelerden uygun kişilere de duyurulur. Vardiya planından kaldırılıp açık ilana dönüşür.</p>
              </div>
            </Sheet>
          )}

          {/* ── İcap çağrısı (yayınlanmış hafta) ── */}
          {calloutModal && (
            <Sheet open onClose={() => setCalloutModal(null)} title="Nöbet çağrısı" description={calloutModal.title}
              footer={<>
                <button onClick={() => setCalloutModal(null)} className={sheetSecondaryClass}>Kapat</button>
                <button onClick={saveCallout} disabled={calloutBusy || !calloutForm.start || !calloutForm.end} className={sheetPrimaryClass}>Çağrıyı kaydet</button>
              </>}>
              <div className="space-y-4">
                <p className="text-xs text-slate-500">Çağrılıp çalışılan saat çalışma süresine ve mesaiye sayılır; bekleme süresi sayılmaz.</p>
                {callouts.filter(c => c.assignment_id === calloutModal.assignmentId).map(c => (
                  <div key={c.id} className="flex items-center justify-between text-xs bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                    <span className="font-semibold text-violet-800">{c.start_time}–{c.end_time}{c.note ? ` · ${c.note}` : ""}</span>
                    <button onClick={() => deleteCallout(c.id)} className="text-slate-400 hover:text-red-500" aria-label="Çağrıyı sil"><Trash2 size={13} /></button>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] font-semibold text-slate-600">Başlangıç
                    <input type="time" value={calloutForm.start} onChange={e => setCalloutForm(f => ({ ...f, start: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-600">Bitiş
                    <input type="time" value={calloutForm.end} onChange={e => setCalloutForm(f => ({ ...f, end: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                  </label>
                </div>
                <input value={calloutForm.note} onChange={e => setCalloutForm(f => ({ ...f, note: e.target.value }))} placeholder="Not (isteğe bağlı): acil hasta, arıza..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </Sheet>
          )}

          {/* ── Düzenleme kilidi modalı ── */}
          {unlockModal && (
            <Sheet open onClose={() => { if (editRequestStatus !== "pending") setUnlockModal(false); }}
              title={editRequestStatus === "pending" ? "Onay bekleniyor" : editRequestStatus === "rejected" ? "Talep reddedildi" : "Düzenleme onayı"}
              description={editRequestStatus === "idle" || editRequestStatus === "sending" ? "Hesap sahibinin onayı gerekiyor" : undefined}
              footer={editRequestStatus === "pending" ? (
                <button onClick={() => setUnlockModal(false)} className={sheetSecondaryClass}>Kapat (arka planda bekler)</button>
              ) : editRequestStatus === "rejected" ? <>
                <button onClick={() => { setUnlockModal(false); setEditRequestStatus("idle"); }} className={sheetSecondaryClass}>Kapat</button>
                <button onClick={() => { setEditRequestStatus("idle"); handleSendEditRequest(); }} className={sheetPrimaryClass}>Tekrar iste</button>
              </> : <>
                <button onClick={() => { setUnlockModal(false); setEditRequestStatus("idle"); }} className={sheetSecondaryClass}>Vazgeç</button>
                <button onClick={handleSendEditRequest} disabled={editRequestStatus === "sending"} className={sheetPrimaryClass}>
                  {editRequestStatus === "sending" ? "Gönderiliyor…" : "Onay iste"}
                </button>
              </>}>
              {(editRequestStatus === "idle" || editRequestStatus === "sending") && (
                <p className="text-sm text-slate-600 leading-relaxed">Bu hafta için yayınlanmış bir plan var. Düzenleme talebiniz <strong>hesap sahibine</strong> gönderilecek. Onayladıktan sonra düzenleyebilirsiniz.</p>
              )}
              {editRequestStatus === "pending" && (
                <p className="text-sm text-slate-600">Talep hesap sahibine iletildi. Onayladığında düzenleme kendiliğinden açılır.</p>
              )}
              {editRequestStatus === "rejected" && (
                <div className="space-y-1">
                  {editRequestNote && <p className="text-sm text-slate-700">&ldquo;{editRequestNote}&rdquo;</p>}
                  <p className="text-sm text-slate-500">Planı düzenlemek için tekrar onay isteyin ya da hesap sahibiyle konuşun.</p>
                </div>
              )}
            </Sheet>
          )}


        </div>
      )}

      {/* ── Adalet Dağılımı yan çekmecesi ── */}
      {fairnessOpen && <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setFairnessOpen(false)} />}
      <div className={cn(
        "fixed top-0 right-0 h-full w-72 bg-white border-l border-slate-200 shadow-xl z-50 flex flex-col transition-transform duration-300",
        fairnessOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <BarChart2 size={15} className="text-forest-500" />
            <h2 className="text-sm font-bold text-slate-800">Adalet Dağılımı</h2>
          </div>
          <button onClick={() => setFairnessOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1"><X size={15} /></button>
        </div>
        <label className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 text-xs font-semibold text-slate-600 cursor-pointer">
          <input type="checkbox" checked={showScores} onChange={toggleScores} className="accent-forest-600" />
          Puanı tabloda isimlerin altında göster
        </label>
        <div className="flex-1 overflow-y-auto p-4">
          {personScores.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Personel yok</p>
          ) : (
            <div className="space-y-3.5">
              {[...personScores].sort((a, b) => b.score - a.score).map(s => {
                // Bu haftanın canlı çarpan sayaçları — hücrelerden türetilir
                let wknd = 0, nght = 0, prfn = 0;
                for (const [key, val] of Object.entries(cellMap)) {
                  if (!key.startsWith(`${s.id}-`)) continue;
                  const day = parseInt(key.slice(key.lastIndexOf("-") + 1));
                  if (day === 5 || day === 6) wknd++;
                  if (matchShiftDef(val.startMin, val.endMin, shiftDefs)?.is_night) nght++;
                  if (availMap[s.id]?.[day]?.status === "preferred_not") prfn++;
                }
                return (
                <div key={s.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-700 truncate max-w-[140px]">{s.name}</span>
                    <span className="flex items-center gap-1">
                      {wknd > 0 && <span className="text-[9px] font-bold bg-amber-50 text-amber-600 px-1 py-px rounded" title={`${wknd} hafta sonu vardiyası`}>{wknd} h.sonu</span>}
                      {nght > 0 && <span className="text-[9px] font-bold bg-forest-50 text-forest-600 px-1 py-px rounded" title={`${nght} gece vardiyası`}>{nght}🌙</span>}
                      {prfn > 0 && <span className="text-[9px] font-bold bg-yellow-50 text-yellow-600 px-1 py-px rounded" title={`${prfn} "tercih etmem" günü ataması (puanla telafi edilir)`}>{prfn}!</span>}
                      <span className="text-xs font-bold text-slate-400 tabular-nums ml-0.5" title={scoreVsAverageText(s.score, avgScore)}>{formatScore(s.score)}</span>
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-300", fairnessBarColor(s.score, avgScore))} style={{ width: `${(s.score / maxScore) * 100}%` }} />
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-slate-100 space-y-1 text-[10px] text-slate-400 leading-relaxed">
          <p>Puan, kişinin son haftalarda ne kadar ve ne kadar zor çalıştığını gösterir. Yüksek = daha çok yük aldı; otomatik plan önce puanı düşük olana vardiya verir.</p>
          <p>Kırmızı çubuk ortalamanın belirgin üstü, mavi altı. Kesin puan yayında hesaplanır.</p>
        </div>
      </div>

      {/* ── Hücre popover ── */}
      {popover && (
        <div
          data-popover
          className="fixed z-50 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 w-[calc(100vw-2rem)] max-w-[288px] sm:w-72"
          style={{ left: Math.min(popover.x, window.innerWidth - 320), top: popover.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-bold text-slate-800">{popoverPerson?.name}</p>
              <p className="text-xs text-slate-400">{DAYS[popover.day]}, {dates[popover.day]}</p>
            </div>
            <button onClick={() => setPopover(null)} className="text-slate-400 hover:text-slate-600 transition-colors p-1"><X size={15} /></button>
          </div>
          {shiftDefs.length === 0 && (
            <div className="mb-3 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex items-center gap-2">
              <BookOpen size={13} className="text-amber-500 shrink-0" />
              <p className="text-[11px] text-amber-700">Tanımlı vardiya yok. <a href="/settings" className="font-bold underline" onClick={() => setPopover(null)}>Ayarlar&apos;dan ekle</a></p>
            </div>
          )}
          {hasExisting && (() => {
            const key = `${popover!.personnelId}-${popover!.day}`;
            const c = cellMap[key];
            const def = c ? matchShiftDef(c.startMin, c.endMin, shiftDefs) : null;
            const wc = (locRules as Record<string, unknown>).work_cycle as WorkCycleConfig | undefined;
            const lines = explainAssignment(weekSnapshot, popover!.personnelId, popover!.day, {
              pinned: !!c?.pinned,
              cycleState: weekStates(wc, popover!.personnelId, weekStart)?.[popover!.day] ?? null,
              requiredRoles: (def?.required_skills ?? []).map(r => r.skill),
              reliabilityNote: reliabilityNotes[popover!.personnelId] ?? null,
              learned: (learnedPrefs[popover!.personnelId] ?? [])
                .filter(l => l.day === popover!.day && (l.shiftId === null || l.shiftId === def?.id))
                .map(l => l.note),
            });
            if (!lines.length) return null;
            return (
              <details className="mb-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                <summary className="text-[11px] font-bold text-slate-600 cursor-pointer select-none">Neden bu kişi?</summary>
                <ul className="mt-1.5 space-y-1">
                  {lines.map(l => (
                    <li key={l.text} className={cn("text-[11px] leading-snug", l.tone === "warn" ? "text-amber-700" : l.tone === "ok" ? "text-slate-700" : "text-slate-500")}>
                      {l.tone === "warn" ? "! " : l.tone === "ok" ? "✓ " : "· "}{l.text}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })()}
          {shiftDefs.some(d => !d.on_call) && (
            <div className="mb-3">
              <p className="text-[10px] text-slate-400 font-medium mb-1.5">Vardiya</p>
              <div className="flex flex-wrap gap-1.5">
                {shiftDefs.filter(d => !d.on_call).map(def => {
                  const ds = hhmmToMin(def.start);
                  let de = hhmmToMin(def.end);
                  if (de <= ds) de += 1440;
                  const isActive = Math.abs(popover.startMin - ds) <= 10 && Math.abs(popover.endMin - de) <= 10;
                  return (
                    <button
                      key={def.id}
                      onClick={() => setPopover(prev => prev ? { ...prev, startMin: ds, endMin: de } : null)}
                      className={cn("text-xs px-2.5 py-1 rounded-lg font-semibold border transition-colors", isActive ? "bg-ember-600 text-white border-ember-600" : "bg-white text-slate-600 border-slate-200 hover:bg-ember-50 hover:border-ember-300 hover:text-ember-700")}
                    >
                      {def.name}<span className="ml-1 opacity-60 font-normal">{def.start}–{def.end}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {popover.custom ? (
            <TimeRangeSlider
              startMin={popover.startMin} endMin={popover.endMin} step={15} trackMin={0} trackMax={1800}
              onChange={(s, e) => setPopover(prev => prev ? { ...prev, startMin: s, endMin: e } : null)}
            />
          ) : (
            <button type="button" onClick={() => setPopover(prev => prev ? { ...prev, custom: true } : null)}
              className="text-xs font-semibold text-forest-700 hover:underline">Özel saat ayarla</button>
          )}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800">{minToHHMM(popover.startMin)} – {minToHHMM(popover.endMin, popover.endMin >= 1440)}</span>
            <span className="text-xs text-slate-500 tabular-nums">{popoverHours} saat</span>
          </div>
          {(() => {
            const matchedDef = matchShiftDef(popover.startMin, popover.endMin, shiftDefs);
            const isWknd = (popover.day === 5 || popover.day === 6) && locRules.hard_shift_weekend !== false;
            // Gece zorluğu vardiya tanımındaki zorluktan gelir (lib/fairness); burada sadece etiket
            const isNght = matchedDef?.is_night ?? false;
            const isPrfN = availMap[popover.personnelId]?.[popover.day]?.status === "preferred_not" && locRules.hard_shift_preferred_not !== false;
            if (!isWknd && !isNght && !isPrfN) return null;
            const hardCount = [isWknd, isNght, isPrfN].filter(Boolean).length;
            return (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {isWknd && <StatusPill tone="attention">Hf. sonu</StatusPill>}
                {isNght && <StatusPill tone="brand">🌙 Gece</StatusPill>}
                {isPrfN && <StatusPill tone="attention">Tercih etmem</StatusPill>}
                <span className="text-[10px] text-slate-400">→ +{locRules.hard_shift_points ?? 4} puan{hardCount > 1 ? " (tek sefer)" : ""}</span>
              </div>
            );
          })()}
          {popoverWarnings.length > 0 && (
            <div className="mt-2 space-y-1">
              {popoverWarnings.map((w, i) => (
                <div key={i} className={cn("flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium", w.type === 'error' ? "bg-red-50 text-red-700 border border-red-100" : "bg-amber-50 text-amber-700 border border-amber-100")}>
                  <AlertCircle size={11} className="mt-0.5 shrink-0" />{w.msg}
                </div>
              ))}
            </div>
          )}
          {hasExisting && (
            <button
              onClick={() => {
                const cell = cellMap[`${popover!.personnelId}-${popover!.day}`];
                const currentStart = minToHHMM(cell!.startMin);
                const currentEnd   = minToHHMM(cell!.endMin, cell!.endMin >= 1440);
                setProposalModal({
                  personnelId:  popover!.personnelId,
                  name:         popoverPerson?.name ?? "",
                  currentDate:  isoDates[popover!.day],
                  currentStart,
                  currentEnd,
                });
                setProposalDay(popover!.day);
                setProposalStartMin(cell!.startMin);
                setProposalEndMin(cell!.endMin);
                setProposalNote("");
                setPopover(null);
              }}
              className="w-full mt-3 py-2 text-xs font-semibold text-sky-600 bg-sky-50 border border-sky-200 rounded-xl hover:bg-sky-100 transition-colors flex items-center justify-center gap-1.5"
            >
              <MessageCircle size={13} /> Vardiya Teklifi Gönder
            </button>
          )}
          {hasExisting && (
            <button
              onClick={handlePopoverTogglePin}
              className="w-full mt-2 py-2 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors flex items-center justify-center gap-1.5"
            >
              {cellMap[`${popover!.personnelId}-${popover!.day}`]?.pinned
                ? <><PinOff size={13} /> Korumayı kaldır (yeniden oluşturmada değişebilir)</>
                : <><Pin size={13} /> Koru (yeniden oluşturmada değişmesin)</>}
            </button>
          )}
          {shiftDefs.some(d => d.on_call) && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-[10px] text-slate-400 font-medium mb-1.5">Nöbet (evden, çağrılırsa gelir)</p>
              <div className="flex flex-wrap gap-1.5">
                {[null, ...shiftDefs.filter(d => d.on_call)].map(def => {
                  const current = onCallMap[`${popover!.personnelId}-${popover!.day}`]?.defId ?? null;
                  const active = (def?.id ?? null) === current;
                  return (
                    <button key={def?.id ?? "none"} onClick={() => handlePopoverSetOnCall(def?.id ?? null)}
                      className={cn("text-xs px-2.5 py-1 rounded-lg font-semibold border transition-colors",
                        active ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700")}>
                      {def ? <>{def.name}<span className="ml-1 opacity-60 font-normal">{def.start}–{def.end}</span></> : "Yok"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex gap-2 mt-2">
            {hasExisting && (
              <button onClick={handlePopoverDelete} className="flex-1 py-2 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors">Sil</button>
            )}
            <button onClick={handlePopoverSave} className="flex-1 py-2 text-sm font-bold text-white bg-primary rounded-xl hover:opacity-90 transition-opacity">Kaydet</button>
          </div>
        </div>
      )}

      {/* ── Vardiya Teklifi modalı ── */}
      {proposalModal && (
        <Sheet open onClose={() => setProposalModal(null)} title="Vardiya teklifi" description={proposalModal.name}
          footer={<>
            <button onClick={() => setProposalModal(null)} className={sheetSecondaryClass}>Vazgeç</button>
            <button onClick={handleSendProposal} disabled={proposalSending} className={sheetPrimaryClass}>
              {proposalSending ? "Gönderiliyor…" : "Teklifi gönder"}
            </button>
          </>}>
          <div className="space-y-4">

            {/* Mevcut vardiya */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
              <p className="text-[10px] font-bold text-slate-400 mb-1">Mevcut Vardiya</p>
              <p className="text-sm font-semibold text-slate-700">
                {(() => {
                  const d = new Date(proposalModal.currentDate);
                  const DAYS_TR = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
                  return `${DAYS_TR[d.getDay()]} ${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")}`;
                })()} · {proposalModal.currentStart}–{proposalModal.currentEnd}
              </p>
            </div>

            {/* Önerilen gün */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 mb-2">Önerilen Gün</p>
              <div className="flex gap-1">
                {DAYS.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => setProposalDay(i)}
                    className={cn(
                      "flex-1 py-1.5 text-[10px] font-bold rounded-lg border transition-colors",
                      proposalDay === i
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-slate-500 border-slate-200 hover:border-sky-300 hover:text-sky-600"
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1 text-center">{isoDates[proposalDay]}</p>
            </div>

            {/* Önerilen vardiya — şablondan seç */}
            {shiftDefs.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 mb-2">Önerilen Vardiya</p>
                <div className="flex flex-wrap gap-1.5">
                  {shiftDefs.map(def => {
                    const ds = hhmmToMin(def.start);
                    let de = hhmmToMin(def.end);
                    if (de <= ds) de += 1440;
                    const isActive = Math.abs(proposalStartMin - ds) <= 10 && Math.abs(proposalEndMin - de) <= 10;
                    return (
                      <button
                        key={def.id}
                        onClick={() => { setProposalStartMin(ds); setProposalEndMin(de); }}
                        className={cn(
                          "text-xs px-2.5 py-1.5 rounded-lg border font-semibold transition-colors",
                          isActive ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-700"
                        )}
                      >
                        {def.name}
                        <span className="ml-1 opacity-60 font-normal text-[10px]">{def.start}–{def.end}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Saat slider */}
            <div>
              <TimeRangeSlider
                startMin={proposalStartMin} endMin={proposalEndMin} step={15} trackMin={0} trackMax={1800}
                onChange={(s, e) => { setProposalStartMin(s); setProposalEndMin(e); }}
              />
              <p className="text-center text-sm font-bold text-slate-700 mt-2">
                {minToHHMM(proposalStartMin)} – {minToHHMM(proposalEndMin, proposalEndMin >= 1440)}
                <span className="text-xs font-normal text-slate-400 ml-2">{Math.round((proposalEndMin - proposalStartMin) / 60 * 10) / 10} saat</span>
              </p>
            </div>

            {/* Özet ok */}
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold">
              <span className="text-slate-500 line-through">{proposalModal.currentStart}–{proposalModal.currentEnd}</span>
              <span className="text-slate-300">→</span>
              <span className="text-primary">{isoDates[proposalDay] !== proposalModal.currentDate ? `${DAYS[proposalDay]} ` : ""}{minToHHMM(proposalStartMin)}–{minToHHMM(proposalEndMin, proposalEndMin >= 1440)}</span>
            </div>

            {/* Not */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 mb-1.5">Not <span className="font-normal normal-case">(isteğe bağlı)</span></p>
              <input
                type="text" value={proposalNote} onChange={e => setProposalNote(e.target.value)}
                placeholder="Neden değişiklik istiyorsunuz?"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-400 placeholder-slate-300"
              />
            </div>

          </div>
        </Sheet>
      )}

      {/* ── Etkinlik ekleme modalı ── */}
      {addEventModal && (
        <Sheet open onClose={() => setAddEventModal(null)} title="Not ekle"
          footer={<>
            <button onClick={() => setAddEventModal(null)} className={sheetSecondaryClass}>Vazgeç</button>
            <button onClick={saveEvent} disabled={!newEventTitle.trim() || eventSaving} className={sheetPrimaryClass}>{eventSaving ? "Kaydediliyor…" : "Kaydet"}</button>
          </>}>
          <div className="space-y-4">
            <Tabs fill value={newEventScope} onChange={setNewEventScope} items={[{ id: "day", label: "Özel gün" }, { id: "week", label: "Haftalık not" }] as const} />
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Başlık</label>
                <input
                  autoFocus type="text" value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEvent()}
                  placeholder={newEventScope === "week" ? "Ramazan dönemi, yoğun sezon..." : "Kampanya başlangıcı, denetim..."}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-300 focus:border-forest-400"
                />
              </div>
              {newEventScope === "day" && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Başlangıç</label>
                    <input type="date" value={addEventModal.date} readOnly className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500 cursor-default" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Bitiş <span className="font-normal text-slate-400">(isteğe bağlı)</span></label>
                    <input type="date" value={newEventEndDate} min={addEventModal.date} onChange={e => setNewEventEndDate(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-300 focus:border-forest-400" />
                  </div>
                </div>
              )}
              {newEventScope === "week" && <p className="text-[11px] text-slate-400">Bu haftanın tamamı için not, sütun başlıklarında değil üstte görünür.</p>}
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Tür</label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(EVENT_TYPE_CONFIG).map(([key, cfg]) => (
                    <button key={key} onClick={() => setNewEventType(key)} className={cn("text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors", newEventType === key ? cn("border-current", cfg.color) : "bg-white text-slate-500 border-slate-200 hover:border-slate-300")}>
                      {cfg.emoji} {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Not <span className="font-normal text-slate-400">(isteğe bağlı)</span></label>
                <input type="text" value={newEventNote} onChange={e => setNewEventNote(e.target.value)} placeholder="Ekstra detay..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-300 focus:border-forest-400" />
              </div>
            </div>
          </div>
        </Sheet>
      )}

      <DragOverlay>
        {activeDragData?.type === "grid" ? (
          <div className="p-2 px-3 bg-white border-2 border-forest-500 rounded-lg shadow-xl opacity-90 scale-105 text-xs font-bold z-[9999]">Taşınıyor...</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
