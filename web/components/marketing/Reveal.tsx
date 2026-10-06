"use client";

import { useEffect, useRef } from "react";

/**
 * Ekrana girince içindeki .m-up / .m-pop / .m-grow öğelerini oynatır (globals.css).
 * Sunucuda ve JS gelmeden içerik görünür kalır; sınıflar yüklendikten sonra doğrudan öğeye eklenir.
 */
export function Reveal({ children, className, threshold = 0.2 }: {
  children: React.ReactNode;
  className?: string;
  threshold?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add("motion-root");
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.classList.add("in-view"); io.disconnect(); }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return <div ref={ref} className={className}>{children}</div>;
}
