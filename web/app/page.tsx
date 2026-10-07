import Link from "next/link";
import {
  ArrowRight, Check, Scale, Repeat, Building2, Megaphone, Sun, BarChart3,
} from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import { BRAND } from "@/lib/brand";
import { HeroPlan, StepsShowcase } from "@/components/marketing/StepsShowcase";
import { SectorMarquee } from "@/components/marketing/SectorMarquee";
import { Reveal } from "@/components/marketing/Reveal";

// Sadeleştirme 2 (2026-10-07): uygulamanın ne yaptığı tek bir beş adımlı akışta anlatılır (StepsShowcase,
// sahneler sektör fotoğraflarının üstünde). Ürün turu ve ekip bölümü bu akışa katıldı, özellik kartları
// animasyonsuz kısa bir listeye indi. Bütün özellik listesi /ozellikler sayfasında.
const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

const FEATURES = [
  { icon: Repeat, title: "Otomatik Pilot", text: "Gelecek haftanın planı seçtiğiniz gün ve saatte taslak olarak hazırlanır. Siz yayınlamadan ekibinize gitmez." },
  { icon: Scale, title: "Adalet puanı", text: "Hafta sonu ve zor vardiyalar kişiler arasında sırayla dağıtılır." },
  { icon: Megaphone, title: "Vardiya ilanı", text: "Boşta kalan bir vardiyayı uygun kişilere ilan edersiniz. Ekibinizden biri ilanı alır." },
  { icon: Building2, title: "Birden çok şube", text: "Bir kişi birden çok şubede çalışabilir. Çalışma süresi bütün şubelerde birlikte hesaplanır." },
  { icon: Sun, title: "Sabah özeti", text: "Her sabah o gün kimin çalıştığı ve karar bekleyen işler size tek bildirimle gelir." },
  { icon: BarChart3, title: "Aylık özet", text: "Her ay başında geçen ay yayınlanan planlar, onaylanan istekler ve fazla mesai özetlenir." },
];

