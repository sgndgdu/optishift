"use client";

/**
 * Planı yazarak değiştirme (Vardiya Planı). Sorumlu isteği yazar, yapay zekâ isteği kurallara çevirir
 * (/api/plan/instruct, lib/ai/planInstruct); sorumlu anlaşılanı görüp onaylayınca plan motorla yeniden kurulur
 * (sayfanın runGenerate'i, mevcut plan en az değişir) ve değişen vardiyalar listelenir. Geri Al ile eski plana dönülür.
 *
 * Konuşma olarak çalışır (2026-10-07, kullanıcı geri bildirimi): yapay zekâ soru sorarsa altta cevap yazılır,
 * önceki mesajlar sunucuya `history` ile gider; anlaşılan listeye ekleme/düzeltme de aynı kutudan yazılır.
 * Kutu her hafta görünür; plan yoksa veya hafta yayınlanmışsa sadece üstteki Planı Oluştur / Düzenle düğmesine yönlendirir
 * (düğme tek yerde, sayfanın üst çubuğunda).
 */
import { useEffect, useRef, useState } from "react";
import { RotateCcw, Send, Sparkles, Undo2 } from "lucide-react";
import type { PlanOverride } from "@/lib/planOverrides";
import { cn } from "@/lib/utils";

type Parsed = { summary: string[]; dropped: string[]; overrides: PlanOverride[]; ask?: string };
export type RebuildResult = { ok: boolean; error?: string; changes: string[] };
type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; parsed: Parsed; modelText: string }
  | { role: "result"; result: RebuildResult; undone?: boolean };

export type InstructMode = "ready" | "locked" | "empty";

