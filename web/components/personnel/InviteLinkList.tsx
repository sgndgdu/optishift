"use client";
/**
 * Yeni açılan hesapların giriş bağlantıları (Excel aktarımı ve Hızlı Kurulum ortak).
 * Kişi başına WhatsApp ile gönder / kopyala; hepsi için tek mesajda kopyala.
 * Kopyalama panoya izin yoksa bağlantı seçilebilir metin olarak da görünür.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface InviteResult { name: string; username: string; invite_token: string }

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export default function InviteLinkList({ results }: { results: InviteResult[] }) {
  const [copied, setCopied] = useState<number | "all" | null>(null);
  const link = (t: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/setup?token=${t}`;
  const message = (r: InviteResult) =>
    `Merhaba ${firstName(r.name)}, vardiyalarını OptiShift'ten görebilirsin. Bu bağlantıdan girip şifreni belirle: ${link(r.invite_token)}`;
  const copy = (text: string, key: number | "all") => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(prev => (prev === key ? null : prev)), 2000);
    }).catch(() => window.prompt?.("Kopyalayın", text));
  };
  const allText = results.map(r => `${r.name}: ${link(r.invite_token)}`).join("\n");

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">Her kişiye giriş bağlantısını gönderin. İlk girişte şifresini kendisi belirler, bağlantı 7 gün geçerli.</p>
      {results.length > 1 && (
        <button
          onClick={() => copy(`OptiShift giriş bağlantıları (ilk girişte herkes kendi şifresini belirler):\n${allText}`, "all")}
          className={cn("w-full py-2.5 rounded-lg text-sm font-bold transition-colors", copied === "all" ? "bg-emerald-500 text-white" : "bg-forest-700 text-white hover:bg-forest-800")}
        >
          {copied === "all" ? "Hepsi kopyalandı" : `${results.length} bağlantının hepsini tek mesajda kopyala`}
        </button>
      )}
      {results.map((r, i) => (
        <div key={r.invite_token} className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-sm flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-800 truncate">{r.name}</div>
            <div className="text-xs text-slate-500">Kullanıcı adı: {r.username}</div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message(r))}`}
              target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              WhatsApp ile gönder
            </a>
            <button
              onClick={() => copy(link(r.invite_token), i)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", copied === i ? "bg-emerald-500 text-white" : "bg-forest-50 text-forest-700 hover:bg-forest-100")}
            >
              {copied === i ? "Kopyalandı" : "Kopyala"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
