"use client";

/**
 * Vardiya Planı: Plan Asistanı kartı. Haftanın kurallı içgörülerini ve hazır soruları
 * gösterir (lib/copilot). Kapalı gelir; başlıkta sorun sayısı yazar.
 */

import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, ChevronDown, Info, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUESTIONS, answerQuestion, type Answer, type Insight, type WeekSnapshot } from "@/lib/copilot";

const TONE = {
  critical: { Icon: AlertCircle,   cls: "text-red-600" },
  warning:  { Icon: AlertTriangle, cls: "text-amber-600" },
  info:     { Icon: Info,          cls: "text-slate-400" },
} as const;

type Loaded = { key: string; data: { snapshot: WeekSnapshot; insights: Insight[] } | null };

export default function WeekCopilot({ locationId, weekStart }: { locationId: string; weekStart: string }) {
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Cevap ve kişi seçimi yüklendiği anahtara bağlı: hafta ya da veri değişince kendiliğinden düşer
  const [asked, setAsked] = useState<{ key: string; id: string; personId?: string; answer: Answer } | null>(null);

  const key = `${locationId}|${weekStart}|${reloadKey}`;
  useEffect(() => {
    if (!locationId || !weekStart) return;
    let cancelled = false;
    fetch(`/api/copilot/week?location_id=${locationId}&week_start=${weekStart}`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(d => { if (!cancelled) setLoaded({ key, data: d }); });
    return () => { cancelled = true; };
  }, [key, locationId, weekStart]);

  const loading = loaded?.key !== key;
  const data = loaded?.data ?? null;
  const failed = !loading && !data;
  const current = asked?.key === key ? asked : null;
  const reload = () => setReloadKey(k => k + 1);

  const ask = (id: string, personId?: string) => {
    if (!data) return;
    const answer = answerQuestion(data.snapshot, id, personId);
    if (answer) setAsked({ key, id, personId, answer });
  };

  const problems = data?.insights.filter(i => i.severity !== "info") ?? [];
  const critical = problems.filter(i => i.severity === "critical").length;
  const headline = !data ? (failed ? "Yüklenemedi" : "Hazırlanıyor…")
    : data.snapshot.status === "empty" ? "Bu hafta için henüz plan yok"
    : problems.length === 0 ? "Planda sorun görünmüyor"
    : `${problems.length} konuya dikkat${critical ? `, ${critical} tanesi acil` : ""}`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button onClick={() => { if (!open) reload(); setOpen(o => !o); }}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left">
        <Sparkles size={15} className="text-ember-500 shrink-0" />
        <span className="text-sm font-bold text-slate-900">Plan Asistanı</span>
        <span className={cn("text-xs font-semibold truncate", critical ? "text-red-600" : problems.length ? "text-amber-700" : "text-slate-500")}>
          {headline}
        </span>
        <ChevronDown size={15} className={cn("ml-auto text-slate-400 transition-transform shrink-0", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-4">
          {failed && (
            <p className="text-sm text-red-600">Plan Asistanı yüklenemedi. <button onClick={reload} className="underline font-semibold">Tekrar dene</button></p>
          )}

          {data && (
            <ul className="space-y-2.5">
              {data.insights.map(i => {
                const t = TONE[i.severity];
                return (
                  <li key={i.id} className="flex gap-2.5">
                    <t.Icon size={15} className={cn("shrink-0 mt-0.5", t.cls)} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{i.title}</p>
                      {i.lines.length > 0 && (
                        <ul className="mt-0.5 space-y-0.5">
                          {i.lines.slice(0, 6).map(l => <li key={l} className="text-xs text-slate-600">{l}</li>)}
                          {i.lines.length > 6 && <li className="text-xs text-slate-400">ve {i.lines.length - 6} satır daha</li>}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {data && data.snapshot.status !== "empty" && (
            <div className="space-y-2.5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hazır sorular</p>
              <div className="flex flex-wrap gap-1.5">
                {QUESTIONS.filter(q => !q.needsPerson).map(q => (
                  <button key={q.id} onClick={() => ask(q.id)}
                    className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                      current?.id === q.id ? "bg-forest-700 text-white border-forest-700" : "bg-white text-slate-700 border-slate-200 hover:border-forest-300 hover:bg-forest-50")}>
                    {q.label}
                  </button>
                ))}
                <select value={current?.id === "person" ? current.personId : ""} aria-label="Bir kişinin haftası"
                  onChange={e => { if (e.target.value) ask("person", e.target.value); else setAsked(null); }}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border bg-white",
                    current?.id === "person" ? "border-forest-700 text-forest-800" : "border-slate-200 text-slate-700")}>
                  <option value="">Bir kişinin haftası…</option>
                  {[...data.snapshot.people].sort((a, b) => a.name.localeCompare(b.name, "tr")).map(p =>
                    <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {current && (
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-3">
                  <p className="text-sm font-bold text-slate-800">{current.answer.title}</p>
                  {current.answer.lines.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {current.answer.lines.map(l => <li key={l} className="text-xs text-slate-600">{l}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-[11px] text-slate-400">Taslaktaki son değişiklikler birkaç saniye içinde yansır.</p>
            <button onClick={reload} disabled={loading}
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50">
              <RefreshCw size={12} className={cn(loading && "animate-spin")} /> Yenile
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
