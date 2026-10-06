import { Logo } from "@/components/Logo";
import { BRAND } from "@/lib/brand";

/** Panellerin telefon üst çubuğundaki marka (yönetim, Tüm Şubeler, çalışan portalı tek ölçü). */
export function MobileBrand() {
  return (
    <span className="flex items-center gap-2.5">
      <Logo size="md" />
      <span className="text-[17px] font-bold tracking-tight text-slate-900">{BRAND.name}</span>
    </span>
  );
}
