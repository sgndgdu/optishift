import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Search, Plus, CalendarCheck, Clock, X } from "lucide-react";
import type { ShiftDefinition } from "@/lib/types";

// Types
type CellMap = Record<string, { startMin: number; endMin: number; points?: number }>;
type AvailMap = Record<string, Record<number, { status: string; start?: string | null; end?: string | null }>>;

const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const AVAIL_BG = { available: "bg-emerald-50", unavailable: "bg-red-50", preferred_not: "bg-amber-50" };

// Draggable Personnel Card (in sidebar)
export function DraggablePersonnelCard({ person, disabled, isWeeklyOff }: { person: any, disabled?: boolean, isWeeklyOff?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: `person-${person.id}`,
    disabled: disabled || isWeeklyOff,
    data: { type: "person", personId: person.id }
  });

  const style = { transform: CSS.Translate.toString(transform) };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "relative p-3 bg-white border border-slate-200 rounded-xl shadow-sm transition-all select-none z-10",
        isDragging ? "opacity-70 scale-105 drop-shadow-md z-50" : "hover:border-indigo-300",
        disabled ? "opacity-50 cursor-not-allowed bg-slate-50" : "cursor-grab active:cursor-grabbing",
        isWeeklyOff && "bg-amber-50 border-amber-200"
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
          {person.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{person.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">
              Limit: {person.max_weekly_hours ?? 45}s
            </span>
            {isWeeklyOff && <span className="text-[10px] text-amber-600 font-bold">İzin Günü</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// Draggable Assigned Card (in the board)
export function DraggableAssignedCard({ person, day, shiftDef }: { person: any, day: number, shiftDef: ShiftDefinition }) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: `assigned-${person.id}-${day}`,
    data: { type: "assigned", personId: person.id, sourceDay: day }
  });

  const style = { transform: CSS.Translate.toString(transform) };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "relative px-2 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-700 shadow-sm transition-all select-none z-10 cursor-grab active:cursor-grabbing flex items-center gap-2 group/card",
        isDragging ? "opacity-70 scale-105 drop-shadow-md z-50" : "hover:bg-indigo-100"
      )}
    >
      <div className="flex-1 truncate">{person.name}</div>
    </div>
  );
}

// Droppable Shift Slot Container
export function DroppableShiftContainer({ id, children, name, timeRange, requiredCount, currentCount }: { id: string, children: React.ReactNode, name: string, timeRange: string, requiredCount: number, currentCount: number }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: "shiftSlot" } });
  
  const isFull = requiredCount > 0 && currentCount >= requiredCount;

  return (
    <div 
      ref={setNodeRef} 
      className={cn(
        "flex flex-col gap-1.5 p-2 rounded-xl min-h-[60px] transition-colors border-2",
        isOver ? "bg-indigo-50 border-indigo-300 ring-2 ring-indigo-100" : "bg-slate-50 border-transparent hover:bg-slate-100",
        isFull && !isOver && "bg-emerald-50/50"
      )}
    >
      <div className="flex items-center justify-between px-1 mb-1">
        <div>
          <p className="text-[11px] font-bold text-slate-700">{name}</p>
          <p className="text-[9px] text-slate-400">{timeRange}</p>
        </div>
        {requiredCount > 0 && (
          <div className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded-md",
            currentCount < requiredCount ? "bg-red-100 text-red-600" : currentCount > requiredCount ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"
          )}>
            {currentCount}/{requiredCount}
          </div>
        )}
      </div>
      {children}
      {currentCount === 0 && (
        <div className="text-[10px] text-slate-400 font-medium italic text-center py-2 opacity-60">Sürükleyin</div>
      )}
    </div>
  );
}

// Droppable Unassign Area (Sidebar)
export function DroppableUnassignArea({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "unassigned", data: { type: "unassign" } });
  return (
    <div 
      ref={setNodeRef} 
      className={cn(
        "flex-1 flex flex-col gap-2 p-2 rounded-xl border-2 transition-colors overflow-y-auto",
        isOver ? "bg-red-50 border-red-300 ring-2 ring-red-100" : "border-transparent"
      )}
    >
      {isOver && (
        <div className="absolute inset-0 bg-red-100/80 backdrop-blur-sm z-40 rounded-xl flex items-center justify-center border-2 border-red-400 border-dashed">
          <p className="text-sm font-bold text-red-700">Vardiyadan Çıkar</p>
        </div>
      )}
      {children}
    </div>
  );
}

