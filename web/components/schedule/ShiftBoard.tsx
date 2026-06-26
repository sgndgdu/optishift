"use client";
import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Search, X, Clock } from "lucide-react";
import type { ShiftDefinition, LocationEvent } from "@/lib/types";
import { TURKISH_HOLIDAYS } from "@/lib/holidays";

// ─── Types ───────────────────────────────────────────────────────────────────
type CellMap  = Record<string, { startMin: number; endMin: number; points?: number }>;
type AvailMap = Record<string, Record<number, { status: string; start?: string | null; end?: string | null }>>;
type WeekAvailDay = { status: string; start?: string | null; end?: string | null };

const DAYS     = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const DAY_SHORT = ["Pt", "Sl", "Çr", "Pr", "Cm", "Ct", "Pz"];

function hm(t?: string | null) { return t ? t.slice(0, 5) : ""; }
function segColor(s: string) {
  return s === "unavailable" ? "bg-red-400" : s === "preferred_not" ? "bg-amber-400" : "bg-emerald-400";
}

// ─── Avatar ──────────────────────────────────────────────────────────────────
function Avatar({ name, size = 7 }: { name: string; size?: number }) {
  return (
    <div className={cn(
      "rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0",
      `w-${size} h-${size}`
    )}>
      {name.charAt(0)}
    </div>
  );
}

// ─── Coverage Badge ───────────────────────────────────────────────────────────
function CoverageBadge({ current, required }: { current: number; required: number }) {
  if (required === 0) return null;
  const cls =
    current < required  ? "bg-red-100 text-red-600 border-red-200" :
    current > required  ? "bg-amber-100 text-amber-600 border-amber-200" :
                          "bg-emerald-100 text-emerald-700 border-emerald-200";
  return (
    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border leading-none", cls)}>
      {current}/{required}
    </span>
  );
}

