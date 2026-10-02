"use client";

/**
 * İşletme Asistanı (yapay zekâ, lib/ai/chat): yönetim panelinin her sayfasında sağ alttaki düğme.
 * Şube panelinde o şube, "Tüm Şubeler" görünümünde kapsamdaki şubeler hakkında sorulur
 * (bağlam sunucuda: lib/ai/businessContext). Sunucuda anahtar yoksa hiç görünmez.
 */
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, X } from "lucide-react";

type Turn = { role: "user" | "assistant"; text: string };

// Yapay zekâ cevabındaki basit Markdown: **kalın**, *italik*, "- " / "* " madde, # başlık (ham işaret görünmesin)
function Rich({ text }: { text: string }) {
  // Önce **kalın**, kalan parçalarda *italik*; eşleşmeyen tek yıldızlar silinir
  const plain = (t: string, k: string) => t.split(/(\*[^*\s][^*]*\*)/g).map((p, j) =>
    p.length > 2 && p.startsWith("*") && p.endsWith("*")
      ? <em key={`${k}-${j}`} className="text-slate-500">{p.slice(1, -1)}</em>
      : <span key={`${k}-${j}`}>{p.replace(/\*/g, "")}</span>);
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : plain(part, String(i)));
  return (
    <div className="space-y-1">
      {text.split("\n").map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="h-1" />;
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        if (bullet) return <div key={i} className="flex gap-1.5 pl-1"><span className="text-slate-400">•</span><span>{inline(bullet[1])}</span></div>;
        const heading = line.match(/^#{1,4}\s+(.*)$/);
        if (heading) return <p key={i} className="font-bold">{inline(heading[1])}</p>;
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}

const EXAMPLES_BRANCH = ["Bu hafta kim izinli?", "Gelecek hafta planı hazır mı?", "En çok kim çalışıyor?", "Bekleyen onaylar neler?"];
const EXAMPLES_ALL = ["Hangi şubenin planı eksik?", "Şubeleri karşılaştır", "Bekleyen izinler hangi şubede?"];

export default function AssistantPanel({ scope = "branch" }: { scope?: "branch" | "all" }) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(null);
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

  // Şube kapsamı: seçili şube; değişince eski sohbet yeni şubeye karışmasın
  useEffect(() => {
    if (scope === "all") return;
    const read = () => {
      let loc: string | null = null;
      try {
        loc = localStorage.getItem("optishift_selected_location")
          || JSON.parse(localStorage.getItem("optishift_manager_user") || "{}").location_id || null;
      } catch { loc = null; }
      setLocationId(prev => { if (prev !== loc) setTurns([]); return loc; });
    };
    read();
    window.addEventListener("optishift_location_changed", read);
    return () => window.removeEventListener("optishift_location_changed", read);
  }, [scope]);

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
        body: JSON.stringify({ location_id: scope === "all" ? null : locationId, question, history }),
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

  const examples = scope === "all" ? EXAMPLES_ALL : EXAMPLES_BRANCH;

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Asistan"
          className="fixed z-40 right-4 bottom-24 lg:bottom-6 inline-flex items-center gap-2 pl-3.5 pr-4 py-3 rounded-full bg-forest-700 text-white text-sm font-bold shadow-lg shadow-forest-900/20 hover:bg-forest-800">
          <Sparkles size={16} /> Asistan
        </button>
      )}
      {open && (
        <div className="fixed z-50 inset-x-0 bottom-0 lg:inset-auto lg:right-6 lg:bottom-6 lg:w-[400px] h-[80vh] lg:h-[600px] bg-white border border-slate-200 rounded-t-2xl lg:rounded-2xl shadow-2xl flex flex-col" role="dialog" aria-label="İşletme Asistanı">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <Sparkles size={16} className="text-ember-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-slate-900">İşletme Asistanı</p>
              <p className="text-[11px] text-slate-500 truncate">{scope === "all" ? "Tüm şubeler hakkında sorun" : "Bu şube hakkında sorun"}</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Kapat" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {turns.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">Personel, plan, izinler, onaylar, fazla mesai ve ayarlar hakkında sorabilirsiniz.</p>
                <div className="flex flex-wrap gap-1.5">
                  {examples.map(e => (
                    <button key={e} onClick={() => ask(e)} disabled={busy}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50">
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={t.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-md bg-forest-700 text-white px-3.5 py-2 text-sm"
                  : "max-w-[90%] rounded-2xl rounded-bl-md bg-slate-50 border border-slate-100 px-3.5 py-2.5 text-sm text-slate-800"}>
                  {t.role === "assistant" ? <Rich text={t.text} /> : t.text}
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-slate-400 px-1">Asistan düşünüyor…</p>}
            <div ref={endRef} />
          </div>

          <div className="border-t border-slate-100 px-3 py-3 space-y-1.5">
            {error && <p className="text-xs font-semibold text-red-600 px-1">{error}</p>}
            <form onSubmit={e => { e.preventDefault(); ask(input); }} className="flex items-center gap-2">
              <input value={input} onChange={e => setInput(e.target.value)} maxLength={500} disabled={busy}
                placeholder="Bir soru yazın…"
                className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-forest-400" />
              <button type="submit" disabled={busy || !input.trim()} aria-label="Gönder"
                className="shrink-0 w-10 h-10 rounded-xl bg-forest-700 text-white flex items-center justify-center disabled:opacity-40">
                <Send size={16} />
              </button>
            </form>
            <p className="text-[10px] text-slate-400 px-1">Yapay zekâ cevaplarını kontrol edin. Asistan kayıt değiştirmez, bilgi ve öneri verir.</p>
          </div>
        </div>
      )}
    </>
  );
}
