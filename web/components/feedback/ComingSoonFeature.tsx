"use client";

import { useEffect, useState, type ComponentType } from "react";
import { cn } from "@/lib/utils";

/**
 * Henüz açılmayan özellik kartı: "Yakında" + işletmeye kısa soru. Cevap /api/feedback ile
 * bize ulaşır (God Mode). Özelliği cevaplara göre geliştiriyoruz.
 */
export function ComingSoonFeature({ feature, icon: Icon, title, description, question, placeholder, className }: {
  feature: string;
  icon: ComponentType<{ size?: number }>;
  title: string;
  description: string;
  question: string;
  placeholder?: string;
  className?: string;
}) {
  const storageKey = `optishift_feedback_${feature}`;
  const [sent, setSent] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem(storageKey) === "1") setSent(true); } catch { /* yok say */ }
  }, [storageKey]);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(answer: "want" | "no") {
    setBusy(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, answer, note }),
      });
      setSent(true);
      try { localStorage.setItem(storageKey, "1"); } catch { /* sadece bu cihazda hatırlanır */ }
    } finally { setBusy(false); }
  }

  return (
    <div className={cn("rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4", className)}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-slate-400"><Icon size={16} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            {title}
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">Yakında</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-200">
        {sent ? (
          <p className="text-xs font-semibold text-emerald-700">Teşekkürler, cevabınız bize ulaştı. Bu özelliği buna göre yapacağız.</p>
        ) : !open ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-slate-600 flex-1 min-w-[12rem]">{question}</p>
            <button type="button" onClick={() => setOpen(true)}
              className="px-3 min-h-[36px] rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90">İsterim</button>
            <button type="button" onClick={() => send("no")} disabled={busy}
              className="px-3 min-h-[36px] rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50">Gerek yok</button>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">{question}</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={1000}
              placeholder={placeholder}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-forest-400 resize-none" />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setOpen(false)} className="px-3 min-h-[36px] rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100">Vazgeç</button>
              <button type="button" onClick={() => send("want")} disabled={busy}
                className="px-3 min-h-[36px] rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 disabled:opacity-50">Gönder</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
