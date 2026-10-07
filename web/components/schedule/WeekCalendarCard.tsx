"use client";

/**
 * Vardiya Planı: bu haftanın takvimi (lib/weekCalendar). Resmî tatil, arife, Ramazan, okul tatili, sektöre göre
 * özel günler, işletmenin aynı gündeki geçmişi ve hava durumu. Haftada özel bir şey yoksa hiç görünmez.
 */
import { useEffect, useState } from "react";
import { CalendarDays, ChevronDown, CloudRain } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTR } from "@/lib/date";
import type { CalendarItem } from "@/lib/weekCalendar";

export default function WeekCalendarCard({ locationId, weekStart }: { locationId: string; weekStart: string }) {
  const [data, setData] = useState<{ key: string; items: CalendarItem[] } | null>(null);
  const [open, setOpen] = useState(false);
  const key = `${locationId}|${weekStart}`;

  useEffect(() => {
    let stale = false;
    fetch(`/api/week-calendar?location_id=${locationId}&week_start=${weekStart}`)
      .then(r => (r.ok ? r.json() : { items: [] }))
      .then(d => { if (!stale) setData({ key, items: Array.isArray(d.items) ? d.items : [] }); })
      .catch(() => {});
    return () => { stale = true; };
  }, [locationId, weekStart, key]);

  const items = data?.key === key ? data.items : [];
  if (!items.length) return null;

  // Sadeleştirme (2026-10-07): kapalı başlar, başlıkta ilk özel gün
  const first = items[0];
  return (
    <div className="bg-white border border-slate-200 rounded-xl">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-center gap-2.5 px-4 py-3 text-left">
        <CalendarDays size={15} className="text-forest-600 shrink-0" />
        <span className="text-sm font-bold text-slate-900 shrink-0">Takvim</span>
        <span className="text-xs font-semibold text-slate-500 truncate">
          {formatDateTR(first.date)} · {first.title}{items.length > 1 ? ` ve ${items.length - 1} gün daha` : ""}
        </span>
        <ChevronDown size={15} className={cn("ml-auto text-slate-400 transition-transform shrink-0", open && "rotate-180")} />
      </button>
      {open && (
        <div className="divide-y divide-slate-100 border-t border-slate-100 px-4">
          {items.map((it, i) => (
            <div key={i} className="py-2.5">
              <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                {it.kind === "weather" && <CloudRain size={13} className="text-sky-500 shrink-0" />}
                {formatDateTR(it.date)} · {it.title}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{it.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
