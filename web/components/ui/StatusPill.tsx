import { cn } from "@/lib/utils";

/**
 * Tek durum-etiketi bileşeni — kapasite sayaçları, müsaitlik durumu, kural
 * ihlali rozetleri gibi app genelinde tekrar eden "renkli pill/blok" deseninin
 * tek kaynağı (bkz. Claude Design "OptiShift Design System" → Kararlar #2).
 *
 * tone anlamı sabit: neutral=nötr, attention=dikkat/bekliyor, danger=sorun,
 * positive=olumlu/yolunda, info=bilgi/fazla. Renk sadece bu 5 anlamdan birini
 * taşır, başka bir yerde farklı bir anlamla kullanılmaz.
 */
const TONES = {
  neutral:   { bg: "bg-slate-50",   text: "text-slate-600",   border: "border-slate-100" },
  attention: { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-100" },
  danger:    { bg: "bg-red-50",     text: "text-red-600",     border: "border-red-100" },
  positive:  { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-100" },
  info:      { bg: "bg-sky-50",     text: "text-sky-600",     border: "border-sky-100" },
} as const;

export type PillTone = keyof typeof TONES;

export function StatusPill({
  tone,
  children,
  size = "pill",
  className,
}: {
  tone: PillTone;
  children: React.ReactNode;
  /** pill: küçük sayaç/rozet (kapasite, ihlal sayısı). block: geniş durum kartı (müsaitlik seçici). */
  size?: "pill" | "block";
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center border font-semibold",
        t.bg, t.text, t.border,
        size === "pill"
          ? "text-[10px] px-1.5 py-0.5 rounded-full"
          : "text-sm px-4 py-2.5 rounded-xl w-full justify-center",
        className
      )}
    >
      {children}
    </span>
  );
}
