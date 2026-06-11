"use client";

import { Scale, Info } from "lucide-react";
import { type Role, type ShiftDefinition, calcPoints } from "@/lib/types";

// ─── Renk yardımcıları ────────────────────────────────────────────────────────

const ZONE_PALETTE: Record<string, { pill: string; dot: string }> = {
  Kasa:   { pill: "bg-indigo-50 text-indigo-700 border-indigo-200",   dot: "bg-indigo-500"  },
  Reyon:  { pill: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  Mutfak: { pill: "bg-pink-50 text-pink-700 border-pink-200",         dot: "bg-pink-500"    },
};
const FALLBACK_PILLS = [
  { pill: "bg-orange-50 text-orange-700 border-orange-200",  dot: "bg-orange-500"  },
  { pill: "bg-violet-50 text-violet-700 border-violet-200",  dot: "bg-violet-500"  },
  { pill: "bg-cyan-50 text-cyan-700 border-cyan-200",        dot: "bg-cyan-500"    },
  { pill: "bg-amber-50 text-amber-700 border-amber-200",     dot: "bg-amber-500"   },
  { pill: "bg-rose-50 text-rose-700 border-rose-200",        dot: "bg-rose-500"    },
];

let _fallbackIdx = 0;
const _zoneCache: Record<string, { pill: string; dot: string }> = {};

function zoneStyle(zone?: string) {
  if (!zone) return { pill: "bg-slate-50 text-slate-600 border-slate-200", dot: "bg-slate-400" };
  if (ZONE_PALETTE[zone]) return ZONE_PALETTE[zone];
  if (!_zoneCache[zone]) {
    _zoneCache[zone] = FALLBACK_PILLS[_fallbackIdx++ % FALLBACK_PILLS.length];
  }
  return _zoneCache[zone];
}

/** Puana göre renk: yeşil=kolay, mavi=normal, turuncu=yoğun, kırmızı=en zor */
function pointStyle(p: number): string {
  if (p <= 4)  return "bg-green-100 text-green-700 border border-green-200";
  if (p <= 6)  return "bg-blue-100 text-blue-700 border border-blue-200";
  if (p <= 9)  return "bg-orange-100 text-orange-700 border border-orange-200";
  return "bg-red-100 text-red-700 border border-red-200";
}

// ─── Tipler ──────────────────────────────────────────────────────────────────

interface Assignment {
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
  prev_score: number;
  availability: Record<string, string>;
}

interface Props {
  fairness_gap: number;
  assignments: Assignment[];
  personnel: PersonData[];
  scores: Record<string, number>;
  weekDates: number[];
  shifts: ShiftDefinition[];
  rolesConfigs: Role[];
}

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

const DAY_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function resolveZone(a: Assignment, personnel: PersonData[]): string | undefined {
  if (a.role_id) return a.role_id;
  return personnel.find((p) => p.id === a.personnelId)?.roles?.[0];
}

function shiftLabel(shiftId: number, shifts: ShiftDefinition[]): string {
  const s = shifts[shiftId];
  return s ? `${s.start}–${s.end}` : `Vardiya ${shiftId + 1}`;
}

function shiftName(shiftId: number, shifts: ShiftDefinition[]): string {
  return shifts[shiftId]?.name || `V${shiftId + 1}`;
}

// ─── Puan Açıklama Tablosu ────────────────────────────────────────────────────

function PointsLegend({ shifts, rolesConfigs }: { shifts: ShiftDefinition[]; rolesConfigs: Role[] }) {
  const bonusRoles = rolesConfigs.filter((r) => r.difficulty_bonus > 0);
  const totalShifts = shifts.length;

  const DAY_GROUPS = [
    { label: "Pzt – Per", days: [0, 1, 2, 3], style: "text-slate-600", sublabel: "Normal gün" },
    { label: "Cum – Cmt", days: [4, 5],        style: "text-orange-600 font-medium", sublabel: "Yoğun gün" },
    { label: "Pazar",     days: [6],            style: "text-red-600 font-medium",    sublabel: "Kapanış günü" },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <Info size={14} className="text-slate-400" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Puan Tablosu — Nasıl Hesaplanır?
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left pb-2 text-slate-400 font-medium w-28">Gün</th>
              {shifts.map((s) => (
                <th key={s.id} className="text-center pb-2 text-slate-400 font-medium px-3">
                  {s.name}
                  <span className="block text-[10px] font-normal text-slate-300">{s.start}–{s.end}</span>
                </th>
              ))}
              <th className="text-left pb-2 text-slate-400 font-medium pl-4">Neden?</th>
            </tr>
          </thead>
          <tbody>
            {DAY_GROUPS.map((group) => {
              const sampleDay = group.days[0];
              return (
                <tr key={group.label} className="border-b border-slate-50 last:border-0">
                  <td className={`py-2 ${group.style}`}>
                    <span className="font-semibold">{group.label}</span>
                    <br />
                    <span className="text-slate-400 font-normal">{group.sublabel}</span>
                  </td>
                  {shifts.map((s, idx) => {
                    const pts = calcPoints(sampleDay, idx === totalShifts - 1, s.base_points, 0);
                    return (
                      <td key={s.id} className="py-2 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold ${pointStyle(pts)}`}>
                          {pts}p
                        </span>
                      </td>
                    );
                  })}
                  <td className="py-2 pl-4 text-slate-500">
                    {group.label === "Pzt – Per" && "Normal mesai"}
                    {group.label === "Cum – Cmt" && "Hafta sonu yoğunluğu — min 8p"}
                    {group.label === "Pazar"     && "Kapanış vardiyası min 10p, diğerleri min 5p"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 border-t border-slate-50 pt-3 space-y-1.5">
        {bonusRoles.length > 0 ? bonusRoles.map((r) => (
          <p key={r.name} className="text-[11px] text-slate-400 flex items-center gap-2">
            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${pointStyle(3 + r.difficulty_bonus)}`}>
              +{r.difficulty_bonus}p
            </span>
            <strong className="text-slate-500">{r.name} rol bonusu</strong>
            {r.difficulty_note && <span>— {r.difficulty_note}</span>}
          </p>
        )) : (
          <p className="text-[11px] text-slate-400">Bu lokasyonda ek rol zorluk bonusu tanımlanmamış.</p>
        )}
        <p className="text-[11px] text-slate-400">
          Puan kümülatif; OR-Tools ay sonunda standart sapmayı minimize eder.
        </p>
      </div>
    </div>
  );
}

// ─── Zone Coverage satır bileşeni ─────────────────────────────────────────────

function ZoneCoverageRows({
  zone, zs, shiftIndex, shift, assignments, personnel, rolesConfigs,
}: {
  zone: string;
  zs: { pill: string; dot: string };
  shiftIndex: number;
  shift: ShiftDefinition;
  assignments: Assignment[];
  personnel: PersonData[];
  rolesConfigs: Role[];
}) {
  const cellAssignments = (day: number) =>
    assignments.filter(
      (a) => resolveZone(a, personnel) === zone && a.shiftId === shiftIndex && a.day === day
    );

  return (
    <tr className={`border-b border-slate-50 last:border-0 ${shiftIndex === 0 ? "bg-slate-50/40" : ""}`}>
      <td className="px-5 py-2">
        {shiftIndex === 0 && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${zs.pill} mb-1 block w-fit`}>
            <span className={`w-1.5 h-1.5 rounded-full ${zs.dot}`} />
            {zone}
          </span>
        )}
        <p className="text-slate-500 text-[10px] leading-tight">
          {shift.name} <span className="text-slate-300 font-mono">{shift.start}–{shift.end}</span>
        </p>
      </td>
      {Array.from({ length: 7 }, (_, day) => {
        const cell = cellAssignments(day);
        return (
          <td key={day} className="text-center px-1.5 py-2">
            {cell.length === 0 ? (
              <span className="text-slate-200">—</span>
            ) : (
              <div className="flex flex-col gap-0.5 items-center">
                {cell.map((a) => {
                  const p = personnel.find((x) => x.id === a.personnelId);
                  return (
                    <span key={a.personnelId}
                      className="text-[10px] text-slate-600 font-medium bg-slate-100 rounded px-1.5 py-0.5 max-w-[64px] truncate block"
                      title={p?.name}>
                      {p?.name.split(" ")[0] ?? a.personnelId}
                    </span>
                  );
                })}
              </div>
            )}
            
            {/* Coverage (Kapsama) İhtiyacı Uyarısı */}
            {(() => {
              const roleConfig = rolesConfigs.find((r) => r.name === zone);
              if (!roleConfig) return null;
              
              const requiredCount = roleConfig.daily_coverage?.[day]?.[shift.id] ?? roleConfig.min_per_shift?.[shift.id] ?? 0;
              
              if (requiredCount > 0 || cell.length > 0) {
                return (
                  <div className="mt-1">
                    {cell.length < requiredCount ? (
                      <span className="text-[9px] font-bold text-rose-500 bg-rose-50 px-1 py-0.5 rounded block">Eksik: {requiredCount - cell.length}</span>
                    ) : cell.length > requiredCount ? (
                      <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-1 py-0.5 rounded block">Fazla: {cell.length - requiredCount}</span>
                    ) : (
                      <span className="text-[9px] text-emerald-500 font-medium">✓ Tam</span>
                    )}
                  </div>
                );
              }
              return null;
            })()}
          </td>
        );
      })}
    </tr>
  );
}

// ─── Zone Coverage tablosu ────────────────────────────────────────────────────

function ZoneCoverage({ assignments, personnel, weekDates, shifts, rolesConfigs }: {
  assignments: Assignment[]; personnel: PersonData[]; weekDates: number[]; shifts: ShiftDefinition[]; rolesConfigs: Role[];
}) {
  const allZones = Array.from(
    new Set(assignments.map((a) => resolveZone(a, personnel)).filter(Boolean))
  ) as string[];

  if (!allZones.length) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Alan Kapsaması — Hangi Alanda Kim Çalışıyor?
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-5 py-2.5 text-slate-400 font-medium" style={{ width: 160 }}>
                Alan / Vardiya
              </th>
              {DAY_SHORT.map((d, i) => (
                <th key={d} className="text-center px-2 py-2.5 text-slate-400 font-medium" style={{ minWidth: 72 }}>
                  {d}<span className="block text-slate-300 font-normal">{weekDates[i]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allZones.sort().map((zone) => {
              const zs = zoneStyle(zone);
              return (
                <React.Fragment key={zone}>
                  {shifts.map((shift, shiftIndex) => (
                    <ZoneCoverageRows
                      key={`${zone}-${shift.id}`}
                      zone={zone} zs={zs}
                      shiftIndex={shiftIndex} shift={shift}
                      assignments={assignments} personnel={personnel}
                      rolesConfigs={rolesConfigs}
                    />
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Ana tablo ────────────────────────────────────────────────────────────────

import React from "react";

export function ScheduleTable({
  fairness_gap, assignments, personnel, scores, weekDates, shifts, rolesConfigs,
}: Props) {
  const [viewMode, setViewMode] = React.useState<"personnel" | "coverage">("personnel");
  const [showPoints, setShowPoints] = React.useState(false);

  return (
    <div className="space-y-4">
      {/* Üst Bar: Adalet Banner & Görünüm Seçici & Puan Bilgisi */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 md:gap-4">
        <div className={`flex items-center gap-2 md:gap-2.5 px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-medium border ${
          fairness_gap === 0
            ? "bg-green-50 text-green-700 border-green-200"
            : fairness_gap <= 3
            ? "bg-blue-50 text-blue-700 border-blue-200"
            : "bg-yellow-50 text-yellow-700 border-yellow-200"
        }`}>
          <Scale size={15} />
          {fairness_gap === 0
            ? "Mükemmel adalet — 0 puan fark"
            : `Adalet farkı: ${fairness_gap} puan — bu haftanın en dengeli çözümü`}
        </div>

        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <button onClick={() => setShowPoints(!showPoints)} className="text-xs text-slate-500 hover:text-indigo-600 font-medium px-2 md:px-3 py-1.5 md:py-2 rounded-lg hover:bg-indigo-50 transition-colors flex items-center gap-1 md:gap-1.5 border border-transparent hover:border-indigo-100">
            <Info size={13} /> <span className="hidden sm:inline">Puanlama Nasıl Yapılıyor?</span><span className="sm:hidden">Puan</span>
          </button>

          <div className="bg-slate-100 p-1 rounded-lg inline-flex">
            <button
              onClick={() => setViewMode("personnel")}
              className={`px-3 md:px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${viewMode === "personnel" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Personel
            </button>
            <button
              onClick={() => setViewMode("coverage")}
              className={`px-3 md:px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${viewMode === "coverage" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              <span className="hidden sm:inline">Kapsama (Alanlar)</span><span className="sm:hidden">Alanlar</span>
            </button>
          </div>
        </div>
      </div>

      {showPoints && (
        <div className="mb-4">
          <PointsLegend shifts={shifts} rolesConfigs={rolesConfigs} />
        </div>
      )}

      {/* Seçilen Tabloyu Göster */}
      {viewMode === "personnel" ? (
        <>
          {/* Personel bazlı tablo */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium" style={{ width: 190 }}>
                Personel
              </th>
              {DAY_SHORT.map((d, i) => (
                <th key={d} className="text-center px-2 py-3.5 font-medium" style={{ minWidth: 80 }}>
                  <span className="block text-xs text-slate-500">{d}</span>
                  <span className="block text-xs text-slate-400 mt-0.5">{weekDates[i]}</span>
                </th>
              ))}
              <th className="text-center px-4 py-3.5 text-slate-500 font-medium text-xs" style={{ width: 88 }}>
                Toplam
              </th>
            </tr>
          </thead>
          <tbody>
            {personnel.map((p) => (
              <tr key={p.id}
                className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                {/* Personel kolonu */}
                <td className="px-5 py-3" style={{ width: 190 }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                      {initials(p.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 text-xs leading-tight truncate">{p.name}</p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {p.roles.map((s) => {
                          const zs = zoneStyle(s);
                          return (
                            <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${zs.pill}`}>
                              {s}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Gün hücreleri */}
                {Array.from({ length: 7 }, (_, day) => {
                  const a = assignments.find((x) => x.personnelId === p.id && x.day === day);
                  const avail = p.availability[String(day)] ?? "available";
                  const zone  = a ? resolveZone(a, personnel) : undefined;
                  const zs    = zoneStyle(zone);

                  if (avail === "unavailable" && !a) {
                    return (
                      <td key={day} className="text-center px-1.5 py-2.5">
                        <div className="bg-red-50 border border-red-100 rounded-lg py-1.5 px-1">
                          <span className="text-[10px] text-red-500 font-medium block">İzin</span>
                        </div>
                      </td>
                    );
                  }

                  if (a) {
                    return (
                      <td key={day} className="text-center px-1.5 py-2">
                        <div className={`relative flex flex-col items-center justify-center p-1.5 rounded-md border ${zs.pill} shadow-sm w-full min-h-[44px]`}>
                          <span className="text-[11px] font-bold tracking-tight mb-0.5 opacity-90">
                            {a.start_time && a.end_time ? `${a.start_time}–${a.end_time}` : shiftLabel(a.shiftId, shifts)}
                          </span>
                          <div className="flex items-center gap-1 opacity-80">
                            <span className={`w-1.5 h-1.5 rounded-full ${zs.dot}`} />
                            <span className="text-[9px] font-semibold uppercase tracking-wider">{zone ?? "—"}</span>
                          </div>
                          
                          {avail === "preferred_not" && (
                            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-yellow-400 text-white rounded-full text-[9px] flex items-center justify-center font-bold leading-none shadow-sm"
                              title="Tercih edilmeyen gün">!</span>
                          )}
                        </div>
                      </td>
                    );
                  }

                  return (
                    <td key={day} className="text-center px-1.5 py-2.5">
                      <span className="text-slate-200 text-sm">—</span>
                    </td>
                  );
                })}

                {/* Puan kolonu */}
                <td className="text-center px-4 py-3">
                  <span className="text-base font-bold text-indigo-600 block leading-tight">{scores[p.id] ?? 0}p</span>
                  <span className="text-[10px] text-slate-400">önceki: {p.prev_score}p</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-400 px-1 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 bg-yellow-400 rounded-full text-white text-[8px] flex items-center justify-center font-bold shadow-sm">!</span>
          tercih edilmeyen gün
        </span>
        <span className="text-slate-200">|</span>
        <span className="text-red-400 font-medium">İzin</span> = kesinlikle gelemez
        <span className="text-slate-200">|</span>
        Toplam = önceki birikimi + bu hafta
      </p>
      </>) : (
        <ZoneCoverage assignments={assignments} personnel={personnel} weekDates={weekDates} shifts={shifts} rolesConfigs={rolesConfigs} />
      )}
    </div>
  );
}
