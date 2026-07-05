"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { Info, AlertTriangle, AlertOctagon, X } from "lucide-react";

type Banner = { id: number; message: string; type: string };

const STYLES: Record<string, { cls: string; icon: React.ElementType }> = {
  info:     { cls: "bg-indigo-600 text-white",  icon: Info },
  warning:  { cls: "bg-amber-500 text-white",   icon: AlertTriangle },
  critical: { cls: "bg-red-600 text-white",     icon: AlertOctagon },
};

// God Mode'dan yayınlanan platform duyuruları — tüm portalların üstünde gösterilir.
// Kapatılan duyuru sessionStorage'da tutulur, oturum boyunca tekrar gösterilmez.
export default function SystemBanner() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [dismissed, setDismissed] = useState<number[]>([]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("optishift_dismissed_banners");
      if (raw) setDismissed(JSON.parse(raw));
    } catch { /* empty */ }

    fetch("/api/god/banners")
      .then(r => (r.ok ? r.json() : []))
      .then((data: any) => { if (Array.isArray(data)) setBanners(data); })
      .catch(() => {});
  }, []);

  const dismiss = (id: number) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try { sessionStorage.setItem("optishift_dismissed_banners", JSON.stringify(next)); } catch { /* empty */ }
  };

  const visible = banners.filter(b => !dismissed.includes(b.id));
  if (visible.length === 0) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[70]">
      {visible.map(b => {
        const meta = STYLES[b.type] ?? STYLES.info;
        return (
          <div key={b.id} className={`flex items-center gap-2.5 px-4 py-2 text-sm font-medium ${meta.cls}`}>
            <meta.icon size={14} className="shrink-0" />
            <span className="flex-1 min-w-0 truncate">{b.message}</span>
            <button onClick={() => dismiss(b.id)} className="shrink-0 opacity-70 hover:opacity-100 transition-opacity">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
