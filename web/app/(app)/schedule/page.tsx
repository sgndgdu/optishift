"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bell, ChevronLeft, ChevronRight, Check, AlertCircle,
  Download, Zap, Send, X, Plus, BookOpen, ChevronDown, Sparkles, Eye, Copy,
  Undo2, Redo2, Search, Trash2, CalendarCheck, MoreHorizontal, BarChart2,
} from "lucide-react";
import { TimeRangeSlider, minToHHMM, hhmmToMin } from "@/components/schedule/TimeRangeSlider";
import { cn } from "@/lib/utils";
import type { ShiftDefinition } from "@/lib/types";
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
import { ShiftBoard } from "@/components/schedule/ShiftBoard";

const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function getWeekStartISO(offset: number): string {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7) + offset * 7);
  return monday.toISOString().split("T")[0];
}

function getWeekLabel(offset: number): { label: string; dates: string[] } {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7) + offset * 7);

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
  const [weekStart, setWeekStart]                 = useState("");
  const [weekLabel, setWeekLabel]                 = useState("");
  const [dates, setDates]                         = useState<string[]>([]);
  const [activeLocationId, setActiveLocationId]   = useState("");
  const [personnel, setPersonnel]                 = useState<any[]>([]);
  const [departments, setDepartments]             = useState<any[]>([]);
  const [cellMap, setCellMap]                     = useState<CellMap>({});
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
  const [demandMatrix, setDemandMatrix]           = useState<Record<string, Record<number, number>>>({}); // shiftDefId → {day → count}
  const [demandOpen, setDemandOpen]               = useState(false);
  const [fairnessOpen, setFairnessOpen]           = useState(false);
  const [isDraftWeek, setIsDraftWeek]             = useState(false);
  const [saveState, setSaveState]                 = useState<"idle" | "saving" | "saved">("idle");
  const [dirty, setDirty]                         = useState(false); // yayınlanmamış lokal değişiklik var mı
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
  const [viewMode, setViewMode]                   = useState<"shift" | "grid">("shift");
  const [activeDragData, setActiveDragData]       = useState<{ id: string; type: string; person?: any } | null>(null);

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
    // Tarih hesapları client-only
    const ws = getWeekStartISO(weekOffset);
    const wl = getWeekLabel(weekOffset);
    setWeekStart(ws);
    setWeekLabel(wl.label);
    setDates(wl.dates);

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

  // weekOffset değişince tarihleri güncelle
  useEffect(() => {
    if (!mounted) return;
    const ws = getWeekStartISO(weekOffset);
    const wl = getWeekLabel(weekOffset);
    setWeekStart(ws);
    setWeekLabel(wl.label);
    setDates(wl.dates);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, mounted]);

  // Load personnel + availability + existing shifts
  useEffect(() => {
    if (!activeLocationId) return;
    const weekStart = getWeekStartISO(weekOffset);
    (async () => {
      setLoading(true);
      try {
        const [pRes, aRes, sRes, locRes, deptRes] = await Promise.all([
          fetch(`/api/personnel?location_id=${activeLocationId}`),
          fetch(`/api/availability/team?location_id=${activeLocationId}&week_start=${weekStart}`),
          fetch(`/api/shifts?location_id=${activeLocationId}&week_start=${weekStart}`),
          fetch(`/api/locations?id=${activeLocationId}`),
          fetch(`/api/departments?location_id=${activeLocationId}`),
        ]);
        const pData = await pRes.json();
        const aData = await aRes.json();
        const sData = await sRes.json();
        const locData = await locRes.json();
        const deptData = await deptRes.json();
        setDepartments(Array.isArray(deptData) ? deptData : []);

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
            // Matris doluysa kapasite paneli varsayılan açık gelsin
            const hasDemand = Object.values(matrix as Record<string, Record<number, number>>)
              .some(days => Object.values(days ?? {}).some(n => (n ?? 0) > 0));
            if (hasDemand) setDemandOpen(true);
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
            }
          }
          setIsDraftWeek(hasDraft);
        }
        setCellMap(newCellMap);
        setDbShiftCount(Object.keys(newCellMap).length);
        // Hafta yüklemesi kullanıcı düzenlemesi değildir — otomatik kayıt tetiklenmesin
        userEditRef.current = false;
        setDirty(false);
        setSaveState("idle");
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
        body: JSON.stringify(buildShiftsPayload("published")),
      });
      const shiftData = await shiftRes.json();

      // 409 = kısmi başarı: bazı vardiyalar kural ihlali nedeniyle atlandı ama geri kalanlar kaydedildi
      if (!shiftRes.ok && shiftRes.status !== 409) {
        showToast("Vardiyalar kaydedilirken hata: " + (shiftData.error || "Bilinmeyen hata"), "error");
        return;
      }
      if (shiftRes.status === 409 && shiftData.details?.length > 0) {
        // Hangi vardiyalar atlandı — isimlerle göster
        const detailLines = shiftData.details.map((d: string) => {
          const match = d.match(/^(P\w+) için (.+)/);
          if (match) {
            const p = personnel.find((p: any) => p.id === match[1]);
            return `• ${p?.name ?? match[1]}: ${match[2]}`;
          }
          return `• ${d}`;
        }).join("\n");
        setError(`⚠️ ${shiftData.details.length} vardiya İş Kanunu kuralları nedeniyle atlandı:\n${detailLines}\n\nGeri kalan vardiyalar yayınlandı.`);
      }

      await fetch("/api/schedule/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: activeLocationId,
          week_start:  weekStart,
          // OR-Tools puanları varsa gönder — yoksa publish route kendi formülüyle hesaplar
          ...(Object.keys(engineScores).length > 0 && { scores: engineScores }),
        }),
      });

      setPublishSuccess(true);
      setIsDraftWeek(false);
      setDbShiftCount(Object.keys(cellMap).length);
      setDirty(false);
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
    const targetWeek = getWeekStartISO(weekOffset + 1);
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
      const prevWeekStart = getWeekStartISO(weekOffset - 1);
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
  const noAvailCount = personnel.filter(p => !availMap[p.id]).length;

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
    ><div className="flex gap-5 min-w-0">
      {mounted && (<>
      {/* ── Main content ── */}
      <div className="flex-1 min-w-0 space-y-4 overflow-x-auto">

        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Vardiya Planı</h1>
          <p className="text-slate-500 text-xs md:text-sm mt-0.5">Haftalık çalışma takvimi — hücreye tıklayarak vardiya ekle/düzenle</p>
        </div>

        {/* ── Top bar: hafta navigasyonu + durum çipi + tek birincil aksiyon (OPTI-024) ── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Week navigation */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <button
              onClick={() => setWeekOffset(o => o - 1)}
              className="p-2.5 hover:bg-slate-50 text-slate-600 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-2 md:px-4 text-xs md:text-sm font-bold text-slate-800 whitespace-nowrap min-w-[140px] md:min-w-[200px] text-center">
              {weekLabel}
            </span>
            <button
              onClick={() => setWeekOffset(o => o + 1)}
              className="p-2.5 hover:bg-slate-50 text-slate-600 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Hafta durumu çipi — adımlar buton değil, durumdur */}
          {!loading && (
            cellCount === 0 && dbShiftCount === 0 ? (
              <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-100 text-slate-500 whitespace-nowrap">Boş hafta</span>
            ) : isPublishedWeek && !dirty ? (
              <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-100 text-emerald-700 whitespace-nowrap flex items-center gap-1">
                <Check size={11} /> Yayınlandı
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
            {/* Görünüm değiştirici */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setViewMode("shift")}
                className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-colors", viewMode === "shift" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}
              >
                Kapasite Pano
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-colors", viewMode === "grid" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}
              >
                Personel Tablo
              </button>
            </div>

            {/* Adalet dağılımı çekmecesi toggle */}
            <button
              onClick={() => setFairnessOpen(o => !o)}
              title="Adalet Dağılımı"
              className={cn(
                "p-2 rounded-xl border transition-colors",
                fairnessOpen
                  ? "bg-indigo-50 border-indigo-200 text-indigo-600"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
              )}
            >
              <BarChart2 size={15} />
            </button>

            {/* ⋯ İşlemler menüsü — ikincil aksiyonların tamamı */}
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
                    <button
                      onClick={() => { setActionsOpen(false); handleGenerateClick(); }}
                      disabled={generating}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Zap size={13} className="text-indigo-500" /> {generating ? "Oluşturuluyor…" : "Yeniden Oluştur (OR-Tools)"}
                    </button>
                  )}
                  <button
                    onClick={() => { setActionsOpen(false); handleRequestAvailability(); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <Bell size={13} className="text-amber-500" /> Müsaitlik İste
                  </button>
                  <button
                    onClick={() => { setActionsOpen(false); handleCopyPrevWeek(); }}
                    disabled={copyLoading}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Copy size={13} className="text-slate-400" /> {copyLoading ? "Kopyalanıyor…" : "Geçen Haftayı Kopyala"}
                  </button>
                  <button
                    onClick={() => { setActionsOpen(false); handleSendForReview(); }}
                    disabled={sendReviewLoading || !isDraftWeek}
                    title="Personele bildirim gönder — 48 saat itiraz penceresi"
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Eye size={13} className="text-sky-500" /> {sendReviewLoading ? "Gönderiliyor…" : "Personele Gönder (İnceleme)"}
                  </button>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    onClick={() => { setActionsOpen(false); handleAISummary(); }}
                    disabled={aiLoading || cellCount === 0}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Sparkles size={13} className="text-violet-500" /> {aiLoading ? "Analiz ediliyor…" : "AI Özet"}
                  </button>
                  <a
                    href={`/api/export/schedule?location_id=${activeLocationId}&week_start=${weekStart}`}
                    download
                    onClick={() => setActionsOpen(false)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <Download size={13} className="text-slate-400" /> Excel İndir
                  </a>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    onClick={undo}
                    disabled={!canUndo}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Undo2 size={13} className="text-slate-400" /> Geri Al <span className="ml-auto text-[10px] text-slate-300">Ctrl+Z</span>
                  </button>
                  <button
                    onClick={redo}
                    disabled={!canRedo}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Redo2 size={13} className="text-slate-400" /> Yeniden Yap <span className="ml-auto text-[10px] text-slate-300">Ctrl+Y</span>
                  </button>
                </div>
              )}
            </div>

            {/* Tek birincil aksiyon: boş hafta → Otomatik Oluştur, dolu hafta → Yayınla */}
            {cellCount === 0 ? (
              <button
                onClick={handleGenerateClick}
                disabled={generating}
                title="Kapasite planı + müsaitlik + kurallara göre adil taslak üret"
                className="px-4 py-2 text-xs md:text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Zap size={14} /> {generating ? "Oluşturuluyor…" : "Otomatik Oluştur"}
              </button>
            ) : (
              <button
                onClick={handlePublish}
                disabled={publishLoading || (isPublishedWeek && !dirty)}
                title={isPublishedWeek && !dirty ? "Yayınlanacak değişiklik yok" : "Planı yayınla — personele bildirim gider"}
                className="px-4 py-2 text-xs md:text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Send size={14} /> {publishLoading ? "Yayınlanıyor…" : "Yayınla"}
              </button>
            )}
          </div>
        </div>

        {/* Müsaitlik girilmemiş personel uyarısı */}
        {noAvailCount > 0 && personnel.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
            <AlertCircle size={13} className="shrink-0 text-blue-500" />
            <span>
              <span className="font-bold">{noAvailCount} personel</span> bu hafta için müsaitlik bilgisi girmemiş.
              Otomatik oluşturmada hepsine <span className="font-bold">müsait</span> olarak davranılır.{" "}
              <button
                onClick={handleRequestAvailability}
                className="underline font-semibold hover:text-blue-900"
              >
                Müsaitlik iste
              </button>
            </span>
          </div>
        )}

        {/* Factor 10: Küçük odaklı ajan çıktısı — sadece açıklama gösterir */}
        {(aiSummary !== null) && (
          <div className="bg-violet-50 border border-violet-200 rounded-2xl px-5 py-4 relative">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-violet-500" />
              <span className="text-xs font-bold text-violet-700 uppercase tracking-wide">AI Hafta Özeti</span>
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {aiLoading && !aiSummary ? "…" : aiSummary}
            </p>
            <button
              onClick={() => setAiSummary(null)}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── Kapasite Planı (Demand Matrix) ── */}
        {shiftDefs.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => setDemandOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Zap size={12} className="text-indigo-600" />
                </div>
                <span className="text-sm font-bold text-slate-800">Kapasite Planı</span>
                <span className="text-xs text-slate-400 font-medium">— her gün kaç kişi gerekli?</span>
              </div>
              <ChevronDown size={15} className={cn("text-slate-400 transition-transform duration-200", demandOpen && "rotate-180")} />
            </button>

            {demandOpen && (
              <div className="border-t border-slate-100 px-5 py-4">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-xs">
                    <thead>
                      <tr>
                        <th className="text-left py-1.5 pr-4 text-slate-500 font-semibold w-28">Vardiya</th>
                        {DAYS.map((d, i) => (
                          <th key={d} className={cn("text-center py-1.5 px-1 font-semibold", i >= 5 ? "text-violet-600" : "text-slate-500")}>
                            {d}
                            <span className="block text-[10px] font-normal text-slate-400">{dates[i]}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shiftDefs.map(def => (
                        <tr key={def.id} className="border-t border-slate-50">
                          <td className="py-2 pr-4">
                            <span className="font-semibold text-slate-700">{def.name}</span>
                            <span className="text-slate-400 ml-1">{def.start}–{def.end}</span>
                          </td>
                          {Array.from({ length: 7 }, (_, day) => {
                            const val = demandMatrix[def.id]?.[day] ?? 0;
                            return (
                              <td key={day} className="py-2 px-1 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={99}
                                  value={val === 0 ? "" : val}
                                  placeholder="—"
                                  onChange={e => {
                                    const n = Math.max(0, parseInt(e.target.value) || 0);
                                    setDemandMatrix(prev => ({
                                      ...prev,
                                      [def.id]: { ...(prev[def.id] ?? {}), [day]: n },
                                    }));
                                  }}
                                  onBlur={() => handleDemandSave(true)}
                                  className="w-10 h-8 text-center text-sm font-bold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-slate-50 hover:bg-white transition-colors"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-400">Boş bırakılan günler → motor müsaitliğe göre kendi kararını verir. Değerler odak ayrılınca otomatik kaydedilir.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Status banners ── */}
        {/* Taslak/yayınlandı durumu artık üst bardaki durum çipinde gösterilir (OPTI-024) */}
        {!loading && shiftDefs.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-700 flex items-center gap-2">
            <BookOpen size={15} className="shrink-0" />
            <span>
              Vardiya şablonu tanımlı değil — popover'da yalnızca slider görünür.{" "}
              <a href="/settings" className="font-bold underline hover:text-amber-900">Ayarlar'dan vardiya tanımı ekleyin</a> (Sabah 08–16, Akşam 16–00 gibi).
            </span>
          </div>
        )}
        {publishSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 text-sm text-emerald-700 font-semibold flex items-center gap-2">
            <Check size={16} /> Vardiya programı yayınlandı! Personellere bildirim gönderildi.
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle size={16} /> {error}
          </div>
        )}
        {seniorViolations.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-800 flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-500" />
            <div>
              <span className="font-semibold">Kıdemli personel atanamadı</span>
              {" — "}
              {seniorViolations.map((v, i) => (
                <span key={i} className="font-medium">
                  {["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"][v.day]} {v.shift}{i < seniorViolations.length - 1 ? ", " : ""}
                </span>
              ))}
              {" "}vardiyasında primary seviyeli personel bulunamadı.
            </div>
          </div>
        )}
        {toast && (
          <div className={cn(
            "rounded-xl px-5 py-3 text-sm font-semibold flex items-center gap-2",
            toast.type === "success" && "bg-emerald-50 border border-emerald-200 text-emerald-700",
            toast.type === "error"   && "bg-red-50 border border-red-200 text-red-700",
            toast.type === "info"    && "bg-blue-50 border border-blue-200 text-blue-700",
          )}>
            {toast.type === "success" && <Check size={16} />}
            {toast.type === "error"   && <AlertCircle size={16} />}
            {toast.msg}
          </div>
        )}

        {/* ── Otomatik oluştur onay diyalogu ── */}
        {confirmGenerate && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">Mevcut vardiyalar silinecek</p>
              <p className="text-xs text-amber-700 mt-0.5">
                {Object.keys(cellMap).length} adet elle girilmiş vardiya var. Otomatik oluştur bunların tamamını silerek yeniden oluşturacak. Devam etmek istiyor musunuz?
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setConfirmGenerate(false)}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={runGenerate}
                className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Evet, Oluştur
              </button>
            </div>
          </div>
        )}

        {/* ── Kopyalama onay diyalogu ── */}
        {confirmCopy && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">Bu haftada mevcut vardiyalar var</p>
              <p className="text-xs text-amber-700 mt-0.5">
                {Object.keys(cellMap).length} adet vardiya üzerine yazılacak. Geçen haftanın planı taslak olarak yüklenecek.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setConfirmCopy(false)}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={doCopyPrevWeek}
                className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Evet, Kopyala
              </button>
            </div>
          </div>
        )}

        {/* ── Kural ihlali uyarı modalı (T2-D) ── */}
        {violationModal && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 md:px-5 py-4 flex flex-col sm:flex-row items-start gap-3">
            <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5 hidden sm:block" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-800 mb-1 flex items-center gap-2">
                <AlertCircle size={16} className="text-red-500 shrink-0 sm:hidden" />
                Kural ihlalleri tespit edildi
              </p>
              <ul className="text-xs text-red-700 space-y-0.5 list-disc list-inside">
                {violationModal.violations.map((v, i) => <li key={i}>{v}</li>)}
              </ul>
              <p className="text-xs text-red-500 mt-2">Yayınlamadan önce düzeltmeniz önerilir. Yine de yayınlayabilirsiniz.</p>
            </div>
            <div className="flex gap-2 shrink-0 sm:flex-col w-full sm:w-auto">
              <button
                onClick={violationModal.onConfirm}
                className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
              >
                Yine de Yayınla
              </button>
              <button
                onClick={() => setViolationModal(null)}
                className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                Düzelt
              </button>
            </div>
          </div>
        )}

        {/* ── Personel arama filtresi ── */}
        {personnel.length > 5 && (
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              type="text"
              value={personnelFilter}
              onChange={e => setPersonnelFilter(e.target.value)}
              placeholder={`${personnel.length} personelde ara…`}
              className="flex-1 text-sm text-slate-700 placeholder-slate-400 bg-transparent outline-none"
            />
            {personnelFilter && (
              <button onClick={() => setPersonnelFilter('')} className="text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
            {personnelFilter && (
              <span className="text-xs text-slate-400 shrink-0">{filteredPersonnel.length} sonuç</span>
            )}
          </div>
        )}

        {/* ── Schedule grid ── */}
        {viewMode === "shift" ? (
          <ShiftBoard
            personnel={personnel}
            shiftDefs={shiftDefs}
            demandMatrix={demandMatrix}
            cellMap={cellMap}
            availMap={availMap}
            dates={dates}
            onRemoveShift={(personId, day) => {
              const newMap = { ...cellMap };
              delete newMap[`${personId}-${day}`];
              pushCellMap(newMap);
            }}
          />
        ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative">
          {generating && (
            <div className="absolute inset-0 z-50 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center">
              <Zap size={36} className="text-indigo-500 animate-pulse mb-3" />
              <p className="text-lg font-bold text-slate-800">Yapay Zeka Planlıyor...</p>
              <p className="text-sm text-slate-500 mt-1">Bu işlem 5-15 saniye sürebilir, lütfen bekleyin.</p>
            </div>
          )}
          {loading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : personnel.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <p className="font-semibold">Bu şubede aktif personel bulunamadı.</p>
              <p className="text-sm mt-1">Personel eklemek için Personel sayfasına gidin.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70">
                    <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-44">
                      Personel
                    </th>
                    {DAYS.map((d, i) => {
                      const defsWithDemand = shiftDefs.filter(def => (demandMatrix[def.id]?.[i] ?? 0) > 0);
                      const dayAssigned = shiftDefs.reduce((sum, def) => sum + (assignedCounts[def.id]?.[i] ?? 0), 0);
                      const dayRequired = shiftDefs.reduce((sum, def) => sum + (demandMatrix[def.id]?.[i] ?? 0), 0);
                      return (
                        <th key={d} className="text-center py-3 px-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider min-w-[72px]">
                          <span className={cn(i === 5 || i === 6 ? "text-violet-600" : "")}>{d}</span>
                          <span className="block text-[10px] font-normal text-slate-400 mt-0.5">{dates[i]}</span>
                          {defsWithDemand.length > 1 ? (
                            <div className="mt-1 flex flex-col gap-0.5 items-center">
                              {defsWithDemand.map(def => {
                                const a = assignedCounts[def.id]?.[i] ?? 0;
                                const r = demandMatrix[def.id]?.[i] ?? 0;
                                return (
                                  <span key={def.id} className={cn(
                                    "px-1.5 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap",
                                    a < r ? "bg-red-100 text-red-600" : a > r ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600"
                                  )}>
                                    {def.name}: {a}/{r}
                                  </span>
                                );
                              })}
                            </div>
                          ) : dayRequired > 0 ? (
                            <span className={cn(
                              "inline-flex items-center justify-center mt-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold",
                              dayAssigned < dayRequired ? "bg-red-100 text-red-600" :
                              dayAssigned > dayRequired ? "bg-blue-100 text-blue-600" :
                              "bg-emerald-100 text-emerald-600"
                            )}>
                              {dayAssigned}/{dayRequired}
                            </span>
                          ) : dayAssigned > 0 ? (
                            <span className="inline-flex items-center justify-center mt-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-500">
                              {dayAssigned}
                            </span>
                          ) : null}
                        </th>
                      );
                    })}
                    <th className="text-center py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-16">
                      Saat
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredPersonnel.length === 0 && personnelFilter && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-sm text-slate-400">
                        &ldquo;{personnelFilter}&rdquo; ile eşleşen personel bulunamadı.
                      </td>
                    </tr>
                  )}
                  {tableRows.map(row => {
                    if (row.kind === 'header') {
                      return (
                        <tr key={`dept-${row.dept.id}`} className="bg-slate-100/70 border-t-2 border-slate-200">
                          <td colSpan={9} className="py-2 px-4">
                            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{row.dept.name}</span>
                          </td>
                        </tr>
                      );
                    }
                    const p = row.person;
                    const ps = personScores.find(s => s.id === p.id);
                    const weekPoints = ps ? ps.score - (p.prev_score || 0) : 0;
                    const totalHours = Object.entries(cellMap)
                      .filter(([k]) => k.startsWith(`${p.id}-`))
                      .reduce((sum, [, v]) => sum + (v.endMin - v.startMin) / 60, 0);
                    const personMaxHours = p.max_weekly_hours ?? 45;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/40 transition-colors">
                        {/* Personnel column */}
                        <td className="py-3 px-4 group/row">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-600 font-bold text-xs flex items-center justify-center shrink-0">
                              {p.name.charAt(0)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-slate-800 truncate max-w-[80px]">{p.name}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="h-1.5 w-14 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={cn("h-full rounded-full transition-all duration-300", ps ? scoreColor(ps.score, maxScore) : "bg-slate-200")}
                                    style={{ width: `${ps ? Math.min(100, (ps.score / maxScore) * 100) : 0}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-slate-400 font-medium">{Math.round(weekPoints * 10) / 10}p</span>
                              </div>
                            </div>
                            {/* Satır hızlı işlemleri — hover'da görünür */}
                            <div className="hidden group-hover/row:flex items-center gap-0.5 shrink-0">
                              <button
                                onClick={e => { e.stopPropagation(); fillPersonRow(p.id); }}
                                title="Müsait tüm günleri doldur"
                                className="p-1 rounded-md text-emerald-500 hover:bg-emerald-50 transition-colors"
                              >
                                <CalendarCheck size={12} />
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); clearPersonRow(p.id); }}
                                title="Tüm vardiyaları temizle"
                                className="p-1 rounded-md text-red-400 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* Day cells */}
                        {Array.from({ length: 7 }, (_, day) => {
                          const key         = `${p.id}-${day}`;
                          const cell        = cellMap[key];
                          const avail       = availMap[p.id]?.[day];
                          const noAvailData = !availMap[p.id];
                          const matchedDef  = cell ? matchShiftDef(cell.startMin, cell.endMin, shiftDefs) : null;
                          const isUnavail   = avail?.status === "unavailable";
                          const isPrefNot   = avail?.status === "preferred_not";
                          const isWeeklyOff = p.weekly_off_day !== null && p.weekly_off_day !== undefined && Number(p.weekly_off_day) === day;
                          return (
                            <DroppableCell
                              key={day}
                              id={key}
                              disabled={isWeeklyOff}
                              className={cn(
                                "py-2 px-1.5 text-center group transition-colors",
                                isWeeklyOff ? "bg-amber-50/60 cursor-not-allowed" : "cursor-pointer",
                                !isWeeklyOff && (avail ? AVAIL_BG[avail.status] : "bg-white"),
                              )}
                              onClick={isWeeklyOff ? undefined : e => handleCellClick(e, p.id, day)}
                            >
                              {cell ? (
                                // ─── Vardiya atanmış ───────────────────────────────
                                <DraggableShift id={key}>
                                <div className={cn(
                                  "relative inline-flex flex-col items-center px-2 py-1.5 rounded-lg text-xs font-bold leading-tight transition-colors",
                                  isUnavail
                                    ? "bg-red-100 text-red-700 group-hover:bg-red-200 ring-1 ring-red-200"
                                    : "bg-violet-100 text-violet-700 group-hover:bg-violet-200"
                                )}>
                                  {matchedDef ? (
                                    <>
                                      <span>{matchedDef.name}</span>
                                      <span className="text-[10px] font-normal opacity-60">{minToHHMM(cell.startMin)}–{minToHHMM(cell.endMin, cell.endMin >= 1440)}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span>{minToHHMM(cell.startMin)}</span>
                                      <span className="text-[10px] font-normal opacity-70">{minToHHMM(cell.endMin, cell.endMin >= 1440)}</span>
                                    </>
                                  )}
                                  {/* Müsaitlik uyarı rozeti — unavailable veya preferred_not günde atama */}
                                  {(isUnavail || isPrefNot) && (
                                    <span className={cn(
                                      "absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-black text-white",
                                      isUnavail ? "bg-red-500" : "bg-amber-400"
                                    )}>!</span>
                                  )}
                                </div>
                                </DraggableShift>
                              ) : noAvailData ? (
                                // ─── Müsaitlik bilgisi yok ─────────────────────────
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-slate-300 group-hover:bg-slate-100 group-hover:text-slate-500 transition-colors text-xs font-bold">
                                  ?
                                </span>
                              ) : isUnavail ? (
                                // ─── Kesinlikle gelemez (izin veya haftalık off) ────
                                <div className={cn(
                                  "inline-flex items-center justify-center px-2.5 py-1 rounded-md text-[10px] font-semibold select-none",
                                  isWeeklyOff ? "bg-amber-100 text-amber-600" : "bg-red-100 text-red-400"
                                )}>
                                  {isWeeklyOff ? "İzin Günü" : "İzin"}
                                </div>
                              ) : isPrefNot ? (
                                // ─── Tercih etmiyor ────────────────────────────────
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-amber-300 group-hover:bg-amber-100 group-hover:text-amber-500 transition-colors">
                                    <Plus size={12} />
                                  </span>
                                  {avail?.start && avail?.end && (
                                    <span className="text-[9px] text-amber-500 font-semibold leading-tight whitespace-nowrap">
                                      {normTime(avail.start)}–{normTime(avail.end)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                // ─── Müsait ────────────────────────────────────────
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-slate-200 group-hover:bg-violet-100 group-hover:text-violet-400 transition-colors">
                                    <Plus size={12} />
                                  </span>
                                  {avail?.start && avail?.end && (
                                    <span className="text-[9px] text-emerald-500 font-semibold leading-tight whitespace-nowrap">
                                      {normTime(avail.start)}–{normTime(avail.end)}
                                    </span>
                                  )}
                                </div>
                              )}
                            </DroppableCell>
                          );
                        })}

                        {/* Weekly hours */}
                        <td className="py-3 px-3 text-center">
                          <span className={cn(
                            "text-xs font-bold px-2 py-1 rounded-md transition-colors",
                            totalHours > personMaxHours ? "bg-red-100 text-red-700 ring-1 ring-red-300" : totalHours > personMaxHours * 0.9 ? "bg-amber-100 text-amber-700 ring-1 ring-amber-300" : totalHours > 0 ? "text-slate-600" : "text-slate-300"
                          )}
                          title={`Limit: ${personMaxHours}s`}
                          >
                            {totalHours > 0 ? `${Math.round(totalHours * 10) / 10}s` : "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {/* ── Legend ── */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
          <span className="font-semibold text-slate-600">Lejant:</span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200" />Müsait
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-50 border border-amber-200" />Tercih etmiyor
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-red-50 border border-red-200" />
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-red-100 text-red-400 text-[9px] font-semibold">İzin</span>
            Gelemez
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-4 rounded flex items-center justify-center bg-violet-100 text-violet-700 text-[9px] font-bold">
              <span className="relative"><span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full text-[6px] text-white flex items-center justify-center">!</span>S</span>
            </span>
            Kısıt ihlali
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-4 rounded bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 text-[9px] font-bold">?</span>
            Müsaitlik yok
          </span>
          <span className="ml-auto text-slate-400">
            Hücreye tıkla → vardiya ekle / düzenle
          </span>
        </div>
      </div>

      {/* ── Adalet Dağılımı çekmecesi (sağdan kayar, tüm view mode'larda çalışır) ── */}
      {fairnessOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setFairnessOpen(false)}
        />
      )}
      <div className={cn(
        "fixed top-0 right-0 h-full w-72 bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col transition-transform duration-300",
        fairnessOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <BarChart2 size={15} className="text-indigo-500" />
            <h2 className="text-sm font-bold text-slate-800">Adalet Dağılımı</h2>
          </div>
          <button
            onClick={() => setFairnessOpen(false)}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
          >
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {personScores.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Personel yok</p>
          ) : (
            <div className="space-y-3.5">
              {[...personScores]
                .sort((a, b) => b.score - a.score)
                .map(s => (
                  <div key={s.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-700 truncate max-w-[160px]">{s.name}</span>
                      <span className="text-xs font-bold text-slate-400 tabular-nums">{Math.round(s.score * 10) / 10}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-300", scoreColor(s.score, maxScore))}
                        style={{ width: `${(s.score / maxScore) * 100}%` }}
                      />
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

      {/* ── Cell popover (fixed position) ── */}
      {popover && (
        <div
          data-popover
          className="fixed z-50 bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 w-[calc(100vw-2rem)] max-w-[288px] sm:w-72"
          style={{ left: Math.min(popover.x, window.innerWidth - 320), top: popover.y }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-bold text-slate-800">{popoverPerson?.name}</p>
              <p className="text-xs text-slate-400">{DAYS[popover.day]}, {dates[popover.day]}</p>
            </div>
            <button
              onClick={() => setPopover(null)}
              className="text-slate-400 hover:text-slate-600 transition-colors p-1"
            >
              <X size={15} />
            </button>
          </div>

          {/* Vardiya şablonu hızlı seçim */}
          {shiftDefs.length === 0 && (
            <div className="mb-3 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex items-center gap-2">
              <BookOpen size={13} className="text-amber-500 shrink-0" />
              <p className="text-[11px] text-amber-700">
                Şablon yok.{" "}
                <a href="/settings" className="font-bold underline" onClick={() => setPopover(null)}>
                  Ayarlar'dan ekle
                </a>
              </p>
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
                      className={cn(
                        "text-xs px-2.5 py-1 rounded-lg font-semibold border transition-colors",
                        isActive
                          ? "bg-violet-600 text-white border-violet-600"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700"
                      )}
                    >
                      {def.name}
                      <span className="ml-1 opacity-60 font-normal">{def.start}–{def.end}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Slider */}
          <TimeRangeSlider
            startMin={popover.startMin}
            endMin={popover.endMin}
            step={15}
            trackMin={0}
            trackMax={1800}
            onChange={(s, e) =>
              setPopover(prev => prev ? { ...prev, startMin: s, endMin: e } : null)
            }
          />

          {/* Summary */}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800">
              {minToHHMM(popover.startMin)} – {minToHHMM(popover.endMin, popover.endMin >= 1440)}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              {popoverHours} saat · {popoverPoints} puan
            </span>
          </div>

          {/* Bonus badges */}
          {(popover.day === 5 || popover.day === 6 || popover.endMin > 22 * 60) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(popover.day === 5 || popover.day === 6) && (
                <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-semibold border border-amber-100">
                  Hf. sonu ×1.5
                </span>
              )}
              {popover.endMin > 22 * 60 && popover.endMin < 1440 && (
                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-semibold border border-indigo-100">
                  Gece +2 bonus
                </span>
              )}
              {popover.endMin >= 1440 && (
                <span className="text-[10px] bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full font-semibold border border-violet-100">
                  🌙 Gece geçişi +2 bonus
                </span>
              )}
            </div>
          )}

          {/* Anlık kural uyarıları */}
          {popoverWarnings.length > 0 && (
            <div className="mt-2 space-y-1">
              {popoverWarnings.map((w, i) => (
                <div key={i} className={cn(
                  "flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium",
                  w.type === 'error' ? "bg-red-50 text-red-700 border border-red-100" : "bg-amber-50 text-amber-700 border border-amber-100"
                )}>
                  <AlertCircle size={11} className="mt-0.5 shrink-0" />
                  {w.msg}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-4">
            {hasExisting && (
              <button
                onClick={handlePopoverDelete}
                className="flex-1 py-2 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors"
              >
                Sil
              </button>
            )}
            <button
              onClick={handlePopoverSave}
              className="flex-1 py-2 text-sm font-bold text-white bg-primary rounded-xl hover:opacity-90 transition-opacity"
            >
              Kaydet
            </button>
          </div>
        </div>
      )}
      </>)}
    </div>
      <DragOverlay>
        {activeDragData?.type === "person" || activeDragData?.type === "assigned" ? (
          <div className="p-2.5 bg-white border-2 border-indigo-500 rounded-xl shadow-xl opacity-90 scale-105 pointer-events-none text-xs font-bold w-48 z-[9999]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 text-sm">
                {activeDragData.person?.name.charAt(0)}
              </div>
              <span className="text-slate-800 flex-1 truncate">{activeDragData.person?.name}</span>
            </div>
          </div>
        ) : activeDragData?.type === "grid" ? (
          <div className="p-2 px-3 bg-white border-2 border-indigo-500 rounded-lg shadow-xl opacity-90 scale-105 text-xs font-bold z-[9999]">
            Taşınıyor...
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
