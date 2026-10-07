"use client";

import { Check, Sparkles, Bell, Camera, ArrowUp, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSceneClock } from "@/components/marketing/useSceneClock";

/**
 * Tanıtım "öne çıkanlar" kartlarının küçük canlandırmaları. Her sahne kendi saatiyle (useSceneClock)
 * ekrandayken döner; hareketi azalt açıksa son hâliyle durur. Örnek veri: Moda Kahve ekibi.
 */

const after = (t: number, a: number) => t >= a;
const typed = (text: string, t: number, at: number, speed = 38) => text.slice(0, Math.max(0, Math.floor((t - at) / speed)));

function Stage({ innerRef, children, className }: { innerRef: React.Ref<HTMLDivElement>; children: React.ReactNode; className?: string }) {
  return (
    <div ref={innerRef} aria-hidden="true" className={cn("relative h-44 overflow-hidden rounded-2xl bg-cream p-4 ring-1 ring-slate-900/5", className)}>
      {children}
    </div>
  );
}

/* ─── Yapay zekâ ile kurulum: kâğıttaki çizelgenin fotoğrafı okunur ─── */
// 3 satır: altındaki "okundu" satırı kartın içinde kalsın (4 satırda kesiliyordu)
const SETUP_PEOPLE = [["Elif K.", "Salon"], ["Burak T.", "Bar"], ["Can B.", "Mutfak"]] as const;
export function SetupScene() {
  const D = 7600;
  const { ref, t } = useSceneClock(D);
  const scan = Math.min(1, Math.max(0, (t - 600) / 2200));
  return (
    <Stage innerRef={ref}>
      <div className="flex h-full gap-3">
        <div className="relative w-[42%] shrink-0 -rotate-2 overflow-hidden rounded-lg bg-white p-2.5 shadow-md ring-1 ring-slate-900/10">
          <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold text-slate-400"><Camera size={10} /> çizelge.jpg</p>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="mb-1.5 flex gap-1">
              <span className="h-1.5 w-8 rounded-full bg-slate-300" />
              <span className="h-1.5 flex-1 rounded-full bg-slate-200" />
            </div>
          ))}
          {t > 600 && t < 2900 && (
            <span className="absolute inset-x-0 h-6 bg-gradient-to-b from-transparent via-ember-300/60 to-transparent" style={{ top: `${scan * 100}%` }} />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          {SETUP_PEOPLE.map(([n, d], i) => after(t, 3000 + i * 380) && (
            <div key={n} className="sc-pop flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-[12px] ring-1 ring-slate-900/5">
              <span className="font-semibold text-slate-800">{n}</span>
              <span className="text-slate-500">{d}</span>
            </div>
          ))}
          {after(t, 4800) && (
            <p className="m-enter flex items-center gap-1.5 pt-0.5 text-[12px] font-semibold text-forest-700"><Sparkles size={12} className="text-ember-500" /> 9 kişi ve 3 vardiya okundu</p>
          )}
        </div>
      </div>
    </Stage>
  );
}

