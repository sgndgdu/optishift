"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check, ShieldCheck, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCENES } from "@/components/marketing/TourScenes";
import { SetupDemo } from "@/components/marketing/SetupDemo";
import { useMedia, useSceneClock } from "@/components/marketing/useSceneClock";

/**
 * Tanıtım: giriş bölümündeki canlı plan (HeroPlan) ve "Nasıl çalışır" adımları (StepsShowcase).
 * Adımlar masaüstünde sayfa kaydırıldıkça sırayla oynar (sağda yapışkan sahne), telefonda her adımın
 * altında kendi sahnesi oynar. Saat: useSceneClock (ekrandayken, hareketi azaltta son hâl).
 */

/** Giriş: boş tablo dolar, plan yayınlanır, bildirim gider (ürün turundaki plan sahnesi) */
export function HeroPlan() {
  const scene = SCENES.plan;
  const small = useMedia("(max-width: 639px)");
  const { ref, t } = useSceneClock(scene.duration + 2500, { threshold: 0.2 });
  const Scene = scene.Component;
  return (
    <div ref={ref} aria-hidden="true" className="overflow-hidden rounded-2xl bg-white shadow-[0_40px_90px_-25px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/90 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        </div>
        <span className="truncate text-[11px] font-medium text-slate-400">Moda Kahve · Vardiya Planı</span>
      </div>
      <div className="relative h-[430px] sm:h-[470px]">
        <Scene t={Math.min(t, scene.duration)} small={small} />
      </div>
    </div>
  );
}

