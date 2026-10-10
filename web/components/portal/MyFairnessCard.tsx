"use client";

/**
 * Ekip üyesinin ana sayfası: kendi Adalet Puanı (/api/fairness/me) ve açık ekip anketi hatırlatması
 * (/api/fairness-surveys/mine). 2026-10-08: puan ekibe geri açıldı (kayırmaya karşı herkes kendi puanını görür;
 * başkasının puanı gösterilmez).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, ClipboardCheck, Scale } from "lucide-react";
import { fairnessExplainer, formatScore } from "@/lib/fairness";
import { cn } from "@/lib/utils";

export function MyFairnessCard() {
  const [me, setMe] = useState<{ score: number; label: { text: string; level: "low" | "ok" | "high" } } | null>(null);
  const [pending, setPending] = useState<{ location_name: string; answered: boolean }[]>([]);

  useEffect(() => {
    let stale = false;
    fetch("/api/fairness/me").then(r => (r.ok ? r.json() : null)).then(d => { if (!stale && d && typeof d.score === "number") setMe(d); }).catch(() => {});
    fetch("/api/fairness-surveys/mine").then(r => (r.ok ? r.json() : null)).then(d => { if (!stale && d?.open) setPending(d.open); }).catch(() => {});
    return () => { stale = true; };
  }, []);

  const unanswered = pending.filter(p => !p.answered);
  if (!me && pending.length === 0) return null;

  return (
    <div className="space-y-3">
      {unanswered.length > 0 && (
        <Link href="/portal/survey" className="flex items-center gap-3 rounded-2xl border border-forest-200 bg-forest-50 p-4 hover:bg-forest-100">
          <ClipboardCheck size={20} className="shrink-0 text-forest-600" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-forest-900">Vardiyaların zorluğunu puanlayın</span>
            <span className="block text-xs text-forest-700">Bir dakikadan kısa sürer. Cevabınız gizlidir.</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-forest-600" />
        </Link>
      )}
      {me && (
        <Link href="/portal/survey" className="block rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:bg-slate-50">
          <div className="flex items-center gap-2">
            <Scale size={16} className="text-forest-600" />
            <span className="text-sm font-bold text-slate-800">Adalet Puanınız</span>
            <span className="ml-auto text-lg font-bold tabular-nums text-slate-900">{formatScore(me.score)}</span>
          </div>
          <p className={cn("mt-1 text-sm font-semibold",
            me.label.level === "high" ? "text-amber-700" : me.label.level === "low" ? "text-emerald-700" : "text-slate-600")}>{me.label.text}</p>
          <p className="mt-1 text-xs text-slate-500">{fairnessExplainer(null, true)}</p>
        </Link>
      )}
    </div>
  );
}
