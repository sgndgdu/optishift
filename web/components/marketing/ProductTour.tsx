"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Sparkles, Smartphone, ClipboardCheck, LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCENES } from "@/components/marketing/TourScenes";

/**
 * Ürün turu (planın hazırlanması girişte, StepsShowcase HeroPlan): kodla çizilmiş sahneler (TourScenes), video yok. Tek saat (t) sahneyi yürütür;
 * bölüm sekmeleri ilerleme çubuğuyla sırayla oynar, ekran dışındayken durur.
 * Hareketi azalt açıksa sahne son hâliyle durur.
 */
const CHAPTERS = [
  { key: "phone", icon: Smartphone, title: "Ekibinizin ekranı", phone: true, text: "Plan yayınlanınca ekibinize bildirim gider. Herkes kendi vardiyalarını ve aynı vardiyada kimlerle çalışacağını görür." },
  { key: "approvals", icon: ClipboardCheck, title: "İzin ve değişiklik onayı", text: "Uygulama her isteği kurallara göre kontrol eder. Kurala uymayan bir istek varsa siz onaylamadan önce nedenini gösterir.", window: "Moda Şube · Onaylar" },
  { key: "cover", icon: LifeBuoy, title: "Gelemeyen kişiye yedek", text: "Uygulama o vardiyaya uygun kişileri nedenleriyle birlikte sıralar. Seçtiğiniz kişiyi atarsınız, ona bildirim gider.", window: "Moda Şube · Bugün" },
  { key: "assistant", icon: Sparkles, title: "İşletme Asistanı", text: "İşletmenizle ilgili bir soru yazarsınız. Asistan cevabı planınızdaki ve kayıtlarınızdaki bilgilere göre verir.", window: "Moda Şube · Asistan" },
] as const;

/** Medya sorgusu: sunucuda false, tarayıcıda canlı */
function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(query); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function ProductTour() {
  const [active, setActive] = useState(0);
  const [t, setT] = useState(0);
  const [visible, setVisible] = useState(false);
  const small = useMedia("(max-width: 767px)");
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const stageRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const chapter = CHAPTERS[active];
  const scene = SCENES[chapter.key];
  const Scene = scene.Component;
  const time = reduced ? scene.duration : t;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Saat: ekrandayken ilerler, sahne bitince sıradaki bölüm
  useEffect(() => {
    if (!visible || reduced) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      setT((x) => {
        const n = x + dt;
        if (n >= scene.duration) { setActive((i) => (i + 1) % CHAPTERS.length); return 0; }
        return n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, reduced, scene.duration]);

  // Dar ekranda sekme şeridi oynayan bölüme kayar
  useEffect(() => {
    const strip = stripRef.current;
    const tab = strip?.querySelectorAll<HTMLElement>("[role=tab]")[active];
    if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollTo({ left: tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2, behavior: "smooth" });
  }, [active]);

  const choose = (i: number) => { setT(0); setActive(i); };
  const progress = Math.min(1, time / scene.duration);
  const stepIdx = scene.steps.reduce((acc, s, i) => (s.t <= time ? i : acc), 0);
  const step = scene.steps[stepIdx];
  const isPhone = "phone" in chapter;

  const frame = isPhone ? (
    <div className="relative flex justify-center">
      <div className="tour-swap h-[560px] rounded-[2.6rem] bg-slate-950 p-2.5 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/10 sm:h-[600px]" style={{ aspectRatio: "390 / 800" }}>
        <div className="relative h-full overflow-hidden rounded-[2.1rem]">
          <Scene t={time} small={small} />
        </div>
      </div>
    </div>
  ) : (
    <div className="tour-swap w-full overflow-hidden rounded-2xl bg-white shadow-[0_40px_90px_-25px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/90 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        </div>
        <span className="truncate text-[11px] font-medium text-slate-400">{chapter.window}</span>
      </div>
      <div className="relative h-[520px] bg-white sm:h-[560px]">
        <Scene t={time} small={small} />
      </div>
    </div>
  );

  return (
    <div>
      {/* Bölümler */}
      <div ref={stripRef} className="relative -mx-4 mb-6 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:mb-8 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div role="tablist" aria-label="Uygulamadan bölümler" className="flex min-w-max gap-2 sm:grid sm:min-w-0 sm:grid-cols-4 sm:gap-3">
          {CHAPTERS.map((c, i) => {
            const on = i === active;
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                role="tab"
                aria-selected={on}
                onClick={() => choose(i)}
                className={cn(
                  "group relative overflow-hidden rounded-2xl px-4 py-3 text-left transition-colors sm:px-4 sm:py-4",
                  on ? "bg-white shadow-[0_10px_30px_-12px_rgba(10,33,30,0.35)] ring-1 ring-slate-900/5" : "hover:bg-white/60",
                )}
              >
                <span className={cn("flex items-center gap-2 text-sm font-semibold whitespace-nowrap", on ? "text-slate-900" : "text-slate-500 group-hover:text-slate-700")}>
                  <Icon size={16} className={on ? "text-ember-500" : "text-slate-400"} /> {c.title}
                </span>
                <span className="absolute inset-x-4 bottom-0 h-[3px] overflow-hidden rounded-full bg-slate-900/5 sm:bottom-1.5">
                  <span
                    className="block h-full origin-left rounded-full bg-ember-400"
                    style={{ transform: `scaleX(${on ? progress : i < active ? 1 : 0})`, opacity: i < active ? 0.35 : 1 }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sahne */}
      <div ref={stageRef} className="tour-stage relative overflow-hidden rounded-[28px] bg-forest-900 sm:rounded-[36px]">
        <div className="pointer-events-none absolute -left-24 -top-32 h-[420px] w-[420px] rounded-full bg-ember-500/25 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-40 -right-24 h-[460px] w-[460px] rounded-full bg-forest-500/40 blur-[120px]" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "56px 56px" }}
        />

        <div className="relative grid gap-6 p-3 sm:p-8 lg:grid-cols-[1fr_290px] lg:items-center lg:gap-10 lg:p-12">
          <div className="min-w-0" aria-hidden="true">
            <div key={chapter.key}>{frame}</div>
            {/* Telefonda adım başlığı sahnenin altında */}
            <div className="mt-3 flex h-[52px] items-center justify-center px-1 lg:hidden">
              <p key={step.text} className="tour-swap flex items-center gap-2.5 text-[15px] font-semibold leading-snug text-white">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ember-400 text-xs font-bold text-forest-900">{stepIdx + 1}</span>
                {step.text}
              </p>
            </div>
          </div>

          {/* Bölüm açıklaması + adımlar */}
          <div key={`${chapter.key}-text`} className="tour-swap px-2 pb-3 text-white sm:px-0 sm:pb-0">
            <p className="text-xs font-semibold text-ember-300">{active + 1} / {CHAPTERS.length}</p>
            <h3 className="mt-2 font-serif text-2xl font-semibold leading-tight sm:text-3xl">{chapter.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-forest-100/80">{chapter.text}</p>
            <ol className="mt-6 hidden space-y-2.5 lg:block">
              {scene.steps.map((s, i) => (
                <li key={s.text} className={cn("flex items-start gap-2.5 text-[14px] leading-snug transition-colors duration-300", i === stepIdx ? "text-white" : i < stepIdx ? "text-forest-100/50" : "text-forest-100/30")}>
                  <span className={cn("mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors duration-300", i === stepIdx ? "bg-ember-400 text-forest-900" : "bg-white/10 text-white/60")}>{i + 1}</span>
                  {s.text}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
