"use client";

/**
 * Vardiya Planı: haftanın uyarılarını üst üste bantlar yerine tek bir şeritte toplar.
 * Tek uyarı varsa doğrudan gösterilir; birden fazlaysa kapalı gelir, başlıkta en
 * önemli uyarı yazar, tıklayınca liste açılır.
 */

import { useState, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type WeekAlertTone = "danger" | "warning" | "info" | "success";

export type WeekAlert = {
  id: string;
  tone: WeekAlertTone;
  title: string;
  detail?: ReactNode;
  action?: { label: string; onClick: () => void };
};

const ORDER: Record<WeekAlertTone, number> = { danger: 0, warning: 1, info: 2, success: 3 };

const TONE = {
  danger:  { box: "bg-red-50 border-red-200",         text: "text-red-800",     sub: "text-red-700",     btn: "text-red-700 hover:text-red-900",         Icon: AlertCircle },
  warning: { box: "bg-amber-50 border-amber-200",     text: "text-amber-900",   sub: "text-amber-800",   btn: "text-amber-800 hover:text-amber-950",     Icon: AlertTriangle },
  info:    { box: "bg-sky-50 border-sky-200",         text: "text-sky-900",     sub: "text-sky-800",     btn: "text-sky-700 hover:text-sky-900",         Icon: Info },
  success: { box: "bg-emerald-50 border-emerald-200", text: "text-emerald-900", sub: "text-emerald-800", btn: "text-emerald-700 hover:text-emerald-900", Icon: CheckCircle2 },
} as const;

function AlertRow({ alert }: { alert: WeekAlert }) {
  const t = TONE[alert.tone];
  return (
    <div className="flex items-start gap-2.5">
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

export default function WeekAlerts({ alerts }: { alerts: WeekAlert[] }) {
  const [open, setOpen] = useState(false);
  if (alerts.length === 0) return null;

  const sorted = [...alerts].sort((a, b) => ORDER[a.tone] - ORDER[b.tone]);
  const top = sorted[0];
  const t = TONE[top.tone];

  if (sorted.length === 1) {
    return <div className={cn("rounded-xl border px-4 py-3", t.box)}><AlertRow alert={top} /></div>;
  }

  return (
    <div className={cn("rounded-xl border", t.box)}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-center gap-2.5 px-4 py-3 text-left">
        <t.Icon size={15} className={cn("shrink-0", t.sub)} />
        <span className={cn("text-sm font-bold flex-1 min-w-0 truncate", t.text)}>
          {sorted.length} uyarı <span className="font-medium opacity-80">· {top.title}</span>
        </span>
        <span className={cn("text-xs font-bold shrink-0", t.btn)}>{open ? "Gizle" : "Göster"}</span>
        <ChevronDown size={14} className={cn("shrink-0 transition-transform", t.sub, open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-3">
          {sorted.map(a => (
            <div key={a.id} className={cn("rounded-lg border bg-white/70 px-3 py-2.5", TONE[a.tone].box)}>
              <AlertRow alert={a} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
