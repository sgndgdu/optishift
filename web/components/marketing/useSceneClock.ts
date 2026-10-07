"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Medya sorgusu: sunucuda false, tarayıcıda canlı */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(query); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Tanıtım sahneleri için tek saat (ms): öğe ekrandayken ilerler, süre dolunca başa döner (loop) ya da
 * sonda durur. Hareketi azalt açıksa her zaman son hâl (duration) döner. Ekrandan çıkınca durur.
 * `restartKey` değişince saat sıfırlanır (ör. adımlar arasında geçiş).
 */
export function useSceneClock<T extends HTMLElement = HTMLDivElement>(duration: number, { loop = true, threshold = 0.3, restartKey }: { loop?: boolean; threshold?: number; restartKey?: unknown } = {}) {
  const ref = useRef<T>(null);
  const [t, setT] = useState(0);
  const [visible, setVisible] = useState(false);
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const [prevKey, setPrevKey] = useState(restartKey);
  if (prevKey !== restartKey) { setPrevKey(restartKey); setT(0); }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  useEffect(() => {
    if (!visible || reduced) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      setT((x) => {
        const n = x + dt;
        if (n >= duration) return loop ? 0 : duration;
        return n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, reduced, duration, loop]);

  return { ref, t: reduced ? duration : t, reduced };
}
