"use client";
/**
 * Vardiya zorluğu: TEK seçici (Ayarlar, ilk kurulum, yeni şube). Üç basamak: Sıradan %0 / Zor %50 / Çok zor %100
 * (lib/fairness DIFFICULTY_LEVELS). Değer vardiya tanımının difficulty_pct alanıdır; ekip anketinden gelen ara değer
 * (ör. %60) seçili basamak olmadan yanında yazılır.
 */
import { cn } from "@/lib/utils";
import { DIFFICULTY_LEVELS } from "@/lib/fairness";

export function DifficultyPicker({ value, onChange, className }: { value: number; onChange: (pct: number) => void; className?: string }) {
  const custom = !DIFFICULTY_LEVELS.some(l => l.pct === value);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-xs text-slate-400 shrink-0">Zorluk</span>
      <div className="grid grid-cols-3 gap-1.5 flex-1">
        {DIFFICULTY_LEVELS.map(l => (
          <button key={l.label} type="button" onClick={() => onChange(l.pct)} title={l.pct > 0 ? `Her saat %${l.pct} fazla sayılır` : "Her saat 1 puan"}
            className={cn("py-1.5 rounded-lg text-xs font-semibold border transition-colors",
              value === l.pct ? "bg-forest-600 text-white border-forest-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}>
            {l.label}
          </button>
        ))}
      </div>
      {custom && <span className="text-xs font-semibold text-forest-700 shrink-0 tabular-nums" title="Ekip anketinden">%{value}</span>}
    </div>
  );
}