/* ─── Otomatik Pilot: seçilen gün ve saatte (örnekte Perşembe 08:00) taslak kendiliğinden hazırlanır ─── */
const WEEK = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
export function PilotScene() {
  const D = 7000;
  const { ref, t } = useSceneClock(D);
  const day = Math.min(3, Math.floor(t / 550));
  const progress = Math.min(1, Math.max(0, (t - 2600) / 1600));
  return (
    <Stage innerRef={ref}>
      <div className="grid grid-cols-7 gap-1">
        {WEEK.map((d, i) => (
          <div key={d} className={cn("rounded-lg py-1.5 text-center text-[11px] font-semibold transition-colors duration-300",
            i === day ? "bg-forest-700 text-white" : i < day ? "bg-forest-50 text-forest-700" : "bg-white text-slate-400")}>{d}</div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[12px] text-slate-600">
        <CalendarClock size={14} className="text-forest-600" />
        {t < 2600 ? "Perşembe saat 08:00 bekleniyor" : progress < 1 ? "Gelecek haftanın planı hazırlanıyor" : "Hazırlandı, yayınlanmadı"}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-ember-400" style={{ width: `${progress * 100}%` }} />
      </div>
      {after(t, 4400) && (
        <div className="m-enter absolute inset-x-4 bottom-4 flex items-center gap-2.5 rounded-xl bg-forest-900 px-3 py-2.5 text-white shadow-lg">
          <Bell size={14} className="shrink-0 text-ember-300" />
          <span className="text-[12px] font-medium">Taslak hazır. Kontrol edip yayınlayın.</span>
        </div>
      )}
    </Stage>
  );
}

/* ─── Adalet puanı: hafta sonu vardiyaları eşitlenir ─── */
const FAIR = [["Elif", 5, 3], ["Mert", 1, 3], ["Burak", 4, 3], ["Can", 2, 3]] as const;
export function FairnessScene() {
  const D = 6500;
  const { ref, t } = useSceneClock(D);
  const balanced = after(t, 2200);
  return (
    <Stage innerRef={ref}>
      <p className="text-[12px] font-semibold text-slate-500">Son 4 haftada hafta sonu vardiyası</p>
      <div className="mt-3 flex h-[92px] items-end justify-around gap-3">
        {FAIR.map(([n, a, b]) => {
          const v = balanced ? b : a;
          return (
            <div key={n} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[12px] font-bold text-slate-800">{v}</span>
              <div className={cn("w-full max-w-[34px] rounded-t-md transition-all duration-[1200ms] ease-out", balanced ? "bg-forest-400" : v >= 4 ? "bg-ember-400" : "bg-slate-300")}
                style={{ height: `${(v / 5) * 60}px` }} />
              <span className="text-[11px] text-slate-500">{n}</span>
            </div>
          );
        })}
      </div>
      {after(t, 3600) && <p className="sc-pop absolute right-3 top-3 rounded-full bg-forest-50 px-2 py-0.5 text-[11px] font-semibold text-forest-700">Eşit dağıldı</p>}
    </Stage>
  );
}

/* ─── Biri gelemezse: yedek bulunur ─── */
const CANDS = [["Deniz Ö.", "O gün boş, kurallara uyuyor"], ["Can B.", "Bu hafta 38 saat"], ["Ayşe D.", "Dinlenmesi 10 saat"]] as const;
export function CoverScene() {
  const D = 8000;
  const { ref, t } = useSceneClock(D);
  const picked = after(t, 4600);
  return (
    <Stage innerRef={ref}>
      <div className="flex items-center justify-between rounded-lg bg-white px-2.5 py-2 text-[12px] ring-1 ring-slate-900/5">
        <span className={cn("font-semibold text-slate-800 transition-all", after(t, 900) && "text-slate-400 line-through")}>Mert Y. · Cmt 15:00</span>
        {after(t, 900) && <span className="sc-pop rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">Gelemiyor</span>}
      </div>
      <div className="mt-2 space-y-1.5">
        {CANDS.map(([n, why], i) => after(t, 2000 + i * 400) && (
          <div key={n} className={cn("sc-pop flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[12px] ring-1 transition-colors",
            picked && i === 0 ? "bg-forest-50 ring-forest-300" : "bg-white ring-slate-900/5", picked && i > 0 && "opacity-40")}>
            <span className="font-semibold text-slate-800">{i + 1}. {n}</span>
            <span className="truncate pl-2 text-[11px] text-slate-500">{picked && i === 0 ? <span className="font-semibold text-forest-700"><Check size={11} className="-mt-0.5 inline" strokeWidth={3} /> Atandı, bildirim gitti</span> : why}</span>
          </div>
        ))}
      </div>
    </Stage>
  );
}

/* ─── İşletme Asistanı: soru yazılır, cevap gelir ─── */
const Q = "Cumartesi kaç kişi eksik?";
const A = "Cumartesi kapanışta 1 kişi eksik. Deniz o gün boş ve kurallara uyuyor.";
export function AssistantMiniScene() {
  const D = 9000;
  const { ref, t } = useSceneClock(D);
  const q = typed(Q, t, 300, 55);
  const aAt = 300 + Q.length * 55 + 900;
  const a = typed(A, t, aAt, 22);
  return (
    <Stage innerRef={ref} className="flex flex-col">
      <div className="flex-1 space-y-2">
        {q && <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-forest-700 px-3 py-1.5 text-[12.5px] text-white">{q}</p>}
        {t > aAt - 700 && t < aAt && <p className="flex items-center gap-1.5 text-[11px] text-slate-400"><span className="m-pulse-dot h-1.5 w-1.5 rounded-full bg-ember-500" /> Plana bakıyor</p>}
        {a && (
          <div className="flex gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-forest-50 text-forest-700"><Sparkles size={12} /></span>
            <p className="max-w-[85%] rounded-2xl rounded-tl-md bg-white px-3 py-1.5 text-[12.5px] leading-snug text-slate-700 ring-1 ring-slate-900/5">{a}</p>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate rounded-xl bg-white px-3 py-1.5 text-[12px] text-slate-400 ring-1 ring-slate-900/5">Sorunuzu yazın…</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-forest-700 text-white"><ArrowUp size={13} /></span>
      </div>
    </Stage>
  );
}

/* ─── Birden çok şube: kişi şubeler arasında sırayla çalışır ─── */
export function BranchesScene() {
  const D = 7000;
  const { ref, t } = useSceneClock(D);
  const moved = after(t, 2600);
  return (
    <Stage innerRef={ref}>
      <div className="grid h-[104px] grid-cols-2 gap-2">
        {["Moda", "Kadıköy"].map((b, i) => (
          <div key={b} className="rounded-xl bg-white p-2 ring-1 ring-slate-900/5">
            <p className="text-[11px] font-semibold text-slate-400">{b} şubesi</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(i === 0 ? ["Elif", "Mert"] : ["Selin", "Onur"]).map(n => (
                <span key={n} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{n}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <span className="absolute top-[64px] rounded-full bg-ember-400 px-2.5 py-0.5 text-[11px] font-bold text-forest-900 shadow-md transition-all duration-[1400ms] ease-in-out"
        style={{ left: moved ? "calc(50% + 12px)" : "28px" }}>Melis</span>
      <p className="mt-2 text-[12px] text-slate-600">
        {moved ? <><span className="font-semibold text-forest-700">Bu hafta Kadıköy.</span> İki şubedeki saatleri birlikte: 42 / 45</> : "İki hafta Moda, iki hafta Kadıköy"}
      </p>
    </Stage>
  );
}
