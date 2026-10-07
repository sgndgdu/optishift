"use client";

/**
 * 24 saatlik saat seçici ("HH:MM"). Tarayıcının <input type="time"> kutusu tarayıcı diline göre AM/PM
 * gösterebiliyordu; bu kutu her zaman Türkiye saat düzeninde (00–23) gösterir.
 * Dakika 5'er adımlıdır; kayıtlı değer adım dışındaysa o dakika da listede kalır.
 */
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

export default function TimeInput({ value, onChange, className, ariaLabel }: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [h0, m0] = (value || "").split(":");
  // "24:00" gece yarısı bitişi 00:00 olarak gösterilir
  const h = h0 === "24" ? "00" : h0 && HOURS.includes(h0.padStart(2, "0")) ? h0.padStart(2, "0") : "";
  const m = m0 ? m0.slice(0, 2).padStart(2, "0") : "";
  const minutes = m && !MINUTES.includes(m) ? [...MINUTES, m].sort() : MINUTES;
  const sel = "appearance-none bg-transparent text-center tabular-nums outline-none cursor-pointer px-0.5";

  return (
    <span role="group" aria-label={ariaLabel}
      className={cn("inline-flex items-center justify-center gap-0.5 focus-within:border-forest-500 focus-within:ring-2 focus-within:ring-forest-500/20", className)}>
      <select aria-label="Saat" value={h} className={sel}
        onChange={e => onChange(`${e.target.value}:${m || "00"}`)}>
        {!h && <option value="">--</option>}
        {HOURS.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
      <span className="text-slate-400">:</span>
      <select aria-label="Dakika" value={m} className={sel}
        onChange={e => onChange(`${h || "00"}:${e.target.value}`)}>
        {!m && <option value="">--</option>}
        {minutes.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
    </span>
  );
}
