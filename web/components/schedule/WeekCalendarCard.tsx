"use client";

/**
 * Vardiya Planı: bu haftanın takvimi (lib/weekCalendar). Resmî tatil, arife, Ramazan, okul tatili, sektöre göre
 * özel günler, işletmenin aynı gündeki geçmişi ve hava durumu. Haftada özel bir şey yoksa hiç görünmez.
 */
import { useEffect, useState } from "react";
import { CalendarDays, CloudRain } from "lucide-react";
import { formatDateTR } from "@/lib/date";
import type { CalendarItem } from "@/lib/weekCalendar";

export default function WeekCalendarCard({ locationId, weekStart }: { locationId: string; weekStart: string }) {
  const [data, setData] = useState<{ key: string; items: CalendarItem[] } | null>(null);
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

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
      <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
        <CalendarDays size={16} className="text-forest-600 shrink-0" /> Bu haftanın takvimi
      </p>
      <div className="divide-y divide-slate-100">
        {items.map((it, i) => (
          <div key={i} className="py-2 first:pt-0 last:pb-0">
            <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              {it.kind === "weather" && <CloudRain size={13} className="text-sky-500 shrink-0" />}
              {formatDateTR(it.date)} · {it.title}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{it.detail}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">Bu günlerde kaç kişi gerektiğini İşlemler › Kaç Kişi Gerekli? tablosundan değiştirebilirsiniz.</p>
    </div>
  );
}
