"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useRef, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { X, Plus, Clock } from "lucide-react";
import type { Role, ShiftDefinition } from "@/lib/types";
import { ShiftTimeEditor } from "./ShiftTimeEditor";

interface Assignment {
  id: string;
  personnelId: string;
  day: number;
  shiftId: number;
  role_id?: string;
  start_time?: string;
  end_time?: string;
  points: number;
}

interface PersonData {
  id: string;
  name: string;
  roles: string[];
  skills?: string[];
  prev_score: number;
  availability?: Record<string, any>;
}

interface DragDropCalendarProps {
  assignments: Assignment[];
  personnel: PersonData[];
  shifts: ShiftDefinition[];
  weekDates: number[];
  rolesConfigs: Role[];
  onAssignmentsChange: (next: Assignment[]) => void;
}

const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const DAYS_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const WEEKEND = new Set([5, 6]);

const SHIFT_ACCENT = [
  { bar: "bg-amber-400",   light: "bg-amber-50",   text: "text-amber-800",  border: "border-amber-200"  },
  { bar: "bg-indigo-500",  light: "bg-indigo-50",  text: "text-indigo-800", border: "border-indigo-200" },
  { bar: "bg-sky-500",     light: "bg-sky-50",     text: "text-sky-800",    border: "border-sky-200"    },
  { bar: "bg-violet-500",  light: "bg-violet-50",  text: "text-violet-800", border: "border-violet-200" },
  { bar: "bg-teal-500",    light: "bg-teal-50",    text: "text-teal-800",   border: "border-teal-200"   },
];
function sa(i: number) { return SHIFT_ACCENT[i % SHIFT_ACCENT.length]; }

