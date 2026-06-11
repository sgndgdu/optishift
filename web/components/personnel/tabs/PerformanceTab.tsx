"use client";

import { Award } from "lucide-react";
import type { Personnel } from "@/lib/types";
import { initials } from "../shared";

interface PerformanceTabProps {
  selected: Personnel;
  personnel: Personnel[];
  teamAvg: number;
}

const AVATAR_COLORS = [
  "bg-indigo-500",
  "bg-violet-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
];

export function PerformanceTab({ selected, personnel, teamAvg }: PerformanceTabProps) {
  const sorted = [...personnel].sort((a, b) => b.prev_score - a.prev_score);
  const rank = sorted.findIndex((p) => p.id === selected.id) + 1;
  const maxScore = sorted[0]?.prev_score ?? 1;
  const diff = selected.prev_score - teamAvg;
  const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
  const diffColor = diff > 0 ? "text-orange-500" : diff < 0 ? "text-emerald-600" : "text-slate-400";
  const diffNote =
    diff > 0
      ? "Motor önümüzdeki dönem bu kişiye daha az ağır vardiya verecek"
      : diff < 0
      ? "Motor bu kişiye öncelik tanıyacak, puan dengelenecek"
      : "Takımla tam dengeli";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-4">
          <div>
            <div className="text-4xl font-bold text-slate-800 leading-none">{selected.prev_score}</div>
            <div className="text-xs text-slate-400 mt-1">Kümülatif Adil Puan</div>
          </div>
          <div className="flex-1" />
          <div className="text-right">
            <div className={`text-lg font-bold ${diffColor}`}>{diffLabel}p</div>
            <div className="text-xs text-slate-400">takım ort. {teamAvg}p</div>
          </div>
        </div>
        <div className="px-5 pb-1">
          <div className="bg-slate-100 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full bg-indigo-500 transition-all"
              style={{ width: `${maxScore > 0 ? (selected.prev_score / maxScore) * 100 : 0}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 mt-3">
          <span className="text-xs text-slate-500">{diffNote}</span>
          <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
            {rank}/{personnel.length}. sıra
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100">
        <div className="px-5 py-3 flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Güvenilirlik</span>
          <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Yoklama modülünden otomatik</span>
        </div>
        {[
          { label: "Gelmeme (No-Show)", value: selected.no_show_count, warnAt: 2 },
          { label: "Geç Gelme",         value: selected.late_count,    warnAt: 4 },
        ].map((row) => {
          const isWarn = row.value >= row.warnAt;
          const countColor = row.value === 0 ? "text-slate-400" : isWarn ? "text-red-500" : "text-orange-500";
          return (
            <div key={row.label} className="flex items-center gap-4 px-5 py-3.5">
              <span className="flex-1 text-sm text-slate-700">{row.label}</span>
              {isWarn && (
                <span className="text-[10px] font-medium text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">Dikkat</span>
              )}
              <span className={`text-base font-bold shrink-0 ${countColor}`}>{row.value}</span>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 px-5 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
          <Award size={18} className="text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-700">Kahraman Bonusu</div>
          <div className="text-xs text-slate-400">Son dakika açık vardiyayı kabul et → ×1.5 puan</div>
        </div>
        <div className="shrink-0 text-right">
          {selected.hero_count === 0 ? (
            <span className="text-xs text-slate-400">Henüz yok</span>
          ) : (
            <div>
              <div className="text-xl font-bold text-amber-500">{selected.hero_count}</div>
              <div className="text-[10px] text-slate-400 leading-tight">kez</div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Takım Sıralaması</span>
        </div>
        <div>
          {sorted.map((p, i) => {
            const isThis = p.id === selected.id;
            const barPct = maxScore > 0 ? (p.prev_score / maxScore) * 100 : 0;
            const avatarColor = AVATAR_COLORS[i % AVATAR_COLORS.length];
            return (
              <div
                key={p.id}
                className={`flex items-center gap-3 px-5 py-3 ${isThis ? "bg-indigo-50" : "border-t border-slate-50"}`}
              >
                <span className={`text-xs font-semibold w-5 shrink-0 ${isThis ? "text-indigo-500" : "text-slate-300"}`}>
                  {i + 1}
                </span>
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0 ${isThis ? "bg-indigo-600" : avatarColor} ${isThis ? "opacity-100" : "opacity-60"}`}
                >
                  {initials(p.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium truncate ${isThis ? "text-indigo-700" : "text-slate-500"}`}>
                      {p.name.split(" ")[0]}
                    </span>
                    <span className={`text-xs font-bold shrink-0 ml-2 ${isThis ? "text-indigo-600" : "text-slate-500"}`}>
                      {p.prev_score}p
                    </span>
                  </div>
                  <div className="bg-slate-100 rounded-full h-1">
                    <div
                      className={`h-1 rounded-full ${isThis ? "bg-indigo-500" : "bg-slate-300"}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