const LAW = ["İki vardiya arasında en az 11 saat dinlenme", "Haftalık en fazla 45 saat", "Vardiya süresine göre yasal mola", "Gece çalışması sınırları"];

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-cream font-sans text-slate-900 selection:bg-ember-200 selection:text-forest-900">
      <PublicHeader />

      {/* ─── Giriş ────────────────────────────────────────────── */}
      <section className="motion-auto relative overflow-hidden bg-forest-900 text-white">
        <div className="m-drift pointer-events-none absolute -right-40 -top-40 h-[680px] w-[680px] rounded-full bg-ember-500/25 blur-[140px]" />
        <div className="pointer-events-none absolute -bottom-60 -left-40 h-[560px] w-[560px] rounded-full bg-forest-500/30 blur-[140px]" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1fr_1.12fr] lg:gap-10 lg:pb-28 lg:pt-24">
          <div className="min-w-0 max-w-xl">
            <h1 className="font-serif text-[44px] font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-[74px]">
              <span className="m-up block" style={d(80)}>Haftalık vardiya planı</span>
              <span className="m-up block italic text-ember-300" style={d(180)}>saniyeler içinde</span>
              <span className="m-up block" style={d(280)}>hazır!</span>
            </h1>
            <p className="m-up mt-7 max-w-lg text-[17px] leading-relaxed text-forest-100/80 sm:text-lg" style={d(400)}>
              Her gün kaç kişiye ihtiyacınız olduğunu bir kez yazarsınız. {BRAND.name} ekibinizin uygunluğuna ve İş Kanunu kurallarına göre planı hazırlar.
            </p>
            <div className="m-up mt-9 flex flex-col gap-3 sm:flex-row" style={d(500)}>
              <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ember-400 px-7 py-4 text-base font-bold text-forest-900 shadow-[0_14px_40px_-12px_rgba(232,135,58,0.8)] transition-colors hover:bg-ember-300">
                14 gün ücretsiz deneyin <ArrowRight size={18} />
              </Link>
              <Link href="#nasil" className="inline-flex items-center justify-center rounded-2xl px-7 py-4 text-base font-semibold text-white ring-1 ring-white/25 transition-colors hover:bg-white/10">
                Nasıl çalışır?
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full min-w-0 max-w-[660px] lg:mr-0">
            <div className="m-up relative" style={d(150)}>
              <HeroPlan />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Sektörler ────────────────────────────────────────── */}
      <section className="pt-16 sm:pt-24">
        <Reveal className="mx-auto mb-10 max-w-2xl px-4 text-center sm:px-6">
          <h2 className="m-up font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Vardiyayla çalışan her işletme için</h2>
          <p className="m-up mt-4 text-base text-slate-600 sm:text-lg" style={d(100)}>
            Departmanlarınızı ve vardiyalarınızı siz belirlersiniz. Uygulama kafede de fabrikada da aynı kurallarla çalışır.
          </p>
        </Reveal>
        <SectorMarquee />
      </section>

      {/* ─── Nasıl çalışır ────────────────────────────────────── */}
      <section id="nasil" className="scroll-mt-20 py-20 sm:py-28">
        <span id="tur" className="block scroll-mt-20" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="mx-auto max-w-2xl text-center lg:mb-4">
            <h2 className="m-up font-serif text-4xl font-semibold tracking-tight text-slate-900 sm:text-6xl">Uygulama nasıl çalışır?</h2>
            <p className="m-up mt-4 text-lg text-slate-600 sm:text-xl" style={d(100)}>
              Örnek bir kafede kurulumdan hafta sonuna kadar olanları adım adım izleyin.
            </p>
          </Reveal>
          <StepsShowcase />
        </div>
      </section>

      {/* ─── Diğer özellikler ─────────────────────────────────── */}
      <section id="features" className="scroll-mt-20 relative overflow-hidden bg-forest-900 py-20 text-white sm:py-28">
        <div className="pointer-events-none absolute -right-40 top-20 h-[520px] w-[520px] rounded-full bg-ember-500/15 blur-[140px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="m-up font-serif text-4xl font-semibold tracking-tight sm:text-6xl">Planı uygulama hazırlar, son kararı siz verirsiniz.</h2>
          </Reveal>
          <div className="grid gap-4 lg:grid-cols-[1fr_2fr] lg:gap-5">
            <Reveal className="relative min-h-[380px] overflow-hidden rounded-3xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marketing/team.webp" alt="Telefonundan vardiyasına bakan çalışan" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-forest-900 via-forest-900/60 to-forest-900/10" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <p className="m-up font-serif text-2xl font-semibold leading-tight">İş Kanunu kuralları kurulu gelir</p>
                <ul className="mt-4 space-y-2">
                  {LAW.map((t, i) => (
                    <li key={t} className="m-up flex items-center gap-2.5 text-[15px] text-forest-50" style={d(120 + i * 90)}>
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ember-400 text-forest-900"><Check size={12} strokeWidth={3} /></span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
              {FEATURES.map(({ icon: Icon, title, text }, i) => (
                <div key={title} className="m-up flex gap-4 rounded-3xl bg-white/[0.06] p-5 ring-1 ring-white/10 transition-colors hover:bg-white/[0.1] sm:block sm:p-6" style={d((i % 3) * 90)}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ember-400/15 text-ember-300"><Icon size={20} /></span>
                  <span className="block">
                    <span className="block text-lg font-semibold sm:mt-4">{title}</span>
                    <span className="mt-1.5 block text-[15px] leading-relaxed text-forest-100/75">{text}</span>
                  </span>
                </div>
              ))}
            </Reveal>
          </div>
          <div className="mt-10 text-center">
            <Link href="/ozellikler" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-forest-900 hover:bg-forest-50">
              Bütün özellikleri görün <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Son çağrı ────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marketing/sector-kafe.webp" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-forest-900/80" />
        <Reveal className="relative mx-auto max-w-3xl px-4 py-24 text-center text-white sm:px-6 sm:py-32">
          <h2 className="m-up font-serif text-4xl font-semibold tracking-tight sm:text-6xl">İlk planınızı bugün hazırlayın.</h2>
          <p className="m-up mt-4 text-base text-forest-100/85 sm:text-lg" style={d(100)}>14 gün boyunca bütün özellikleri ücretsiz kullanabilirsiniz.</p>
          <ul className="m-up mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-forest-50" style={d(160)}>
            {["Kurulumu yapay zekâ yapar", "İş Kanunu kuralları kurulu gelir", "Ekibiniz planı anında görür"].map((t) => (
              <li key={t} className="flex items-center gap-1.5"><Check size={15} className="text-ember-300" strokeWidth={2.5} /> {t}</li>
            ))}
          </ul>
          <Link href="/register" className="m-up mt-9 inline-flex items-center gap-2 rounded-2xl bg-ember-400 px-7 py-4 text-base font-bold text-forest-900 shadow-[0_14px_40px_-12px_rgba(232,135,58,0.8)] hover:bg-ember-300" style={d(220)}>
            14 gün ücretsiz deneyin <ArrowRight size={18} />
          </Link>
        </Reveal>
      </section>

      <PublicFooter />
    </div>
  );
}
