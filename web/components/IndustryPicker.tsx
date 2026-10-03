"use client";

/**
 * İşletme türü seçici: 7 sektör kartı + seçilen sektörün alt türleri (Kafe / Restoran...).
 * Yeni Şube sihirbazı, ilk kurulum ve Ayarlar aynı bileşeni kullanır.
 */

import {
  Check, Factory, Headset, ShieldCheck, ShoppingBag, Stethoscope, Truck, UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { INDUSTRIES, getIndustry, type IndustryIcon as IconName } from "@/lib/templates";
import { cn } from "@/lib/utils";

const ICONS: Record<IconName, LucideIcon> = {
  UtensilsCrossed, Factory, ShoppingBag, Stethoscope, ShieldCheck, Truck, Headset,
};

export function IndustryIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  const Icon = ICONS[name];
  return <Icon size={size} />;
}

export default function IndustryPicker({ industry, variant, onChange, compact = false }: {
  industry: string | null;
  variant: string | null;
  onChange: (industry: string, variant: string) => void;
  /** Dar alanlar için (Ayarlar): açıklamalar gizlenir */
  compact?: boolean;
}) {
  const selected = getIndustry(industry);
  return (
    <div className="space-y-3">
      {compact ? (
        // Dar alan: tek çerçeveli radyo listesi (DESIGN.md §2), seçili satırda onay işareti
        <ul className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden" role="radiogroup" aria-label="İşletme türü">
          {INDUSTRIES.map(ind => {
            const active = ind.key === industry;
            return (
              <li key={ind.key}>
                <button type="button" role="radio" aria-checked={active}
                  onClick={() => onChange(ind.key, ind.variants[0].key)}
                  className={cn("w-full flex items-center gap-3 px-3 min-h-[44px] text-left transition-colors",
                    active ? "bg-primary/5" : "bg-white hover:bg-slate-50")}>
                  <span className={active ? "text-primary" : "text-slate-400"}><IndustryIcon name={ind.icon} size={16} /></span>
                  <span className={cn("flex-1 text-sm", active ? "font-semibold text-primary" : "text-slate-800")}>{ind.label}</span>
                  {active && <Check size={16} className="text-primary shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2" role="radiogroup" aria-label="İşletme türü">
        {INDUSTRIES.map(ind => {
          const active = ind.key === industry;
          return (
            <button key={ind.key} type="button" role="radio" aria-checked={active}
              onClick={() => onChange(ind.key, ind.variants[0].key)}
              className={cn(
                "flex items-start gap-3 rounded-xl border-2 px-3.5 py-3 text-left transition-colors",
                active ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300 bg-white",
              )}>
              <span className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                active ? "bg-primary text-white" : "bg-slate-100 text-slate-500")}>
                <IndustryIcon name={ind.icon} size={17} />
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-bold", active ? "text-primary" : "text-slate-800")}>{ind.label}</span>
                <span className="block text-xs text-slate-500 mt-0.5 leading-snug">{ind.description}</span>
              </span>
            </button>
          );
        })}
      </div>
      )}

      {selected && selected.variants.length > 1 && (
        <div>
          <p className="text-xs font-bold text-slate-600 mb-1.5">Çalışma düzeni</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Çalışma düzeni">
            {selected.variants.map(v => {
              const active = v.key === variant;
              return (
                <button key={v.key} type="button" role="radio" aria-checked={active} title={v.description}
                  onClick={() => onChange(selected.key, v.key)}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-colors",
                    active ? "border-primary bg-primary text-white" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
                  {active && <Check size={12} />} {v.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-1.5">{selected.variants.find(v => v.key === variant)?.description}</p>
        </div>
      )}
    </div>
  );
}
