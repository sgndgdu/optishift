"use client";

import { ChevronLeft, ChevronRight, Download, Zap, RefreshCw, Send } from "lucide-react";

interface ScheduleHeaderProps {
  weekOffset: number;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  weekLabel: string;
  hasSchedule: boolean;
  loading: boolean;
  runCount: number;
  onGenerate: () => void;
  onPublish?: () => void;
}

export function ScheduleHeader({
  weekOffset,
  onPrevWeek,
  onNextWeek,
  weekLabel,
  hasSchedule,
  loading,
  runCount,
  onGenerate,
  onPublish,
}: ScheduleHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 md:gap-4">
      <div className="flex items-center gap-2 md:gap-3">
        <button
          onClick={onPrevWeek}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
          aria-label="Önceki hafta"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-center min-w-[140px] md:min-w-[200px]">
          <p className="text-sm font-semibold text-slate-800">{weekLabel}</p>
          {runCount > 0 && (
            <p className="text-xs text-indigo-400 mt-0.5">#{runCount}. çalıştırma</p>
          )}
          {weekOffset !== 0 && runCount === 0 && (
            <p className="text-xs text-slate-400 mt-0.5">
              {weekOffset > 0 ? `+${weekOffset}` : weekOffset} hafta
            </p>
          )}
        </div>
        <button
          onClick={onNextWeek}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
          aria-label="Sonraki hafta"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 md:gap-3 items-center">
        {hasSchedule && onPublish && (
          <button
            onClick={onPublish}
            className="flex items-center gap-1.5 md:gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs md:text-sm font-medium px-3 md:px-4 py-2 md:py-2.5 rounded-lg transition-colors shadow-sm"
          >
            <Send size={14} />
            <span className="hidden sm:inline">Vardiyayı Yayınla</span><span className="sm:hidden">Yayınla</span>
          </button>
        )}
        <button
          disabled={!hasSchedule}
          onClick={() => alert("Yakında")}
          className="flex items-center gap-1.5 md:gap-2 border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 text-xs md:text-sm font-medium px-3 md:px-4 py-2 md:py-2.5 rounded-lg transition-colors"
        >
          <Download size={14} />
          Excel
        </button>
        <button
          onClick={onGenerate}
          disabled={loading}
          className="flex items-center gap-1.5 md:gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs md:text-sm font-medium px-3 md:px-4 py-2 md:py-2.5 rounded-lg transition-colors shadow-sm"
        >
          {loading ? (
            <RefreshCw size={15} className="animate-spin" />
          ) : (
            <Zap size={15} />
          )}
          {loading
            ? "Hesaplanıyor..."
            : hasSchedule
            ? "Yeniden Oluştur"
            : "Vardiya Oluştur"}
        </button>
      </div>
    </div>
  );
}
