"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Sparkles, ArrowUp, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tanıtım: yapay zekâ ile kurulum sohbetinin canlandırması (uygulamadaki components/onboarding/SetupChat).
 * Örnek veri; sahne bir saatle (t, ms) ilerler, ekrandayken döner, hareketi azalt açıksa son hâliyle durur.
 */
const U1 = "Moda'da bir kafeyiz, 12 kişiyiz. Her gün 07:00-23:00 açığız. Salon, bar ve mutfak var.";
const A1 = "Hangi günler daha yoğun? Örneğin hafta sonu kaç kişi daha gerekir?";
const U2 = "Cumartesi ve pazar çok yoğun, neredeyse iki katı kişi lazım.";
const T_U1 = 400, T_A1 = 400 + U1.length * 28 + 900, T_U2 = T_A1 + 1800, T_A2 = T_U2 + U2.length * 28 + 1300;
const DURATION = T_A2 + 7000;
const TYPE = 28;

const DEMAND = [6, 6, 6, 6, 8, 11, 11];
const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export function SetupDemo() {
  const [t, setT] = useState(0);
  const [visible, setVisible] = useState(false);
  const reduced = useSyncExternalStore(
    (cb) => { const m = window.matchMedia("(prefers-reduced-motion: reduce)"); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || reduced) return;
    const id = setInterval(() => setT(x => (x + 50 >= DURATION ? 0 : x + 50)), 50);
    return () => clearInterval(id);
  }, [visible, reduced]);

  const time = reduced ? DURATION : t;
  const typed = (text: string, at: number) => text.slice(0, Math.max(0, Math.floor((time - at) / TYPE)));
  const showCard = time >= T_A2;

  return (
    <div ref={ref} className="w-full" aria-hidden="true">
      <div className="overflow-hidden rounded-3xl bg-white text-slate-900 shadow-[0_40px_90px_-30px_rgba(10,33,30,0.45)] ring-1 ring-slate-900/5">
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-3.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-forest-700 text-ember-300"><Sparkles size={16} /></span>
          <span>
            <span className="block text-[14px] font-semibold">Yapay zekâ ile kurulum</span>
            <span className="block text-[12px] text-slate-400">İşletmenizi anlatın, asistan kurulumu doldursun</span>
          </span>
        </div>

        <div className="min-h-[420px] space-y-3 bg-slate-50/70 px-4 py-4 sm:px-5">
          {time >= T_U1 && <Bubble user text={typed(U1, T_U1)} typing={typed(U1, T_U1).length < U1.length} />}
          {time >= T_A1 && <Bubble text={A1} />}
          {time >= T_U2 && <Bubble user text={typed(U2, T_U2)} typing={typed(U2, T_U2).length < U2.length} />}
          {time >= T_A2 - 1000 && time < T_A2 && (
            <p className="flex items-center gap-2 pl-10 text-[13px] text-slate-400"><span className="m-pulse-dot h-1.5 w-1.5 rounded-full bg-ember-500" /> Kurulum önerisi hazırlanıyor</p>
          )}
          {showCard && (
            <div className="m-enter ml-9 space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-900/5">
              <p className="text-[13.5px] font-semibold text-slate-900">Kurulum önerisi hazır</p>
              <Row label="İşletme türü"><Chip>Kafe / Pastane</Chip></Row>
              <Row label="Departmanlar">{["Salon", "Bar", "Mutfak"].map(d => <Chip key={d}>{d}</Chip>)}</Row>
              <Row label="Vardiyalar">{["Açılış 07-15", "Ara 11-19", "Kapanış 15-23"].map(d => <Chip key={d}>{d}</Chip>)}</Row>
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-slate-400">Günde kaç kişi</p>
                <div className="grid grid-cols-7 gap-1">
                  {DEMAND.map((n, i) => (
                    <div key={i} className="text-center">
                      <div className="flex h-14 items-end justify-center rounded-md bg-slate-50">
                        <div className={cn("w-full rounded-md", i >= 5 ? "bg-ember-300" : "bg-forest-200")} style={{ height: `${(n / 11) * 100}%` }} />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">{DAYS[i]}</p>
                      <p className="text-[12px] font-semibold text-slate-800">{n}</p>
                    </div>
                  ))}
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-forest-700 px-3.5 py-2 text-[13px] font-semibold text-white"><Check size={14} /> Kontrol et ve onayla</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
          <span className="flex-1 truncate rounded-xl bg-slate-100 px-3.5 py-2.5 text-[13px] text-slate-400">Cevabınızı yazın…</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest-700 text-white"><ArrowUp size={16} /></span>
        </div>
      </div>
    </div>
  );
}

function Bubble({ text, user, typing }: { text: string; user?: boolean; typing?: boolean }) {
  return (
    <div className={cn("flex", user ? "justify-end" : "m-enter gap-2.5")}>
      {!user && <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-forest-50 text-forest-700"><Sparkles size={13} /></span>}
      <p className={cn("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed", user ? "rounded-br-md bg-forest-700 text-white" : "rounded-tl-md bg-white text-slate-700 ring-1 ring-slate-900/5")}>
        {text}
        {typing && <span className="m-caret ml-px inline-block h-[1em] w-[2px] translate-y-[2px] bg-white/80" />}
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-medium text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-forest-50 px-2.5 py-1 text-[12.5px] font-medium text-forest-800 ring-1 ring-forest-100">{children}</span>;
}
