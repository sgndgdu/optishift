"use client";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Ayrıntı ve form penceresi (DESIGN.md §6): telefonda alttan açılır, masaüstünde ortada.
 * Başlık + kapat, kaydırılabilir içerik, altta sabit eylemler. Esc kapatır.
 */
export function Sheet({ open, onClose, title, description, children, footer, size = "md" }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Alt eylem çubuğu (Kaydet / Vazgeç gibi). */
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        className={cn(
          "bg-white w-full rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh]",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="p-1.5 -m-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/** Ayrıntı içinde etiket + değer satırı (büyük harf etiket yok). */
export function DetailRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span className="text-sm text-slate-900 text-right min-w-0 break-words">{children}</span>
    </div>
  );
}

/** Pencere altındaki düğmeler. */
export const sheetPrimaryClass = "px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50";
export const sheetSecondaryClass = "px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50";
export const sheetDangerClass = "px-4 py-2.5 rounded-xl border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50";
