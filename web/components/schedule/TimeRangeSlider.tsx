"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  startMin: number;
  endMin: number;
  onChange: (startMin: number, endMin: number) => void;
  step?: number;      // default 15
  trackMin?: number;  // default 0
  trackMax?: number;  // default 1800 (06:00 +1 gün, gece geçişini destekler)
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function snap(v: number, step: number) {
  return Math.round(v / step) * step;
}

/** Dakikayı HH:MM formatına çevirir. 1440+ ise "+1" etiketi eklenir. */
export function minToHHMM(min: number, showNextDay = false): string {
  const normalized = min % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const base = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return showNextDay && min >= 1440 ? `${base} +1` : base;
}

export function hhmmToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

/** Gece yarısı etiketi: 1440 için "00:00 (gece)" göster */
function trackLabel(min: number, trackMin: number, trackMax: number): string {
  if (min === 1440) return "00:00 (gece)";
  if (min > 1440)   return minToHHMM(min, true);
  if (min === trackMin) return minToHHMM(min);
  if (min === trackMax) return minToHHMM(min, min >= 1440);
  return minToHHMM(min);
}

export function TimeRangeSlider({
  startMin,
  endMin,
  onChange,
  step = 15,
  trackMin = 0,
  trackMax = 1800, // 06:00 ertesi gün
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  const totalRange = trackMax - trackMin;
  const startPct   = ((startMin - trackMin) / totalRange) * 100;
  const endPct     = ((endMin   - trackMin) / totalRange) * 100;

  const getMinFromX = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const frac = clamp((clientX - rect.left) / rect.width, 0, 1);
      return snap(frac * totalRange + trackMin, step);
    },
    [totalRange, trackMin, step]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging) return;
      const val = getMinFromX(e.clientX);
      if (dragging === "start") {
        onChange(clamp(val, trackMin, endMin - step), endMin);
      } else {
        onChange(startMin, clamp(val, startMin + step, trackMax));
      }
    },
    [dragging, getMinFromX, onChange, startMin, endMin, step, trackMin, trackMax]
  );

  const handlePointerUp = useCallback(() => setDragging(null), []);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragging, handlePointerMove, handlePointerUp]);

  const handleTrackClick = (e: React.MouseEvent) => {
    if (dragging) return;
    const val    = getMinFromX(e.clientX);
    const dStart = Math.abs(val - startMin);
    const dEnd   = Math.abs(val - endMin);
    if (dStart <= dEnd) {
      onChange(clamp(val, trackMin, endMin - step), endMin);
    } else {
      onChange(startMin, clamp(val, startMin + step, trackMax));
    }
  };

  const durationMin = endMin - startMin;
  const durationLabel =
    durationMin >= 60
      ? `${Math.floor(durationMin / 60)} sa ${durationMin % 60 > 0 ? `${durationMin % 60} dk` : ""}`.trim()
      : `${durationMin} dk`;

  // Gece geçişi var mı?
  const crossesMidnight = endMin >= 1440;

  // Gece yarısı çizgisi konumu (1440 dakika)
  const midnightPct = ((1440 - trackMin) / totalRange) * 100;
  const showMidnightLine = trackMax > 1440 && midnightPct > 0 && midnightPct < 100;

  return (
    <div className="space-y-2 select-none">
      {/* Gece geçişi uyarısı */}
      {crossesMidnight && (
        <div className="flex items-center gap-1.5 text-[10px] text-indigo-600 font-semibold bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1">
          <span>🌙</span>
          <span>Gece geçişi — bitiş ertesi güne sarkıyor</span>
        </div>
      )}

      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-6 flex items-center cursor-pointer"
        onClick={handleTrackClick}
      >
        {/* Rail */}
        <div className="absolute inset-x-0 h-2 bg-slate-100 rounded-full" />

        {/* Gece yarısı işareti */}
        {showMidnightLine && (
          <div
            className="absolute h-4 w-px bg-slate-300 z-0"
            style={{ left: `${midnightPct}%` }}
            title="Gece yarısı"
          />
        )}

        {/* Active range */}
        <div
          className="absolute h-2 bg-primary rounded-full"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />

        {/* Start handle — z-10 */}
        <div
          className="absolute z-10 group"
          style={{ left: `${startPct}%`, transform: "translateX(-50%)" }}
        >
          {/* Tooltip */}
          <div className={`absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold bg-slate-800 text-white rounded px-1.5 py-0.5 pointer-events-none transition-opacity ${dragging === "start" ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
            {minToHHMM(startMin)}
          </div>
          <div
            className="w-5 h-5 bg-white border-2 border-primary rounded-full shadow-md cursor-grab active:cursor-grabbing hover:scale-110 transition-transform"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setDragging("start"); }}
          />
        </div>

        {/* End handle — z-20 (her zaman üstte, overlap sorununu çözer) */}
        <div
          className="absolute z-20 group"
          style={{ left: `${endPct}%`, transform: "translateX(-50%)" }}
        >
          {/* Tooltip */}
          <div className={`absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold bg-slate-800 text-white rounded px-1.5 py-0.5 pointer-events-none transition-opacity ${dragging === "end" ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
            {minToHHMM(endMin, endMin >= 1440)}
          </div>
          <div
            className="w-5 h-5 bg-white border-2 border-violet-500 rounded-full shadow-md cursor-grab active:cursor-grabbing hover:scale-110 transition-transform"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setDragging("end"); }}
          />
        </div>
      </div>

      {/* Time labels */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium px-0.5">
        <span>{trackLabel(trackMin, trackMin, trackMax)}</span>
        <span className="text-primary font-bold text-xs">{durationLabel}</span>
        <span>{trackLabel(trackMax, trackMin, trackMax)}</span>
      </div>
    </div>
  );
}
