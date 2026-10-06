"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Play, Sparkles, CalendarCheck, Smartphone, ClipboardCheck, LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Toast } from "@/components/marketing/Mockups";

/**
 * Uygulamanın gerçek ekran kayıtları (scripts/vid/*, vitrin işletmesi "Moda Kahve").
 * Bölüm sekmeleri ilerleme çubuğuyla sırayla oynar; sahne ekrana girdikçe büyür (globals.css .tour-stage).
 * Sadece seçili bölümün videosu yüklenir, ekran dışındayken durur; hareketi azalt açıksa kendiliğinden oynamaz.
 */
const CHAPTERS = [
  {
    key: "plan", icon: CalendarCheck, title: "Plan saniyeler içinde",
    text: "Ekibin uygunluğuna bakar, ihtiyacı karşılayan planı kurar. Kontrol edip tek tıkla yayınlarsınız.",
    window: "Moda Şube · Vardiya Planı",
  },
  {
    key: "phone", icon: Smartphone, title: "Ekip telefondan görür", phone: true,
    text: "Yayınladığınız an bildirim gider. Herkes vardiyasını ve kiminle çalışacağını görür.",
  },
  {
    key: "approvals", icon: ClipboardCheck, title: "Onaylar tek ekranda",
    text: "İzin ve vardiya değişikliği isteklerini kurallara göre kontrol eder, sorun varsa önceden söyler.",
    window: "Moda Şube · Onaylar",
  },
  {
    key: "cover", icon: LifeBuoy, title: "Biri gelemezse",
    text: "En uygun yedekleri gerekçesiyle sıralar. Tek dokunuşla atarsınız, kişiye bildirim gider.",
    window: "Moda Şube · Vardiya Planı",
  },
  {
    key: "assistant", icon: Sparkles, title: "İşletme Asistanı",
    text: "İşletmenizle ilgili sorunuzu yazın, cevabı planınızdan ve kayıtlarınızdan gelsin.",
    window: "Moda Şube · Ana Sayfa",
  },
] as const;

