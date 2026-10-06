"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTORS, SECTOR_ICONS, type SectorId } from "@/components/marketing/sectors";
import { AppWindow, ScheduleBoard } from "@/components/marketing/Mockups";
import { SectorPhoto } from "@/components/marketing/SectorPhoto";

/** Landing: sektör sekmeleri. Her sektörde fotoğraf, o sektörün derdi ve kendi vardiyalarıyla plan önizlemesi. */
export function SectorShowcase() {
  const [active, setActive] = useState<SectorId>("kafe");
  const sector = SECTORS.find((s) => s.id === active)!;

  return (
    <div>
      <div role="tablist" aria-label="Sektör" className="mx-auto mb-10 flex w-full max-w-3xl gap-1 overflow-x-auto rounded-2xl bg-white p-1.5 ring-1 ring-slate-900/5 shadow-sm">
        {SECTORS.map((s) => {
          const Icon = SECTOR_ICONS[s.id];
          const on = s.id === active;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(s.id)}
              className={cn(
                "flex flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                on ? "bg-forest-700 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon size={16} />
              <span className="sm:hidden">{s.short}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          );
        })}
      </div>

      <div key={sector.id} className="grid items-stretch gap-6 lg:grid-cols-[1.05fr_1fr] animate-in fade-in duration-500">
        {/* Fotoğraf + plan önizlemesi */}
        <div className="relative min-h-[360px] overflow-hidden rounded-3xl sm:min-h-[460px]">
          <SectorPhoto sector={sector} className="absolute inset-0" />
          <div className="absolute inset-x-4 bottom-4 sm:inset-x-6 sm:bottom-6">
            <AppWindow title={`${sector.label} · haftalık plan`}>
              <ScheduleBoard sector={sector} compact />
            </AppWindow>
          </div>
        </div>

        {/* Metin */}
        <div className="flex flex-col justify-center rounded-3xl bg-white p-7 ring-1 ring-slate-900/5 sm:p-10">
          <p className="mb-3 text-sm font-semibold text-ember-600">{sector.label}</p>
          <h3 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-[32px]">{sector.headline}</h3>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-600 sm:text-base">{sector.pain}</p>
          <ul className="mt-8 space-y-5">
            {sector.points.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest-50 text-forest-700">
                  <Check size={13} strokeWidth={3} />
                </span>
                <span>
                  <span className="block font-semibold text-slate-900">{p.title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-slate-600">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
