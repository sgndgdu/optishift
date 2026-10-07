"use client";

/**
 * Planı cümleyle değiştirme (Vardiya Planı). Sorumlu isteği yazar, yapay zekâ isteği kurallara çevirir
 * (/api/plan/instruct, lib/ai/planInstruct); sorumlu anlaşılanı görüp onaylayınca plan motorla yeniden kurulur
 * (sayfanın runGenerate'i, mevcut plan en az değişir) ve değişen vardiyalar listelenir. Geri Al ile eski plana dönülür.
 */
import { useState } from "react";
import { Sparkles, Undo2, X } from "lucide-react";
import type { PlanOverride } from "@/lib/planOverrides";
import { cn } from "@/lib/utils";

type Parsed = { summary: string[]; dropped: string[]; overrides: PlanOverride[]; ask?: string };
export type RebuildResult = { ok: boolean; error?: string; changes: string[] };


export default function PlanInstructBar({ locationId, weekStart, onRebuild, onUndo }: {
  locationId: string; weekStart: string;
  onRebuild: (overrides: PlanOverride[]) => Promise<RebuildResult>;
  onUndo: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "parse" | "build">("");
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [result, setResult] = useState<RebuildResult | null>(null);
  const [undone, setUndone] = useState(false);

  const reset = () => { setParsed(null); setResult(null); setError(""); setUndone(false); };

  const parse = async (q: string) => {
    const t = q.trim();
    if (!t || busy) return;
    reset();
    setText(t);
    setBusy("parse");
    try {
      const r = await fetch("/api/plan/instruct", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: locationId, week_start: weekStart, text: t }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setError(d.error || "İstek işlenemedi.");
      else setParsed({ summary: d.summary ?? [], dropped: d.dropped ?? [], overrides: d.overrides ?? [], ask: d.ask });
    } catch { setError("Bağlantı hatası, tekrar deneyin."); }
    finally { setBusy(""); }
  };

  const build = async () => {
    if (!parsed?.overrides.length) return;
    setBusy("build");
    setError("");
    try {
      const r = await onRebuild(parsed.overrides);
      if (!r.ok) setError(r.error || "Plan yeniden kurulamadı.");
      else { setResult(r); setParsed(null); setText(""); }
    } finally { setBusy(""); }
  };

  return (
    // Sadeleştirme (2026-10-07): başlık ve örnek düğmeleri kalktı, tek satırlık kutu; örnek yer tutucuda
    <div className={cn("bg-white border border-slate-200 rounded-2xl", parsed || result || error ? "p-4 space-y-3" : "p-2")}>
      <form onSubmit={e => { e.preventDefault(); parse(text); }} className="flex items-center gap-2">
        <Sparkles size={16} className="text-ember-500 shrink-0 ml-2" aria-hidden />
        <input value={text} onChange={e => setText(e.target.value)} maxLength={600} disabled={!!busy}
          aria-label="Planı yazarak değiştirin"
          placeholder="Planı yazarak değiştirin. Örneğin: Mehmet cuma gelemiyor"
          className="flex-1 min-w-0 rounded-xl px-2 py-2 text-sm focus:outline-none" />
        {text.trim() && (
          <button type="submit" disabled={!!busy}
            className="shrink-0 px-4 py-2 rounded-xl bg-forest-700 text-white text-sm font-bold disabled:opacity-40">
            {busy === "parse" ? "Okunuyor…" : "Devam"}
          </button>
        )}
        {(parsed || result || error) && (
          <button onClick={reset} type="button" aria-label="Kapat" title="Kapat" className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"><X size={15} /></button>
        )}
      </form>
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

      {parsed && (
        <div className="space-y-2">
          {parsed.ask && <p className="text-sm text-slate-700">{parsed.ask}</p>}
          {parsed.summary.length > 0 && (
            <div className="rounded-xl bg-forest-50/60 border border-forest-100 px-3 py-2.5 space-y-1">
              <p className="text-xs font-semibold text-forest-800">Plan şu isteklere göre yeniden kurulur:</p>
              {parsed.summary.map((s, i) => <p key={i} className="text-sm text-slate-800">• {s}</p>)}
              <p className="text-xs text-slate-500 pt-1">Diğer vardiyalar mümkün olduğunca yerinde kalır. Çalışma kuralları her zamanki gibi uygulanır.</p>
            </div>
          )}
          {parsed.dropped.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800 space-y-0.5">
              {parsed.dropped.map((d, i) => <p key={i}>Uygulanamaz: {d}</p>)}
            </div>
          )}
          {parsed.overrides.length > 0 && (
            <div className="flex gap-2">
              <button onClick={build} disabled={!!busy}
                className="px-4 py-2 rounded-xl bg-forest-700 text-white text-sm font-bold disabled:opacity-40">
                {busy === "build" ? "Plan kuruluyor…" : "Planı yeniden kur"}
              </button>
              <button onClick={reset} disabled={!!busy} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold">Vazgeç</button>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-forest-800">
            {undone ? "Eski plana dönüldü." : result.changes.length ? `${result.changes.length} değişiklik yapıldı ve taslak kaydedildi.` : "Plan isteklere zaten uyuyordu, değişiklik gerekmedi."}
          </p>
          {!undone && result.changes.length > 0 && (
            <div className="rounded-xl border border-slate-100 px-3 py-2 max-h-48 overflow-y-auto space-y-0.5">
              {result.changes.map((c, i) => <p key={i} className="text-xs text-slate-700">{c}</p>)}
            </div>
          )}
          {!undone && result.changes.length > 0 && (
            <button onClick={() => { onUndo(); setUndone(true); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50">
              <Undo2 size={13} /> Geri al
            </button>
          )}
        </div>
      )}
    </div>
  );
}
