"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SECTORS, SECTOR_ICONS, type SectorId } from "@/components/marketing/sectors";
import { AppWindow, ScheduleBoard } from "@/components/marketing/Mockups";

const ROTATE_MS = 8000;

/**
 * Landing: sektör sekmeleri. Her sektörde tam genişlik fotoğraf, üstünde sektörün
 * başlığı ve kendi vardiyalarıyla plan önizlemesi (kullanıcı kararı 2026-10-06:
 * açıklama paragrafı ve madde listesi yok).
 */
export function SectorShowcase() {
  const [active, setActive] = useState<SectorId>("kafe");
  // Kendiliğinden döner; ziyaretçi bir sekmeye dokununca durur. Sadece ekrandayken ilerler.
  const [auto, setAuto] = useState(true);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const sector = SECTORS.find((s) => s.id === active)!;

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!auto || !visible || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => {
      setActive((cur) => SECTORS[(SECTORS.findIndex((s) => s.id === cur) + 1) % SECTORS.length].id);
    }, ROTATE_MS);
    return () => clearTimeout(t);
  }, [auto, visible, active]);

  return (
    <div ref={rootRef}>
      <div role="tablist" aria-label="Sektör" className="mx-auto mb-8 flex w-full max-w-3xl gap-1 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-900/5">
        {SECTORS.map((s) => {
          const Icon = SECTOR_ICONS[s.id];
          const on = s.id === active;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={on}
              onClick={() => { setActive(s.id); setAuto(false); }}
              className={cn(
                "relative flex flex-1 shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-xl px-2.5 py-2.5 text-sm font-semibold transition-colors sm:px-3",
                on ? "bg-forest-700 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon size={16} className="hidden sm:block" />
              <span className="sm:hidden">{s.short}</span>
              <span className="hidden sm:inline">{s.label}</span>
              {on && auto && visible && (
                <span key={active} className="m-progress absolute inset-x-0 bottom-0 h-0.5 bg-ember-400" style={{ "--dur": `${ROTATE_MS}ms` } as React.CSSProperties} />
              )}
            </button>
          );
        })}
      </div>

      <div key={sector.id} className="motion-auto relative overflow-hidden rounded-[2rem] bg-forest-900 shadow-[0_40px_90px_-40px_rgba(10,33,30,0.55)]">
        <div className="m-zoom absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sector.image} alt={sector.label} className="h-full w-full object-cover" />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-forest-900 via-forest-900/70 to-forest-900/20 lg:bg-gradient-to-r lg:from-forest-900/95 lg:via-forest-900/60 lg:to-forest-900/10" />

        <div className="relative grid gap-8 p-5 pt-40 sm:p-10 sm:pt-56 lg:grid-cols-[0.85fr_1.15fr] lg:items-end lg:gap-10 lg:p-12 lg:pt-12 xl:min-h-[560px]">
          <div className="min-w-0 lg:self-center">
            <p className="m-up text-sm font-semibold text-ember-300">{sector.label}</p>
            <h3 className="m-up mt-3 font-serif text-[28px] font-semibold leading-[1.1] tracking-tight text-white sm:text-[40px]" style={{ "--d": "80ms" } as React.CSSProperties}>
              {sector.headline}
            </h3>
            <ul className="m-up mt-6 flex flex-wrap gap-2" style={{ "--d": "160ms" } as React.CSSProperties}>
              {sector.shifts.map((s) => (
                <li key={s.code} className="rounded-full bg-white/10 px-3 py-1 text-[13px] text-forest-50 ring-1 ring-white/15 backdrop-blur">
                  <span className="font-semibold text-white">{s.label}</span> {s.time.replace(" - ", "-")}
                </li>
              ))}
            </ul>
          </div>
          <div className="m-up min-w-0" style={{ "--d": "200ms" } as React.CSSProperties}>
            <AppWindow title={`${sector.location} · Vardiya Planı`}>
              <div className="sm:hidden"><ScheduleBoard sector={sector} compact animate /></div>
              <div className="hidden sm:block"><ScheduleBoard sector={sector} animate /></div>
            </AppWindow>
          </div>
        </div>
      </div>
    </div>
  );
}