// ─── Draggable Personnel Card ─────────────────────────────────────────────────
export function DraggablePersonnelCard({ person, disabled, isWeeklyOff, availDay, weekAvail }: {
  person: any;
  disabled?: boolean;
  isWeeklyOff?: boolean;
  availDay?: { status: string; start?: string | null; end?: string | null } | null;
  weekAvail?: Record<number, WeekAvailDay> | null;
}) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: `person-${person.id}`,
    disabled: disabled || isWeeklyOff,
    data: { type: "person", personId: person.id },
  });

  const borderCls =
    isWeeklyOff                          ? "border-amber-300 bg-amber-50/60" :
    availDay?.status === "unavailable"   ? "border-red-200 bg-red-50/40" :
    availDay?.status === "preferred_not" ? "border-amber-200 bg-amber-50/30" :
    "border-slate-200 bg-white";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      className={cn(
        "px-3 py-2 border rounded-xl shadow-sm transition-all select-none",
        isDragging ? "opacity-60 scale-105 shadow-lg z-50" : "hover:border-indigo-300 hover:shadow-sm",
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
        borderCls,
      )}
    >
      {/* Name row */}
      <div className="flex items-center gap-2">
        <Avatar name={person.name} size={7} />
        <span className="flex-1 text-sm font-semibold text-slate-800 truncate">{person.name}</span>
        <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
          {person.max_weekly_hours ?? 45}s
        </span>
      </div>

      {/* Specific-day availability */}
      {availDay !== undefined && (
        <div className="mt-1 pl-9 text-[11px] leading-tight">
          {isWeeklyOff && <span className="text-amber-600 font-semibold">İzin günü</span>}
          {!isWeeklyOff && availDay === null && (
            <span className="text-slate-400">Müsaitlik girilmedi</span>
          )}
          {!isWeeklyOff && availDay?.status === "unavailable" && (
            <span className="text-red-500 font-semibold">Gelemiyor</span>
          )}
          {!isWeeklyOff && availDay?.status === "preferred_not" && (
            <span className="text-amber-600">
              Tercih etmiyor{availDay.start ? ` · ${hm(availDay.start)}–${hm(availDay.end)}` : ""}
            </span>
          )}
          {!isWeeklyOff && availDay?.status === "available" && (
            <span className="text-emerald-600">
              {availDay.start ? `${hm(availDay.start)}–${hm(availDay.end)}` : "Müsait"}
            </span>
          )}
        </div>
      )}

      {/* Week availability bar + özet */}
      {weekAvail !== undefined && (
        <div className="mt-2 pl-9">
          {weekAvail === null ? (
            <span className="text-[11px] text-slate-400">Müsaitlik girilmedi</span>
          ) : (() => {
            const days = [0,1,2,3,4,5,6].map(i => {
              const d = weekAvail[i];
              return { st: d?.status ?? "available", start: hm(d?.start), end: hm(d?.end), i };
            });
            const unavail  = days.filter(d => d.st === "unavailable");
            const prefNot  = days.filter(d => d.st === "preferred_not");
            const avail    = days.filter(d => d.st === "available");
            // Müsait günlerin ortak saat aralığı
            const t0       = avail.find(d => d.start);
            const timeStr  = t0 ? `${t0.start}–${t0.end}` : "";
            const allSame  = timeStr && avail.every(d => d.start === t0!.start && d.end === t0!.end);
            // Özet satırı
            const parts: string[] = [];
            if (timeStr) parts.push(allSame ? timeStr : "Değişken saat");
            if (prefNot.length)  parts.push(`${prefNot.map(d => DAY_SHORT[d.i]).join(" ")} tercih etm.`);
            if (unavail.length)  parts.push(`${unavail.map(d => DAY_SHORT[d.i]).join(" ")} gelemiyor`);
            const summary = parts.join("  ·  ");
            return (
              <>
                {/* Renk şeridi — sadece durum rengi, saat yok */}
                <div className="flex gap-[3px]">
                  {days.map(d => (
                    <div key={d.i} className="flex-1 flex flex-col items-center gap-[1px]">
                      <span className="text-[8px] text-slate-400 leading-none">{DAY_SHORT[d.i]}</span>
                      <div className={cn("h-2 w-full rounded-sm", segColor(d.st))} />
                    </div>
                  ))}
                </div>
                {/* Tek satır özet */}
                {summary && (
                  <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">{summary}</p>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Assigned Chip (in grid cell) ────────────────────────────────────────────
export function DraggableAssignedCard({ person, day, shiftDef, forceStatus }: {
  person: any; day: number; shiftDef: ShiftDefinition; forceStatus?: string | null;
}) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: `assigned-${person.id}-${day}`,
    data: { type: "assigned", personId: person.id, sourceDay: day },
  });

  const isPending  = forceStatus === "pending";
  const isRejected = forceStatus === "rejected";

  const chipCls =
    isPending  ? "bg-amber-50 border-amber-300 text-amber-800" :
    isRejected ? "bg-red-50 border-red-200 text-red-600 opacity-70" :
                 "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium select-none transition-all cursor-grab active:cursor-grabbing",
        chipCls,
        isDragging && "opacity-60 scale-105 shadow-md z-50",
      )}
    >
      <div className="w-4 h-4 rounded-full bg-current/10 flex items-center justify-center text-[9px] font-bold shrink-0">
        {person.name.charAt(0)}
      </div>
      <span className="truncate flex-1">{person.name}</span>
      {isPending  && <span title="Zorunlu atama — onay bekleniyor" className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
      {isRejected && <X size={10} className="shrink-0" />}
    </div>
  );
}

// ─── Shift Slot (droppable) ───────────────────────────────────────────────────
export function DroppableShiftContainer({ id, children, name, timeRange, requiredCount, currentCount }: {
  id: string; children: React.ReactNode;
  name: string; timeRange: string;
  requiredCount: number; currentCount: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: "shiftSlot" } });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-xl border transition-all",
        isOver
          ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200"
          : "border-slate-200 bg-white hover:border-slate-300",
      )}
    >
      {/* Slot header */}
      <div className="flex items-center gap-2 px-2.5 py-2 border-b border-slate-100">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-700 truncate">{name}</p>
          <p className="text-[10px] text-slate-400 tabular-nums">{timeRange}</p>
        </div>
        <CoverageBadge current={currentCount} required={requiredCount} />
      </div>

      {/* Drop area */}
      <div className={cn(
        "p-1.5 min-h-[52px] flex flex-col gap-1",
        isOver && "bg-indigo-50/50"
      )}>
        {children}
        {currentCount === 0 && !isOver && (
          <div className="flex-1 flex items-center justify-center border border-dashed border-slate-200 rounded-lg text-[10px] text-slate-300 font-medium min-h-[36px]">
            Sürükle
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Unassign Drop Zone (sidebar) ─────────────────────────────────────────────
export function DroppableUnassignArea({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "unassigned", data: { type: "unassign" } });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative flex-1 flex flex-col gap-2 p-2 rounded-xl transition-colors overflow-y-auto",
        isOver && "bg-red-50"
      )}
    >
      {isOver && (
        <div className="absolute inset-0 z-40 bg-red-100/80 backdrop-blur-sm rounded-xl flex items-center justify-center border-2 border-dashed border-red-400">
          <p className="text-sm font-bold text-red-600">Vardiyadan Çıkar</p>
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Event / Holiday helpers ──────────────────────────────────────────────────
const EV_EMOJI: Record<string, string> = {
  kampanya: "🎯", etkinlik: "🎉", denetim: "📋", kapali: "🔒", diger: "📌",
};
const EV_CLS: Record<string, string> = {
  kampanya: "bg-purple-50 text-purple-700 border-purple-200",
  etkinlik: "bg-blue-50 text-blue-700 border-blue-200",
  denetim:  "bg-orange-50 text-orange-700 border-orange-200",
  kapali:   "bg-red-50 text-red-700 border-red-200",
  diger:    "bg-slate-100 text-slate-600 border-slate-200",
};
function eventCoversDate(ev: LocationEvent, iso: string) {
  if (ev.scope === "week") return false;
  if (ev.end_date) return iso >= ev.date && iso <= ev.end_date;
  return ev.date === iso;
}

// ─── Main ShiftBoard ──────────────────────────────────────────────────────────
export function ShiftBoard({
  personnel, shiftDefs, demandMatrix,
  cellMap, availMap, dates, isoDates, events, forceAssignMap, onRemoveShift,
}: {
  personnel: any[];
  shiftDefs: ShiftDefinition[];
  demandMatrix: Record<string, Record<number, number>>;
  cellMap: CellMap;
  availMap: AvailMap;
  dates: string[];
  isoDates?: string[];
  events?: LocationEvent[];
  forceAssignMap?: Record<string, { status: string; multiplier: number }>;
  onRemoveShift: (personId: string, day: number) => void;
}) {
  const [filter, setFilter]         = useState("");
  const [selectedDay, setSelectedDay] = useState<number | "all">("all");

  const filtered = personnel.filter(p =>
    p.name.toLowerCase().includes(filter.toLowerCase())
  );

  function personHours(pId: string) {
    return Object.entries(cellMap)
      .filter(([k]) => k.startsWith(`${pId}-`))
      .reduce((s, [, v]) => s + (v.endMin - v.startMin) / 60, 0);
  }

  return (
    <div className="flex h-[calc(100vh-180px)] min-h-[500px] gap-3">

      {/* ── LEFT: Personnel panel ── */}
      <div className="w-56 shrink-0 flex flex-col border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">

        {/* Panel header */}
        <div className="px-3 pt-3 pb-2 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Personel</p>
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Ara…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <select
            value={selectedDay}
            onChange={e => setSelectedDay(e.target.value === "all" ? "all" : parseInt(e.target.value))}
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer"
          >
            <option value="all">Tüm günler</option>
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>

        {/* Personnel list */}
        <DroppableUnassignArea>
          {filtered.map(p => {
            const hours       = personHours(p.id);
            const isWeeklyOff = p.weekly_off_day != null && selectedDay !== "all" && Number(p.weekly_off_day) === selectedDay;
            if (selectedDay !== "all" && cellMap[`${p.id}-${selectedDay}`]) return null;

            const availDay  = selectedDay !== "all" ? (availMap[p.id]?.[selectedDay as number] ?? null) : undefined;
            const weekAvail = selectedDay === "all" ? (availMap[p.id] ?? null) : undefined;

            return (
              <div key={p.id} className="relative">
                <DraggablePersonnelCard
                  person={p}
                  isWeeklyOff={isWeeklyOff}
                  availDay={availDay}
                  weekAvail={weekAvail}
                />
                {hours > 0 && (
                  <span className={cn(
                    "absolute -top-1 -right-1 z-10 text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-sm text-white",
                    hours > (p.max_weekly_hours ?? 45) ? "bg-red-500" : "bg-indigo-500"
                  )}>
                    {Math.round(hours)}s
                  </span>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-6">Personel bulunamadı</p>
          )}
        </DroppableUnassignArea>
      </div>

      {/* ── RIGHT: Schedule grid ── */}
      <div className="flex-1 border border-slate-200 rounded-2xl bg-slate-50/40 shadow-sm overflow-hidden">
        {shiftDefs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
            <Clock size={28} className="opacity-40" />
            <p className="text-sm font-semibold">Vardiya tanımı yok</p>
            <p className="text-xs">Ayarlar → Vardiyalar</p>
          </div>
        ) : (
          <div className="flex h-full overflow-x-auto overflow-y-auto">
            {DAYS.map((dayName, dayIdx) => {
              if (selectedDay !== "all" && selectedDay !== dayIdx) return null;

              const isoDate   = isoDates?.[dayIdx] ?? "";
              const holidays  = TURKISH_HOLIDAYS.filter(h => h.date === isoDate);
              const dayEvents = (events ?? []).filter(e => eventCoversDate(e, isoDate));
              const isHoliday = holidays.length > 0;

              return (
                <div
                  key={dayIdx}
                  className={cn(
                    "flex-1 min-w-[140px] max-w-[220px] flex flex-col border-r border-slate-200 last:border-r-0",
                  )}
                >
                  {/* Day header */}
                  <div className={cn(
                    "sticky top-0 z-20 px-3 py-2.5 border-b border-slate-200 bg-white",
                    isHoliday && "bg-red-50"
                  )}>
                    <p className={cn("text-sm font-bold text-center", isHoliday ? "text-red-600" : "text-slate-800")}>
                      {dayName}
                    </p>
                    <p className="text-[10px] text-slate-400 text-center tabular-nums">{dates[dayIdx]}</p>

                    {/* Holidays */}
                    {holidays.map(h => (
                      <div key={h.name} className="mt-1 text-[9px] bg-red-100 text-red-600 rounded px-1.5 py-0.5 text-center font-semibold truncate">
                        🎌 {h.name}
                      </div>
                    ))}
                    {/* Events */}
                    {dayEvents.map(ev => (
                      <div key={ev.id} className={cn("mt-1 text-[9px] rounded px-1.5 py-0.5 text-center font-semibold truncate border", EV_CLS[ev.type] ?? EV_CLS.diger)}>
                        {EV_EMOJI[ev.type] ?? "📌"} {ev.title}
                      </div>
                    ))}
                  </div>

                  {/* Shift slots */}
                  <div className="flex-1 flex flex-col gap-2 p-2 overflow-y-auto">
                    {shiftDefs.map(def => {
                      const required = demandMatrix[def.id]?.[dayIdx] ?? 0;
                      const defStart = def.start.split(":").reduce((h, m, i) => h + (i === 0 ? +m * 60 : +m), 0);
                      let defEnd = def.end.split(":").reduce((h, m, i) => h + (i === 0 ? +m * 60 : +m), 0);
                      if (defEnd < defStart) defEnd += 1440;

                      const assigned = personnel.filter(p => {
                        const c = cellMap[`${p.id}-${dayIdx}`];
                        return c && Math.abs(c.startMin - defStart) < 30 && Math.abs(c.endMin - defEnd) < 30;
                      });

                      return (
                        <DroppableShiftContainer
                          key={def.id}
                          id={`shift-${def.id}-${dayIdx}`}
                          name={def.name}
                          timeRange={`${def.start}–${def.end}`}
                          requiredCount={required}
                          currentCount={assigned.length}
                        >
                          {assigned.map(p => (
                            <div key={p.id} className="relative group/chip">
                              <DraggableAssignedCard
                                person={p}
                                day={dayIdx}
                                shiftDef={def}
                                forceStatus={forceAssignMap?.[`${p.id}-${dayIdx}`]?.status}
                              />
                              <button
                                onClick={() => onRemoveShift(p.id, dayIdx)}
                                className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover/chip:opacity-100 transition-opacity"
                              >
                                <X size={11} />
                              </button>
                            </div>
                          ))}
                        </DroppableShiftContainer>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
