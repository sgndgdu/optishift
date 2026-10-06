"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tanıtım: İşletme Asistanı sohbet önizlemesi. Örnek sorular uygulamadaki
 * AssistantPanel örnekleriyle aynı; cevaplar örnek veridir (gerçek işletme değil).
 * Kendiliğinden sırayla döner, ziyaretçi bir soruya dokununca o soruda durur.
 */
const QA = [
  {
    q: "Bu hafta kim izinli?",
    a: ["Bu hafta 2 kişi izinli:", "Selin A. · Çarşamba ve Perşembe, yıllık izin", "Mert Y. · Pazar, mazeret izni"],
  },
  {
    q: "Gelecek hafta planı hazır mı?",
    a: ["Taslak hazır, henüz yayınlanmadı.", "Otomatik Pilot perşembe sabahı kurdu. Bütün vardiyalar dolu, kural ihlali yok.", "Bakıp yayınlayabilirsiniz."],
  },
  {
    q: "En çok kim çalışıyor?",
    a: ["Son 4 haftada en çok çalışan:", "Burak T. · haftada ortalama 44 saat", "Sınıra yakın. Gelecek hafta ona daha az vardiya yazılmasını isteyebilirsiniz."],
  },
  {
    q: "Hangi şubenin planı eksik?",
    a: ["Kadıköy şubesinde cumartesi kapanışında 1 kişi eksik.", "Moda ve Kanyon şubelerinin planı tam."],
  },
];

const ROTATE_MS = 6500;

export function AssistantDemo() {
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState(QA[0].q.length);
  const [auto, setAuto] = useState(true);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Soru harf harf yazılır
  useEffect(() => {
    if (reduced.current) { setTyped(QA[idx].q.length); return; }
    setTyped(0);
    let n = 0;
    const t = setInterval(() => {
      n++;
      setTyped(n);
      if (n >= QA[idx].q.length) clearInterval(t);
    }, 38);
    return () => clearInterval(t);
  }, [idx]);

  useEffect(() => {
    if (!auto || !visible || reduced.current) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % QA.length), ROTATE_MS);
    return () => clearTimeout(t);
  }, [auto, visible, idx]);

  const cur = QA[idx];
  const done = typed >= cur.q.length;

  return (
    <div ref={rootRef} className="w-full">
      <div className="overflow-hidden rounded-3xl bg-white text-slate-900 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.6)] ring-1 ring-white/10" aria-hidden="true">
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-3.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-forest-700 text-ember-300">
            <Sparkles size={16} />
          </span>
          <span>
            <span className="block text-[13px] font-semibold">İşletme Asistanı</span>
            <span className="block text-[11px] text-slate-400">Planınızı, ekibinizi ve onayları bilir</span>
          </span>
        </div>

        <div className="min-h-[248px] space-y-3 bg-slate-50/70 px-5 py-5">
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-md bg-forest-700 px-3.5 py-2 text-[13.5px] text-white">
              {cur.q.slice(0, typed)}
              {!done && <span className="m-caret ml-px inline-block h-[1em] w-[2px] translate-y-[2px] bg-white/80" />}
            </p>
          </div>
          {done && (
            <div key={idx} className="flex gap-2.5 m-enter">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-forest-50 text-forest-700">
                <Sparkles size={13} />
              </span>
              <div className="max-w-[88%] space-y-1 rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed ring-1 ring-slate-900/5">
                {cur.a.map((line, i) => (
                  <p key={i} className={cn(i === 0 ? "font-semibold text-slate-900" : "text-slate-600")}>{line}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
          <span className="flex-1 truncate rounded-xl bg-slate-100 px-3.5 py-2.5 text-[13px] text-slate-400">Sorunuzu yazın…</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest-700 text-white">
            <ArrowUp size={16} />
          </span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {QA.map((x, i) => (
          <button
            key={x.q}
            type="button"
            onClick={() => { setIdx(i); setAuto(false); }}
            aria-pressed={i === idx}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              i === idx ? "bg-ember-400 text-forest-900" : "bg-white/10 text-forest-50 hover:bg-white/20"
            )}
          >
            {x.q}
          </button>
        ))}
      </div>
    </div>
  );
}
