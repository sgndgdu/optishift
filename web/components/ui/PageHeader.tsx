import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Sayfa başlığı: TEK KAYNAK. Yönetim paneli, Tüm Şubeler paneli ve personel portalındaki
 * her sayfa başlığını bununla çizer; ölçü, kalınlık ve boşluk sadece burada tanımlıdır
 * (Claude Design "OptiShift Design System" kararları). Sayfada elle <h1> yazılmaz,
 * lib/__tests__/pageHeader.test.ts bunu denetler.
 *
 * Sayfa kökü <Page> ile kurulur: bölümler arası boşluk her sayfada aynı.
 */
export function PageHeader({ title, description, actions, eyebrow, className }: {
  title: ReactNode;
  /** Başlık altındaki tek satırlık açıklama. */
  description?: ReactNode;
  /** Sağdaki düğmeler (sığmazsa başlığın altına kayar). */
  actions?: ReactNode;
  /** Başlığın üstündeki küçük etiket (ör. geri bağlantısı, tarih). */
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-xs font-semibold text-slate-500">{eyebrow}</div>}
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{title}</h1>
        {description && <p className="text-sm sm:text-base text-slate-500 mt-1">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Başlıktaki ana eylem düğmesi (Yeni İlan, Personel Ekle...): her sayfada aynı ölçü ve renk. */
export const pageActionClass =
  "inline-flex items-center gap-2 bg-primary text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-50";

/**
 * Sayfa kökü: bölümler arası standart boşluk. Dış dolgu layout'tan gelir.
 * Genişlik iki seçenek: "full" (layout'un 7xl'i: tablolar, panolar) ya da
 * "narrow" (4xl: ayarlar, listeler, formlar gibi okunan sayfalar).
 */
export function Page({ children, width = "full", className }: { children?: ReactNode; width?: "full" | "narrow"; className?: string }) {
  return <div className={cn("space-y-6", width === "narrow" && "max-w-4xl", className)}>{children}</div>;
}