export function ShiftBoard({
  personnel,
  shiftDefs,
  demandMatrix,
  cellMap,
  availMap,
  dates,
  onRemoveShift
}: {
  personnel: any[],
  shiftDefs: ShiftDefinition[],
  demandMatrix: Record<string, Record<number, number>>,
  cellMap: CellMap,
  availMap: AvailMap,
  dates: string[],
  onRemoveShift: (personId: string, day: number) => void
}) {
  const [filter, setFilter] = useState("");
  const [selectedDay, setSelectedDay] = useState<number | "all">("all");

  const filteredPersonnel = personnel.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()));

  // Calculate assigned hours to show in sidebar
  const getPersonHours = (pId: string) => {
    return Object.entries(cellMap)
      .filter(([k]) => k.startsWith(`${pId}-`))
      .reduce((sum, [, v]) => sum + (v.endMin - v.startMin) / 60, 0);
  };

  return (
    <div className="flex h-[calc(100vh-180px)] min-h-[500px] gap-2">
      {/* LEFT SIDEBAR: Personnel Pool */}
      <div className="w-48 flex flex-col bg-slate-50/50 border border-slate-200 rounded-xl shadow-sm overflow-hidden relative shrink-0">
        <div className="p-3 border-b border-slate-200 bg-white">
          <h2 className="text-sm font-bold text-slate-800 mb-3">Personel Havuzu</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Ara..." 
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
            />
          </div>
          <div className="mt-3 flex items-center gap-1">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Filtre:</span>
            <select 
              value={selectedDay} 
              onChange={e => setSelectedDay(e.target.value === "all" ? "all" : parseInt(e.target.value))}
              className="text-xs bg-transparent font-bold text-indigo-600 outline-none cursor-pointer"
            >
              <option value="all">Tüm Günler</option>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
        </div>

        <DroppableUnassignArea>
          {filteredPersonnel.map(p => {
            const hours = getPersonHours(p.id);
            const isWeeklyOff = p.weekly_off_day !== null && p.weekly_off_day !== undefined && selectedDay !== "all" && Number(p.weekly_off_day) === selectedDay;
            // Hide if already assigned on the selected day (only if viewing a specific day)
            if (selectedDay !== "all" && cellMap[`${p.id}-${selectedDay}`]) return null;

            return (
              <div key={p.id} className="relative">
                <DraggablePersonnelCard person={p} isWeeklyOff={isWeeklyOff} />
                {hours > 0 && (
                  <div className="absolute top-0 right-0 -mt-1 -mr-1 z-20">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[9px] font-black shadow-sm",
                      hours > (p.max_weekly_hours ?? 45) ? "bg-red-500 text-white" : "bg-indigo-500 text-white"
                    )}>
                      {Math.round(hours)}s
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {filteredPersonnel.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">Personel bulunamadı.</p>
          )}
        </DroppableUnassignArea>
      </div>

      {/* RIGHT BOARD: Days and Shifts */}
      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto overflow-y-auto p-2">
        {shiftDefs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <Clock size={32} className="mb-3 opacity-50" />
            <p className="font-semibold text-sm">Vardiya tanımı bulunamadı.</p>
            <p className="text-xs mt-1">Ayarlar'dan vardiya ekleyin.</p>
          </div>
        ) : (
          <div className="flex gap-2 min-w-max md:min-w-0 h-full">
            {DAYS.map((dayName, dayIndex) => {
              if (selectedDay !== "all" && selectedDay !== dayIndex) return null;
              
              return (
                <div key={dayIndex} className="flex-1 min-w-[110px] max-w-[200px] flex flex-col h-full border border-slate-100 rounded-lg bg-slate-50/30">
                  <div className="sticky top-0 bg-white z-20 py-2 border-b border-slate-200 rounded-t-lg shadow-sm mb-2">
                    <h3 className="text-xs font-bold text-slate-800 text-center">{dayName}</h3>
                    <p className="text-[9px] text-slate-500 text-center">{dates[dayIndex]}</p>
                  </div>
                  
                  <div className="flex-1 flex flex-col gap-2 overflow-y-auto px-1.5 pb-2">
                    {shiftDefs.map(def => {
                      const requiredCount = demandMatrix[def.id]?.[dayIndex] ?? 0;
                      
                      // Find people assigned to this shift on this day
                      const assignedPeople = personnel.filter(p => {
                        const cell = cellMap[`${p.id}-${dayIndex}`];
                        if (!cell) return false;
                        // Check if times match approximately
                        const defStartMin = parseInt(def.start.split(":")[0]) * 60 + parseInt(def.start.split(":")[1]);
                        let defEndMin = parseInt(def.end.split(":")[0]) * 60 + parseInt(def.end.split(":")[1]);
                        if (defEndMin < defStartMin) defEndMin += 1440;
                        return Math.abs(cell.startMin - defStartMin) < 30 && Math.abs(cell.endMin - defEndMin) < 30; // 30 min tolerance
                      });

                      const droppableId = `shift-${def.id}-${dayIndex}`;

                      return (
                        <DroppableShiftContainer 
                          key={def.id} 
                          id={droppableId}
                          name={def.name}
                          timeRange={`${def.start}–${def.end}`}
                          requiredCount={requiredCount}
                          currentCount={assignedPeople.length}
                        >
                          <div className="space-y-1.5 mt-1">
                            {assignedPeople.map(p => (
                              <div key={p.id} className="relative group/remove">
                                <DraggableAssignedCard person={p} day={dayIndex} shiftDef={def} />
                                <button 
                                  onClick={() => onRemoveShift(p.id, dayIndex)}
                                  className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-red-400 hover:bg-red-100 rounded opacity-0 group-hover/remove:opacity-100 transition-opacity z-20"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
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
