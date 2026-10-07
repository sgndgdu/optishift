import Link from "next/link";
import {
  ArrowRight, Check, Scale, Repeat, Sparkles, Users, Building2, MessageSquareText,
  Smartphone, ArrowLeftRight, Megaphone, CalendarClock,
} from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import { BRAND } from "@/lib/brand";
import { SECTORS } from "@/components/marketing/sectors";
import { AppWindow, ScheduleBoard, PhoneMock } from "@/components/marketing/Mockups";
import { Reveal } from "@/components/marketing/Reveal";
import { ProductTour } from "@/components/marketing/ProductTour";

// Sadeleştirme (2026-10-07): sayfa 11 bölümden 5 bölüme indi. Bütün özellik
// listesi /ozellikler sayfasında.
const KAFE = SECTORS[0];
const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

const STEPS = [
  {
    n: "1",
    title: "İşletmenizi anlatın",
    text: "Yapay zekâ birkaç soru sorar, departmanları, vardiyaları ve her gün kaç kişi gerektiğini doldurur. Kâğıttaki çizelgenizin fotoğrafını da ekleyebilirsiniz.",
  },
  {
    n: "2",
    title: "Uygulama planı hazırlar",
    text: "Plan, ekibin uygunluğuna, İş Kanunu kurallarına ve herkesin iş yüküne göre birkaç saniyede hazırlanır. İstediğiniz vardiyayı elle değiştirebilirsiniz.",
  },
  {
    n: "3",
    title: "Planı yayınlarsınız",
    text: "Yayınladığınızda ekibinizin telefonuna bildirim gider. İzin ve değişiklik istekleri size gelir.",
  },
];

const FEATURES = [
  { icon: Sparkles, title: "Yapay zekâ ile kurulum", text: "İşletmenizi kendi cümlelerinizle anlatırsınız, kurulum birkaç dakikada biter." },
  { icon: Repeat, title: "Otomatik Pilot", text: "Gelecek haftanın planı her hafta taslak olarak hazırlanır. Siz yayınlamadan ekibe gitmez." },
  { icon: Scale, title: "Adalet puanı", text: "Hafta sonu ve zor vardiyalar kişiler arasında sırayla dağıtılır." },
  { icon: Users, title: "Biri gelemezse yedek", text: "Kurallara uyan en uygun kişiler bulunur, vardiya tek dokunuşla devredilir." },
  { icon: MessageSquareText, title: "İşletme Asistanı", text: "Planınız, ekibiniz ve izinler hakkındaki sorularınızı yazarak sorarsınız." },
  { icon: Building2, title: "Birden çok şube", text: "Bir kişi birden çok şubede çalışabilir, saatleri bütün şubelerde birlikte hesaplanır." },
];

