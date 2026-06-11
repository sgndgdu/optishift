"use client";

import { useState } from "react";
import { Clock, X, Check, Zap } from "lucide-react";
import { TimeRangeSlider, minToHHMM, hhmmToMin } from "./TimeRangeSlider";
import type { ShiftDefinition } from "@/lib/types";

interface Props {
  personName: string;
  dayLabel: string;
  initialStart: string;  // "HH:MM"
  initialEnd: string;    // "HH:MM"
  shiftTemplates: ShiftDefinition[];
  onConfirm: (startTime: string, endTime: string) => void;
  onCancel: () => void;
}

export function ShiftTimeEditor({
  personName,
  dayLabel,
  initialStart,
  initialEnd,
  shiftTemplates,
  onConfirm,
  onCancel,
}: Props) {
  const [startMin, setStartMin] = useState(() => hhmmToMin(initialStart || "09:00"));
  const [endMin, setEndMin] = useState(() => hhmmToMin(initialEnd || "17:00"));

  const [startInput, setStartInput] = useState(initialStart || "09:00");
  const [endInput, setEndInput] = useState(initialEnd || "17:00");

  // Sync slider → inputs
  const handleSliderChange = (s: number, e: number) => {
    setStartMin(s);
    setEndMin(e);
    setStartInput(minToHHMM(s));
    setEndInput(minToHHMM(e));
  };

  // Sync text input → slider
  const commitStartInput = () => {
    const m = hhmmToMin(startInput);
    if (m >= 0 && m < endMin) {
      setStartMin(m);
    } else {
      setStartInput(minToHHMM(startMin));
    }
  };
  const commitEndInput = () => {
    const m = hhmmToMin(endInput);
    if (m > startMin && m <= 1440) {
      setEndMin(m);
    } else {
      setEndInput(minToHHMM(endMin));
    }
  };

  const applyTemplate = (t: ShiftDefinition) => {
    const s = hhmmToMin(t.start);
    const e = hhmmToMin(t.end);
    setStartMin(s);
    setEndMin(e);
    setStartInput(t.start);
    setEndInput(t.end);
  };

  const durationMin = endMin - startMin;
  const durationLabel =
    durationMin >= 60
      ? `${Math.floor(durationMin / 60)} sa ${durationMin % 60 > 0 ? `${durationMin % 60} dk` : ""}`.trim()
      : `${durationMin} dk`;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl shadow-slate-300/40 border border-slate-200 w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-150"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <Clock size={13} className="text-primary" />
              </div>
              <span className="text-sm font-black text-slate-900">{personName}</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 pl-9">{dayLabel} vardiyası</p>
          </div>
          <button
            onClick={onCancel}
            className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Shift template quick-select */}
        {shiftTemplates.length > 0 && (
          <div className="mb-5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Zap size={10} className="text-amber-500" />
              Hızlı Seç
            </p>
            <div className="flex flex-wrap gap-1.5">
              {shiftTemplates.map((t) => {
                const isActive = t.start === minToHHMM(startMin) && t.end === minToHHMM(endMin);
                return (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all ${
                      isActive
                        ? "bg-primary text-white border-primary"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:border-primary/50 hover:text-primary"
                    }`}
                  >
                    {t.name}
                    <span className="ml-1.5 font-normal opacity-70">
                      {t.start}–{t.end}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Range slider */}
        <div className="mb-5">
          <TimeRangeSlider
            startMin={startMin}
            endMin={endMin}
            onChange={handleSliderChange}
          />
        </div>

        {/* Manual time inputs */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">
              Başlangıç
            </label>
            <input
              type="time"
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
              onBlur={commitStartInput}
              className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-primary transition-colors text-center"
            />
          </div>

          <div className="mt-5 text-slate-300 font-bold">→</div>

          <div className="flex-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">
              Bitiş
            </label>
            <input
              type="time"
              value={endInput}
              onChange={(e) => setEndInput(e.target.value)}
              onBlur={commitEndInput}
              className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-primary transition-colors text-center"
            />
          </div>

          {/* Duration badge */}
          <div className="mt-5 text-center min-w-[52px]">
            <span className="inline-block bg-primary/10 text-primary text-xs font-black px-2 py-1.5 rounded-xl leading-none">
              {durationLabel}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            İptal
          </button>
          <button
            onClick={() => onConfirm(minToHHMM(startMin), minToHHMM(endMin))}
            className="flex-1 py-2.5 bg-primary hover:bg-primary/90 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-colors"
          >
            <Check size={15} />
            Onayla
          </button>
        </div>
      </div>
    </div>
  );
}
