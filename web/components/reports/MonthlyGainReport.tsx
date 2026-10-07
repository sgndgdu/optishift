"use client";

/**
 * Raporlar › Aylık Özet (lib/monthlyGain, /api/reports/monthly-gain): bir ayda uygulamayla yapılanlar.
 * Sadece kayıtlı veriden; tahmin olan tek sayı (planlamada kazanılan süre) varsayımıyla yazılır.
 */
import { useEffect, useState } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, Clock, ShieldCheck, Sparkles, Timer, UserCheck, ClipboardCheck } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { businessToday } from "@/lib/date";
import { monthLabel, nextMonth, prevMonth } from "@/lib/months";
import type { MonthlyGain } from "@/lib/monthlyGain";
import { trNum } from "@/lib/format";

const MANUAL_MINUTES = 5; // lib/monthlyGain MANUAL_MINUTES_PER_PERSON_WEEK ile aynı (sunucu modülü tarayıcıya alınmaz)

/** Kısa karşılaştırma (telefonda kart altına sığsın). Süren ay tam ayla karşılaştırılmaz, yanıltır. */
function diffText(cur: number, prev: number, partial: boolean): string {
  if (partial) return "Ay sürüyor";
  if (!prev) return "Önceki ayda kayıt yok";
  const d = Math.round((cur - prev) * 10) / 10;
  return d === 0 ? "Önceki ayla aynı" : `Önceki aya göre ${d > 0 ? "+" : "−"}${trNum(Math.abs(d))}`;
}

export default function MonthlyGainReport({ initialMonth }: { initialMonth?: string | null }) {
  const thisMonth = businessToday().slice(0, 7);
  const [month, setMonth] = useState(initialMonth && initialMonth <= thisMonth ? initialMonth : prevMonth(thisMonth));
  const [data, setData] = useState<MonthlyGain | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stale = false;
    const loc = (() => { try { return localStorage.getItem("optishift_selected_location") || ""; } catch { return ""; } })();
    if (!loc) return;
    const t = setTimeout(() => { setData(null); setError(""); }, 0);
    fetch(`/api/reports/monthly-gain?location_id=${loc}&month=${month}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (stale) return; if (ok) setData(d); else setError(d.error ?? "Rapor hazırlanamadı."); })
      .catch(() => { if (!stale) setError("Bağlantı hatası, tekrar deneyin."); });
    return () => { stale = true; clearTimeout(t); };
  }, [month]);

  const navBtn = "flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={() => setMonth(prevMonth(month))} aria-label="Önceki ay" className={navBtn}><ChevronLeft size={18} /></button>
        <p className="min-w-[9rem] text-center text-base font-bold text-slate-900">{monthLabel(month)}</p>
        <button onClick={() => setMonth(nextMonth(month))} disabled={month >= thisMonth} aria-label="Sonraki ay" className={navBtn}><ChevronRight size={18} /></button>
        {data?.partial && <span className="text-xs font-semibold text-amber-700">Ay sürüyor, bugüne kadarki durum</span>}
      </div>

      {error && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</p>}
      {!data && !error && <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}</div>}

      {data && (
        <>
          {data.highlights.length > 0 ? (
            <div className="rounded-2xl bg-forest-50 px-4 py-4 ring-1 ring-forest-100">
              <p className="mb-2 flex items-center gap-2 text-sm font-bold text-forest-900"><Sparkles size={16} className="text-ember-500" /> {data.label} özeti</p>
              <ul className="space-y-1.5 text-sm leading-relaxed text-forest-900/90">
                {data.highlights.map(h => <li key={h} className="flex gap-2"><span className="text-forest-500">•</span><span>{h}</span></li>)}
              </ul>
            </div>
          ) : (
            <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Bu ay için yayınlanmış plan ya da kayıt yok.</p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Yayınlanan hafta" value={data.plans.published} icon={CalendarCheck} />
            <StatCard label="Otomatik hazırlanan" value={data.plans.generated} icon={Sparkles}
              hint={data.plans.generated ? `Yaklaşık ${trNum(data.plans.estHours)} saat (tahmin)` : undefined} />
            <StatCard label="Boşalan vardiya" value={data.absences.total} icon={UserCheck}
              tone={data.absences.unfilled ? "attention" : "neutral"}
              hint={data.absences.total ? `${data.absences.filled} tanesine biri bulundu` : undefined} />
            <StatCard label="Karara bağlanan talep" value={data.requests.leaveApproved + data.requests.leaveRejected + data.requests.swapsDecided} icon={ClipboardCheck}
              hint={`${data.requests.leaveApproved + data.requests.leaveRejected} izin, ${data.requests.swapsDecided} değişiklik`} />
            <StatCard label="Kural aşımı" value={data.compliance.problems} icon={ShieldCheck}
              tone={data.compliance.problems ? "danger" : data.compliance.shifts ? "positive" : "neutral"}
              hint={`${data.compliance.shifts} vardiya kontrol edildi`} />
            <StatCard label="Çalışılan saat" value={trNum(data.work.hours)} icon={Clock} hint={diffText(data.work.hours, data.work.prevHours, data.partial)} />
            {data.overtime && (
              <StatCard label="Fazla mesai" value={`${trNum(data.overtime.hours)} sa`} icon={Timer}
                tone={!data.partial && data.overtime.hours > data.overtime.prevHours ? "attention" : "neutral"}
                hint={data.overtime.cost !== null ? `₺${data.overtime.cost.toLocaleString("tr-TR")}` : diffText(data.overtime.hours, data.overtime.prevHours, data.partial)} />
            )}
          </div>

          {data.compliance.examples.length > 0 && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-bold">Kural aşılan yerler</p>
              <ul className="mt-1 space-y-0.5">{data.compliance.examples.map(e => <li key={e}>{e}</li>)}</ul>
            </div>
          )}

          <p className="text-xs leading-relaxed text-slate-400">
            Rakamlar uygulamadaki kayıtlardan hesaplanır. Kazanılan süre tahminidir: elle planlamanın kişi başı haftada {MANUAL_MINUTES} dakika sürdüğü varsayılır.
            Kural kontrolü yayınlanmış vardiyalarda iki vardiya arası dinlenmeye ve haftalık saat sınırına bakar.
          </p>
        </>
      )}
    </div>
  );
}
