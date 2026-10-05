"use client";

import { Check, CalendarClock, Users, Grid3x3, Sparkles } from "lucide-react";

/**
 * Vardiya Planı'nda kurulum bandı: eksik adımları sırayla gösterir.
 * Vardiya tanımlarının TEK yeri Ayarlar > Temel'dir; bu bant oraya götürür (ayrı bir
 * vardiya düzenleyicisi yok). Kişi eklemenin tek yeri Ekip sayfası; bant oraya götürür.
 */

interface QuickSetupProps {
  shiftDefsCount: number;
  personnelCount: number;
  demandFilled: boolean;
  /** Personel ihtiyacı tablosu Planı Oluştur sihirbazının 1. adımında */
  onOpenDemand: () => void;
}

export default function QuickSetup({ shiftDefsCount, personnelCount, demandFilled, onOpenDemand }: QuickSetupProps) {

  const steps = [
    { key: "shifts",    label: "Vardiyaları tanımla",  done: shiftDefsCount > 0,  icon: CalendarClock, action: () => { window.location.href = "/settings?tab=basic"; } },
    { key: "personnel", label: "Ekibi ekle",            done: personnelCount > 0,  icon: Users,          action: () => { window.location.href = "/personnel?add=1"; } },
    { key: "demand",    label: "Kaç kişi gerektiğini gir", done: demandFilled,        icon: Grid3x3,        action: onOpenDemand },
  ];
  const allDone = steps.every(s => s.done);
  if (allDone) return null;

  return (
      <div className="bg-forest-50/70 border border-forest-100 rounded-2xl px-4 py-3.5">
        <div className="flex items-center gap-2 mb-2.5">
          <Sparkles size={14} className="text-forest-500" />
          <p className="text-xs font-bold text-forest-700">Hızlı Kurulum · {steps.filter(s => s.done).length}/3</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {steps.map((s, i) => (
            <div key={s.key} className={`flex-1 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${s.done ? "bg-white border-emerald-200" : "bg-white border-slate-200"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold ${s.done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                {s.done ? <Check size={13} /> : i + 1}
              </div>
              <span className={`text-xs font-semibold flex-1 ${s.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{s.label}</span>
              {!s.done && (
                <button
                  onClick={s.action}
                  className="text-xs font-bold text-forest-600 bg-forest-50 hover:bg-forest-100 border border-forest-200 px-2.5 py-1 rounded-lg transition-colors shrink-0"
                >
                  Başla
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
  );
}
