"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useRef, useCallback, Fragment, useMemo } from "react";
import {
  Bell, ChevronLeft, ChevronRight, Check, AlertCircle,
  Download, Zap, Send, X, Plus, BookOpen, Sparkles, Eye, Copy,
  Undo2, Redo2, Search, Trash2, CalendarCheck, MoreHorizontal, BarChart2, CalendarPlus,
  History, CheckCircle2, RefreshCw, ChevronDown, MessageCircle,
} from "lucide-react";
import { TimeRangeSlider, minToHHMM, hhmmToMin } from "@/components/schedule/TimeRangeSlider";
import { cn } from "@/lib/utils";
import type { ShiftDefinition, LocationEvent } from "@/lib/types";
import { TURKISH_HOLIDAYS } from "@/lib/holidays";
import { getWeekStart } from "@/lib/date";
import { DAY_SHORT } from "@/lib/constants";
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

// day: 0=Mon … 5=Sat, 6=Sun
function calcPoints(startMin: number, endMin: number, day: number): number {
  const adjEnd = endMin <= startMin ? endMin + 1440 : endMin; // gece geçişi
  const hours = (adjEnd - startMin) / 60;
  const dayMultiplier = day === 5 || day === 6 ? 1.5 : 1;
  const lateBonus = adjEnd > 22 * 60 ? 2 : 0;
  return Math.round(hours * dayMultiplier + lateBonus);
}

/** Sarı (tercih edilmeyen) günde çalışan personele telafi çarpanı uygular. */
function withPrefNotBonus(pts: number, am: AvailMap, pid: string, day: number, mult: number): number {
  return am[pid]?.[day]?.status === "preferred_not" ? Math.round(pts * mult) : pts;
}

