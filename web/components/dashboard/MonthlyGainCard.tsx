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
  // Sadeleştirme (2026-10-07): tek satır; maddelerin tamamı raporda
  return (
    <Link href={`/reports?tab=ozet&month=${data.month}`}
      className="flex items-center gap-3 rounded-2xl bg-forest-50 px-5 py-3.5 ring-1 ring-forest-100 transition-colors hover:bg-forest-100/60">
      <Sparkles size={16} className="shrink-0 text-ember-500" />
      <span className="min-w-0 flex-1 text-sm text-forest-900">
        <span className="font-bold">{data.label} özeti hazır.</span>{" "}
        <span className="text-forest-900/80">{data.highlights[0]}</span>
      </span>
      <ArrowRight size={15} className="shrink-0 text-forest-700" />
    </Link>
  );
}