/* ─── 2. adım: plan kurallara göre kontrol edilir ─── */
const CHECKS = [
  "Her vardiyada gereken sayıda kişi var",
  "Herkes iki vardiya arasında en az 11 saat dinleniyor",
  "Kimse haftalık 45 saati aşmıyor",
  "Gelemem dediği güne kimse yazılmadı",
  "Hafta sonu vardiyaları eşit dağıldı",
];
function ChecksScene({ restartKey }: { restartKey?: unknown }) {
  const D = 7500;
  const { ref, t } = useSceneClock(D, { restartKey });
  const done = CHECKS.filter((_, i) => t >= 900 + i * 650).length;
  return (
    <div ref={ref} aria-hidden="true" className="rounded-3xl bg-white p-5 shadow-[0_40px_90px_-30px_rgba(10,33,30,0.45)] ring-1 ring-slate-900/5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-700 text-ember-300"><ShieldCheck size={20} /></span>
        <div>
          <p className="text-[15px] font-semibold text-slate-900">Plan kontrol ediliyor</p>
          <p className="text-[13px] text-slate-500">{done}/{CHECKS.length} kural</p>
        </div>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-forest-500 transition-all duration-500" style={{ width: `${(done / CHECKS.length) * 100}%` }} />
      </div>
      <ul className="mt-5 space-y-3">
        {CHECKS.map((c, i) => {
          const ok = i < done;
          return (
            <li key={c} className={cn("flex items-center gap-3 text-[14px] transition-colors duration-300", ok ? "text-slate-800" : "text-slate-300")}>
              <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors duration-300", ok ? "bg-forest-100 text-forest-700" : "bg-slate-100 text-transparent")}>
                <Check size={13} strokeWidth={3} />
              </span>
              {c}
            </li>
          );
        })}
      </ul>
      <div className="mt-5 h-[52px]">
        {done === CHECKS.length && t >= 900 + CHECKS.length * 650 + 300 && (
          <div className="m-enter flex items-center justify-between rounded-2xl bg-forest-50 px-4 py-3 ring-1 ring-forest-100">
            <span className="text-[14px] font-semibold text-forest-800">38 vardiya, sorun yok</span>
            <span className="rounded-xl bg-ember-400 px-3 py-1.5 text-[13px] font-semibold text-forest-900">Yayınla</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── 3. adım: yayınlanınca ekibin telefonuna bildirim düşer ─── */
const NOTES = [
  { title: "Yeni haftanın planı yayında", text: "13-19 Ekim vardiyalarınız hazır." },
  { title: "Bu hafta 5 vardiyanız var", text: "İlki pazartesi 07:00, sizinle Mert ve Can." },
  { title: "Cumartesi için değiştirme isteği", text: "Elif sizinle vardiya değiştirmek istiyor." },
];
function PublishScene({ restartKey }: { restartKey?: unknown }) {
  const D = 8000;
  const { ref, t } = useSceneClock(D, { restartKey });
  return (
    <div ref={ref} aria-hidden="true" className="flex justify-center">
      <div className="h-[460px] rounded-[2.4rem] bg-slate-950 p-2.5 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.55)] ring-1 ring-black/10" style={{ aspectRatio: "390 / 780" }}>
        <div className="relative h-full overflow-hidden rounded-[2rem] bg-gradient-to-b from-forest-800 to-forest-900 px-3 pt-10">
          <p className="text-center font-serif text-5xl font-semibold text-white">09:41</p>
          <p className="mt-1 text-center text-[12px] text-forest-100/70">Pazar, 12 Ekim</p>
          <div className="mt-6 space-y-2">
            {NOTES.map((n, i) => t >= 1000 + i * 1500 && (
              <div key={n.title} className="m-enter flex gap-2.5 rounded-2xl bg-white/90 p-3 shadow-lg backdrop-blur">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-forest-700 text-ember-300"><Bell size={14} /></span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold leading-tight text-slate-900">{n.title}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-600">{n.text}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="absolute inset-x-0 bottom-5 flex items-center justify-center gap-1.5 text-[11px] text-forest-100/60"><Smartphone size={12} /> Uygulama indirmeden, tarayıcıdan</p>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  { n: 1, title: "İşletmenizi anlatın", text: "Yapay zekâ birkaç soru sorar. Departmanları, vardiyaları ve her gün kaç kişi gerektiğini kendisi doldurur. Kâğıttaki çizelgenizin fotoğrafını da ekleyebilirsiniz." },
  { n: 2, title: "Plan kurallara göre hazırlanır", text: "Ekibin uygunluğu, İş Kanunu'ndaki dinlenme ve saat sınırları ve herkesin iş yükü birlikte hesaplanır. Plan birkaç saniyede hazır olur." },
  { n: 3, title: "Yayınlarsınız, ekip telefondan görür", text: "Yayınladığınız anda herkese bildirim gider. Kişiler vardiyalarını, kimlerle çalışacaklarını görür, izin ve değişiklik isteklerini size gönderir." },
];

function StepScene({ i, restartKey }: { i: number; restartKey?: unknown }) {
  if (i === 0) return <SetupDemo />;
  if (i === 1) return <ChecksScene restartKey={restartKey} />;
  return <PublishScene restartKey={restartKey} />;
}

export function StepsShowcase() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const wide = useMedia("(min-width: 1024px)");

  // Masaüstü: ekranın ortasındaki adım etkin olur
  useEffect(() => {
    if (!wide) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i)); });
    }, { rootMargin: "-45% 0px -45% 0px" });
    refs.current.forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, [wide]);

  return (
    <div className="lg:grid lg:grid-cols-[1fr_1.05fr] lg:gap-16">
      <div>
        {STEPS.map((s, i) => (
          <div key={s.n} ref={el => { refs.current[i] = el; }} data-i={i}
            className="flex flex-col justify-center py-8 lg:min-h-[78vh] lg:py-0">
            <div className={cn("transition-opacity duration-500", wide && active !== i && "lg:opacity-35")}>
              <span className={cn("mb-5 flex h-11 w-11 items-center justify-center rounded-full font-serif text-lg font-semibold transition-colors duration-500",
                !wide || active === i ? "bg-ember-400 text-forest-900" : "bg-forest-700 text-white")}>{s.n}</span>
              <h3 className="font-serif text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">{s.title}</h3>
              <p className="mt-4 max-w-md text-[17px] leading-relaxed text-slate-600">{s.text}</p>
            </div>
            {/* Telefonda sahne metnin altında */}
            {!wide && <div className="mt-8"><StepScene i={i} /></div>}
          </div>
        ))}
      </div>
      {wide && (
        <div className="relative">
          <div className="sticky top-[12vh] flex h-[76vh] items-center">
            <div key={active} className="tour-swap w-full"><StepScene i={active} restartKey={active} /></div>
          </div>
        </div>
      )}
    </div>
  );
}
