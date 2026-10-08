"use client";

/**
 * Adalet Puanı › Zor günler (Ayarlar). Haftanın her gününe ayrı ek puan ve işletmenin kendi özel günleri.
 * Hesap lib/fairness (resolveHardDayRules, dayHardReasons): bir gün birden fazla nedenle zor sayılırsa en yüksek puan yazılır.
 */
import { Plus, X } from "lucide-react";
import { DAY_SHORT } from "@/lib/constants";
import { formatDateTR } from "@/lib/date";
import type { SpecialDatePoints, SpecialDateRepeat } from "@/lib/fairness";
import { specialDaysInRange } from "@/lib/specialDays";

const clamp = (v: number) => Math.min(20, Math.max(0, Math.round(v)));
const inputCls = "px-1 py-2 text-sm tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none font-bold text-slate-800 bg-white border border-slate-200 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent";

function PointsInput({ value, onChange, label, className }: { value: number; onChange: (v: number) => void; label: string; className?: string }) {
  return (
    <input type="number" inputMode="numeric" min={0} max={20} value={value} aria-label={label}
      onChange={e => { const n = parseInt(e.target.value); onChange(isNaN(n) ? 0 : clamp(n)); }}
      className={`${inputCls} ${className ?? "w-full"}`} />
  );
}

/** Pazartesi'den Pazar'a 7 gün, her birine ayrı ek puan (0 = zor sayılmaz) */
export function DayPointsGrid({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {DAY_SHORT.map((d, i) => (
        <label key={d} className="flex min-w-0 flex-col items-center gap-1">
          <span className={value[i] > 0 ? "text-xs font-bold text-forest-700" : "text-xs font-semibold text-slate-400"}>{d}</span>
          <PointsInput value={value[i] ?? 0} label={`${d} ek puanı`}
            onChange={v => onChange(value.map((x, k) => (k === i ? v : x)))} />
        </label>
      ))}
    </div>
  );
}

const selectCls = "rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-forest-500";

const REPEAT_OPTIONS: { value: SpecialDateRepeat; label: string }[] = [
  { value: "none", label: "Bir kez" },
  { value: "monthly_day", label: "Her ay bu gün" },
  { value: "monthly_last", label: "Her ayın son günü" },
];

/**
 * İşletmenin kendi ek puanlı günleri; takvimdeki yaklaşan özel günler tek dokunuşla eklenir.
 * Ek puan bütün vardiyalara ya da tek vardiyaya verilir (ör. sadece akşam vardiyası), istenirse her ay tekrar eder.
 */
export function SpecialDatesEditor({ value, onChange, industry, today, shifts }: {
  value: SpecialDatePoints[];
  onChange: (v: SpecialDatePoints[]) => void;
  industry?: string | null;
  today: string;
  shifts: { id: string; name: string }[];
}) {
  const yearLater = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
  const taken = new Set(value.map(v => v.date));
  // Resmî tatiller ayrı ayarda; burada arife ve ticari günler önerilir
  const suggestions = specialDaysInRange(today, yearLater, industry)
    .filter(s => (s.kind === "commercial" || s.kind === "half_holiday") && !taken.has(s.date));
  const update = (i: number, patch: Partial<SpecialDatePoints>) => onChange(value.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const sorted = value.map((v, i) => ({ v, i })).sort((a, b) => (a.v.date || "9").localeCompare(b.v.date || "9"));

  return (
    <div className="space-y-3">
      {sorted.length > 0 && (
        <ul className="space-y-2">
          {sorted.map(({ v, i }) => (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
              <input type="date" value={v.date} onChange={e => update(i, { date: e.target.value })} aria-label="Tarih"
                className={`${inputCls} w-[9.5rem] px-2 font-semibold`} />
              <input value={v.name} onChange={e => update(i, { name: e.target.value })} placeholder="Günün adı" aria-label="Günün adı"
                className="min-w-[8rem] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-forest-500" />
              <select value={v.shift_ids?.[0] ?? ""} aria-label="Hangi vardiya"
                onChange={e => update(i, { shift_ids: e.target.value ? [e.target.value] : undefined })} className={selectCls}>
                <option value="">Bütün vardiyalar</option>
                {shifts.map(sh => <option key={sh.id} value={sh.id}>{sh.name}</option>)}
                {v.shift_ids?.[0] && !shifts.some(sh => sh.id === v.shift_ids![0]) && <option value={v.shift_ids[0]}>Silinmiş vardiya</option>}
              </select>
              <select value={v.repeat ?? "none"} aria-label="Tekrar"
                onChange={e => update(i, { repeat: e.target.value === "none" ? undefined : e.target.value as SpecialDateRepeat })} className={selectCls}>
                {REPEAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span className="flex items-center gap-1.5">
                <PointsInput value={v.points} onChange={p => update(i, { points: p })} label="Ek puan" className="w-16" />
                <span className="text-xs font-semibold text-slate-400">puan</span>
              </span>
              <button type="button" onClick={() => onChange(value.filter((_, k) => k !== i))} aria-label="Günü sil"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500">
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onChange([...value, { date: today, name: "", points: 4 }])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
          <Plus size={13} /> Gün ekle
        </button>
        {suggestions.map(s => (
          <button key={s.date + s.name} type="button" onClick={() => onChange([...value, { date: s.date, name: s.name, points: 4 }])}
            className="inline-flex items-center gap-1 rounded-lg bg-forest-50 px-2.5 py-1.5 text-xs font-semibold text-forest-700 hover:bg-forest-100">
            <Plus size={12} /> {s.name} <span className="font-normal text-forest-600">({formatDateTR(s.date)})</span>
          </button>
        ))}
      </div>
    </div>
  );
}
