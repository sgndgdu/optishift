"use client";

/**
 * Ana Sayfa: ayın ilk 7 günü geçen ayın özeti (lib/monthlyGain). Ayrıntı Raporlar › Aylık Özet'te.
 * Özet yoksa (plan yayınlanmamışsa) hiç görünmez.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { businessToday } from "@/lib/date";
import { prevMonth } from "@/lib/months";
import type { MonthlyGain } from "@/lib/monthlyGain";

const SHOW_DAYS = 7;

export function MonthlyGainCard({ locationId }: { locationId: string | null }) {
  const [data, setData] = useState<MonthlyGain | null>(null);
  useEffect(() => {
    const today = businessToday();
    if (!locationId || Number(today.slice(8, 10)) > SHOW_DAYS) return;
    let stale = false;
    fetch(`/api/reports/monthly-gain?location_id=${locationId}&month=${prevMonth(today.slice(0, 7))}`)
      .then(r => (r.ok ? r.json() : null)).then(d => { if (!stale && d?.highlights?.length) setData(d); }).catch(() => {});
    return () => { stale = true; };
  }, [locationId]);
  if (!data) return null;
  return (
    <div className="rounded-2xl bg-forest-50 px-5 py-4 ring-1 ring-forest-100">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold text-forest-900"><Sparkles size={16} className="text-ember-500" /> {data.label} özeti</p>
      <ul className="space-y-1.5 text-sm leading-relaxed text-forest-900/90">
        {data.highlights.slice(0, 3).map(h => <li key={h} className="flex gap-2"><span className="text-forest-500">•</span><span>{h}</span></li>)}
      </ul>
      <Link href={`/reports?tab=ozet&month=${data.month}`} className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-bold text-forest-800 ring-1 ring-forest-200 hover:bg-forest-50">
        Raporun tamamı <ArrowRight size={13} />
      </Link>
    </div>
  );
}
