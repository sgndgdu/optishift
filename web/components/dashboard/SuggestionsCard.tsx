"use client";

/**
 * Ana Sayfa "Hazır çözümler" (lib/suggestions): karar bekleyen işin çözümü önceden hazırlanmıştır,
 * "Uygula" mevcut uçlarla uygular (lib/copilot/applyAction). Uygulanan kart sonucunu gösterip kalır,
 * "Kendim bakarım" işin normal ekranına götürür.
 */
import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { applyAction } from "@/lib/copilot/applyAction";
import type { Suggestion } from "@/lib/suggestions";
import { cn } from "@/lib/utils";

type State = { status: "idle" | "busy" | "done" | "failed"; message?: string };

export function SuggestionsCard({ suggestions }: { suggestions: Suggestion[] }) {
  const [state, setState] = useState<Record<string, State>>({});
  // Uygulanan kart, sayfa tazelenip listeden düşse de sonucuyla görünür kalır
  const [kept, setKept] = useState<Suggestion[]>([]);
  const list = [...suggestions, ...kept.filter(k => !suggestions.some(s => s.id === k.id))];
  if (list.length === 0) return null;

  const run = async (s: Suggestion) => {
    setState(p => ({ ...p, [s.id]: { status: "busy" } }));
    setKept(k => (k.some(x => x.id === s.id) ? k : [...k, s]));
    const res = await applyAction(s.action);
    setState(p => ({ ...p, [s.id]: { status: res.ok ? "done" : "failed", message: res.message } }));
  };
  const open = list.filter(s => state[s.id]?.status !== "done").length;

  return (
    <Card id="hazir-cozumler" className="stripe-card border-0 shadow-none scroll-mt-6">
      <CardHeader className="border-b border-border/40 pb-4">
        <div className="flex items-center gap-2.5">
          <Sparkles size={16} className="text-ember-500" />
          <CardTitle className="text-base font-bold">Hazır çözümler</CardTitle>
          {open > 0 && <Badge variant="secondary">{open}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-slate-100">
          {list.map(s => {
            const st = state[s.id] ?? { status: "idle" };
            return (
              <li key={s.id} className="px-5 py-4 space-y-2.5">
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    {s.urgent && <span className="mr-1.5 text-red-600">Acil ·</span>}{s.title}
                  </p>
                  <p className="text-sm text-slate-600 mt-1">{s.detail}</p>
                </div>
                {st.status === "done" ? (
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-forest-700"><Check size={15} /> {st.message}</p>
                ) : (
                  <div className="space-y-1.5">
                    {st.status === "failed" && <p className="text-xs font-semibold text-red-600">{st.message}</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => run(s)} disabled={st.status === "busy"}
                        className={cn("inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary/90 disabled:opacity-60")}>
                        <Check size={14} /> {st.status === "busy" ? "Uygulanıyor…" : st.status === "failed" ? "Tekrar dene" : "Uygula"}
                      </button>
                      <Link href={s.href} className="inline-flex min-h-[40px] items-center rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">
                        Kendim bakarım
                      </Link>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