const TEAM_POINTS = [
  { icon: Smartphone, t: "Vardiyalarını görür", x: "Haftanın vardiyalarını ve kimlerle çalışacağını görür." },
  { icon: CalendarClock, t: "Gelemeyeceği günleri bildirir", x: "Plan bu bilgilere göre hazırlanır." },
  { icon: ArrowLeftRight, t: "İzin ve değişiklik ister", x: "Kurala uymayan bir istek için önceden uyarı görür." },
  { icon: Megaphone, t: "Boşta kalan vardiyayı alır", x: "Biri gelemediğinde uygun kişilere bildirim gider." },
];

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
              <span className="m-up block" style={d(280)}>hazır olur.</span>
            </h1>
            <p className="m-up mt-7 max-w-lg text-[17px] leading-relaxed text-forest-100/80 sm:text-lg" style={d(400)}>
              Her gün kaç kişiye ihtiyacınız olduğunu bir kez yazarsınız. {BRAND.name} ekibinizin uygunluğuna ve İş Kanunu kurallarına göre planı hazırlar.
            </p>
            <div className="m-up mt-9 flex flex-col gap-3 sm:flex-row" style={d(500)}>
              <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ember-400 px-7 py-4 text-base font-bold text-forest-900 shadow-[0_14px_40px_-12px_rgba(232,135,58,0.8)] transition-colors hover:bg-ember-300">
                14 gün ücretsiz deneyin <ArrowRight size={18} />
              </Link>
              <Link href="#tur" className="inline-flex items-center justify-center rounded-2xl px-7 py-4 text-base font-semibold text-white ring-1 ring-white/25 transition-colors hover:bg-white/10">
                Nasıl çalışır?
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full min-w-0 max-w-[660px] lg:mr-0">
            <div className="m-up relative" style={d(150)}>
              <AppWindow title={`${KAFE.location} · Vardiya Planı`}>
                <div className="sm:hidden"><ScheduleBoard sector={KAFE} compact animate /></div>
                <div className="hidden sm:block"><ScheduleBoard sector={KAFE} animate /></div>
              </AppWindow>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Nasıl çalışır ────────────────────────────────────── */}
      <section id="nasil" className="scroll-mt-20 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="m-up font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Planı üç adımda yayınlarsınız.</h2>
          </Reveal>
          <div className="grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} className="flex">
                <div className="m-up flex w-full flex-col rounded-3xl bg-white p-7 ring-1 ring-slate-900/5 sm:p-8" style={d(i * 120)}>
                  <span className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-forest-700 font-serif text-lg font-semibold text-white">{s.n}</span>
                  <h3 className="text-xl font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{s.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Ürün turu ────────────────────────────────────────── */}
      <section id="tur" className="scroll-mt-20 bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
            <h2 className="m-up font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Uygulamayı adım adım görün.</h2>
            <p className="m-up mt-4 text-base text-slate-600 sm:text-lg" style={d(100)}>
              Örnek bir kafede planın hazırlanması, ekibin telefonu, onaylar ve yedek bulma.
            </p>
          </Reveal>
          <ProductTour />
        </div>
      </section>

      {/* ─── Öne çıkanlar ─────────────────────────────────────── */}
      <section id="features" className="scroll-mt-20 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="m-up font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Planı uygulama hazırlar, son kararı siz verirsiniz.</h2>
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} className="flex">
                <div className="m-up flex w-full gap-4 rounded-3xl bg-white p-6 ring-1 ring-slate-900/5 sm:p-7" style={d((i % 3) * 100)}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-700"><Icon size={20} /></span>
                  <span>
                    <span className="block text-lg font-semibold text-slate-900">{title}</span>
                    <span className="mt-1 block text-[15px] leading-relaxed text-slate-600">{text}</span>
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/ozellikler" className="inline-flex items-center gap-2 rounded-full bg-forest-700 px-6 py-3 text-sm font-semibold text-white hover:bg-forest-800">
              Bütün özellikleri görün <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Ekip ─────────────────────────────────────────────── */}
      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
          <Reveal className="order-2 lg:order-1">
            <h2 className="m-up font-serif text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">Ekibiniz vardiyalarını telefonundan takip eder.</h2>
            <p className="m-up mt-5 text-base leading-relaxed text-slate-600 sm:text-lg" style={d(100)}>
              Bir şey indirmeleri gerekmez. Giriş bağlantısını WhatsApp ile gönderirsiniz.
            </p>
            <ul className="mt-9 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {TEAM_POINTS.map(({ icon: Icon, t, x }, i) => (
                <li key={t} className="m-up flex gap-3.5" style={d(160 + i * 80)}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-700"><Icon size={20} /></span>
                  <span>
                    <span className="block font-semibold text-slate-900">{t}</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-slate-600">{x}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="relative order-1 lg:order-2">
            <div className="m-up relative aspect-[4/3] overflow-hidden rounded-3xl bg-forest-900 lg:aspect-[5/4]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marketing/briefing.webp" alt="Vardiya başında kısa toplantı yapan ekip" className="h-full w-full object-cover" loading="lazy" />
            </div>
            <div className="m-up absolute -bottom-12 -left-4 z-10 hidden sm:block lg:-left-10" style={d(300)}>
              <PhoneMock sector={KAFE} className="origin-bottom-left scale-[0.8]" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── Son çağrı ────────────────────────────────────────── */}
      <section className="py-20 sm:py-28">
        <Reveal className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="m-up font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">İlk planınızı bugün hazırlayın.</h2>
          <p className="m-up mt-4 text-base text-slate-600 sm:text-lg" style={d(100)}>14 gün boyunca bütün özellikleri ücretsiz kullanabilirsiniz.</p>
          <ul className="m-up mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-600" style={d(160)}>
            {["Kurulumu yapay zekâ yapar", "İş Kanunu kuralları kurulu gelir", "Telefondan da kullanılır"].map((t) => (
              <li key={t} className="flex items-center gap-1.5"><Check size={15} className="text-forest-600" strokeWidth={2.5} /> {t}</li>
            ))}
          </ul>
          <Link href="/register" className="m-up mt-9 inline-flex items-center gap-2 rounded-2xl bg-forest-700 px-7 py-4 text-base font-bold text-white hover:bg-forest-800" style={d(220)}>
            14 gün ücretsiz deneyin <ArrowRight size={18} />
          </Link>
        </Reveal>
      </section>

      <PublicFooter />
    </div>
  );
}
