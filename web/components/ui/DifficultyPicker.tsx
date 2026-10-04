"use client";
/**
 * Vardiya zorluğu: TEK seçici (Ayarlar, ilk kurulum). Sayı yerine üç seçenek: Kolay 3 / Orta 5 / Zor 8;
 * eski ara değerler en yakın seçeneğe düşer. Puan vardiya tanımının base_points alanıdır (lib/fairness).
 */
import { cn } from "@/lib/utils";

const LEVELS = [["Kolay", 3], ["Orta", 5], ["Zor", 8]] as const;

export const difficultyLevel = (points: number) => (points <= 3 ? 3 : points >= 7 ? 8 : 5);

export function DifficultyPicker({ value, onChange, className }: { value: number; onChange: (points: number) => void; className?: string }) {
  const level = difficultyLevel(value);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-xs text-slate-400 shrink-0">Zorluk</span>
      <div className="grid grid-cols-3 gap-1.5 flex-1">
        {LEVELS.map(([lbl, val]) => (
          <button key={lbl} type="button" onClick={() => onChange(val)}
            className={cn("py-1.5 rounded-lg text-xs font-semibold border transition-colors",
              level === val ? "bg-forest-600 text-white border-forest-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}>
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}
