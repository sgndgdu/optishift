"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Camera, Sparkles, Wand2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SetupProposal } from "@/lib/ai/setupAssistant";

/**
 * Yapay zekâ ile kurulum sohbeti (api/onboarding/assistant). İşletme sahibi işletmesini anlatır,
 * asistan birkaç soru sorar ve kurulum önerisini döndürür. Öneri burada kaydedilmez:
 * sihirbaz formları doldurur, sahip kontrol edip onaylar.
 * Fotoğraftan kurulum: kâğıt/Excel çizelgesinin ya da ekip listesinin fotoğrafı eklenir, asistan ekibi,
 * vardiyaları ve kaç kişi gerektiğini okur. Resim burada küçültülür (en uzun kenar 1600 px, JPEG).
 */
type Img = { mime: string; data: string };
type Msg = { role: "user" | "assistant"; text: string; raw?: string; images?: Img[] };

const PHOTO_TEXT = "Fotoğraftaki çizelgeye göre kurulumu hazırla.";
const MAX_SIDE = 1600;
const MAX_PHOTOS = 2;

/** Seçilen resmi küçültüp base64 JPEG'e çevirir (telefon fotoğrafları 3-8 MB geliyor) */
async function shrinkImage(file: File): Promise<Img> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    return { mime: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const FIRST = "Merhaba! İşletmenizi birkaç cümleyle anlatır mısınız? Ne iş yaptığınızı, kaç kişi olduğunuzu, kaçta açıp kapandığınızı ve mutfak, salon gibi bölümleriniz olup olmadığını yazmanız yeterli.";
const EXAMPLES = [
  "Moda'da bir kafeyiz, 12 kişiyiz. Her gün 07:00-23:00 açığız. Salon, bar ve mutfak var, hafta sonu çok yoğun.",
  "3 vardiya çalışan bir fabrikayız, 60 kişiyiz. Üretim, bakım ve kalite bölümlerimiz var. Pazar günü kapalıyız.",
  "AVM'de bir mağazayız, 8 kişiyiz. 10:00-22:00 açığız, kasa ve satış ayrı.",
];

export function SetupChat({ onProposal, onManual }: { onProposal: (p: SetupProposal) => void; onManual: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", text: FIRST }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photos, setPhotos] = useState<Img[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sentPhotos = msgs.reduce((n, m) => n + (m.images?.length ?? 0), 0);

  const pickPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    const room = MAX_PHOTOS - sentPhotos - photos.length;
    const picked: Img[] = [];
    for (const f of Array.from(files).slice(0, Math.max(0, room))) {
      try { picked.push(await shrinkImage(f)); }
      catch { setError("Bu fotoğraf açılamadı. JPEG ya da PNG biçiminde bir fotoğraf seçin."); }
    }
    if (files.length > room) setError(`En fazla ${MAX_PHOTOS} fotoğraf ekleyebilirsiniz.`);
    setPhotos(p => [...p, ...picked]);
    if (fileRef.current) fileRef.current.value = "";
  };
  const userCount = msgs.filter(m => m.role === "user").length;

  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [msgs, busy]);

  const send = async (text: string, finish = false) => {
    const t = text.trim() || (photos.length ? PHOTO_TEXT : "");
    const next: Msg[] = t ? [...msgs, { role: "user", text: t, ...(photos.length ? { images: photos } : {}) }] : msgs;
    if (!next.some(m => m.role === "user")) return;
    setMsgs(next);
    setInput("");
    setPhotos([]);
    setBusy(true);
    setError("");
    try {
      // İlk karşılama mesajı modele gönderilmez; asistanın önceki soruları kendi biçiminde (JSON) gider
      const turns = next.slice(1).map(m => ({ role: m.role, text: m.raw ?? m.text, ...(m.images ? { images: m.images } : {}) }));
      if (finish && turns[turns.length - 1]?.role !== "user") turns.push({ role: "user", text: "Bu bilgilerle önerini hazırla." });
      const res = await fetch("/api/onboarding/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns, finish }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Asistan şu an cevap veremiyor."); return; }
      if (data.type === "question") {
        setMsgs(m => [...m, { role: "assistant", text: data.text, raw: JSON.stringify({ ask: data.text }) }]);
      } else if (data.type === "proposal" && data.proposal) {
        setMsgs(m => [...m, { role: "assistant", text: data.text }]);
        onProposal(data.proposal as SetupProposal);
      }
    } catch {
      setError("Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-forest-700 text-ember-300"><Sparkles size={20} /></span>
        <div>
          <h2 className="text-xl font-bold text-slate-900">İşletmenizi anlatın, kurulumu yapay zekâ yapsın</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">Asistan birkaç soru sorar, sonra işletme türünü, departmanları, vardiyaları ve her gün kaç kişi gerektiğini doldurur. Siz kontrol edip onaylamadan hiçbir şey kaydedilmez.</p>
        </div>
      </div>

      {userCount === 0 && (
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
          className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-forest-200 bg-forest-50/60 px-4 py-4 text-left hover:bg-forest-50">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-forest-700 text-white"><Camera size={20} /></span>
          <span className="text-sm leading-relaxed text-forest-900">
            <span className="block font-bold">Vardiya çizelgenizin fotoğrafını ekleyin</span>
            <span className="text-forest-800/80">Kâğıttaki çizelge, Excel ekran görüntüsü ya da ekip listesi olabilir. Asistan ekibinizi, vardiyalarınızı ve her gün kaç kişi gerektiğini fotoğraftan okur.</span>
          </span>
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" multiple className="hidden"
        onChange={e => pickPhotos(e.target.files)} />

      <div className="max-h-[46vh] min-h-[220px] space-y-3 overflow-y-auto rounded-2xl bg-slate-50 p-4">
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "gap-2.5")}>
            {m.role === "assistant" && <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-forest-50 text-forest-700"><Sparkles size={13} /></span>}
            <div className={cn("max-w-[85%] space-y-2 rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed",
              m.role === "user" ? "rounded-br-md bg-forest-700 text-white" : "rounded-tl-md bg-white text-slate-700 ring-1 ring-slate-900/5")}>
              {m.images && (
                <div className="flex gap-2">
                  {m.images.map((im, j) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={j} src={`data:${im.mime};base64,${im.data}`} alt="Eklenen fotoğraf" className="h-20 w-20 rounded-lg object-cover" />
                  ))}
                </div>
              )}
              <p className="whitespace-pre-line">{m.text}</p>
            </div>
          </div>
        ))}
        {busy && (
          <p className="flex items-center gap-2 pl-10 text-[13px] text-slate-400"><span className="m-pulse-dot h-1.5 w-1.5 rounded-full bg-ember-500" />
            {msgs[msgs.length - 1]?.images ? "Asistan fotoğrafı okuyor, bu birkaç saniye sürebilir…" : "Asistan cevap hazırlıyor…"}</p>
        )}
        <div ref={endRef} />
      </div>

      {userCount === 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-400">Örnekler (dokunun, kendi bilginize göre değiştirin)</p>
          <div className="flex flex-col gap-2">
            {EXAMPLES.map(e => (
              <button key={e} type="button" onClick={() => setInput(e)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-[13px] text-slate-600 hover:bg-slate-50">{e}</button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</p>}

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((im, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:${im.mime};base64,${im.data}`} alt="Gönderilecek fotoğraf" className="h-20 w-20 rounded-xl object-cover ring-1 ring-slate-200" />
              <button type="button" onClick={() => setPhotos(p => p.filter((_, j) => j !== i))} aria-label="Fotoğrafı kaldır"
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-white"><X size={14} /></button>
            </div>
          ))}
          <p className="w-full text-xs text-slate-500">İsterseniz not ekleyin (ör. &quot;Pazar kapalıyız&quot;), sonra gönderin.</p>
        </div>
      )}

      <form onSubmit={e => { e.preventDefault(); if (!busy) send(input); }} className="flex items-end gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy || sentPhotos + photos.length >= MAX_PHOTOS} aria-label="Fotoğraf ekle"
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
          <Camera size={18} />
        </button>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!busy) send(input); } }}
          rows={2}
          maxLength={1500}
          placeholder="Cevabınızı yazın…"
          className="min-h-[52px] flex-1 resize-none rounded-xl border border-slate-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none"
        />
        <button type="submit" disabled={busy || (!input.trim() && photos.length === 0)} aria-label="Gönder"
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-forest-700 text-white disabled:opacity-40">
          <ArrowUp size={18} />
        </button>
      </form>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {userCount > 0 ? (
          <button type="button" onClick={() => send("", true)} disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-ember-400 px-4 py-3 text-sm font-bold text-forest-900 hover:bg-ember-300 disabled:opacity-50">
            <Wand2 size={16} /> Soruları geç, öneriyi şimdi hazırla
          </button>
        ) : <span />}
        <button type="button" onClick={onManual} className="text-sm font-semibold text-slate-500 hover:text-slate-700 hover:underline">
          Yapay zekâ olmadan, adım adım kendim seçeyim
        </button>
      </div>
    </div>
  );
}