/** Bir hücrenin başlangıç/bitiş dakikalarını shift tanımlarıyla eşleştirir (±10 dk tolerans). */
function matchShiftDef(startMin: number, endMin: number, defs: ShiftDefinition[]): ShiftDefinition | null {
  for (const d of defs) {
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

function scoreColor(score: number, max: number): string {
  const pct = max > 0 ? score / max : 0;
  if (pct < 0.35) return "bg-emerald-500";
  if (pct < 0.65) return "bg-blue-500";
  if (pct < 0.85) return "bg-amber-500";
  return "bg-red-500";
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
  kampanya: { emoji: "🎯", color: "bg-purple-50 text-purple-700 border-purple-200", label: "Kampanya"  },
  etkinlik: { emoji: "🎉", color: "bg-blue-50 text-blue-700 border-blue-200",       label: "Etkinlik"  },
  denetim:  { emoji: "📋", color: "bg-orange-50 text-orange-700 border-orange-200", label: "Denetim"   },
  kapali:   { emoji: "🔒", color: "bg-red-50 text-red-700 border-red-200",          label: "Kapalı"    },
  diger:    { emoji: "📌", color: "bg-slate-100 text-slate-600 border-slate-200",   label: "Diğer"     },
};

// ─── Yayın geçmişi tipleri ────────────────────────────────────────────────────
interface PubSummary {
  id: number;
  week_start: string;
  revision: number;
  published_by_name: string | null;
  published_at: number;
}

interface SnapshotAssignment {
  personnelId: string;
  personnelName: string;
  departmentId: string | null;
  departmentName: string;
  day: number;
  startTime: string;
  endTime: string;
  shiftId: string;
  points: number;
}

interface PubSnapshot {
  locationName: string;
  shiftDefs: { id: string; name: string; start: string; end: string }[];
  departments: { id: string; name: string }[];
  assignments: SnapshotAssignment[];
}

interface FullPub extends PubSummary {
  snapshot: PubSnapshot | null;
}

const DAYS_SHORT = DAY_SHORT;

function fullWeekLabel(weekStart: string): string {
  if (!weekStart) return "";
  const [y, m, d] = weekStart.split("-").map(Number);
  const mon = new Date(y, m - 1, d);
  const sun = new Date(y, m - 1, d + 6);
  return `${mon.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })} – ${sun.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}`;
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
  const days = Math.floor(diff / 86400);
  if (days < 7) return `${days} gün önce`;
  if (days < 30) return `${Math.floor(days / 7)} hafta önce`;
  return `${Math.floor(days / 30)} ay önce`;
}

// ─── Snapshot viewer (read-only grid) ─────────────────────────────────────────
function SnapshotGrid({ data }: { data: FullPub }) {
  const snap = data.snapshot;
  if (!snap) return <div className="py-10 text-center text-sm text-slate-400">Anlık görüntü bulunamadı.</div>;

  const cellMap: Record<string, SnapshotAssignment> = {};
  for (const a of snap.assignments) cellMap[`${a.personnelId}-${a.day}`] = a;

  const personnelByDept: Record<string, { id: string; name: string }[]> = {};
  const seen = new Set<string>();
  for (const a of snap.assignments) {
    if (!seen.has(a.personnelId)) {
      seen.add(a.personnelId);
      const key = a.departmentId ?? "__none__";
      if (!personnelByDept[key]) personnelByDept[key] = [];
      personnelByDept[key].push({ id: a.personnelId, name: a.personnelName });
    }
  }

  const deptOrder = [...snap.departments.map(d => d.id)];
  if (personnelByDept["__none__"]?.length) deptOrder.push("__none__");

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50/80 border-b border-slate-200">
            <th className="py-2.5 px-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest w-40 sticky left-0 bg-slate-50/80 z-10">Personel</th>
            {DAYS_SHORT.map((d, i) => (
              <th key={i} className={cn("py-2.5 px-2 text-center text-[10px] font-black uppercase tracking-widest min-w-[72px]", i >= 5 ? "text-indigo-500 bg-indigo-50/40" : "text-slate-400")}>
                {d}
              </th>
            ))}
            <th className="py-2.5 px-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest w-12">Saat</th>
          </tr>
        </thead>
        <tbody>
          {deptOrder.map(deptId => {
            const dept = snap.departments.find(d => d.id === deptId);
            const ppl = personnelByDept[deptId] ?? [];
            if (!ppl.length) return null;
            return (
              <Fragment key={`sg-dept-${deptId}`}>
                <tr className="border-t-2 border-slate-200 bg-slate-50/60">
                  <td colSpan={9} className="py-2 px-4">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{dept?.name ?? "Diğer"}</span>
                  </td>
                </tr>
                {ppl.map(p => {
                  const totalMins = Array.from({ length: 7 }, (_, d) => {
                    const c = cellMap[`${p.id}-${d}`];
                    if (!c) return 0;
                    const [sh, sm] = c.startTime.split(":").map(Number);
                    const [eh, em] = c.endTime.split(":").map(Number);
                    let start = sh * 60 + sm, end = eh * 60 + em;
                    if (end <= start) end += 1440;
                    return end - start;
                  }).reduce((a, b) => a + b, 0);
                  return (
                    <tr key={p.id} className="border-t border-slate-50 hover:bg-slate-50/40 transition-colors">
                      <td className="py-2.5 px-4 sticky left-0 bg-white z-10">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-black flex items-center justify-center shrink-0">
                            {p.name.charAt(0)}
                          </div>
                          <span className="font-semibold text-slate-800 truncate max-w-[90px]">{p.name}</span>
                        </div>
                      </td>
                      {Array.from({ length: 7 }, (_, d) => {
                        const cell = cellMap[`${p.id}-${d}`];
                        return (
                          <td key={d} className={cn("py-1 px-1 text-center", d >= 5 && "bg-indigo-50/20")}>
                            {cell ? (
                              <div className="bg-indigo-50 border border-indigo-200/70 rounded-lg py-1 px-1 mx-auto max-w-[80px]">
                                <div className="font-bold text-indigo-700 text-[10px] truncate">
                                  {snap.shiftDefs.find(s => s.id === cell.shiftId)?.name ?? "—"}
                                </div>
                                <div className="text-indigo-400/80 text-[9px]">{cell.startTime}–{cell.endTime}</div>
                              </div>
                            ) : <span className="text-slate-200 text-[10px]">—</span>}
                          </td>
                        );
                      })}
                      <td className="py-1 px-3 text-center">
                        <span className="text-[10px] font-semibold text-slate-500 tabular-nums">
                          {totalMins > 0 ? `${Math.round(totalMins / 60 * 10) / 10}s` : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type CellData = { startMin: number; endMin: number; points: number };
type CellMap  = Record<string, CellData>;
type AvailDay = { status: string; start?: string | null; end?: string | null };
type AvailMap = Record<string, Record<number, AvailDay>>;

interface Popover {
  personnelId: string;
  day: number;
  x: number;
  y: number;
  startMin: number;
  endMin: number;
}

export default function SchedulePage() {
  const [mounted, setMounted]                      = useState(false);
  const [weekOffset, setWeekOffset]               = useState(0);
  const weekStart = useMemo(() => mounted ? getWeekStart(weekOffset) : "", [weekOffset, mounted]);
  const weekLabel = useMemo(() => mounted ? getWeekLabel(weekOffset).label : "", [weekOffset, mounted]);
  // dates, weekStart'tan türetilir — ayrı state tutmak senkron sorununa yol açıyor

  const [activeLocationId, setActiveLocationId]   = useState("");
  const [personnel, setPersonnel]                 = useState<any[]>([]);
  const [departments, setDepartments]             = useState<any[]>([]);
  const [cellMap, setCellMap]                     = useState<CellMap>({});
  const [forceAssignMap, setForceAssignMap]       = useState<Record<string, { status: string; multiplier: number }>>({});
  const [availMap, setAvailMap]                   = useState<AvailMap>({});
  const [prefNotMult, setPrefNotMult]             = useState(1.5);
  const [clopeningMinRest, setClopeningMinRest]   = useState(13); // bu saatin altı "clopening" (kapanış→açılış) sayılır
  const [popover, setPopover]                     = useState<Popover | null>(null);
  const [loading, setLoading]                     = useState(false);
  const [generating, setGenerating]               = useState(false);
  const [publishLoading, setPublishLoading]       = useState(false);
  const [publishSuccess, setPublishSuccess]       = useState(false);
  const [error, setError]                         = useState<string | null>(null);
  const [toast, setToast]                         = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [confirmGenerate, setConfirmGenerate]     = useState(false);
  const [engineScores, setEngineScores]           = useState<Record<string, number>>({}); // personnel_id → OR-Tools total score
  const [shiftDefs, setShiftDefs]                 = useState<ShiftDefinition[]>([]);
  const [dbShiftCount, setDbShiftCount]           = useState(0); // DB'den yüklenen vardiya sayısı (yayınlandı göstergesi için)
  const [demandMatrix, setDemandMatrix]           = useState<Record<string, Record<number, number>>>({}); // shiftDefId → {day → count} (lokasyon geneli, OR-Tools fallback)
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
  const [sendReviewLoading, setSendReviewLoading] = useState(false);
  const [copyLoading, setCopyLoading]             = useState(false);
  const [confirmCopy, setConfirmCopy]             = useState(false);
  const [violationModal, setViolationModal]       = useState<{ violations: string[]; onConfirm: () => void } | null>(null);
  const [aiSummary, setAiSummary]                 = useState<string | null>(null);
  const [aiLoading, setAiLoading]                 = useState(false);
  const [seniorViolations, setSeniorViolations]   = useState<{ shift: string; day: number }[]>([]);
  const [personnelFilter, setPersonnelFilter]     = useState('');
  const [canUndo, setCanUndo]                     = useState(false);
  const [canRedo, setCanRedo]                     = useState(false);
  const [pubsModalOpen, setPubsModalOpen]           = useState(false);
  const [demandOpen, setDemandOpen]               = useState(false);
  const [publications, setPublications]            = useState<PubSummary[]>([]);
  const [pubsLoading, setPubsLoading]              = useState(false);
  const [expandedPubId, setExpandedPubId]          = useState<number | null>(null);
  const [expandedPubData, setExpandedPubData]      = useState<FullPub | null>(null);
  const [expandedPubLoading, setExpandedPubLoading] = useState(false);
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
    };
    window.addEventListener("optishift_location_changed", handleLocChange);
    return () => window.removeEventListener("optishift_location_changed", handleLocChange);
  }, []);

  // Load personnel + availability + existing shifts
  useEffect(() => {
    if (!activeLocationId) return;
    const weekStart = getWeekStart(weekOffset);
    (async () => {
      setLoading(true);
      try {
        const [pRes, aRes, sRes, locRes, deptRes, evRes, pubRes] = await Promise.all([
          fetch(`/api/personnel?location_id=${activeLocationId}`),
          fetch(`/api/availability/team?location_id=${activeLocationId}&week_start=${weekStart}`),
          fetch(`/api/shifts?location_id=${activeLocationId}&week_start=${weekStart}`),
          fetch(`/api/locations?id=${activeLocationId}`),
          fetch(`/api/departments?location_id=${activeLocationId}`),
          fetch(`/api/events?location_id=${activeLocationId}&week_start=${weekStart}`),
          fetch(`/api/schedule/publications?location_id=${activeLocationId}&week_start=${weekStart}`),
        ]);
        const pData = await pRes.json();
        const aData = await aRes.json();
        const sData = await sRes.json();
        const locData = await locRes.json();
        const deptData = await deptRes.json();
        const deptArr = Array.isArray(deptData) ? deptData : [];
        setDepartments(deptArr);

        // Per-departman kapasite matrislerini yükle
        const deptDemands: Record<string, Record<string, Record<number, number>>> = {};
        for (const dept of deptArr) {
          if (dept.demand_matrix) {
            try {
              const raw = typeof dept.demand_matrix === "string" ? JSON.parse(dept.demand_matrix) : dept.demand_matrix;
              if (raw && typeof raw === "object") deptDemands[dept.id] = raw;
            } catch { /* ignore */ }
          }
        }
        setDeptDemandMatrix(deptDemands);

        // Shift tanımlarını yükle
        if (Array.isArray(locData) && locData[0]?.shift_definitions) {
          try {
            const rawDefs = typeof locData[0].shift_definitions === "string"
              ? JSON.parse(locData[0].shift_definitions)
              : locData[0].shift_definitions;
            setShiftDefs(Array.isArray(rawDefs) ? rawDefs : []);
          } catch { setShiftDefs([]); }
        } else {
          setShiftDefs([]);
        }

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

        // Tercih edilmeyen gün telafi çarpanı + clopening eşiği (locations.rules)
        let mult = 1.5;
        let clopeningRest = 13;
        if (Array.isArray(locData) && locData[0]?.rules) {
          try {
            const r = typeof locData[0].rules === "string" ? JSON.parse(locData[0].rules) : locData[0].rules;
            if (typeof r?.preferred_not_multiplier === "number") mult = r.preferred_not_multiplier;
            if (typeof r?.clopening_min_rest_hours === "number") clopeningRest = r.clopening_min_rest_hours;
          } catch { /* varsayılanlar */ }
        }
        setPrefNotMult(mult);
        setClopeningMinRest(clopeningRest);

        // Koordinatlar (hava durumu için)
        const rawLat = Array.isArray(locData) ? locData[0]?.latitude : null;
        const rawLon = Array.isArray(locData) ? locData[0]?.longitude : null;
        setLocationLatLon(rawLat && rawLon ? { lat: rawLat, lon: rawLon } : null);

        // Etkinlikler
        const evData = await evRes.json();
        setEvents(Array.isArray(evData) ? evData : []);

        // Mevcut yayın revizyonu
        const pubData = await pubRes.json();
        if (Array.isArray(pubData) && pubData.length > 0) {
          const maxRev = Math.max(...pubData.map((p: any) => p.revision ?? 0));
          setCurrentRevision(maxRev);
        } else {
          setCurrentRevision(null);
        }

        setPersonnel(Array.isArray(pData) ? pData.filter((p: any) => p.status === "active") : []);

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
        const newForceMap: Record<string, { status: string; multiplier: number }> = {};
        if (Array.isArray(sData)) {
          let hasDraft = false;
          for (const s of sData) {
            if (s.start_time && s.end_time) {
              const key = `${s.personnel_id}-${s.day}`;
              const startMin = hhmmToMin(s.start_time);
              const rawEnd   = hhmmToMin(s.end_time);
              const endMin   = rawEnd <= startMin ? rawEnd + 1440 : rawEnd; // gece geçişi
              newCellMap[key] = { startMin, endMin, points: withPrefNotBonus(calcPoints(startMin, endMin, s.day), newAvailMap, s.personnel_id, s.day, mult) };
              if (s.publication_status === "draft") hasDraft = true;
              if (s.force_assigned && s.force_acceptance_status) {
                newForceMap[key] = { status: s.force_acceptance_status, multiplier: s.force_bonus_multiplier ?? 1.5 };
              }
            }
          }
          setIsDraftWeek(hasDraft);
        }
        setForceAssignMap(newForceMap);
        setCellMap(newCellMap);
        setDbShiftCount(Object.keys(newCellMap).length);
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
      setLoading(false);
    })();
  }, [activeLocationId, weekOffset]);

  // ── Otomatik taslak kaydı (OPTI-024) ──────────────────────────────────────
  // Kullanıcı düzenlemesinden 1.2 sn sonra haftanın draft satırları DB ile
  // senkronlanır. Yayınlanmış haftada otomatik kayıt yapılmaz — değişiklikler
  // "Yayınla" düğmesine kadar lokal kalır (portal eski planı göstermeye devam eder).
  useEffect(() => {
    if (!userEditRef.current || !activeLocationId || !weekStart) return;
    const isPublishedWeek = dbShiftCount > 0 && !isDraftWeek;
    if (isPublishedWeek) return;
    const t = setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await fetch("/api/shifts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "sync_draft_week",
            location_id: activeLocationId,
            week_start: weekStart,
            shifts: Object.entries(cellMap).map(([key, val]) => {
              const lastDash = key.lastIndexOf("-");
              return {
                personnel_id: key.slice(0, lastDash),
                day:          parseInt(key.slice(lastDash + 1)),
                start_time:   minToHHMM(val.startMin),
                end_time:     minToHHMM(val.endMin),
              };
            }),
          }),
        });
        if (res.ok) {
          userEditRef.current = false;
          setSaveState("saved");
          const n = Object.keys(cellMap).length;
          setIsDraftWeek(n > 0);
          setDbShiftCount(n);
        } else {
          setSaveState("idle");
        }
      } catch {
        setSaveState("idle");
      }
    }, 1200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellMap, activeLocationId, weekStart]);

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

  // Yayın geçmişi modalı açıldığında publication listesini yükle
  useEffect(() => {
    if (!pubsModalOpen || !activeLocationId) return;
    setPubsLoading(true);
    setExpandedPubId(null);
    setExpandedPubData(null);
    fetch(`/api/schedule/publications?location_id=${activeLocationId}`)
      .then(r => r.json())
      .then(data => setPublications(Array.isArray(data) ? data : []))
      .catch(() => setPublications([]))
      .finally(() => setPubsLoading(false));
  }, [pubsModalOpen, activeLocationId]);

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
          showToast(`Düzenleme onaylandı${d.reviewed_by_name ? " — " + d.reviewed_by_name : ""}! Değişiklik yapabilirsiniz.`, "success");
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
          showToast(`Düzenleme onayı aktif${d.reviewed_by_name ? " — " + d.reviewed_by_name : ""}. Değişiklik yapabilirsiniz.`, "info");
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
    const id = setInterval(tick, 1_000);
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
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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
  const personScores = personnel.map(p => {
    const weekPoints = Object.entries(cellMap)
      .filter(([k]) => k.startsWith(`${p.id}-`))
      .reduce((sum, [, v]) => sum + v.points, 0);
    return { id: p.id, name: p.name, score: (p.prev_score || 0) + weekPoints };
  });
  const maxScore = Math.max(...personScores.map(s => s.score), 1);

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
    setPopover({
      personnelId,
      day,
      x,
      y,
      startMin: existing?.startMin ?? 9 * 60,
      endMin:   existing?.endMin   ?? 17 * 60,
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
        points:   withPrefNotBonus(calcPoints(popover.startMin, popover.endMin, popover.day), availMap, popover.personnelId, popover.day, prefNotMult),
      },
    });
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

  // OR-Tools generate
  const handleGenerateClick = () => {
    // Eğer elle girilmiş vardiya varsa onay iste (UX-7)
    if (Object.keys(cellMap).length > 0) {
      setConfirmGenerate(true);
    } else {
      runGenerate();
    }
  };

  const runGenerate = async () => {
    setConfirmGenerate(false);
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId: activeLocationId, week_start: weekStart }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      const newCellMap: CellMap = {};
      for (const a of (data.assignments || [])) {
        if (a.start_time && a.end_time) {
          const key      = `${a.personnelId}-${a.day}`;
          const startMin = hhmmToMin(a.start_time);
          const rawEnd   = hhmmToMin(a.end_time);
          const endMin   = rawEnd <= startMin ? rawEnd + 1440 : rawEnd; // gece geçişi
          newCellMap[key] = { startMin, endMin, points: withPrefNotBonus(calcPoints(startMin, endMin, a.day), availMap, a.personnelId, a.day, prefNotMult) };
        }
      }
      pushCellMap(newCellMap);
      setDbShiftCount(0); // OR-Tools taslağı — henüz yayınlanmadı
      // Engine'in base_points tabanlı puanlarını sakla — publish sırasında prev_score güncellemesinde kullanılır
      setEngineScores(data.scores ?? {});
      setSeniorViolations(data.senior_violations ?? []);
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
    const violations = checkViolations();
    if (violations.length > 0) {
      setViolationModal({ violations, onConfirm: doPublish });
    } else {
      doPublish();
    }
  };

  // Request availability — müdürün baktığı haftanın sonraki haftasına gönder (UX-5 fix)
  const handleRequestAvailability = async () => {
    const targetWeek = getWeekStart(weekOffset + 1);
    const targetWeekLabel = new Date(targetWeek).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
    try {
      const payload = personnel.map(p => ({
        personnel_id: p.id,
        type:         "alert",
        title:        "Müsaitlik Bildiriminizi Girin 📋",
        message:      `${targetWeekLabel} haftası için müsaitlik bilginizi girmeniz bekleniyor.`,
        link:         "/portal/availability",
      }));
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      showToast(`${payload.length} personele müsaitlik isteği gönderildi.`, "success");
    } catch {
      showToast("Müsaitlik isteği gönderilirken hata oluştu.", "error");
    }
  };

  const handleExpandPub = async (pub: PubSummary) => {
    if (expandedPubId === pub.id) {
      setExpandedPubId(null);
      setExpandedPubData(null);
      return;
    }
    setExpandedPubId(pub.id);
    setExpandedPubData(null);
    setExpandedPubLoading(true);
    try {
      const res = await fetch("/api/schedule/publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pub.id }),
      });
      const data = await res.json();
      setExpandedPubData(data);
    } catch { /* ignore */ }
    setExpandedPubLoading(false);
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

  const handleDemandSave = async (silent = false) => {
    if (!activeLocationId) return;
    try {
      await fetch(`/api/locations?id=${activeLocationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demand_matrix: demandMatrix }),
      });
      if (!silent) showToast("Kapasite planı kaydedildi.", "success");
    } catch {
      if (!silent) showToast("Kapasite planı kaydedilemedi.", "error");
    }
  };

  const handleDeptDemandSave = async (deptId: string) => {
    const matrix = deptDemandMatrix[deptId] ?? {};
    try {
      await fetch(`/api/departments?id=${deptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demand_matrix: matrix }),
      });
    } catch { /* sessiz hata */ }
  };

  // Kural ihlali kontrolü — yayınlamadan önce çalıştırılır
  const checkViolations = (): string[] => {
    const violations: string[] = [];
    for (const p of personnel) {
      // Haftalık saat limiti
      const totalHours = Object.entries(cellMap)
        .filter(([k]) => k.startsWith(`${p.id}-`))
        .reduce((sum, [, v]) => sum + (v.endMin - v.startMin) / 60, 0);
      const maxH = p.max_weekly_hours ?? 45;
      if (totalHours > maxH) {
        violations.push(`${p.name}: haftalık ${Math.round(totalHours * 10) / 10}s — limit ${maxH}s aşıldı`);
      }
      // 11 saatlik dinlenme kuralı + clopening tespiti (kapanış→açılış yorucu geçişi)
      let clopeningCount = 0;
      for (let d = 0; d < 6; d++) {
        const cur  = cellMap[`${p.id}-${d}`];
        const next = cellMap[`${p.id}-${d + 1}`];
        if (!cur || !next) continue;
        const adjEnd = cur.endMin;
        const gap    = (next.startMin + 1440) - adjEnd;
        if (gap < 11 * 60) {
          violations.push(`${p.name}: ${DAYS[d]}→${DAYS[d + 1]} arası dinlenme ${Math.round(gap / 60 * 10) / 10}s (min 11s)`);
        } else if (gap < clopeningMinRest * 60) {
          clopeningCount++;
          violations.push(`${p.name}: ${DAYS[d]}→${DAYS[d + 1]} clopening (kapanış→açılış) — dinlenme ${Math.round(gap / 60 * 10) / 10}s, ${clopeningMinRest}s önerilir`);
        }
      }
      if (clopeningCount >= 2) {
        violations.push(`${p.name}: bu hafta ${clopeningCount} clopening — yorgunluk riski yüksek, dağıtmayı düşünün`);
      }
      // Müsaitlik ihlalleri — "unavailable" gün atama
      for (let d = 0; d < 7; d++) {
        if (!cellMap[`${p.id}-${d}`]) continue;
        if (availMap[p.id]?.[d]?.status === 'unavailable') {
          violations.push(`${p.name}: ${DAYS[d]} günü "kesinlikle gelemem" olarak işaretli ama vardiya atandı`);
        }
      }
      // Müsaitlik bilgisi girilmemiş ama vardiya atanmış
      if (!availMap[p.id]) {
        const hasShift = Object.keys(cellMap).some(k => k.startsWith(`${p.id}-`));
        if (hasShift) {
          violations.push(`${p.name}: müsaitlik bilgisi girilmemiş, vardiya atanmış`);
        }
      }
    }
    return violations;
  };

  const buildShiftsPayload = (pubStatus: "draft" | "published") =>
    Object.entries(cellMap).map(([key, val]) => {
      const lastDash = key.lastIndexOf("-");
      return {
        personnel_id:       key.slice(0, lastDash),
        location_id:        activeLocationId,
        week_start:         weekStart,
        day:                parseInt(key.slice(lastDash + 1)),
        start_time:         minToHHMM(val.startMin),
        end_time:           minToHHMM(val.endMin),
        publication_status: pubStatus,
      };
    });

  // Taslağı personele inceleme için gönder — durum draft kalır, sadece bildirim gider
  const handleSendForReview = async () => {
    if (!isDraftWeek) {
      showToast("Henüz taslak yok — plana vardiya ekleyin, otomatik kaydedilir.", "error");
      return;
    }
    setSendReviewLoading(true);
    try {
      const res = await fetch("/api/schedule/send-for-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: activeLocationId, week_start: weekStart }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Gönderme sırasında hata oluştu.", "error");
        return;
      }
      showToast(`${data.notified} personele taslak planı bildirildi. 48 saat itiraz penceresi açıldı.`, "success");
    } catch {
      showToast("Bildirim gönderilemedi.", "error");
    } finally {
      setSendReviewLoading(false);
    }
  };

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
          newCellMap[key] = { startMin, endMin, points: withPrefNotBonus(calcPoints(startMin, endMin, s.day), availMap, s.personnel_id, s.day, prefNotMult) };
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

  // Satır hızlı işlemleri: tüm müsait günleri doldur / temizle
  const fillPersonRow = (personId: string) => {
    if (!shiftDefs.length) { showToast("Önce vardiya şablonu tanımlayın.", "error"); return; }
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
        newMap[key] = { startMin: ds, endMin: de, points: withPrefNotBonus(calcPoints(ds, de, day), availMap, personId, day, prefNotMult) };
        added++;
      }
    }
    if (added === 0) { showToast("Eklenecek müsait gün bulunamadı.", "info"); return; }
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
  const handleAISummary = async () => {
    if (!activeLocationId || !weekStart) return;
    setAiLoading(true);
    setAiSummary("");
    try {
      const res = await fetch("/api/ai/explain-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: weekStart, location_id: activeLocationId }),
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error ?? "AI özet alınamadı.", "error");
        setAiSummary(null);
        return;
      }
      // Stream'i oku ve state'e ekle
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setAiSummary(prev => (prev ?? "") + decoder.decode(value));
      }
    } catch {
      showToast("AI özet sırasında hata oluştu.", "error");
      setAiSummary(null);
    } finally {
      setAiLoading(false);
    }
  };

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

  // ShiftBoard için toplam talep (tüm dept matrislerinin toplamı; yoksa lokasyon geneli)
  const hasDeptDemand = Object.keys(deptDemandMatrix).length > 0;
  const effectiveDemandMatrix: Record<string, Record<number, number>> = hasDeptDemand
    ? Object.values(deptDemandMatrix).reduce<Record<string, Record<number, number>>>((acc, matrix) => {
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
  const popoverPoints = popover ? withPrefNotBonus(calcPoints(popover.startMin, popover.endMin, popover.day), availMap, popover.personnelId, popover.day, prefNotMult) : 0;
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
    const maxH = popoverPerson.max_weekly_hours ?? 45;
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
    // Müsaitlik durumu
    const pAvail = availMap[popover.personnelId];
    const dayAvail = pAvail?.[popover.day];
    if (dayAvail?.status === 'unavailable') {
      popoverWarnings.push({ type: 'error', msg: 'Bu gün kesinlikle müsait değil (kırmızı)' });
    } else if (dayAvail?.status === 'preferred_not') {
      popoverWarnings.push({ type: 'warn', msg: 'Bu günü tercih etmiyor (sarı)' });
    } else if (!pAvail) {
      popoverWarnings.push({ type: 'warn', msg: 'Müsaitlik bilgisi girilmemiş' });
    }
  }

  // Müsaitlik bilgisi girilmemiş personel sayısı
  // Not: müsaitlik girilmemesi otomatik oluşturmayı ENGELLEMEZ — motor eksik
  // müsaitliği "tam müsait" kabul eder (get_avail default). Bu sayaç sadece bilgilendirme amaçlıdır.
  const noAvailCount = personnel.filter(p => !availMap[p.id]).length;

  // Kapasite matrisi ile mevcut personel sayısı çelişiyor mu? (herkes günde yalnızca
  // 1 vardiyaya girebildiği için bir günün toplam talebi o gün müsait personel sayısını
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

    if (hasDeptDemand) {
      for (const [deptId, matrix] of Object.entries(deptDemandMatrix)) {
        const members = personnel.filter(p => (p.department_id || '__none__') === deptId);
        const deptName = departments.find(d => d.id === deptId)?.name || deptId;
        const dayTotals = sumDayTotals(matrix);
        for (const [dayStr, total] of Object.entries(dayTotals)) {
          const d = parseInt(dayStr);
          if (total <= 0) continue;
          const availableCount = members.filter(p => !isUnavailable(p.id, d)).length;
          if (total > availableCount) {
            warnings.push(`${DAYS[d]} — ${deptName}: ${total} kişi isteniyor, bu departmanda ${availableCount} müsait personel var (toplam ${members.length} kişi).`);
          }
        }
      }
    } else if (Object.keys(demandMatrix).length > 0) {
      const dayTotals = sumDayTotals(demandMatrix);
      for (const [dayStr, total] of Object.entries(dayTotals)) {
        const d = parseInt(dayStr);
        if (total <= 0) continue;
        const availableCount = personnel.filter(p => !isUnavailable(p.id, d)).length;
        if (total > availableCount) {
          warnings.push(`${DAYS[d]}: ${total} kişi isteniyor, ${availableCount} müsait personel var (toplam ${personnel.length} kişi).`);
        }
      }
    }
    return warnings;
  }, [hasDeptDemand, deptDemandMatrix, demandMatrix, personnel, departments, availMap]);

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
    for (const dept of departments) {
      const ppl = byDept[dept.id] || [];
      if (personnelFilter && ppl.length === 0) continue;
      tableRows.push({ kind: 'header', dept: { id: dept.id, name: dept.name } });
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

    // ShiftBoard Logic
    if (sourceId.startsWith("person-") || sourceId.startsWith("assigned-")) {
      const isFromAssigned = sourceId.startsWith("assigned-");
      let personIdStr = sourceId.replace(isFromAssigned ? "assigned-" : "person-", "");
      let sourceDay: number | null = null;
      if (isFromAssigned) {
        const pParts = personIdStr.split("-");
        sourceDay = parseInt(pParts.pop()!);
        personIdStr = pParts.join("-");
      }
      const personId = personIdStr;

      if (targetId === "unassigned") {
        if (isFromAssigned && sourceDay !== null) {
          delete newMap[`${personId}-${sourceDay}`];
          pushCellMap(newMap);
        }
        return;
      }

      if (targetId.startsWith("shift-")) {
        const parts = targetId.split("-");
        const targetDay = parseInt(parts.pop()!);
        const shiftDefId = parts.slice(1).join("-");
        const shiftDef = shiftDefs.find(s => s.id === shiftDefId);
        
        if (!shiftDef) return;

        const targetAvail = availMap[personId]?.[targetDay];
        const person = personnel.find(p => p.id === personId);

        if (targetAvail?.status === "unavailable") {
          showToast("Personel bu gün izinli.", "error");
          return;
        }
        if (person?.weekly_off_day !== null && person?.weekly_off_day !== undefined && Number(person.weekly_off_day) === targetDay) {
           showToast("Personelin haftalık izni.", "error");
           return;
        }

        const startMin = hhmmToMin(shiftDef.start);
        let endMin = hhmmToMin(shiftDef.end);
        if (endMin < startMin) endMin += 1440;
        
        if (isFromAssigned && sourceDay !== null) {
          delete newMap[`${personId}-${sourceDay}`];
        }

        newMap[`${personId}-${targetDay}`] = {
          startMin,
          endMin,
          points: withPrefNotBonus(calcPoints(startMin, endMin, targetDay), availMap, personId, targetDay, prefNotMult)
        };
        pushCellMap(newMap);
      }
      return;
    }

    // Existing Grid Logic
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
      points: withPrefNotBonus(calcPoints(sourceCell.startMin, sourceCell.endMin, targetDay), availMap, targetPId, targetDay, prefNotMult)
    };
    delete newMap[sourceId];
    
    pushCellMap(newMap);
  };

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
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Vardiya Planı</h1>
            <p className="text-slate-400 text-xs mt-0.5">Hücreye tıklayarak vardiya ekle/düzenle — değişiklikler otomatik kaydedilir</p>
          </div>

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
                <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-100 text-slate-500 whitespace-nowrap">Boş hafta</span>
              ) : isPublishedWeek && !dirty ? (
                <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-100 text-emerald-700 whitespace-nowrap flex items-center gap-1">
                  <Check size={11} /> Yayınlandı{currentRevision !== null && currentRevision > 0 ? ` R${currentRevision}` : ""}
                </span>
              ) : isPublishedWeek && dirty ? (
                <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-100 text-amber-700 whitespace-nowrap">Yayınlanmamış değişiklik</span>
              ) : (
                <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-sky-100 text-sky-700 whitespace-nowrap" title="Personel taslağı göremez">Taslak</span>
              )
            )}

            {/* Otomatik kayıt göstergesi */}
            {!isPublishedWeek && saveState !== "idle" && (
              <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 whitespace-nowrap">
                {saveState === "saving" ? "Kaydediliyor…" : <><Check size={11} className="text-emerald-500" /> Kaydedildi</>}
              </span>
            )}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* Personel filtresi */}
              {personnel.length > 5 && (
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-sm">
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
                onClick={() => setFairnessOpen(o => !o)} title="Adalet Dağılımı"
                className={cn("p-2 rounded-xl border transition-colors", fairnessOpen ? "bg-indigo-50 border-indigo-200 text-indigo-600" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50")}
              >
                <BarChart2 size={15} />
              </button>

              {/* ⋯ İşlemler menüsü */}
              <div className="relative" data-actions-menu>
                <button
                  onClick={() => setActionsOpen(o => !o)}
                  className="px-3 py-2 text-xs md:text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <MoreHorizontal size={15} /> <span className="hidden sm:inline">İşlemler</span>
                </button>
                {actionsOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-40 py-1.5">
                    {cellCount > 0 && (
                      <button onClick={() => { setActionsOpen(false); handleGenerateClick(); }} disabled={generating}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        <Zap size={13} className="text-indigo-500" /> {generating ? "Oluşturuluyor…" : "Yeniden Oluştur (OR-Tools)"}
                      </button>
                    )}
                    <button onClick={() => { setActionsOpen(false); handleRequestAvailability(); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                      <Bell size={13} className="text-amber-500" /> Müsaitlik İste
                    </button>
                    <button onClick={() => { setActionsOpen(false); handleCopyPrevWeek(); }} disabled={copyLoading}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      <Copy size={13} className="text-slate-400" /> {copyLoading ? "Kopyalanıyor…" : "Geçen Haftayı Kopyala"}
                    </button>
                    <button onClick={() => { setActionsOpen(false); handleSendForReview(); }} disabled={sendReviewLoading || !isDraftWeek}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      <Eye size={13} className="text-sky-500" /> {sendReviewLoading ? "Gönderiliyor…" : "Personele Gönder (İnceleme)"}
                    </button>
                    <div className="my-1 border-t border-slate-100" />
                    <button onClick={() => { setActionsOpen(false); handleAISummary(); }} disabled={aiLoading || cellCount === 0}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      <Sparkles size={13} className="text-violet-500" /> {aiLoading ? "Analiz ediliyor…" : "AI Özet"}
                    </button>
                    <a href={`/api/export/schedule?location_id=${activeLocationId}&week_start=${weekStart}`} download onClick={() => setActionsOpen(false)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                      <Download size={13} className="text-slate-400" /> Excel İndir
                    </a>
                    <button onClick={() => { setActionsOpen(false); setAddEventModal({ date: weekStart, dayLabel: "Bu Hafta", initScope: "week" }); setNewEventScope("week"); setNewEventTitle(""); setNewEventType("kampanya"); setNewEventNote(""); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                      <CalendarPlus size={13} className="text-emerald-500" /> Haftalık Not Ekle
                    </button>
                    <div className="my-1 border-t border-slate-100" />
                    <button onClick={undo} disabled={!canUndo} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      <Undo2 size={13} className="text-slate-400" /> Geri Al <span className="ml-auto text-[10px] text-slate-300">Ctrl+Z</span>
                    </button>
                    <button onClick={redo} disabled={!canRedo} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      <Redo2 size={13} className="text-slate-400" /> Yeniden Yap <span className="ml-auto text-[10px] text-slate-300">Ctrl+Y</span>
                    </button>
                    <div className="my-1 border-t border-slate-100" />
                    <button onClick={() => { setActionsOpen(false); setPubsModalOpen(true); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                      <History size={13} className="text-slate-400" /> Yayın Geçmişi
                    </button>
                  </div>
                )}
              </div>

              {/* Birincil aksiyon */}
              {isPublishedWeek && !editUnlocked ? (
                <button onClick={() => setUnlockModal(true)}
                  className="px-4 py-2 text-xs md:text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-sm">
                  🔒 Düzenle
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  {(cellCount === 0 || generating) && !isPublishedWeek && (
                    <button onClick={handleGenerateClick} disabled={generating}
                      className="px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors flex items-center gap-1.5 disabled:opacity-50">
                      <Zap size={13} /> {generating ? "Oluşturuluyor…" : "Otomatik Oluştur"}
                    </button>
                  )}
                  <button onClick={handlePublish} disabled={publishLoading || !dirty}
                    className="px-4 py-2 text-xs md:text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50">
                    <Send size={14} /> {publishLoading ? "Yayınlanıyor…" : isPublishedWeek ? "Revize Et & Yayınla" : "Yayınla"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Uyarı bannerları ── */}
          {capacityWarnings.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">
              <p className="font-bold mb-1 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                Kapasite matrisi mevcut personel sayısından fazla kişi istiyor
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                {capacityWarnings.slice(0, 6).map((w, i) => <li key={i}>{w}</li>)}
              </ul>
              <p className="mt-1 text-red-500">Bu günlerde herkes müsait olsa bile Otomatik Oluştur çözüm bulamaz — kapasite matrisindeki sayıları azaltın.</p>
            </div>
          )}
          {noAvailCount > 0 && personnel.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-600">
              <AlertCircle size={13} className="shrink-0 text-blue-400" />
              <span><span className="font-bold">{noAvailCount} personel</span> müsaitlik bilgisi girmemiş — bu kişiler otomatik oluşturmada tam müsait kabul edilir, planlama engellenmez.</span>
              <button onClick={handleRequestAvailability} className="ml-auto underline font-semibold hover:text-blue-900">Müsaitlik İste</button>
            </div>
          )}
          {!loading && shiftDefs.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
              <BookOpen size={15} className="shrink-0" />
              <span>Vardiya şablonu tanımlı değil. <a href="/settings" className="font-bold underline hover:text-amber-900">Ayarlar&apos;dan ekleyin</a></span>
            </div>
          )}
          {publishSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 font-semibold flex items-center gap-2">
              <Check size={16} /> Vardiya programı yayınlandı! Personellere bildirim gönderildi.
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}
          {seniorViolations.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-500" />
              <div>
                <span className="font-semibold">Kıdemli personel atanamadı</span>{" — "}
                {seniorViolations.map((v, i) => (
                  <span key={i} className="font-medium">
                    {["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"][v.day]} {v.shift}{i < seniorViolations.length - 1 ? ", " : ""}
                  </span>
                ))} vardiyasında kıdemli personel bulunamadı.
              </div>
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
          {aiSummary !== null && (
            <div className="bg-violet-50 border border-violet-200 rounded-2xl px-5 py-4 relative">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={14} className="text-violet-500" />
                <span className="text-xs font-bold text-violet-700 uppercase tracking-wide">AI Hafta Özeti</span>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{aiLoading && !aiSummary ? "…" : aiSummary}</p>
              <button onClick={() => setAiSummary(null)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"><X size={14} /></button>
            </div>
          )}
          {isPublishedWeek && !editUnlocked && editRequestStatus === "pending" && (
            <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
              <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin shrink-0" />
              <span className="flex-1">Düzenleme onayı patronda bekleniyor…</span>
              <button onClick={() => setUnlockModal(true)} className="text-xs font-bold text-blue-600 hover:text-blue-800 shrink-0">Detay</button>
            </div>
          )}
          {isPublishedWeek && !editUnlocked && editRequestStatus === "rejected" && (
            <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <X size={14} className="shrink-0" />
              <div className="flex-1">
                <span>Düzenleme talebi reddedildi</span>
                {editRequestReviewer && <span className="text-red-500"> — {editRequestReviewer}</span>}
                {editRequestNote && <span className="italic"> &ldquo;{editRequestNote}&rdquo;</span>}
              </div>
              <button onClick={() => { setEditRequestStatus("idle"); setUnlockModal(true); }} className="text-xs font-bold text-red-600 hover:text-red-800 shrink-0">Tekrar İste</button>
            </div>
          )}
          {isPublishedWeek && editUnlocked && editRequestStatus === "approved" && (
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
              <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
              <div className="flex-1">
                <span className="font-semibold">Düzenleme modu açık</span>
                {editRequestReviewer && <span className="text-emerald-500 font-normal"> — {editRequestReviewer} onayladı</span>}
              </div>
              <span className="text-xs text-emerald-400 shrink-0">Yayınlayınca kapanır</span>
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
                    {ev.note && <span className="opacity-60">— {ev.note}</span>}
                    <span className="text-[9px] opacity-50 uppercase tracking-wide">haftalık</span>
                    <button onClick={() => deleteEvent(ev.id)} className="opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110" title="Sil"><X size={11} /></button>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── Kapasite Planı ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setDemandOpen(o => !o)}
              className="w-full flex items-center gap-3 px-5 py-3 bg-slate-50/60 hover:bg-slate-100/60 transition-colors text-left"
            >
              <ChevronDown size={14} className={cn("text-slate-400 transition-transform duration-200 shrink-0", demandOpen && "rotate-180")} />
              <div className="flex-1">
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Kapasite Planı</p>
                {!demandOpen && (
                  <p className="text-xs text-slate-400 mt-0.5">Her vardiya için günlük kişi sayısını belirle</p>
                )}
              </div>
              {shiftDefs.length === 0 && (
                <a href="/settings" onClick={e => e.stopPropagation()} className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1 shrink-0"><BookOpen size={12} /> Vardiya tanımla</a>
              )}
            </button>
            {demandOpen && (loading ? (
              <div className="p-4 space-y-2 border-t border-slate-100">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : shiftDefs.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm border-t border-slate-100">Vardiya şablonu tanımlı değil.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2.5 px-5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-44">Vardiya</th>
                      {DAYS.map((d, i) => {
                        const isWeekend = i === 5 || i === 6;
                        return (
                          <th key={d} className={cn("text-center py-2.5 px-2 text-[11px] font-black uppercase tracking-widest min-w-[52px]", isWeekend ? "text-indigo-500 bg-indigo-50/40" : "text-slate-400")}>
                            <div>{d}</div>
                            <div className={cn("text-[10px] font-semibold mt-0.5", isWeekend ? "text-indigo-300" : "text-slate-300")}>{dates[i]}</div>
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
                          </td>
                          {Array.from({ length: 7 }, (_, day) => {
                            const val = demandMatrix[def.id]?.[day] ?? 0;
                            const assigned = assignedCounts[def.id]?.[day] ?? 0;
                            const isWeekend = day === 5 || day === 6;
                            const coverState = val === 0 ? "empty" : assigned < val ? "under" : assigned === val ? "ok" : "over";
                            return (
                              <td key={day} className={cn("py-2 px-2 text-center", isWeekend && "bg-indigo-50/20")}>
                                <div className="flex flex-col items-center gap-0.5">
                                  <input
                                    type="number" min={0} max={99}
                                    value={val === 0 ? "" : val}
                                    placeholder="—"
                                    disabled={isPublishedWeek && !editUnlocked}
                                    onChange={e => {
                                      const n = Math.max(0, parseInt(e.target.value) || 0);
                                      setDemandMatrix(prev => ({ ...prev, [def.id]: { ...(prev[def.id] ?? {}), [day]: n } }));
                                    }}
                                    onBlur={() => handleDemandSave(true)}
                                    className="w-11 h-8 text-center text-sm font-bold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white text-indigo-700 placeholder-slate-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-slate-50"
                                  />
                                  {val > 0 && (
                                    <span className={cn(
                                      "text-[10px] font-bold leading-tight",
                                      coverState === "under" && "text-red-500",
                                      coverState === "ok"    && "text-emerald-600",
                                      coverState === "over"  && "text-sky-500",
                                    )}>{assigned}/{val}</span>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    ) : (
                      departments.map(dept => (
                        <Fragment key={dept.id}>
                          <tr className="border-t border-slate-200 bg-slate-50/70">
                            <td colSpan={8} className="px-5 py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-0.5 h-4 rounded-full bg-indigo-400 shrink-0" />
                                <span className="text-xs font-black text-slate-700">{dept.name}</span>
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
                                </td>
                                {Array.from({ length: 7 }, (_, day) => {
                                  const val = deptRow[day] ?? 0;
                                  const assigned = deptAssignedCounts[dept.id]?.[def.id]?.[day] ?? 0;
                                  const isWeekend = day === 5 || day === 6;
                                  const coverState = val === 0 ? "empty" : assigned < val ? "under" : assigned === val ? "ok" : "over";
                                  return (
                                    <td key={day} className={cn("py-2 px-2 text-center", isWeekend && "bg-indigo-50/20")}>
                                      <div className="flex flex-col items-center gap-0.5">
                                        <input
                                          type="number" min={0} max={99}
                                          value={val === 0 ? "" : val}
                                          placeholder="—"
                                          disabled={isPublishedWeek && !editUnlocked}
                                          onChange={e => {
                                            const n = Math.max(0, parseInt(e.target.value) || 0);
                                            setDeptDemandMatrix(prev => ({
                                              ...prev,
                                              [dept.id]: { ...(prev[dept.id] ?? {}), [def.id]: { ...(prev[dept.id]?.[def.id] ?? {}), [day]: n } },
                                            }));
                                          }}
                                          onBlur={() => handleDeptDemandSave(dept.id)}
                                          className="w-11 h-8 text-center text-sm font-bold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white text-indigo-700 placeholder-slate-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-slate-50"
                                        />
                                        {val > 0 && (
                                          <span className={cn(
                                            "text-[10px] font-bold leading-tight",
                                            coverState === "under" && "text-red-500",
                                            coverState === "ok"    && "text-emerald-600",
                                            coverState === "over"  && "text-sky-500",
                                          )}>{assigned}/{val}</span>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* ── Otomatik oluştur onay diyalogu ── */}
          {confirmGenerate && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-800">Mevcut vardiyalar silinecek</p>
                <p className="text-xs text-amber-700 mt-0.5">{Object.keys(cellMap).length} adet vardiya var. Otomatik oluştur bunları silerek yeniden oluşturacak.</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setConfirmGenerate(false)} className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">İptal</button>
                <button onClick={runGenerate} className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">Evet, Oluştur</button>
              </div>
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
                <button onClick={doCopyPrevWeek} className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">Evet, Kopyala</button>
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
                  Kural ihlalleri tespit edildi
                </p>
                <ul className="text-xs text-red-700 space-y-0.5 list-disc list-inside">
                  {violationModal.violations.map((v, i) => <li key={i}>{v}</li>)}
                </ul>
                <p className="text-xs text-red-500 mt-2">Yayınlamadan önce düzeltmeniz önerilir.</p>
              </div>
              <div className="flex gap-2 shrink-0 sm:flex-col w-full sm:w-auto">
                <button onClick={violationModal.onConfirm} className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap">Yine de Yayınla</button>
                <button onClick={() => setViolationModal(null)} className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap">Düzelt</button>
              </div>
            </div>
          )}

          {/* ── Personel Haftalık Planı (Grid) ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative">
            {loading && (
              <div className="absolute inset-0 bg-white/70 z-20 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse">
                <thead>
                  <tr className="bg-white border-b-2 border-slate-200">
                    <th className="sticky left-0 bg-white z-30 px-4 py-3 text-left w-52 align-bottom">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Personel {filteredPersonnel.length > 0 && <span className="font-normal text-slate-300">({filteredPersonnel.length})</span>}
                      </span>
                    </th>
                    {Array.from({ length: 7 }, (_, i) => {
                      const isWeekend = i === 5 || i === 6;
                      const isoDate = isoDates[i];
                      const holiday = (TURKISH_HOLIDAYS as unknown as Record<string, string>)?.[isoDate];
                      const dayEvents = events.filter(ev => ev.scope === "day" && eventCoversDate(ev, isoDate));
                      const totalNeeded = Object.values(effectiveDemandMatrix).reduce((sum, dm) => sum + (dm[i] ?? 0), 0);
                      const totalAssigned = Object.values(assignedCounts).reduce((sum, dm) => sum + (dm[i] ?? 0), 0);
                      return (
                        <th key={i} className={cn("py-2 px-1 text-center min-w-[88px] align-top", isWeekend ? "bg-indigo-50/50" : "")}>
                          <div className={cn("text-[11px] font-black uppercase tracking-wider", isWeekend ? "text-indigo-600" : "text-slate-700")}>{DAYS[i]}</div>
                          <div className={cn("text-[10px] mt-0.5 font-semibold", isWeekend ? "text-indigo-400" : "text-slate-400")}>{dates[i]}</div>
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
                            className="mt-0.5 text-[9px] text-slate-200 hover:text-indigo-400 transition-colors block w-full text-center" title="Etkinlik ekle"
                          >
                            <CalendarPlus size={9} className="inline" />
                          </button>
                          {weather[isoDate] && (
                            <div className="text-[10px] text-slate-400 font-medium mt-0.5">{weather[isoDate].icon} {weather[isoDate].temp}°</div>
                          )}
                          {totalNeeded > 0 && (
                            <div className={cn(
                              "mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full mx-auto w-fit border",
                              totalAssigned < totalNeeded ? "bg-red-50 text-red-600 border-red-100" :
                              totalAssigned === totalNeeded ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                              "bg-sky-50 text-sky-600 border-sky-100"
                            )}>{totalAssigned}/{totalNeeded}</div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length === 0 && !loading && (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-slate-400 text-sm">
                        {personnel.length === 0 ? "Henüz personel eklenmemiş." : "Arama sonucu bulunamadı."}
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
                              <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                              <span className="text-xs font-black text-slate-700">{row.dept.name}</span>
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
                      <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/40 transition-colors group h-14">
                        <td className="sticky left-0 bg-white group-hover:bg-slate-50/40 z-10 px-3 py-2 h-14">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
                              {p.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-slate-800 truncate leading-tight">{p.name}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="h-1 bg-slate-100 rounded-full w-10 overflow-hidden">
                                  <div className={cn("h-full rounded-full", scoreColor(score, maxScore))} style={{ width: scoreBarWidth }} />
                                </div>
                                <span className="text-[10px] text-slate-400 tabular-nums">{Math.round(score * 10) / 10}</span>
                              </div>
                            </div>
                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button onClick={() => fillPersonRow(p.id)} title="Tüm müsait günleri doldur" className="p-1 text-slate-300 hover:text-indigo-500 transition-colors">
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

                          const tdClass = cn(
                            "py-1 px-1 h-14 align-middle",
                            isWeekend && "bg-indigo-50/20",
                          );

                          if (isPublishedWeek && !editUnlocked) {
                            return (
                              <td key={day} className={tdClass}>
                                {cell ? (
                                  <div className={cn("mx-auto w-full max-w-[84px] rounded-lg px-1 py-1 text-center border", forceData ? "bg-amber-50 border-amber-200" : "bg-indigo-50 border-indigo-200/70")}>
                                    {matchedDef && <div className={cn("text-[11px] font-bold truncate", forceData ? "text-amber-700" : "text-indigo-700")}>{matchedDef.name}</div>}
                                    <div className={cn("text-[9px]", forceData ? "text-amber-500" : "text-indigo-400")}>
                                      {normTime(minToHHMM(cell.startMin))}–{normTime(minToHHMM(cell.endMin, cell.endMin >= 1440))}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center h-full">
                                    <span className="text-slate-200 text-xs">—</span>
                                  </div>
                                )}
                              </td>
                            );
                          }

                          return (
                            <DroppableCell key={day} id={cellKey} className={tdClass}>
                              {cell ? (
                                <DraggableShift id={cellKey} disabled={false}>
                                  <div
                                    onClick={(e: React.MouseEvent) => handleCellClick(e, p.id, day)}
                                    className={cn(
                                      "mx-auto w-full max-w-[84px] rounded-lg px-1 py-1 text-center border cursor-pointer transition-all hover:shadow-sm",
                                      forceData ? "bg-amber-50 border-amber-300 hover:border-amber-400" : "bg-indigo-50 border-indigo-200/70 hover:border-indigo-400"
                                    )}
                                  >
                                    <div className={cn("text-[11px] font-bold truncate", forceData ? "text-amber-700" : "text-indigo-700")}>
                                      {matchedDef ? matchedDef.name : "Özel"}
                                    </div>
                                    <div className={cn("text-[9px]", forceData ? "text-amber-500" : "text-indigo-400")}>
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
                                <div className="w-full h-11 rounded-lg bg-red-50 border border-red-200 flex flex-col items-center justify-center gap-0.5" title="Kesinlikle müsait değil">
                                  <X size={12} className="text-red-400" />
                                  <span className="text-[9px] font-bold text-red-400">Müsait Değil</span>
                                </div>
                              ) : isPrefNot ? (
                                <button
                                  onClick={(e: React.MouseEvent) => handleCellClick(e, p.id, day)}
                                  className="w-full h-11 rounded-lg bg-amber-50 border border-amber-300 hover:border-amber-400 hover:bg-amber-100 transition-all flex flex-col items-center justify-center gap-0.5 group"
                                  title={avail?.start && avail.end ? `Tercih etmiyor — ${avail.start}–${avail.end} arası gelebilir` : "Tercih etmiyor (gerekirse gelebilir)"}
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
                                  title={avail?.start && avail.end ? `Müsait — ${avail.start}–${avail.end}` : "Müsait"}
                                >
                                  <span className="text-[10px] font-bold text-emerald-600 group-hover:opacity-0 transition-opacity">✓ Müsait</span>
                                  {avail?.start && avail.end && (
                                    <span className="text-[9px] text-emerald-400 group-hover:opacity-0 transition-opacity">{avail.start}–{avail.end}</span>
                                  )}
                                  <Plus size={13} className="text-emerald-500 opacity-0 group-hover:opacity-100 absolute transition-opacity" />
                                </button>
                              ) : (
                                <button
                                  onClick={(e: React.MouseEvent) => handleCellClick(e, p.id, day)}
                                  className="w-full h-11 rounded-lg border-2 border-dashed border-slate-200 text-slate-300 hover:border-indigo-300 hover:text-indigo-400 hover:bg-indigo-50/30 transition-all flex items-center justify-center"
                                  title="Müsaitlik girilmemiş — vardiya ekle"
                                >
                                  <Plus size={13} />
                                </button>
                              )}
                            </DroppableCell>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Kilitli floating badge */}
            {isPublishedWeek && !editUnlocked && (
              <div className="absolute bottom-4 right-4 z-10 cursor-pointer" onClick={() => setUnlockModal(true)}>
                <div className="bg-white border border-slate-200 shadow-lg rounded-xl px-4 py-2.5 flex items-center gap-2.5 hover:shadow-xl transition-shadow">
                  <div className="text-lg">🔒</div>
                  <div>
                    <p className="font-bold text-slate-800 text-xs leading-tight">Plan Kilitli</p>
                    <p className="text-[10px] text-slate-400 leading-tight">Düzenlemek için tıkla</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── OR-Tools oluşturuyor overlay ── */}
          {generating && (
            <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 pointer-events-none">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center">
                <Zap size={22} className="text-indigo-600 animate-pulse" />
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-slate-800">OR-Tools Planlıyor</p>
                <p className="text-sm text-slate-400 mt-0.5">5–15 saniye sürebilir…</p>
              </div>
            </div>
          )}

          {/* ── Düzenleme kilidi modalı ── */}
          {unlockModal && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => { if (editRequestStatus !== "pending") setUnlockModal(false); }}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                {(editRequestStatus === "idle" || editRequestStatus === "sending") && (
                  <div className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">Düzenleme Onayı</p>
                        <p className="text-xs text-slate-500 mt-0.5">Patron onayı gerekiyor</p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 mb-5 leading-relaxed">Bu hafta için yayınlanmış bir plan var. Düzenleme talebiniz <strong>supervisor / patron</strong>&apos;a gönderilecek. Onayladıktan sonra düzenleyebilirsiniz.</p>
                    <div className="flex gap-2">
                      <button onClick={() => { setUnlockModal(false); setEditRequestStatus("idle"); }} className="flex-1 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">İptal</button>
                      <button onClick={handleSendEditRequest} disabled={editRequestStatus === "sending"} className="flex-1 py-2.5 text-sm font-bold text-white bg-amber-500 rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                        {editRequestStatus === "sending" && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                        {editRequestStatus === "sending" ? "Gönderiliyor…" : "Onay İste"}
                      </button>
                    </div>
                  </div>
                )}
                {editRequestStatus === "pending" && (
                  <div className="p-6 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto mb-4">
                      <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                    <p className="font-bold text-slate-800 mb-1">Onay Bekleniyor</p>
                    <p className="text-sm text-slate-500 mb-5">Talep patrona iletildi. Onayladığında düzenleme modu otomatik açılacak.</p>
                    <button onClick={() => setUnlockModal(false)} className="w-full py-2.5 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">Kapat (arka planda bekler)</button>
                  </div>
                )}
                {editRequestStatus === "rejected" && (
                  <div className="p-6 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
                      <X size={22} className="text-red-500" />
                    </div>
                    <p className="font-bold text-slate-800 mb-1">Talep Reddedildi</p>
                    {editRequestNote && <p className="text-sm text-slate-500 mb-1">&ldquo;{editRequestNote}&rdquo;</p>}
                    <p className="text-xs text-slate-400 mb-5">Planı düzenlemek için tekrar onay isteyin veya yöneticinizle iletişime geçin.</p>
                    <div className="flex gap-2">
                      <button onClick={() => { setUnlockModal(false); setEditRequestStatus("idle"); }} className="flex-1 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">Kapat</button>
                      <button onClick={() => { setEditRequestStatus("idle"); handleSendEditRequest(); }} className="flex-1 py-2.5 text-sm font-bold text-white bg-amber-500 rounded-xl hover:bg-amber-600 transition-colors">Tekrar İste</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Yayın Geçmişi Modalı ── */}
          {pubsModalOpen && (
            <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPubsModalOpen(false)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
                  <div className="flex items-center gap-2">
                    <History size={16} className="text-slate-400" />
                    <h2 className="text-base font-bold text-slate-800">Yayın Geçmişi</h2>
                  </div>
                  <button onClick={() => setPubsModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600"><X size={16} /></button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {pubsLoading ? (
                    <div className="py-12 flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                      <p className="text-sm text-slate-400">Yükleniyor…</p>
                    </div>
                  ) : publications.length === 0 ? (
                    <div className="py-16 flex flex-col items-center gap-3 text-center px-6">
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                        <History size={24} className="text-slate-300" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-600">Henüz yayınlanmış vardiya yok</p>
                        <p className="text-sm text-slate-400 mt-1">Planlamayı tamamlayıp yayınladığınızda burada görünür.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {publications.map(pub => {
                        const isThisWeek = pub.week_start === weekStart;
                        const isExpanded = expandedPubId === pub.id;
                        return (
                          <div key={pub.id}>
                            <button onClick={() => handleExpandPub(pub)} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50/70 transition-colors text-left">
                              <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", pub.revision === 0 ? "bg-emerald-50 border border-emerald-200" : "bg-violet-50 border border-violet-200")}>
                                {pub.revision === 0 ? <CheckCircle2 size={14} className="text-emerald-600" /> : <RefreshCw size={14} className="text-violet-600" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={cn("font-bold text-sm", isThisWeek ? "text-indigo-700" : "text-slate-800")}>{fullWeekLabel(pub.week_start)}</span>
                                  {isThisWeek && <span className="px-1.5 py-0.5 text-[9px] font-black rounded bg-indigo-100 text-indigo-700 border border-indigo-200 uppercase tracking-wider">Bu Hafta</span>}
                                  {pub.revision > 0 && <span className="px-1.5 py-0.5 text-[10px] font-black rounded bg-violet-100 text-violet-700 border border-violet-200">R{pub.revision}</span>}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5">{pub.published_by_name ?? "Yönetici"} · {timeAgo(pub.published_at)}</p>
                              </div>
                              <ChevronDown size={14} className={cn("text-slate-300 shrink-0 transition-transform duration-200", isExpanded && "rotate-180")} />
                            </button>
                            {isExpanded && (
                              <div className="border-t border-slate-100">
                                {expandedPubLoading && expandedPubId === pub.id ? (
                                  <div className="py-10 flex flex-col items-center gap-2">
                                    <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                                    <p className="text-xs text-slate-400">Yükleniyor…</p>
                                  </div>
                                ) : expandedPubData?.id === pub.id ? (
                                  <>
                                    <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-50/80 border-b border-slate-100">
                                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                                        {expandedPubData.snapshot?.locationName} — {fullWeekLabel(pub.week_start)}{pub.revision > 0 && ` — R${pub.revision}`}
                                      </span>
                                      <span className="ml-auto text-[10px] text-slate-400">{expandedPubData.snapshot?.assignments.length ?? 0} atama</span>
                                    </div>
                                    <SnapshotGrid data={expandedPubData} />
                                  </>
                                ) : (
                                  <div className="py-6 text-center text-xs text-slate-400">Yüklenemedi.</div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Adalet Dağılımı yan çekmecesi ── */}
      {fairnessOpen && <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setFairnessOpen(false)} />}
      <div className={cn(
        "fixed top-0 right-0 h-full w-72 bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col transition-transform duration-300",
        fairnessOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <BarChart2 size={15} className="text-indigo-500" />
            <h2 className="text-sm font-bold text-slate-800">Adalet Dağılımı</h2>
          </div>
          <button onClick={() => setFairnessOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {personScores.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Personel yok</p>
          ) : (
            <div className="space-y-3.5">
              {[...personScores].sort((a, b) => b.score - a.score).map(s => (
                <div key={s.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-700 truncate max-w-[160px]">{s.name}</span>
                    <span className="text-xs font-bold text-slate-400 tabular-nums">{Math.round(s.score * 10) / 10}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-300", scoreColor(s.score, maxScore))} style={{ width: `${(s.score / maxScore) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-slate-100 space-y-1 text-[10px] text-slate-400 leading-relaxed">
          <p>Puan = birikimli puan + bu haftanın vardiya puanları.</p>
          <p>Cumartesi/Pazar ×1.5 · 22:00 sonrası +2 bonus.</p>
        </div>
      </div>

      {/* ── Hücre popover ── */}
      {popover && (
        <div
          data-popover
          className="fixed z-50 bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 w-[calc(100vw-2rem)] max-w-[288px] sm:w-72"
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
              <p className="text-[11px] text-amber-700">Şablon yok. <a href="/settings" className="font-bold underline" onClick={() => setPopover(null)}>Ayarlar&apos;dan ekle</a></p>
            </div>
          )}
          {shiftDefs.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-1.5">Şablondan seç</p>
              <div className="flex flex-wrap gap-1.5">
                {shiftDefs.map(def => {
                  const ds = hhmmToMin(def.start);
                  let de = hhmmToMin(def.end);
                  if (de <= ds) de += 1440;
                  const isActive = Math.abs(popover.startMin - ds) <= 10 && Math.abs(popover.endMin - de) <= 10;
                  return (
                    <button
                      key={def.id}
                      onClick={() => setPopover(prev => prev ? { ...prev, startMin: ds, endMin: de } : null)}
                      className={cn("text-xs px-2.5 py-1 rounded-lg font-semibold border transition-colors", isActive ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700")}
                    >
                      {def.name}<span className="ml-1 opacity-60 font-normal">{def.start}–{def.end}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <TimeRangeSlider
            startMin={popover.startMin} endMin={popover.endMin} step={15} trackMin={0} trackMax={1800}
            onChange={(s, e) => setPopover(prev => prev ? { ...prev, startMin: s, endMin: e } : null)}
          />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800">{minToHHMM(popover.startMin)} – {minToHHMM(popover.endMin, popover.endMin >= 1440)}</span>
            <span className="text-xs text-slate-500 tabular-nums">{popoverHours} saat · {popoverPoints} puan</span>
          </div>
          {(popover.day === 5 || popover.day === 6 || popover.endMin > 22 * 60) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(popover.day === 5 || popover.day === 6) && <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-semibold border border-amber-100">Hf. sonu ×1.5</span>}
              {popover.endMin > 22 * 60 && popover.endMin < 1440 && <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-semibold border border-indigo-100">Gece +2 bonus</span>}
              {popover.endMin >= 1440 && <span className="text-[10px] bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full font-semibold border border-violet-100">🌙 Gece geçişi +2 bonus</span>}
            </div>
          )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={() => setProposalModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            {/* Başlık */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0">
                  <MessageCircle size={15} className="text-sky-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Vardiya Teklifi</p>
                  <p className="text-xs text-slate-400">{proposalModal.name}</p>
                </div>
              </div>
              <button onClick={() => setProposalModal(null)} className="text-slate-400 hover:text-slate-600 p-1"><X size={15} /></button>
            </div>

            {/* Mevcut vardiya */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mevcut Vardiya</p>
              <p className="text-sm font-semibold text-slate-700">
                {(() => {
                  const d = new Date(proposalModal.currentDate);
                  const DAYS_TR = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
                  return `${DAYS_TR[d.getDay()]} ${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")}`;
                })()} — {proposalModal.currentStart}–{proposalModal.currentEnd}
              </p>
            </div>

            {/* Önerilen gün */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Önerilen Gün</p>
              <div className="flex gap-1">
                {DAYS.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => setProposalDay(i)}
                    className={cn(
                      "flex-1 py-1.5 text-[10px] font-bold rounded-lg border transition-colors",
                      proposalDay === i
                        ? "bg-sky-600 text-white border-sky-600"
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
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Önerilen Vardiya</p>
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
                          isActive ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-700"
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
            <div className="flex items-center gap-3 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2.5 text-xs font-semibold">
              <span className="text-slate-500 line-through">{proposalModal.currentStart}–{proposalModal.currentEnd}</span>
              <span className="text-slate-300">→</span>
              <span className="text-sky-700">{isoDates[proposalDay] !== proposalModal.currentDate ? `${DAYS[proposalDay]} ` : ""}{minToHHMM(proposalStartMin)}–{minToHHMM(proposalEndMin, proposalEndMin >= 1440)}</span>
            </div>

            {/* Not */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Not <span className="font-normal normal-case">(opsiyonel)</span></p>
              <input
                type="text" value={proposalNote} onChange={e => setProposalNote(e.target.value)}
                placeholder="Neden değişiklik istiyorsunuz?"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-400 placeholder-slate-300"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setProposalModal(null)} className="flex-1 py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">İptal</button>
              <button
                onClick={handleSendProposal}
                disabled={proposalSending}
                className="flex-1 py-2.5 text-sm font-bold text-white bg-sky-600 rounded-xl hover:bg-sky-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {proposalSending
                  ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Gönderiliyor…</>
                  : <><Send size={13} /> Teklif Gönder</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Etkinlik ekleme modalı ── */}
      {addEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={() => setAddEventModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">Etkinlik Ekle</h2>
              <button onClick={() => setAddEventModal(null)} className="text-slate-400 hover:text-slate-600 p-1 transition-colors"><X size={16} /></button>
            </div>
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              <button onClick={() => setNewEventScope("day")} className={cn("flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all", newEventScope === "day" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}>📅 Özel Gün</button>
              <button onClick={() => setNewEventScope("week")} className={cn("flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all", newEventScope === "week" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}>🗓 Haftalık Not</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Başlık</label>
                <input
                  autoFocus type="text" value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEvent()}
                  placeholder={newEventScope === "week" ? "Ramazan dönemi, yoğun sezon..." : "Kampanya başlangıcı, denetim..."}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                />
              </div>
              {newEventScope === "day" && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Başlangıç</label>
                    <input type="date" value={addEventModal.date} readOnly className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500 cursor-default" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Bitiş <span className="font-normal text-slate-400">(opsiyonel)</span></label>
                    <input type="date" value={newEventEndDate} min={addEventModal.date} onChange={e => setNewEventEndDate(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400" />
                  </div>
                </div>
              )}
              {newEventScope === "week" && <p className="text-[11px] text-slate-400">Bu haftanın tamamı için not — sütun başlıklarında değil, üstte görünür.</p>}
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
                <label className="text-xs font-semibold text-slate-600 block mb-1">Not <span className="font-normal text-slate-400">(opsiyonel)</span></label>
                <input type="text" value={newEventNote} onChange={e => setNewEventNote(e.target.value)} placeholder="Ekstra detay..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setAddEventModal(null)} className="flex-1 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">İptal</button>
              <button onClick={saveEvent} disabled={!newEventTitle.trim() || eventSaving} className="flex-1 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {eventSaving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      <DragOverlay>
        {activeDragData?.type === "grid" ? (
          <div className="p-2 px-3 bg-white border-2 border-indigo-500 rounded-lg shadow-xl opacity-90 scale-105 text-xs font-bold z-[9999]">Taşınıyor...</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
