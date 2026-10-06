"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LIBRARY, type LibraryVideo } from "@/components/marketing/videoLibrary";
import { TOUR_CAPTIONS } from "@/components/marketing/tourCaptions";

/**
 * Özellik videoları ızgarası: kart ekrana girince sessiz döngüde oynar (aynı anda en çok birkaç tane),
 * dokununca büyük oynatıcıda baştan açılır. Dar ekranda telefon kayıtları ve altında eşzamanlı adım başlığı.
 */
function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(query); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const fileOf = (v: LibraryVideo, small: boolean) => `/marketing/tour/${v.file}${(small || !v.desk) && v.file !== "phone" ? "-m" : ""}`;
const isPhone = (v: LibraryVideo, small: boolean) => small || !v.desk;

/** Telefon kaydının o anki adım başlığı */
function useCaption(v: LibraryVideo, small: boolean, ref: React.RefObject<HTMLVideoElement | null>) {
  const [text, setText] = useState<{ text: string; n: number } | null>(null);
  useEffect(() => {
    if (!isPhone(v, small)) return;
    const caps = TOUR_CAPTIONS[v.file] ?? [];
    let raf = 0;
    const tick = () => {
      const t = ref.current?.currentTime ?? 0;
      const c = [...caps].reverse().find((x) => x.t <= t) ?? null;
      setText((prev) => (prev?.text === c?.text ? prev : c));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [v, small, ref]);
  return text;
}

function Media({ v, small, big, videoRef, autoPlay }: {
  v: LibraryVideo; small: boolean; big?: boolean; videoRef: React.RefObject<HTMLVideoElement | null>; autoPlay?: boolean;
}) {
  const f = fileOf(v, small);
  const phone = isPhone(v, small);
  const video = (
    <video ref={videoRef} src={`${f}.mp4`} poster={`${f}.webp`} muted playsInline loop={!big} autoPlay={autoPlay}
      preload="none" className="block h-full w-full object-cover" aria-label={`${v.title}: uygulamanın ekran kaydı`} />
  );
  if (phone) {
    return (
      <div className={cn("mx-auto overflow-hidden bg-cream ring-1 ring-slate-900/10", big ? "h-full rounded-[1.6rem]" : "w-[62%] rounded-[1.4rem] shadow-[0_24px_50px_-20px_rgba(10,33,30,0.55)]")} style={{ aspectRatio: "390 / 760" }}>
        {video}
      </div>
    );
  }
  return (
    <div className={cn("overflow-hidden rounded-xl bg-white ring-1 ring-slate-900/10", !big && "shadow-[0_24px_50px_-20px_rgba(10,33,30,0.55)]")}>
      <div className="flex gap-1 border-b border-slate-100 bg-slate-50 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-slate-200" /><span className="h-2 w-2 rounded-full bg-slate-200" /><span className="h-2 w-2 rounded-full bg-slate-200" />
      </div>
      <div style={{ aspectRatio: "16 / 10" }}>{video}</div>
    </div>
  );
}

function Card({ v, small, onOpen }: { v: LibraryVideo; small: boolean; onOpen: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLButtonElement>(null);
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  // Ekrandayken oynat, çıkınca durdur (hepsi aynı anda yüklenmesin)
  useEffect(() => {
    const el = wrap.current;
    if (!el || reduced) return;
    const io = new IntersectionObserver(([e]) => {
      const vid = ref.current;
      if (!vid) return;
      if (e.isIntersecting) { vid.preload = "auto"; vid.play().catch(() => {}); } else vid.pause();
    }, { threshold: 0.55 });
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, small]);
  const cap = useCaption(v, small, ref);
  const phone = isPhone(v, small);

  return (
    <button ref={wrap} onClick={onOpen} className="group flex flex-col overflow-hidden rounded-3xl bg-white text-left ring-1 ring-slate-900/5 transition-shadow hover:shadow-[0_30px_60px_-30px_rgba(10,33,30,0.45)]">
      <div className={cn("relative flex items-center justify-center overflow-hidden bg-forest-900", phone ? "px-4 pb-0 pt-6" : "p-5 sm:p-6")}>
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-ember-500/25 blur-[70px]" />
        <div className={cn("relative w-full", phone && "-mb-[18%]")}><Media key={`${v.file}-${small}`} v={v} small={small} videoRef={ref} /></div>
        <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white opacity-0 ring-1 ring-white/20 backdrop-blur transition-opacity group-hover:opacity-100">
          <Maximize2 size={14} />
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-slate-900">{v.title}</h3>
        <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">{v.text}</p>
        {phone && (
          <p className="mt-3 flex min-h-[24px] items-center gap-2 text-sm font-semibold text-forest-700" aria-live="polite">
            {cap?.text && <>{cap.n > 0 && <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ember-400 text-[11px] font-bold text-forest-900">{cap.n}</span>}{cap.text}</>}
          </p>
        )}
      </div>
    </button>
  );
}

function Player({ v, small, onClose }: { v: LibraryVideo; small: boolean; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const cap = useCaption(v, small, ref);
  const phone = isPhone(v, small);
  useEffect(() => {
    ref.current?.play().catch(() => {});
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0b1f1c]/90 p-4 backdrop-blur-sm sm:p-8" onClick={onClose} role="dialog" aria-label={v.title}>
      <button onClick={onClose} aria-label="Kapat" className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20"><X size={20} /></button>
      <div onClick={(e) => e.stopPropagation()} className={cn("w-full", phone ? "flex h-[min(78svh,820px)] justify-center" : "max-w-6xl")}>
        <Media v={v} small={small} big videoRef={ref} />
      </div>
      <div className="mt-4 min-h-[28px] text-center text-white" onClick={(e) => e.stopPropagation()}>
        {phone && cap?.text ? (
          <p className="flex items-center justify-center gap-2 text-base font-semibold">{cap.n > 0 && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ember-400 text-xs font-bold text-forest-900">{cap.n}</span>}{cap.text}</p>
        ) : (
          <p className="text-base font-semibold">{v.title}</p>
        )}
      </div>
    </div>
  );
}

export function VideoGallery() {
  const small = useMedia("(max-width: 767px)");
  const [open, setOpen] = useState<LibraryVideo | null>(null);
  return (
    <>
      {LIBRARY.map((g) => (
        <section key={g.group} className="mb-16 sm:mb-20">
          <div className="mb-6 sm:mb-8">
            <h2 className="font-serif text-2xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{g.group}</h2>
            <p className="mt-2 text-slate-600">{g.intro}</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((v) => <Card key={v.file} v={v} small={small} onOpen={() => setOpen(v)} />)}
          </div>
        </section>
      ))}
      {open && <Player v={open} small={small} onClose={() => setOpen(null)} />}
    </>
  );
}
