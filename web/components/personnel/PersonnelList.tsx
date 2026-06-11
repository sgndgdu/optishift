"use client";

import { Search, ChevronRight } from "lucide-react";
import type { Personnel, PersonnelStatus } from "@/lib/types";
import { STATUS_CFG, EMP_LABELS, ZONE_COLORS, ZONE_DEFAULT, initials, calcLeaveEntitlement } from "./shared";

interface PersonnelListProps {
  personnel: Personnel[];
  filtered: Personnel[];
  selectedId: string | null;
  search: string;
  setSearch: (v: string) => void;
  statusFilter: PersonnelStatus | "all";
  setStatusFilter: (v: PersonnelStatus | "all") => void;
  openDrawer: (id: string) => void;
  closeDrawer: () => void;
}

import { useMemo } from "react";

export function PersonnelList({
  personnel,
  filtered,
  selectedId,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  openDrawer,
  closeDrawer,
}: PersonnelListProps) {
  const unavailabilityMap = useMemo(() => {
    const map: Record<string, number> = {};
    personnel.forEach(p => {
      try {
        const raw = localStorage.getItem(`optishift_avail_${p.id}`);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length > 0) {
            map[p.id] = arr.length;
          }
        }
      } catch { /* ignore */ }
    });
    return map;
  }, [personnel]);

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="İsim, ünvan veya sicil no..."
            className="field-input pl-9"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {(["all", "active", "on_leave", "inactive"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                statusFilter === s ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s === "all" ? "Tümü" : STATUS_CFG[s as PersonnelStatus].label}
              {s !== "all" && (
                <span className="ml-1 opacity-60">({personnel.filter((p) => p.status === s).length})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">Arama kriterlerine uyan personel bulunamadı.</div>
        )}
        {filtered.map((p) => {
          const sc = STATUS_CFG[p.status];
          const isSelected = p.id === selectedId;
          return (
            <button
              key={p.id}
              onClick={() => (isSelected ? closeDrawer() : openDrawer(p.id))}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl border transition-all text-left ${
                isSelected
                  ? "bg-indigo-50 border-indigo-200 shadow-sm"
                  : "bg-white border-slate-100 hover:border-slate-200 hover:shadow-sm"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0 ${
                  p.status === "inactive" ? "bg-slate-400" : "bg-indigo-600"
                }`}
              >
                {initials(p.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-800">{p.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.cls}`}>{sc.label}</span>
                  {p.employment_type !== "full_time" && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      {EMP_LABELS[p.employment_type]}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {p.title} · Sicil: {p.employee_id}
                </div>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {p.roles.map((s) => {
                    const c = ZONE_COLORS[s] ?? ZONE_DEFAULT;
                    const isPrimary = p.role_levels[s] === "primary";
                    return (
                      <span key={s} className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.chip}`}>
                        #{s}{isPrimary && <span className="ml-0.5 opacity-50">●</span>}
                      </span>
                    );
                  })}
                  {p.roles.length === 0 && <span className="text-xs text-slate-400 italic">Rol atanmamış</span>}
                  {unavailabilityMap[p.id] && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-medium ml-1">
                      {unavailabilityMap[p.id]} gün müsait değil
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0 mr-1">
                <div className="text-lg font-bold text-indigo-600">{p.prev_score}p</div>
                <div className="text-xs text-slate-400">Adil Puan</div>
                {p.hero_count > 0 && (
                  <div className="text-xs text-yellow-600 mt-0.5">★ {p.hero_count}×</div>
                )}
                {(() => {
                  const ent = p.annual_leave_days_total || calcLeaveEntitlement(p.hire_date);
                  const used = p.leave_records.filter((r) => r.type === "annual").reduce((s, r) => s + r.days, 0);
                  const rem = ent - used;
                  if (rem <= 0) return <div className="text-[10px] text-red-500 mt-0.5">İzin tükendi</div>;
                  if (rem <= 3) return <div className="text-[10px] text-orange-500 mt-0.5">{rem}g izin kaldı</div>;
                  return null;
                })()}
              </div>
              <ChevronRight
                size={16}
                className={`text-slate-300 shrink-0 transition-transform ${isSelected ? "rotate-90" : ""}`}
              />
            </button>
          );
        })}
      </div>
    </>
  );
}
