"use client";

import { useEffect, useState } from "react";

const DAYS = ["perşembe", "cuma", "pazartesi", "çarşamba", "salı"];

/**
 * Otomatik Pilot rozetindeki gün: klavyeyle yazılıp silinir gibi döner.
 * Pilotun günü ayarlanabildiği için tek bir gün sabit yazılmaz.
 * Hareketi azalt açıksa ilk gün sabit kalır.
 */
export function TypedDay() {
  const [text, setText] = useState(DAYS[0]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    let len = DAYS[0].length;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const word = DAYS[i];
      if (!deleting && len === word.length) {
        deleting = true;
        timer = setTimeout(tick, 1900);
        return;
      }
      if (deleting && len === 0) {
        deleting = false;
        i = (i + 1) % DAYS.length;
        timer = setTimeout(tick, 260);
        return;
      }
      len += deleting ? -1 : 1;
      setText(DAYS[i].slice(0, len));
      timer = setTimeout(tick, deleting ? 45 : 95);
    };
    timer = setTimeout(tick, 1900);
    return () => clearTimeout(timer);
  }, []);

  return (
    <span className="inline-flex items-baseline">
      <span className="font-semibold text-white">{text}</span>
      <span aria-hidden="true" className="m-caret ml-px inline-block h-[1.05em] w-[2px] translate-y-[2px] bg-ember-300" />
    </span>
  );
}
