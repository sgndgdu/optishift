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
  return (
    <div onClick={onClick}
      className={cn("bg-white border border-slate-200 rounded-2xl p-4 shadow-sm", onClick && "cursor-pointer hover:shadow-md transition-shadow", className)}>
      {Icon && (
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3", t.bg)}>
          <Icon size={18} className={t.color} />
        </div>
      )}
      <p className="text-2xl font-black text-slate-900">{value}</p>
      <p className="text-xs font-semibold text-slate-500 mt-0.5">{label}</p>
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}
