"use client";

/**
 * Vardiya Planı: haftanın TEK uyarı kartı.
 *
 * Üstte işlem uyarıları (hata, personel ihtiyacı çelişkisi, düzenleme talebi, son otomatik
 * planlamanın notları) her zaman görünür. Altında Plan Kontrolü (yapay zekâ değil, kurallı; sohbet eden
 * yapay zekâ sağ alttaki İşletme Asistanı'dır): ekrandaki plandan
 * (kaydedilmemiş değişiklikler dahil) kurallı içgörüler ve hazır sorular. Sorunlar,
 * Yayınla'daki kontrolle aynı listedir (lib/copilot/checks.ts).
 */

import { useState, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ClipboardCheck, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Insight, type InsightTarget, type WeekSnapshot } from "@/lib/copilot";

export type WeekAlertTone = "danger" | "warning" | "info" | "success";

export type WeekAlert = {
  id: string;
  tone: WeekAlertTone;
  title: string;
  detail?: ReactNode;
  action?: { label: string; onClick: () => void };
};

export type InsightAction = NonNullable<Insight["action"]>;

const ALERT_ORDER: Record<WeekAlertTone, number> = { danger: 0, warning: 1, info: 2, success: 3 };

const ALERT_TONE = {
  danger:  { box: "bg-red-50 border-red-200",         text: "text-red-800",     sub: "text-red-700",     btn: "text-red-700 hover:text-red-900",         Icon: AlertCircle },
  warning: { box: "bg-amber-50 border-amber-200",     text: "text-amber-900",   sub: "text-amber-800",   btn: "text-amber-800 hover:text-amber-950",     Icon: AlertTriangle },
  info:    { box: "bg-sky-50 border-sky-200",         text: "text-sky-900",     sub: "text-sky-800",     btn: "text-sky-700 hover:text-sky-900",         Icon: Info },
  success: { box: "bg-emerald-50 border-emerald-200", text: "text-emerald-900", sub: "text-emerald-800", btn: "text-emerald-700 hover:text-emerald-900", Icon: CheckCircle2 },
} as const;

const INSIGHT_TONE = {
  critical: { Icon: AlertCircle,   cls: "text-red-600" },
  warning:  { Icon: AlertTriangle, cls: "text-amber-600" },
  info:     { Icon: Info,          cls: "text-slate-400" },
} as const;

const ACTION_LABEL: Record<InsightAction, string> = {
  "remind-availability": "Uygunluk İste",
  "open-demand": "Tabloyu Aç",
};

function AlertRow({ alert }: { alert: WeekAlert }) {
  const t = ALERT_TONE[alert.tone];
  return (
    <div className={cn("rounded-lg border px-3 py-2.5 flex items-start gap-2.5", t.box)}>
      <t.Icon size={15} className={cn("shrink-0 mt-0.5", t.sub)} />
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-bold", t.text)}>{alert.title}</p>
        {alert.detail && <div className={cn("text-xs mt-0.5", t.sub)}>{alert.detail}</div>}
      </div>
      {alert.action && (
        <button onClick={alert.action.onClick} className={cn("text-xs font-bold underline shrink-0", t.btn)}>
          {alert.action.label}
        </button>
      )}
    </div>
  );
}

export default function WeekCopilot({ alerts, snapshot, insights, onAction, onJump }: {
  alerts: WeekAlert[];
  /** null: vardiya tanımı ya da personel yok, Asistan gösterilmez. */
  snapshot: WeekSnapshot | null;
  insights: Insight[];
  onAction: (action: InsightAction) => void;
  /** Satıra dokununca plan tablosunda o kişiye/güne gider. */
  onJump?: (target: InsightTarget) => void;
}) {
  const [open, setOpen] = useState(false);

  if (alerts.length === 0 && !snapshot) return null;

  const problems = insights.filter(i => i.severity !== "info");
  const critical = problems.filter(i => i.severity === "critical").length;
  const headline = !snapshot ? ""
    : snapshot.status === "empty" ? "Bu haftanın planı henüz yok"
    : problems.length === 0 ? "Planda sorun görünmüyor"
    : `${problems.length} konuya dikkat${critical ? `, ${critical} tanesi acil` : ""}`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {alerts.length > 0 && (
        <div className="p-3 space-y-2">
          {[...alerts].sort((a, b) => ALERT_ORDER[a.tone] - ALERT_ORDER[b.tone]).map(a => <AlertRow key={a.id} alert={a} />)}
        </div>
      )}

      {snapshot && (
        <>
          <button onClick={() => setOpen(o => !o)} aria-expanded={open}
            className={cn("w-full flex items-center gap-2.5 px-4 py-3 text-left", alerts.length > 0 && "border-t border-slate-100")}>
            <ClipboardCheck size={15} className="text-forest-600 shrink-0" />
            <span className="text-sm font-bold text-slate-900 shrink-0">Plan Kontrolü</span>
            <span className={cn("text-xs font-semibold truncate", critical ? "text-red-600" : problems.length ? "text-amber-700" : "text-slate-500")}>
              {headline}
            </span>
            <ChevronDown size={15} className={cn("ml-auto text-slate-400 transition-transform shrink-0", open && "rotate-180")} />
          </button>

          {open && (
            <div className="border-t border-slate-100 px-4 py-3 space-y-4">
              <ul className="space-y-2.5">
                {insights.map(i => {
                  const t = INSIGHT_TONE[i.severity];
                  return (
                    <li key={i.id} className="flex gap-2.5">
                      <t.Icon size={15} className={cn("shrink-0 mt-0.5", t.cls)} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">{i.title}</p>
                        {i.lines.length > 0 && (
                          <ul className="mt-0.5 space-y-0.5">
                            {i.lines.slice(0, 6).map((l, li) => {
                              const tg = i.targets?.[li];
                              return (
                                <li key={l} className="text-xs text-slate-600">
                                  {tg && onJump
                                    ? <button type="button" onClick={() => onJump(tg)} className="text-left hover:text-forest-700 underline decoration-dotted underline-offset-2">{l}</button>
                                    : l}
                                </li>
                              );
                            })}
                            {i.lines.length > 6 && <li className="text-xs text-slate-400">ve {i.lines.length - 6} satır daha</li>}
                          </ul>
                        )}
                      </div>
                      {i.action && (
                        <button onClick={() => onAction(i.action!)} className="text-xs font-bold text-forest-700 underline shrink-0 self-start">
                          {ACTION_LABEL[i.action]}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Hazır sorular buradan kaldırıldı: aynı işi İşletme Asistanı yapıyor; bu kart sadece uyarı listesi */}
            </div>
          )}
        </>
      )}
    </div>
  );
}
