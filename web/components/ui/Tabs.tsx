import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { CountBadge } from "@/components/ui/StatusPill";

export type TabItem<T extends string> = {
  id: T;
  label: string;
  /** Sekmede bekleyen iş sayısı (0 ise gösterilmez). */
  count?: number;
  icon?: ComponentType<{ size?: number; className?: string }>;
};

/**
 * Sekmeler: TEK KAYNAK (DESIGN.md). Gri zemin üstünde beyaz seçili kutu; telefonda sığmazsa yatay kayar.
 * Sayfalar kendi sekme çubuğunu çizmez.
 */
export function Tabs<T extends string>({ items, value, onChange, className }: {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto max-w-full w-fit", className)}>
      {items.map(t => {
        const on = t.id === value;
        return (
          <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.id)}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
              on ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
            )}>
            {t.icon && <t.icon size={14} className={on ? "text-primary" : undefined} />}
            {t.label}
            {(t.count ?? 0) > 0 && <CountBadge tone="attention" count={t.count!} />}
          </button>
        );
      })}
    </div>
  );
}
