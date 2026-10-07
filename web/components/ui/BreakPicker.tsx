"use client";

import { breakMinutes, formatBreak, netWorkMinutes } from "@/lib/legal";
import { trNum } from "@/lib/format";

/**
 * "Mola ne kadar?" seçicisi: TEK yer (Ayarlar › Vardiyalar ve ilk kurulum). Mola vardiyanın içindedir,
 * çalışma süresine sayılmaz (lib/legal breakMinutes). Boş = İş Kanunu m.68 asgarisi.
 */
export function BreakPicker({ id, start, end, value, onChange }: {
  id: string;
  start: string;
  end: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  const toMin = (t: string) => { const [h, m] = (t || "").split(":").map(Number); return h * 60 + (m || 0); };
  let grossMin = toMin(end) - toMin(start);
  if (grossMin <= 0) grossMin += 1440;
  if (!start || !end || Number.isNaN(grossMin)) return null;
  const legalMin = breakMinutes(grossMin);
  const workH = netWorkMinutes(grossMin, value) / 60;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
      <label htmlFor={id}>Mola ne kadar?</label>
      <select
        id={id}
        value={value === undefined ? "" : String(value)}
        onChange={e => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className="px-2 py-1 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-forest-400"
      >
        <option value="">{formatBreak(legalMin)} (yasal en az)</option>
        {[0, 15, 30, 45, 60, 90].filter(m => m !== legalMin).map(m => <option key={m} value={String(m)}>{formatBreak(m)}</option>)}
      </select>
      <span className="text-slate-400">Çalışma süresi {trNum(workH)} saat</span>
      {value !== undefined && value < legalMin && (
        <span className="basis-full text-xs text-amber-700">İş Kanunu bu uzunluktaki vardiyada en az {formatBreak(legalMin)} mola ister.</span>
      )}
    </div>
  );
}
