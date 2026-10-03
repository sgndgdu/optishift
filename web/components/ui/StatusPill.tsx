import { cn } from "@/lib/utils";

/**
 * Tek durum-etiketi bileşeni — kapasite sayaçları, uygunluk durumu, kural
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
  /** Marka/tanım etiketi: rol, departman değil; vardiya türü (gece), müdür unvanı */
  brand:     { bg: "bg-forest-50",  text: "text-forest-700",  border: "border-forest-100" },
  /** İşletme sahibi / bölge müdürü rol etiketi (rol renk kararı) */
  accent:    { bg: "bg-ember-50",   text: "text-ember-700",   border: "border-ember-100" },
} as const;

export type PillTone = keyof typeof TONES;

export function StatusPill({
  tone,
  children,
  size = "pill",
  className,
  title,
}: {
  tone: PillTone;
  children: React.ReactNode;
  /** pill: küçük sayaç/rozet (kapasite, ihlal sayısı). block: geniş durum kartı (uygunluk seçici). */
  size?: "pill" | "block";
  className?: string;
  title?: string;
}) {
  const t = TONES[tone];
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 border font-semibold whitespace-nowrap",
        t.bg, t.text, t.border,
        size === "pill"
          ? "text-xs px-1.5 py-0.5 rounded-full"
          : "text-sm px-4 py-2.5 rounded-xl w-full justify-center",
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * Sayı balonu (okunmamış mesaj, bekleyen talep sayısı): TEK KAYNAK. Dolu renk, beyaz yazı.
 * danger = okunmamış/acil, attention = bekleyen, brand = bilgi sayısı.
 */
const COUNT_TONES = {
  danger: "bg-red-500", attention: "bg-amber-500", brand: "bg-primary",
} as const;

export function CountBadge({ count, children, tone = "danger", size = "md", className }: {
  count?: number | string; children?: React.ReactNode; tone?: keyof typeof COUNT_TONES;
  /** md: menü ve sekme yanında; sm: ikonun köşesinde */
  size?: "md" | "sm"; className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center justify-center rounded-full font-bold text-white",
      size === "md" ? "min-w-[18px] h-[18px] px-1.5 text-xs" : "min-w-[15px] h-[15px] px-0.5 text-xs",
      COUNT_TONES[tone], className)}>
      {children ?? count}
    </span>
  );
}
