import { cn } from "@/lib/utils";

/**
 * Marka işareti — iki üst üste binen vardiya bloğu (devir/geçiş fikri).
 * Tüm giriş noktalarına (nav, sidebar, e-posta vb.) dağılmış aynı Zap-ikon+kutu
 * kopyasının yerini alır — tek kaynak burası.
 */
const SIZES = {
  sm: { box: "w-7 h-7", mark: 16 },
  md: { box: "w-9 h-9", mark: 20 },
  lg: { box: "w-11 h-11", mark: 24 },
} as const;

const TONES = {
  forest: { box: "bg-gradient-to-br from-forest-700 to-forest-600", accent: "#E8873A" },
  ember: { box: "bg-gradient-to-br from-ember-600 to-ember-500", accent: "#14453D" },
} as const;

function Mark({ size, accent, monochrome }: { size: number; accent: string; monochrome?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="4" y="4" width="17" height="17" rx="5.5" fill={monochrome ? "currentColor" : "#FAF6ED"} opacity={monochrome ? 0.55 : 1} />
      <rect x="12" y="12" width="16" height="16" rx="5" fill={monochrome ? "currentColor" : accent} />
    </svg>
  );
}

/** Süpervizör paneli ember tonuyla ayrışır — rol bazlı renk ayrımı korunuyor. */
export function Logo({
  size = "md",
  tone = "forest",
  className,
}: {
  size?: keyof typeof SIZES;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  const s = SIZES[size];
  const t = TONES[tone];
  return (
    <div
      className={cn(
        s.box,
        "shrink-0 rounded-tl-xl rounded-tr-xl rounded-bl-xl rounded-br-md flex items-center justify-center shadow-sm",
        t.box,
        className
      )}
    >
      <Mark size={s.mark} accent={t.accent} />
    </div>
  );
}

/** Kutusuz, tek renkli işaret — küçük/satır-içi başlıklar için (örn. "← OptiShift" geri linki). */
export function LogoMark({
  size = "md",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span className={cn("inline-flex shrink-0 text-forest-600", className)}>
      <Mark size={s.mark} accent="" monochrome />
    </span>
  );
}