export default function PlanInstructBar({ locationId, weekStart, mode, onRebuild, onUndo }: {
  locationId: string; weekStart: string; mode: InstructMode;
  onRebuild: (overrides: PlanOverride[]) => Promise<RebuildResult>;
  onUndo: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "parse" | "build">("");
  const [error, setError] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Hafta değişince konuşma baştan
  useEffect(() => { setMsgs([]); setText(""); setError(""); }, [weekStart, locationId]);

  const last = msgs[msgs.length - 1];
  const lastParsed = last?.role === "assistant" ? last.parsed : null;
  const asking = !!lastParsed?.ask && !lastParsed.overrides.length;

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    // Sunucuya giden geçmiş: plan kurulduktan sonraki mesajlar (yeni istek yeni konuşmadır)
    const lastResult = msgs.map(m => m.role).lastIndexOf("result");
    const convo = msgs.slice(lastResult + 1);
    const history: { role: "user" | "model"; text: string }[] = [];
    for (const m of convo) {
      if (m.role === "user") history.push({ role: "user", text: m.text });
      else if (m.role === "assistant") history.push({ role: "model", text: m.modelText });
    }
    setMsgs(m => [...m, { role: "user", text: t }]);
    setText("");
    setError("");
    setBusy("parse");
    try {
      const r = await fetch("/api/plan/instruct", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: locationId, week_start: weekStart, text: t, history: history.slice(-8) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setError(d.error || "İstek işlenemedi.");
      else setMsgs(m => [...m, {
        role: "assistant",
        parsed: { summary: d.summary ?? [], dropped: d.dropped ?? [], overrides: d.overrides ?? [], ask: d.ask },
        modelText: typeof d.model_text === "string" ? d.model_text : JSON.stringify(d.ask ? { ask: d.ask } : {}),
      }]);
    } catch { setError("Bağlantı hatası, tekrar deneyin."); }
    finally { setBusy(""); setTimeout(() => inputRef.current?.focus(), 0); }
  };

  const build = async () => {
    if (!lastParsed?.overrides.length) return;
    setBusy("build");
    setError("");
    try {
      const r = await onRebuild(lastParsed.overrides);
      if (!r.ok) setError(r.error || "Plan yeniden kurulamadı.");
      else setMsgs(m => [...m, { role: "result", result: r }]);
    } finally { setBusy(""); }
  };

  const undo = (i: number) => {
    onUndo();
    setMsgs(m => m.map((x, k) => (k === i && x.role === "result" ? { ...x, undone: true } : x)));
  };

  const header = (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-forest-700 text-ember-300"><Sparkles size={17} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">Planı yazarak değiştirin</p>
        <p className="text-xs text-slate-500">Örneğin: &quot;Mehmet cuma gelemiyor&quot;, &quot;Ayşe bu hafta sadece sabah çalışsın&quot;, &quot;Cumartesi akşama bir kişi daha&quot;.</p>
      </div>
      {msgs.length > 0 && mode === "ready" && (
        <button type="button" onClick={() => { setMsgs([]); setError(""); }} disabled={!!busy}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100">
          <RotateCcw size={12} /> Yeni istek
        </button>
      )}
    </div>
  );

  if (mode !== "ready") {
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        {header}
        <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
          {mode === "locked"
            ? "Bu hafta yayınlanmış. Yazarak değiştirmek için önce üstteki Düzenle düğmesiyle düzenlemeyi açın."
            : "Bu haftanın planı henüz yok. Önce üstteki Planı Oluştur düğmesiyle planı oluşturun, sonra buradan yazarak değiştirebilirsiniz."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      {header}

      {msgs.length > 0 && (
        <div className="space-y-2.5">
          {msgs.map((m, i) => {
            if (m.role === "user") return (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-forest-700 px-3.5 py-2 text-sm text-white">{m.text}</p>
              </div>
            );
            if (m.role === "result") {
              const r = m.result;
              return (
                <div key={i} className="space-y-2 rounded-xl border border-forest-100 bg-forest-50/60 px-3 py-2.5">
                  <p className="text-sm font-semibold text-forest-800">
                    {m.undone ? "Eski plana dönüldü." : r.changes.length ? `${r.changes.length} değişiklik yapıldı ve taslak kaydedildi.` : "Plan isteklere zaten uyuyordu, değişiklik gerekmedi."}
                  </p>
                  {!m.undone && r.changes.length > 0 && (
                    <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg bg-white px-3 py-2">
                      {r.changes.map((c, k) => <p key={k} className="text-xs text-slate-700">{c}</p>)}
                    </div>
                  )}
                  {!m.undone && r.changes.length > 0 && i === msgs.length - 1 && (
                    <button onClick={() => undo(i)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                      <Undo2 size={13} /> Geri al
                    </button>
                  )}
                </div>
              );
            }
            const p = m.parsed;
            const isLast = i === msgs.length - 1;
            return (
              <div key={i} className="max-w-[92%] space-y-2 rounded-2xl rounded-bl-md bg-slate-50 px-3.5 py-2.5">
                {p.ask && <p className="text-sm text-slate-800">{p.ask}</p>}
                {p.summary.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-forest-800">Anladığım istekler:</p>
                    {p.summary.map((s, k) => <p key={k} className="text-sm text-slate-800">• {s}</p>)}
                  </div>
                )}
                {p.dropped.length > 0 && (
                  <div className="space-y-0.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                    {p.dropped.map((d, k) => <p key={k}>Uygulanamaz: {d}</p>)}
                  </div>
                )}
                {isLast && p.overrides.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs text-slate-500">Diğer vardiyalar mümkün olduğunca yerinde kalır, çalışma kuralları her zamanki gibi uygulanır. Eklemek ya da düzeltmek istediğiniz bir şey varsa aşağıya yazın.</p>
                    <button onClick={build} disabled={!!busy}
                      className="rounded-xl bg-forest-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                      {busy === "build" ? "Plan kuruluyor…" : "Planı bu isteklere göre yeniden kur"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {busy === "parse" && <p className="text-xs text-slate-400">Okunuyor…</p>}
        </div>
      )}

      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

      <form onSubmit={e => { e.preventDefault(); send(); }} className="flex items-end gap-2">
        <textarea ref={inputRef} value={text} onChange={e => setText(e.target.value)} maxLength={600} rows={1} disabled={busy === "build"}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          aria-label={asking ? "Cevabınız" : "İsteğiniz"}
          placeholder={asking ? "Cevabınızı yazın" : lastParsed?.overrides.length ? "Eklemek ya da düzeltmek istediğinizi yazın" : "İsteğinizi yazın"}
          className="field-input min-h-[44px] flex-1 resize-none py-2.5" />
        <button type="submit" disabled={!text.trim() || !!busy} aria-label="Gönder"
          className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-forest-700 text-white disabled:opacity-40")}>
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
