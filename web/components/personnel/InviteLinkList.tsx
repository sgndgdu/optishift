"use client";
/**
 * Yeni açılan hesapların giriş bağlantıları (Excel aktarımı ve Hızlı Kurulum ortak).
 * Kopyalama panoya izin yoksa bağlantı seçilebilir metin olarak da görünür.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface InviteResult { name: string; username: string; invite_token: string }

export default function InviteLinkList({ results }: { results: InviteResult[] }) {
  const [copied, setCopied] = useState<number | null>(null);
  const link = (t: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/setup?token=${t}`;
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">Her kişiye giriş bağlantısını gönderin (WhatsApp, SMS). İlk girişte şifresini kendisi belirler, bağlantı 7 gün geçerli.</p>
      {results.map((r, i) => (
        <div key={r.invite_token} className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-sm flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-800 truncate">{r.name}</div>
            <div className="text-xs text-slate-500">Kullanıcı adı: {r.username}</div>
          </div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(link(r.invite_token)).then(() => {
                setCopied(i);
                setTimeout(() => setCopied(prev => (prev === i ? null : prev)), 2000);
              }).catch(() => window.prompt?.("Bağlantıyı kopyalayın", link(r.invite_token)));
            }}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0", copied === i ? "bg-emerald-500 text-white" : "bg-forest-50 text-forest-700 hover:bg-forest-100")}
          >
            {copied === i ? "Kopyalandı" : "Giriş bağlantısını kopyala"}
          </button>
        </div>
      ))}
    </div>
  );
}
