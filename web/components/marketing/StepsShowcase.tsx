"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCENES } from "@/components/marketing/TourScenes";
import { SetupDemo } from "@/components/marketing/SetupDemo";
import { useMedia, useSceneClock } from "@/components/marketing/useSceneClock";

/**
 * Tanıtım: giriş bölümündeki canlı plan (HeroPlan) ve "Nasıl çalışır" adımları (StepsShowcase).
 * Beş adım; her adımın sahnesi karartılmış bir sektör fotoğrafının üstünde oynar.
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
      <div className="relative h-[530px] sm:h-[520px]">
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

/* ─── 3-5. adım: ürün turundaki telefon, yedek ve asistan sahneleri ─── */
const WINDOW = { cover: "Moda Kahve · Bugün", assistant: "Moda Kahve · Asistan" };
function TourStage({ k, restartKey }: { k: "phone" | "cover" | "assistant"; restartKey?: unknown }) {
  const scene = SCENES[k];
  const small = useMedia("(max-width: 639px)");
  const { ref, t } = useSceneClock(scene.duration + 1500, { restartKey });
  const time = Math.min(t, scene.duration);
  const Scene = scene.Component;
  const stepIdx = scene.steps.reduce((acc, s, i) => (s.t <= time ? i : acc), 0);
  return (
    <div ref={ref} aria-hidden="true" className="w-full">
      {k === "phone" ? (
        <div className="flex justify-center">
          <div className="h-[470px] rounded-[2.4rem] bg-slate-950 p-2.5 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/10 sm:h-[500px]" style={{ aspectRatio: "390 / 800" }}>
            <div className="relative h-full overflow-hidden rounded-[2rem]"><Scene t={time} small={small} /></div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_40px_90px_-25px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/90 px-4 py-2.5">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
            </div>
            <span className="truncate text-[11px] font-medium text-slate-400">{WINDOW[k]}</span>
          </div>
          <div className="relative h-[440px] bg-white sm:h-[470px]"><Scene t={time} small={small} /></div>
        </div>
      )}
      <p key={stepIdx} className="tour-swap mt-4 flex items-center justify-center gap-2.5 text-center text-[15px] font-semibold leading-snug text-white drop-shadow">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ember-400 text-xs font-bold text-forest-900">{stepIdx + 1}</span>
        {scene.steps[stepIdx].text}
      </p>
    </div>
  );
}

const STEPS = [
  { n: 1, photo: "/marketing/assistant.webp", title: "İşletmenizi anlatın", text: "Yapay zekâ birkaç soru sorar. Departmanları, vardiyaları ve her gün kaç kişi gerektiğini kendisi doldurur. Kâğıttaki çizelgenizin fotoğrafını da ekleyebilirsiniz." },
  { n: 2, photo: "/marketing/pilot.webp", title: "Plan kurallara göre hazırlanır", text: "Ekibinizin uygunluğu, İş Kanunu'ndaki dinlenme ve çalışma süresi sınırları ve herkesin iş yükü birlikte hesaplanır. Plan birkaç saniyede hazır olur." },
  { n: 3, photo: "/marketing/briefing.webp", title: "Yayınlarsınız, ekibiniz telefonundan görür", text: "Herkese bildirim gider. Kişiler kendi vardiyalarını ve kimlerle çalışacaklarını görür. Gelemeyecekleri günleri ve izin isteklerini size buradan gönderirler." },
  { n: 4, photo: "/marketing/sector-restoran.webp", title: "Hafta boyunca değişiklikleri yönetirsiniz", text: "Biri gelemezse uygulama uygun kişileri sıralar, siz birini seçersiniz. İzin ve değişiklik isteklerini kurallara uyup uymadığını görerek onaylarsınız." },
  { n: 5, photo: "/marketing/rotation.webp", title: "Merak ettiğinizi asistana sorarsınız", text: "İşletme Asistanı'na planınız, ekibiniz ve izinler hakkında yazarak soru sorarsınız. Cevabı sizin kayıtlarınıza göre verir. Gerekirse bir işlem önerir, siz onaylarsanız uygulanır." },
];

function StepScene({ i, restartKey }: { i: number; restartKey?: unknown }) {
  if (i === 0) return <SetupDemo />;
  if (i === 1) return <ChecksScene restartKey={restartKey} />;
  if (i === 2) return <TourStage k="phone" restartKey={restartKey} />;
  if (i === 3) return <TourStage k="cover" restartKey={restartKey} />;
  return <TourStage k="assistant" restartKey={restartKey} />;
}

/** Fotoğraflı sahne zemini: fotoğraf karartılır, üstünde uygulama ekranı oynar */
function Stage({ photos, active, children, className }: { photos: string[]; active: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-[28px] bg-forest-900 sm:rounded-[36px]", className)}>
      {photos.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt="" loading="lazy"
          className={cn("absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-[1200ms] ease-out",
            i === active ? "scale-100 opacity-100" : "scale-110 opacity-0")} />
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-forest-900/55 via-forest-900/45 to-forest-900/85" />
      <div className="relative flex h-full w-full items-center justify-center p-4 sm:p-8 lg:p-10">{children}</div>
    </div>
  );
}

export function StepsShowcase() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const wide = useMedia("(min-width: 1024px)");
  const photos = STEPS.map(s => s.photo);

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
    <div className="lg:grid lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
      <div className="relative">
        {/* Adımları birleştiren çizgi, etkin adıma kadar dolar */}
        {wide && (
          <div className="absolute bottom-[calc(39vh+100px)] left-[21px] top-[calc(39vh-100px)] w-[2px] rounded-full bg-slate-200">
            <div className="w-full rounded-full bg-ember-400 transition-[height] duration-700" style={{ height: `${(active / (STEPS.length - 1)) * 100}%` }} />
          </div>
        )}
        {STEPS.map((s, i) => (
          <div key={s.n} ref={el => { refs.current[i] = el; }} data-i={i}
            className="relative flex flex-col justify-center py-8 lg:min-h-[78vh] lg:py-0">
            <div className={cn("transition-opacity duration-500 lg:pl-16", wide && active !== i && "lg:opacity-35")}>
              <span className={cn("mb-5 flex h-11 w-11 items-center justify-center rounded-full font-serif text-lg font-semibold ring-4 ring-cream transition-colors duration-500 lg:absolute lg:left-0 lg:mb-0 lg:mt-0.5",
                !wide || active >= i ? "bg-ember-400 text-forest-900" : "bg-forest-700 text-white")}>{s.n}</span>
              <h3 className="font-serif text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">{s.title}</h3>
              <p className="mt-4 max-w-md text-[17px] leading-relaxed text-slate-600">{s.text}</p>
            </div>
            {/* Telefonda sahne metnin altında */}
            {!wide && (
              <Stage photos={[s.photo]} active={0} className="mt-8 min-h-[420px]">
                <div className="w-full max-w-[520px]"><StepScene i={i} /></div>
              </Stage>
            )}
          </div>
        ))}
      </div>
      {wide && (
        <div className="relative">
          <div className="sticky top-[8vh] h-[84vh]">
            <Stage photos={photos} active={active} className="h-full">
              <div key={active} className="tour-swap w-full max-w-[560px]"><StepScene i={active} restartKey={active} /></div>
            </Stage>
          </div>
        </div>
      )}
    </div>
  );
}
