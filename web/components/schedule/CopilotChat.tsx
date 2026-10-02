"use client";

/**
 * Plan Asistanı sohbet kutusu (yapay zekâ, lib/ai/chat). Sunucuda anahtar yoksa hiç görünmez.
 * Bağlam: ekrandaki haftanın özeti (kaydedilmemiş değişiklikler dahil). Hafta/şube değişince sohbet sıfırlanır
 * (WeekCopilot bileşeni key ile yeniden kurar).
 */
import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import type { WeekSnapshot } from "@/lib/copilot";

type Turn = { role: "user" | "assistant"; text: string };

const EXAMPLES = ["Salı akşamına kimi koyabilirim?", "Bu hafta en yorgun kim?", "Eksik günleri nasıl kapatırım?"];

export default function CopilotChat({ locationId, snapshot }: { locationId: string; snapshot: WeekSnapshot }) {
  const [enabled, setEnabled] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let stale = false;
    fetch("/api/copilot/chat").then(r => (r.ok ? r.json() : null)).then(d => { if (!stale) setEnabled(!!d?.enabled); }).catch(() => {});
    return () => { stale = true; };
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [turns, busy]);

  if (!enabled) return null;

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setError("");
    setInput("");
    const history = turns;
    setTurns([...history, { role: "user", text: question }]);
    setBusy(true);
    try {
      const r = await fetch("/api/copilot/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: locationId, question, history, snapshot }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.answer) {
        setError(d.error || "Asistan şu an cevap veremiyor.");
        setTurns(history);
        setInput(question);
      } else {
        setTurns([...history, { role: "user", text: question }, { role: "assistant", text: d.answer }]);
      }
    } catch {
      setError("Bağlantı hatası, tekrar deneyin.");
      setTurns(history);
      setInput(question);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Asistana sor</p>
      {turns.length > 0 && (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {turns.map((t, i) => (
            <div key={i} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={t.role === "user"
                ? "max-w-[85%] rounded-2xl rounded-br-md bg-forest-700 text-white px-3.5 py-2 text-sm"
                : "max-w-[90%] rounded-2xl rounded-bl-md bg-slate-50 border border-slate-100 px-3.5 py-2.5 text-sm text-slate-800 whitespace-pre-wrap"}>
                {t.text}
              </div>
            </div>
          ))}
          {busy && <p className="text-xs text-slate-400 px-1">Asistan düşünüyor…</p>}
          <div ref={endRef} />
        </div>
      )}
      {turns.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map(e => (
            <button key={e} onClick={() => ask(e)} disabled={busy}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50">
              {e}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={e => { e.preventDefault(); ask(input); }} className="flex items-center gap-2">
        <input value={input} onChange={e => setInput(e.target.value)} maxLength={500} disabled={busy}
          placeholder="Planla ilgili bir şey sorun…"
          className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-forest-400" />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Gönder"
          className="shrink-0 w-10 h-10 rounded-xl bg-forest-700 text-white flex items-center justify-center disabled:opacity-40">
          <Send size={16} />
        </button>
      </form>
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      <p className="text-[10px] text-slate-400">Yapay zekâ cevaplarını kontrol edin. Asistan planı değiştirmez, sadece öneri verir.</p>
    </div>
  );
}
