"use client";

import { useEffect, useRef } from "react";

/**
 * "7,5 saat" gibi bir değerin sayısını ekrana girince sıfırdan sayar.
 * Sunucuda son değer yazılı gelir; hareketi azalt açıksa hiç oynatmaz.
 */
export function CountUp({ value, duration = 1200 }: { value: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    const m = value.match(/^(\d+)(?:,(\d+))?(.*)$/);
    if (!el || !m || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const decimals = m[2]?.length ?? 0;
    const target = parseFloat(`${m[1]}.${m[2] ?? 0}`);
    const rest = m[3];
    const render = (v: number) => { el.textContent = v.toFixed(decimals).replace(".", ",") + rest; };
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        render(target * (1 - Math.pow(1 - t, 3)));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      render(0);
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value, duration]);

  return <span ref={ref}>{value}</span>;
}
