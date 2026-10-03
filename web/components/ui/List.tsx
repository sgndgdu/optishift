import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Aynı türden kayıtların listesi (DESIGN.md §2): tek çerçeve, satırlar arası çizgi.
 * Kişi, talep, ilan, bildirim gibi kayıtlar kart ızgarası yerine bununla çizilir.
 */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden", className)}>{children}</ul>;
}

/** Liste içinde bölüm başlığı (ör. "Yöneticiler", "Çalışanlar"). */
export function ListSection({ title, count, action }: { title: ReactNode; count?: number; action?: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2 bg-slate-50/80">
      <span className="text-xs font-semibold text-slate-500">
        {title}{typeof count === "number" && <span className="ml-1.5 text-slate-400">{count}</span>}
      </span>
      {action}
    </li>
  );
}

/**
 * Tek satır: solda avatar/ikon, ortada başlık + alt satır, sağda tek durum ve ok.
 * onClick ya da href verilirse satırın tamamı dokunulabilir olur.
 */
export function ListItem({ leading, title, subtitle, trailing, onClick, href, chevron, className }: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  href?: string;
  /** Sağda ok gösterilsin mi (varsayılan: tıklanabilirse evet). */
  chevron?: boolean;
  className?: string;
}) {
  const interactive = !!onClick || !!href;
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900 truncate">{title}</span>
        {subtitle && <span className="block text-xs text-slate-500 truncate mt-0.5">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0 flex items-center gap-2">{trailing}</span>}
      {(chevron ?? interactive) && <ChevronRight size={16} className="shrink-0 text-slate-300" aria-hidden />}
    </>
  );
  const cls = cn("flex items-center gap-3 px-4 py-3 min-h-[56px] w-full text-left", interactive && "hover:bg-slate-50 active:bg-slate-100 transition-colors", className);
  return (
    <li>
      {href ? <Link href={href} className={cls}>{body}</Link>
        : onClick ? <button type="button" onClick={onClick} className={cls}>{body}</button>
        : <div className={cls}>{body}</div>}
    </li>
  );
}

/** Boş liste (DESIGN.md §7): tek cümle + isteğe bağlı tek eylem. */
export function ListEmpty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <li className="px-4 py-8 text-center">
      <p className="text-sm text-slate-500">{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </li>
  );
}
