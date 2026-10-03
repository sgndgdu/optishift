import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { kpiToneClasses, type KpiTone } from "@/lib/kpiColors";

/**
 * Sayı kartı (KPI): TEK KAYNAK. Renk anlam taşır (lib/kpiColors): neutral sayaç,
 * attention bekleyen/dikkat, danger sorun, positive yolunda. Sayfalar kendi renkli
 * kutusunu çizmez.
 */
export function StatCard({ label, value, icon: Icon, tone = "neutral", hint, onClick, className }: {
  label: string;
  value: React.ReactNode;
  icon?: ComponentType<{ size?: number; className?: string }>;
  tone?: KpiTone;
  hint?: string;
  onClick?: () => void;
  className?: string;
}) {
  const t = kpiToneClasses(tone);
  // Kompakt (DESIGN.md §1): telefonda üç kutu yan yana sığar; ikon etiketin yanında küçük, ayrı kutu yok
  return (
    <div onClick={onClick}
      className={cn("bg-white border border-slate-200 rounded-2xl px-3 py-3 sm:px-4", onClick && "cursor-pointer hover:border-slate-300 transition-colors", className)}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 truncate">
        {Icon && <Icon size={14} className={cn("shrink-0", t.color)} />}
        <span className="truncate">{label}</span>
      </p>
      <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-0.5 truncate">{hint}</p>}
    </div>
  );
}