const ZONE_AVATAR = [
  { bg: "bg-rose-200",    text: "text-rose-900",    dot: "bg-rose-400"    },
  { bg: "bg-emerald-200", text: "text-emerald-900", dot: "bg-emerald-500" },
  { bg: "bg-amber-200",   text: "text-amber-900",   dot: "bg-amber-500"   },
  { bg: "bg-sky-200",     text: "text-sky-900",     dot: "bg-sky-500"     },
  { bg: "bg-violet-200",  text: "text-violet-900",  dot: "bg-violet-500"  },
  { bg: "bg-teal-200",    text: "text-teal-900",    dot: "bg-teal-500"    },
];
const DEFAULT_AVATAR = { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" };

const zoneIndexCache = new Map<string, number>();
let zoneCounter = 0;
function avatarColor(zone: string | null) {
  if (!zone) return DEFAULT_AVATAR;
  if (!zoneIndexCache.has(zone)) {
    zoneIndexCache.set(zone, zoneCounter % ZONE_AVATAR.length);
    zoneCounter++;
  }
  return ZONE_AVATAR[zoneIndexCache.get(zone)!];
}

function primaryZone(p: PersonData): string | null {
  return p.skills?.[0] || p.roles?.[0] || null;
}

function getAvail(p: PersonData, day: number): "available" | "preferred_not" | "unavailable" {
  if (!p.availability) return "available";
  const v = p.availability[day];
  if (!v) return "available";
  if (typeof v === "object") {
    const vals = Object.values(v) as string[];
    if (vals.includes("unavailable")) return "unavailable";
    if (vals.includes("preferred_not")) return "preferred_not";
    return "available";
  }
  return v as "available" | "preferred_not" | "unavailable";
}

// ── Draggable person badge ────────────────────────────────────────────────────
function PersonBadge({
  assignment,
  person,
  onRemove,
  onEditTime,
}: {
  assignment: Assignment;
  person: PersonData;
  onRemove: () => void;
  onEditTime: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: assignment.id,
    data: {
      personnelId: assignment.personnelId,
      day: assignment.day,
      shiftId: assignment.shiftId,
      assignmentId: assignment.id,
    },
  });

  const initials = person.name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
  const ac = avatarColor(primaryZone(person));
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.25 : 1 };

  const hasCustomTime = assignment.start_time && assignment.end_time;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`group flex items-start gap-1.5 px-2 py-1.5 bg-white border border-slate-200 rounded-lg cursor-grab select-none transition-shadow
        ${isDragging ? "" : "hover:border-slate-300 hover:shadow-sm"}`}
    >
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-px ${ac.bg} ${ac.text}`}>
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[12px] font-semibold text-slate-800 leading-none block">
          {person.name.split(" ")[0]}
        </span>
        {/* Saat — tıklayarak düzenle */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onEditTime(); }}
          className="flex items-center gap-0.5 mt-0.5 text-[10px] font-semibold leading-none transition-colors
            text-slate-400 hover:text-primary group-hover:text-primary/70"
          title="Saatleri düzenle"
        >
          <Clock size={9} />
          {hasCustomTime
            ? `${assignment.start_time}–${assignment.end_time}`
            : "saat ekle"}
        </button>
      </div>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="mt-px opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-opacity shrink-0"
        title="Kaldır"
      >
        <X size={10} />
      </button>
    </div>
  );
}

// ── Add-person popover ────────────────────────────────────────────────────────
function AddPersonPopover({
  day,
  personnel,
  assignments,
  onAdd,
  onClose,
}: {
  day: number;
  personnel: PersonData[];
  assignments: Assignment[];
  onAdd: (personId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [onClose]);

  const assignedThisDay = new Set(assignments.filter((a) => a.day === day).map((a) => a.personnelId));
  const available = personnel.filter((p) => !assignedThisDay.has(p.id));

  if (available.length === 0) {
    return (
      <div ref={ref} className="absolute z-30 top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 p-3 min-w-[160px]">
        <p className="text-xs text-slate-400 text-center">Tüm personel bu gün atandı.</p>
      </div>
    );
  }

  return (
    <div ref={ref} className="absolute z-30 top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 min-w-[172px]">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide px-2 py-1">
        {DAYS[day]} — Personel Ekle
      </div>
      {available.map((p) => {
        const avail = getAvail(p, day);
        return (
          <button
            key={p.id}
            onClick={() => { onAdd(p.id); onClose(); }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors text-left"
          >
            {(() => {
              const ac = avatarColor(primaryZone(p));
              return (
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${ac.bg} ${ac.text}`}>
                  {p.name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()}
                </div>
              );
            })()}
            <span className="text-xs font-semibold text-slate-700 flex-1">{p.name.split(" ")[0]}</span>
            {primaryZone(p) && <span className="text-[10px] text-slate-400">{primaryZone(p)}</span>}
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0
                ${avail === "unavailable" ? "bg-rose-400" : avail === "preferred_not" ? "bg-amber-400" : "bg-emerald-400"}`}
              title={avail === "unavailable" ? "Gelemez" : avail === "preferred_not" ? "Tercih etmiyor" : "Müsait"}
            />
          </button>
        );
      })}
    </div>
  );
}

// ── Droppable shift cell ───────────────────────────────────────────────────────
function ShiftCell({
  shiftId,
  day,
  cellAssignments,
  personnel,
  allAssignments,
  onAdd,
  onRemove,
  onEditTime,
}: {
  shiftId: number;
  day: number;
  cellAssignments: Assignment[];
  personnel: PersonData[];
  allAssignments: Assignment[];
  onAdd: (personId: string) => void;
  onRemove: (assignmentId: string) => void;
  onEditTime: (assignmentId: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const { isOver, setNodeRef } = useDroppable({
    id: `cell-${shiftId}-${day}`,
    data: { shiftId, day },
  });

  const zoneMap = new Map<string, Assignment[]>();
  const unzoned: Assignment[] = [];
  for (const a of cellAssignments) {
    const p = personnel.find((x) => x.id === a.personnelId);
    const z = p ? primaryZone(p) : null;
    if (z) {
      if (!zoneMap.has(z)) zoneMap.set(z, []);
      zoneMap.get(z)!.push(a);
    } else {
      unzoned.push(a);
    }
  }
  const hasZones = zoneMap.size > 0;

  return (
    <div
      ref={setNodeRef}
      className={`relative flex-1 min-h-[80px] p-2 border-r border-slate-100 last:border-0 flex flex-col gap-1.5
        ${isOver ? "bg-indigo-50/60 ring-1 ring-inset ring-indigo-300" : ""}`}
    >
      {hasZones ? (
        <>
          {Array.from(zoneMap.entries()).map(([zone, asgns]) => {
            const ac = avatarColor(zone);
            return (
              <div key={zone} className="flex flex-col gap-1">
                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md w-fit ${ac.bg}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ac.dot}`} />
                  <span className={`text-[9px] font-extrabold uppercase tracking-widest ${ac.text}`}>{zone}</span>
                </div>
                {asgns.map((a) => {
                  const p = personnel.find((x) => x.id === a.personnelId);
                  if (!p) return null;
                  return (
                    <PersonBadge
                      key={a.id}
                      assignment={a}
                      person={p}
                      onRemove={() => onRemove(a.id)}
                      onEditTime={() => onEditTime(a.id)}
                    />
                  );
                })}
              </div>
            );
          })}
          {unzoned.map((a) => {
            const p = personnel.find((x) => x.id === a.personnelId);
            if (!p) return null;
            return (
              <PersonBadge
                key={a.id}
                assignment={a}
                person={p}
                onRemove={() => onRemove(a.id)}
                onEditTime={() => onEditTime(a.id)}
              />
            );
          })}
        </>
      ) : (
        cellAssignments.map((a) => {
          const p = personnel.find((x) => x.id === a.personnelId);
          if (!p) return null;
          return (
            <PersonBadge
              key={a.id}
              assignment={a}
              person={p}
              onRemove={() => onRemove(a.id)}
              onEditTime={() => onEditTime(a.id)}
            />
          );
        })
      )}

      <button
        onClick={() => setShowPicker((v) => !v)}
        className="mt-auto flex items-center gap-1 text-[10px] text-slate-300 hover:text-indigo-500 transition-colors self-start pt-0.5"
      >
        <Plus size={11} />
        <span className="font-medium">Ekle</span>
      </button>

      {showPicker && (
        <AddPersonPopover
          day={day}
          personnel={personnel}
          assignments={allAssignments}
          onAdd={onAdd}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// ── Shift row ─────────────────────────────────────────────────────────────────
function ShiftRow({
  shiftIdx,
  shift,
  assignments,
  personnel,
  allAssignments,
  onAdd,
  onRemove,
  onEditTime,
}: {
  shiftIdx: number;
  shift: ShiftDefinition;
  assignments: Assignment[];
  personnel: PersonData[];
  allAssignments: Assignment[];
  onAdd: (personId: string, day: number) => void;
  onRemove: (assignmentId: string) => void;
  onEditTime: (assignmentId: string) => void;
}) {
  const accent = sa(shiftIdx);

  return (
    <div className="flex border-b border-slate-100 last:border-0">
      <div className={`w-[120px] shrink-0 border-r border-slate-200 flex flex-col justify-center px-4 py-3 gap-0.5 ${accent.light}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${accent.bar}`} />
          <span className="text-[12px] font-bold text-slate-800">{shift.name}</span>
        </div>
        <span className="text-[10px] text-slate-500 pl-4">{shift.start}–{shift.end}</span>
      </div>

      {[0, 1, 2, 3, 4, 5, 6].map((day) => (
        <ShiftCell
          key={day}
          shiftId={shiftIdx}
          day={day}
          cellAssignments={assignments.filter((a) => a.day === day && a.shiftId === shiftIdx)}
          personnel={personnel}
          allAssignments={allAssignments}
          onAdd={(personId) => onAdd(personId, day)}
          onRemove={onRemove}
          onEditTime={onEditTime}
        />
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function DragDropCalendar({
  assignments,
  personnel,
  shifts,
  weekDates,
  rolesConfigs: _,
  onAssignmentsChange,
}: DragDropCalendarProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Time editor state
  const [timeEditor, setTimeEditor] = useState<{
    assignmentId: string;
    isNew: boolean;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const onDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const ad = active.data.current;
    const od = over.data.current;
    if (!ad || !od) return;

    const { personnelId, day: srcDay, shiftId: srcShift, assignmentId } = ad;
    const { shiftId: dstShift, day: dstDay } = od;

    if (srcDay === dstDay && srcShift === dstShift) return;

    let next = assignments.filter((a) => a.id !== assignmentId);

    const clash = assignments.find(
      (a) => a.personnelId === personnelId && a.day === dstDay && a.shiftId === dstShift
    );
    if (clash) {
      next = next.filter((a) => a.id !== clash.id);
      next.push({ ...clash, id: `a-${Date.now()}-0`, day: srcDay, shiftId: srcShift });
    }

    const newId = `a-${Date.now()}-1`;
    const srcAssignment = assignments.find((a) => a.id === assignmentId);
    next.push({
      id: newId,
      personnelId,
      day: dstDay,
      shiftId: dstShift,
      start_time: srcAssignment?.start_time,
      end_time: srcAssignment?.end_time,
      points: 5,
    });
    onAssignmentsChange(next);

    // Open time editor for the moved assignment
    setTimeEditor({ assignmentId: newId, isNew: false });
  };

  const handleAdd = (personId: string, day: number, shiftIdx: number) => {
    const newId = `a-${Date.now()}`;
    const shift = shifts[shiftIdx];
    const next = assignments.filter((a) => !(a.personnelId === personId && a.day === day));
    next.push({
      id: newId,
      personnelId: personId,
      day,
      shiftId: shiftIdx,
      start_time: shift?.start,
      end_time: shift?.end,
      points: 5,
    });
    onAssignmentsChange(next);
    // Open editor immediately
    setTimeEditor({ assignmentId: newId, isNew: true });
  };

  const handleRemove = (assignmentId: string) => {
    onAssignmentsChange(assignments.filter((a) => a.id !== assignmentId));
  };

  const handleEditTime = (assignmentId: string) => {
    setTimeEditor({ assignmentId, isNew: false });
  };

  const handleTimeConfirm = (startTime: string, endTime: string) => {
    if (!timeEditor) return;
    onAssignmentsChange(
      assignments.map((a) =>
        a.id === timeEditor.assignmentId
          ? { ...a, start_time: startTime, end_time: endTime }
          : a
      )
    );
    setTimeEditor(null);
  };

  const handleTimeCancel = () => {
    if (!timeEditor) return;
    if (timeEditor.isNew) {
      // Remove the just-added assignment
      onAssignmentsChange(assignments.filter((a) => a.id !== timeEditor.assignmentId));
    }
    setTimeEditor(null);
  };

  // Resolve editing assignment for ShiftTimeEditor
  const editingAssignment = timeEditor
    ? assignments.find((a) => a.id === timeEditor.assignmentId)
    : null;
  const editingPerson = editingAssignment
    ? personnel.find((p) => p.id === editingAssignment.personnelId)
    : null;

  const activeDrag = activeId ? assignments.find((a) => a.id === activeId) : null;
  const activePerson = activeDrag ? personnel.find((p) => p.id === activeDrag.personnelId) : null;

  if (!shifts.length) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center text-sm text-slate-400">
        Vardiya tanımlanmamış.{" "}
        <a href="/settings" className="text-primary font-bold hover:underline">
          Ayarlar sayfasından
        </a>{" "}
        vardiya ekleyin.
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
          <div className="bg-white rounded-2xl min-w-[780px]">
            {/* Column header */}
            <div className="flex border-b-2 border-slate-200 rounded-t-2xl overflow-hidden bg-white">
              <div className="w-[120px] shrink-0 border-r border-slate-200 bg-slate-50 flex items-end px-4 py-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vardiya</span>
              </div>
              {DAYS_SHORT.map((d, i) => {
                const count = assignments.filter((a) => a.day === i).length;
                const isWE = WEEKEND.has(i);
                return (
                  <div
                    key={d}
                    className={`flex-1 py-3 text-center border-r border-slate-100 last:border-0 ${isWE ? "bg-slate-50/80" : ""}`}
                  >
                    <div className={`text-[12px] font-extrabold ${isWE ? "text-indigo-600" : "text-slate-700"}`}>{d}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{weekDates[i] ?? i + 1}</div>
                    <div className="mt-1.5 h-[18px] flex items-center justify-center">
                      {count > 0 ? (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                          ${isWE ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {count}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-200">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Shift rows */}
            {shifts.map((shift, si) => (
              <ShiftRow
                key={shift.id}
                shiftIdx={si}
                shift={shift}
                assignments={assignments.filter((a) => a.shiftId === si)}
                personnel={personnel}
                allAssignments={assignments}
                onAdd={(personId, day) => handleAdd(personId, day, si)}
                onRemove={handleRemove}
                onEditTime={handleEditTime}
              />
            ))}

            {/* Footer */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 border-t border-slate-100 rounded-b-2xl bg-slate-50/60 overflow-hidden">
              {Array.from(
                new Set(
                  personnel
                    .flatMap((p) => (p.skills?.length ? p.skills : p.roles ?? []))
                    .filter(Boolean)
                )
              ).map((zone) => {
                const ac = avatarColor(zone);
                return (
                  <span key={zone} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                    <span className={`w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center ${ac.bg} ${ac.text}`}>
                      {zone.charAt(0).toUpperCase()}
                    </span>
                    {zone}
                  </span>
                );
              })}
              <div className="ml-auto flex items-center gap-4 text-[10px] text-slate-400">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block" /> Gelemez</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Tercih etmiyor</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Müsait</span>
              </div>
            </div>
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activePerson && activeDrag
            ? (() => {
                const ac = avatarColor(primaryZone(activePerson));
                return (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-white border-2 border-indigo-300 rounded-xl shadow-2xl cursor-grabbing rotate-2">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${ac.bg} ${ac.text}`}>
                      {activePerson.name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()}
                    </div>
                    <span className="text-xs font-bold text-slate-800">{activePerson.name.split(" ")[0]}</span>
                  </div>
                );
              })()
            : null}
        </DragOverlay>
      </DndContext>

      {/* Time Editor Modal */}
      {timeEditor && editingAssignment && editingPerson && (
        <ShiftTimeEditor
          personName={editingPerson.name}
          dayLabel={`${DAYS[editingAssignment.day]}`}
          initialStart={editingAssignment.start_time || shifts[editingAssignment.shiftId]?.start || "09:00"}
          initialEnd={editingAssignment.end_time || shifts[editingAssignment.shiftId]?.end || "17:00"}
          shiftTemplates={shifts}
          onConfirm={handleTimeConfirm}
          onCancel={handleTimeCancel}
        />
      )}
    </>
  );
}
