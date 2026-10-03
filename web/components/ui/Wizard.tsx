"use client";

/**
 * Adım adım ilerleyen akışların (İleri → İleri → Bitir) ortak parçaları.
 * İlk kurulum, haftalık vardiya oluşturma ve yeni şube açma sihirbazları
 * aynı görünümü bu üç bileşenden alır:
 *
 *   <WizardProgress steps={STEPS} current={step} />
 *   <WizardStep icon={...} title="..." sub="...">…form…</WizardStep>
 *   <WizardNav current={step} total={STEPS.length} onBack onNext busy />
 */

import type { ComponentType, ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

export type WizardStepDef = { label: string; icon: ComponentType<{ size?: number }> };

/** Üstteki numaralı adım çubuğu. */
export function WizardProgress({ steps, current, className = "" }: {
  steps: WizardStepDef[];
  current: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center ${className}`}>
      {steps.map((s, i) => {
        const Icon   = s.icon;
        const done   = current > i;
        const active = current === i;
        return (
          <div key={i} className={`flex items-center ${i < steps.length - 1 ? "flex-1" : ""}`}>
            <div className="flex flex-col items-center gap-1">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                done   ? "bg-primary text-white" :
                active ? "bg-white border-2 border-primary text-primary shadow-md" :
                         "bg-slate-200 text-slate-400"
              }`}>
                {done ? <Check size={16} strokeWidth={3} /> : <Icon size={16} />}
              </div>
              <span className={`text-xs font-bold hidden sm:block ${
                active ? "text-primary" : done ? "text-slate-600" : "text-slate-400"
              }`}>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-4 transition-colors ${current > i ? "bg-primary" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Tek bir adımın başlığı + içeriği. */
export function WizardStep({ title, sub, children }: {
  /** Eski çağrılar için kabul edilir, çizilmez (DESIGN.md: başlık yanında ikon kutusu yok). */
  icon?: ReactNode;
  color?: string;
  title: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{title}</h2>
        <p className="text-slate-500 text-sm mt-1">{sub}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

/** Alttaki Geri / İleri / Bitir düğmeleri. Son adımda `finishLabel` gösterilir. */
export function WizardNav({ current, total, onBack, onNext, busy = false, nextLabel = "Devam Et", finishLabel = "Bitir" }: {
  current: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
  busy?: boolean;
  nextLabel?: string;
  finishLabel?: string;
}) {
  const isLast = current === total - 1;
  return (
    <div className="flex gap-3 mt-8">
      {current > 0 && (
        <button onClick={onBack} disabled={busy}
          className="flex items-center gap-2 px-5 py-3 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors">
          <ArrowLeft size={15} /> Geri
        </button>
      )}
      <button onClick={onNext} disabled={busy}
        className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-md shadow-primary/20 group">
        {busy ? (
          <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Kaydediliyor…</>
        ) : (
          <>{isLast ? finishLabel : nextLabel} <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" /></>
        )}
      </button>
    </div>
  );
}
