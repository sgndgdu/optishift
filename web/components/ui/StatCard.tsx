import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { kpiToneClasses, type KpiTone } from "@/lib/kpiColors";

/**
 * Sayı kartı (KPI): TEK KAYNAK. Renk anlam taşır (lib/kpiColors): neutral sayaç,
 * attention bekleyen/dikkat, danger sorun, positive yolunda. Sayfalar kendi renkli
 * kutusunu çizmez.
 */
export function StatCard({ label, value, icon: Icon, tone = "neutral", hint, onClick, active, className }: {
  label: string;
  value: React.ReactNode;
  icon?: ComponentType<{ size?: number; className?: string }>;
  tone?: KpiTone;
  hint?: string;
  onClick?: () => void;
  /** Tıklanan kart süzgeç olarak seçili */
  active?: boolean;
  className?: string;
}) {
  const t = kpiToneClasses(tone);
  // Kompakt (DESIGN.md §1): telefonda üç kutu yan yana sığar; ikon etiketin yanında küçük, ayrı kutu yok
  const body = <>
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 truncate">
        {Icon && <Icon size={14} className={cn("shrink-0", t.color)} />}
        <span className="truncate">{label}</span>
      </p>
      <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-0.5 truncate">{hint}</p>}
  </>;
  const base = "bg-white border border-slate-200 rounded-2xl px-3 py-3 sm:px-4";
  // Tıklanabilir kart düğmedir (klavye ve ekran okuyucu için)
  if (onClick) return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn(base, "w-full text-left transition-colors hover:border-slate-300", active && "border-forest-500 ring-2 ring-forest-100", className)}>
      {body}
    </button>
  );
  return <div className={cn(base, className)}>{body}</div>;
}