const src = (key: string, small: boolean, phone?: boolean) =>
  `/marketing/tour/${key}${small && !phone ? "-sm" : ""}.mp4`;

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
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const small = useMedia("(max-width: 767px)");
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const visible = useRef(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const chapter = CHAPTERS[active];

  // Ekrandayken oynat, çıkınca durdur
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      visible.current = e.isIntersecting;
      const v = videoRef.current;
      if (!v) return;
      if (e.isIntersecting && !reduced) v.play().catch(() => {});
      else v.pause();
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  // Bölüm değişince yeni video baştan (ilerleme çubuğu yeni videonun süresinden okunur)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.load();
    if (visible.current && !reduced) v.play().catch(() => {});
  }, [active, small, reduced]);

  // Dar ekranda sekme şeridi oynayan bölüme kayar (sayfa dikeyde oynamaz)
  useEffect(() => {
    const strip = stripRef.current;
    const tab = strip?.querySelectorAll<HTMLElement>("[role=tab]")[active];
    if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollTo({ left: tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2, behavior: "smooth" });
  }, [active]);

  // İlerleme çubuğu: timeupdate seyrek geldiği için kare kare
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v && v.duration) setProgress(v.currentTime / v.duration);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const next = () => { setProgress(0); setActive((i) => (i + 1) % CHAPTERS.length); };
  const choose = (i: number) => {
    if (i === active) {
      const v = videoRef.current;
      if (v) { v.currentTime = 0; v.play().catch(() => {}); }
    } else { setProgress(0); setActive(i); }
  };

  const video = (
    <>
    <video
      ref={videoRef}
      key={chapter.key}
      className="block h-full w-full object-cover"
      src={src(chapter.key, small, "phone" in chapter)}
      poster={`/marketing/tour/${chapter.key}.webp`}
      muted
      playsInline
      preload="metadata"
      onEnded={next}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      aria-label={`${chapter.title}: uygulamanın ekran kaydı`}
    />
    {/* Hareketi azalt açıkken kendiliğinden oynamaz: oynatma düğmesi */}
    {reduced && !playing && (
      <button
        onClick={() => videoRef.current?.play().catch(() => {})}
        aria-label="Videoyu oynat"
        className="absolute inset-0 m-auto flex h-16 w-16 items-center justify-center rounded-full bg-forest-900/80 text-white shadow-lg ring-1 ring-white/20"
      >
        <Play size={22} fill="currentColor" />
      </button>
    )}
    </>
  );

  return (
    <div>
      {/* Bölümler */}
      <div ref={stripRef} className="relative -mx-4 mb-6 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:mb-8 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div role="tablist" aria-label="Uygulamadan bölümler" className="flex min-w-max gap-2 sm:grid sm:min-w-0 sm:grid-cols-5 sm:gap-3">
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

        <div className="relative grid gap-6 p-3 sm:p-8 lg:grid-cols-[1fr_270px] lg:items-center lg:gap-10 lg:p-12">
          {/* Masaüstünde yükseklik sabit (pencere boyu): telefon bölümüne geçince sayfa zıplamasın */}
          <div key={chapter.key} className="flex h-[min(480px,118vw)] min-w-0 items-center justify-center sm:h-auto sm:aspect-[16/10.75]">
            {"phone" in chapter ? (
              <div className="relative flex h-full justify-center">
                {/* Masaüstünde telefonun iki yanında bildirimler (videodaki anla aynı) */}
                <div className="pointer-events-none absolute right-full top-[16%] z-10 mr-8 hidden w-[250px] lg:block">
                  <div className="m-float"><Toast icon="bell" title="Vardiya programı yayınlandı" text="12-18 Ekim haftanız hazır." className="tour-swap w-full" style={{ animationDelay: "350ms" }} /></div>
                </div>
                <div className="pointer-events-none absolute bottom-[18%] left-full z-10 ml-8 hidden w-[230px] lg:block">
                  <div className="m-float" style={{ animationDelay: "2.5s" }}><Toast icon="check" title="Aynı vardiyada" text="Salı 15:00 · Burak ile" className="tour-swap w-full" style={{ animationDelay: "650ms" }} /></div>
                </div>
                <div className="tour-swap h-full rounded-[2.2rem] bg-slate-950 p-2 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/10 sm:rounded-[2.6rem] sm:p-2.5" style={{ aspectRatio: "410 / 864" }}>
                  <div className="relative h-full overflow-hidden rounded-[1.8rem] bg-cream sm:rounded-[2.1rem]">
                    {video}
                  </div>
                </div>
              </div>
            ) : (
              <div className="tour-swap w-full overflow-hidden rounded-xl bg-white shadow-[0_40px_90px_-25px_rgba(0,0,0,0.6)] ring-1 ring-white/10 sm:rounded-2xl">
                <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/90 px-3 py-2 sm:px-4 sm:py-2.5">
                  <div className="flex gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-slate-200 sm:h-2.5 sm:w-2.5" />
                    <span className="h-2 w-2 rounded-full bg-slate-200 sm:h-2.5 sm:w-2.5" />
                    <span className="h-2 w-2 rounded-full bg-slate-200 sm:h-2.5 sm:w-2.5" />
                  </div>
                  <span className="truncate text-[10px] font-medium text-slate-400 sm:text-[11px]">{chapter.window}</span>
                </div>
                <div className="relative bg-white" style={{ aspectRatio: "16 / 10" }}>
                  {video}
                </div>
              </div>
            )}
          </div>

          {/* Bölüm açıklaması */}
          <div key={`${chapter.key}-text`} className="tour-swap min-h-[188px] px-2 pb-3 text-white sm:min-h-0 sm:px-0 sm:pb-0">
            <p className="text-xs font-semibold text-ember-300">{active + 1} / {CHAPTERS.length}</p>
            <h3 className="mt-2 font-serif text-2xl font-semibold leading-tight sm:text-3xl">{chapter.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-forest-100/80">{chapter.text}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
