import Link from "next/link";
import {
  ArrowRight, Check, Scale, FileSpreadsheet, HelpCircle, Repeat, CalendarCheck, GitCompare,
  Smartphone, ArrowLeftRight, Megaphone, CalendarClock, Siren, Building2, Users, Layers, StickyNote,
} from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import { BRAND } from "@/lib/brand";
import { SECTORS } from "@/components/marketing/sectors";
import {
  AppWindow, ScheduleBoard, PhoneMock, Toast, FairnessCard, PilotCard, WhyCard,
  AvailabilityMini, RotationBoard, StoreBadge,
} from "@/components/marketing/Mockups";
import { SectorShowcase } from "@/components/marketing/SectorShowcase";
import { Reveal } from "@/components/marketing/Reveal";
import { TypedDay } from "@/components/marketing/TypedDay";
import { AssistantDemo } from "@/components/marketing/AssistantDemo";
import { ProductTour } from "@/components/marketing/ProductTour";
import { DepartmentsMock, CalendarMock, FeatureCatalog } from "@/components/marketing/FeatureShowcase";

const KAFE = SECTORS[0];
const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

const STEPS = [
  {
    n: "1",
    title: "Kaç kişi gerektiğini yazın",
    text: "Her gün ve her vardiya için kaç kişi gerektiğini bir kez yazarsınız. Sonraki haftalarda aynı sayılar kullanılır, istediğiniz zaman değiştirebilirsiniz.",
  },
  {
    n: "2",
    title: "Uygulama planı hazırlar",
    text: "Uygulama kuralları ve herkesin iş yükünü gözeterek planı birkaç saniyede hazırlar. Uygun bulmadığınız vardiyayı elle değiştirebilirsiniz.",
  },
  {
    n: "3",
    title: "Planı yayınlarsınız",
    text: "Planı yayınladığınızda ekibinizin telefonuna bildirim gider.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-cream font-sans text-slate-900 selection:bg-ember-200 selection:text-forest-900">
      <PublicHeader />

      {/* ─── Giriş ────────────────────────────────────────────── */}
      <section className="motion-auto relative overflow-hidden bg-forest-900 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "64px 64px", maskImage: "radial-gradient(ellipse at 70% 30%, black, transparent 75%)" }}
        />
        <div className="m-drift pointer-events-none absolute -right-40 -top-40 h-[680px] w-[680px] rounded-full bg-ember-500/25 blur-[140px]" />
        <div className="pointer-events-none absolute -bottom-60 -left-40 h-[560px] w-[560px] rounded-full bg-forest-500/30 blur-[140px]" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1fr_1.12fr] lg:gap-10 lg:pb-32 lg:pt-24">
          <div className="min-w-0 max-w-xl">
            <Link href="#pilot" className="m-up group mb-8 flex w-fit max-w-full items-center gap-2.5 rounded-2xl bg-white/10 py-1 pl-1 pr-3.5 leading-snug sm:rounded-full text-[13px] text-forest-100 ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/15">
              <span className="rounded-full bg-ember-400 px-2.5 py-0.5 text-[11px] font-bold text-forest-900">Yeni</span>
              <span className="sr-only">Otomatik Pilot gelecek haftanın planını seçtiğiniz gün hazırlar</span>
              <span aria-hidden="true" className="min-w-0">Otomatik Pilot gelecek haftanın planını her <TypedDay /> hazırlar</span>
              <ArrowRight size={14} className="shrink-0 text-forest-200 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <h1 className="font-serif text-[44px] font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-[74px]">
              <span className="m-up block" style={d(80)}>Haftalık vardiya planı</span>
              <span className="m-up block italic text-ember-300" style={d(180)}>saniyeler içinde</span>
              <span className="m-up block" style={d(280)}>hazır olur.</span>
            </h1>
            <p className="m-up mt-7 max-w-lg text-[17px] leading-relaxed text-forest-100/80 sm:text-lg" style={d(400)}>
              Hangi gün, hangi vardiyada kaç kişiye ihtiyacınız olduğunu bir kez yazarsınız. {BRAND.name} ekibinizin uygunluğuna ve İş Kanunu kurallarına göre haftanın planını hazırlar, vardiyaları ekibe eşit dağıtır.
            </p>
            <div className="m-up mt-9 flex flex-col gap-3 sm:flex-row" style={d(500)}>
              <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ember-400 px-7 py-4 text-base font-bold text-forest-900 shadow-[0_14px_40px_-12px_rgba(232,135,58,0.8)] transition-colors hover:bg-ember-300">
                14 gün ücretsiz deneyin <ArrowRight size={18} />
              </Link>
              <Link href="#nasil" className="inline-flex items-center justify-center rounded-2xl px-7 py-4 text-base font-semibold text-white ring-1 ring-white/25 transition-colors hover:bg-white/10">
                Nasıl çalışır?
              </Link>
            </div>
            <ul className="m-up mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-forest-100/70" style={d(600)}>
              {["Denemede bütün özellikler açık", "İş Kanunu kuralları kurulu gelir", "Telefondan da kullanılır"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check size={15} className="text-ember-300" strokeWidth={2.5} /> {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Ürün kompozisyonu */}
          <div className="relative mx-auto w-full min-w-0 max-w-[660px] lg:mr-0">
            <div className="m-up relative z-10" style={d(150)}>
              <AppWindow title={`${KAFE.location} · Vardiya Planı`}>
                <div className="sm:hidden"><ScheduleBoard sector={KAFE} compact animate /></div>
                <div className="hidden sm:block"><ScheduleBoard sector={KAFE} animate /></div>
              </AppWindow>
            </div>
            <div className="m-up absolute -right-4 -top-10 z-20 hidden lg:block 2xl:-right-12" style={d(1900)}>
              <div className="m-float"><PilotCard /></div>
            </div>
            <div className="m-up absolute -bottom-36 left-4 z-20 hidden md:block xl:-left-4" style={d(2400)}>
              <div className="m-float" style={{ animationDelay: "2.5s" }}><WhyCard /></div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Ürün turu: adım adım ekranlar ───────────────────── */}
      <section id="tur" className="pt-20 sm:pt-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
            <p className="m-up mb-3 text-sm font-semibold text-ember-600">Ürün turu</p>
            <h2 className="m-up font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl" style={d(80)}>Uygulama nasıl kullanılır, adım adım görün.</h2>
            <p className="m-up mt-4 text-base text-slate-600 sm:text-lg" style={d(160)}>
              Örnek bir kafede planın hazırlanmasını, ekibin telefonunu, onayları ve yedek bulmayı gösteriyoruz.
            </p>
          </Reveal>
          <ProductTour />
        </div>
      </section>

      {/* ─── Sektörler ────────────────────────────────────────── */}
      <section id="sektorler" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="mx-auto mb-10 max-w-2xl text-center">
            <p className="m-up mb-3 text-sm font-semibold text-ember-600">İşletme türünüze göre</p>
            <h2 className="m-up font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl" style={d(80)}>Vardiyalar ve kurallar işletme türünüze göre kurulur.</h2>
            <p className="m-up mt-4 text-base text-slate-600 sm:text-lg" style={d(160)}>
              Kayıt olurken işletme türünüzü seçersiniz. Vardiya saatleri ve kurallar bu türe göre kurulur, sonra istediğiniz gibi değiştirebilirsiniz.
            </p>
          </Reveal>
          <Reveal threshold={0.15}><SectorShowcase /></Reveal>
        </div>
      </section>

      {/* ─── Nasıl çalışır ────────────────────────────────────── */}
      <section id="nasil" className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="mb-14 max-w-2xl">
            <p className="m-up mb-3 text-sm font-semibold text-ember-600">Nasıl çalışır</p>
            <h2 className="m-up font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl" style={d(80)}>Planı üç adımda yayınlarsınız.</h2>
          </Reveal>
          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} className="flex">
                <div className="m-up flex w-full flex-col rounded-3xl bg-cream p-7 ring-1 ring-slate-900/5 sm:p-8" style={d(i * 120)}>
                  <span className="mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-forest-700 font-serif text-lg font-semibold text-white">{s.n}</span>
                  <h3 className="text-xl font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{s.text}</p>
                  <div className="mt-8 flex-1">
                    {i === 0 && <DemandMini />}
                    {i === 1 && <ChecksMini />}
                    {i === 2 && (
                      <div className="space-y-2">
                        <Toast icon="bell" title="Yeni haftanın planı yayında" text="13-19 Ekim vardiyalarınız hazır." className="m-up w-full" style={d(700)} />
                        <Toast icon="check" title="Can izin istedi" text="Perşembe · yerine 3 uygun kişi var" className="m-up w-full" style={d(1300)} />
                      </div>
                    )}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Öne çıkanlar ─────────────────────────────────────── */}
      <section id="features" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="mx-auto mb-14 max-w-2xl text-center">
            <p className="m-up mb-3 text-sm font-semibold text-ember-600">Özellikler</p>
            <h2 className="m-up font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl" style={d(80)}>Planı uygulama hazırlar, son kararı siz verirsiniz.</h2>
          </Reveal>

          <div className="grid gap-5 lg:grid-cols-3">
            {/* Otomatik Pilot */}
            <Reveal className="lg:col-span-2">
              <div id="pilot" className="m-up relative grid h-full scroll-mt-24 overflow-hidden rounded-3xl bg-forest-800 text-white sm:grid-cols-2">
                <div className="relative z-10 flex flex-col p-7 sm:p-9">
                  <FeatureIcon icon={Repeat} dark />
                  <h3 className="mt-5 font-serif text-2xl font-semibold sm:text-3xl">Otomatik Pilot</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-forest-100/80">
                    Uygulama her hafta seçtiğiniz gün gelecek haftanın planını taslak olarak hazırlar. Taslak, siz yayınlamadan ekibe gönderilmez.
                  </p>
                  <PilotCard className="m-up mt-8 w-full max-w-[300px] sm:mt-auto" />
                </div>
                <div className="relative hidden min-h-[320px] sm:block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/marketing/pilot.webp" alt="Sabah kafesinde gelecek haftanın planına bakan işletme sahibi" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-r from-forest-800 via-forest-800/30 to-transparent" />
                </div>
              </div>
            </Reveal>

            <Bento icon={HelpCircle} title="Neden bu kişi?" text="Plandaki bir isme dokunduğunuzda o kişinin o vardiyaya neden yazıldığını görürsünüz. Ekipten biri sorduğunda bu nedeni gösterebilirsiniz.">
              <WhyCard className="w-full shadow-none ring-slate-900/10" />
            </Bento>

            <Bento icon={CalendarCheck} title="Uygunluk toplama" text="Ekibiniz gelemeyeceği ve çalışmayı tercih etmediği günleri telefondan bildirir. Plan bu bilgilere göre hazırlanır. Bildirmeyenlere uygulama hatırlatma gönderir.">
              <AvailabilityMini />
            </Bento>

            <Bento icon={Scale} title="Adalet puanı" text="Uygulama kimin kaç hafta sonu ve kaç zor vardiyada çalıştığını sayar. Zor vardiyalar kişiler arasında sırayla dağıtılır.">
              <FairnessCard animate className="w-full shadow-none ring-slate-900/10" />
            </Bento>

            <Bento icon={GitCompare} title="Ya şöyle olursa?" text="Biri izne çıkarsa ya da daha çok kişi gerekirse planın nasıl değişeceğini görürsünüz. Mevcut plan ile yeni plan yan yana gösterilir.">
              <ScenarioMini />
            </Bento>

            <Bento icon={FileSpreadsheet} title="Puantaj ve fazla mesai" text="Çalışılan saatler, geç kalmalar, fazla mesai ve izinler aylık raporda toplanır. Raporu Excel olarak indirebilirsiniz." />

            <Reveal className="lg:col-span-2">
              <div className="m-up flex h-full flex-col justify-center rounded-3xl bg-white p-7 ring-1 ring-slate-900/5 sm:p-9">
                <p className="text-sm font-semibold text-slate-900">Diğer özellikler</p>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600">Departmanlar, resmî tatiller, güne eklenen notlar, İş Kanunu kuralları, puantaj ve giriş-çıkış gibi bütün özellikleri listede bulabilirsiniz.</p>
                <a href="#tum-ozellikler" className="mt-5 inline-flex items-center gap-2 self-start rounded-full bg-forest-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-forest-800">
                  Bütün özellikleri görün <ArrowRight size={15} />
                </a>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── Departmanlar ve takvim ───────────────────────────── */}
      <section id="departmanlar" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <p className="m-up mb-3 text-sm font-semibold text-ember-600">Departmanlar ve takvim</p>
            <h2 className="m-up font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl" style={d(80)}>Departmanlarınız ve özel günleriniz planda görünür.</h2>
          </Reveal>
          <div className="grid gap-5 lg:grid-cols-2">
            <Reveal>
              <div className="m-up flex h-full flex-col rounded-3xl bg-white p-7 ring-1 ring-slate-900/5 sm:p-8">
                <FeatureIcon icon={Layers} />
                <h3 className="mt-5 text-xl font-semibold text-slate-900">Departmanlar</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600">İşletmenizi salon, mutfak, bar gibi departmanlara ve bunların altındaki bölümlere ayırabilirsiniz. Her departman için kaç kişi gerektiğini ayrı yazarsınız. Birden çok departmanda çalışabilen biri gerektiğinde diğer departmana da yazılır. Departman sorumlusu kendi departmanının planını hazırlayıp onayınıza gönderir.</p>
                <div className="mt-7 flex-1 rounded-2xl bg-cream p-4"><DepartmentsMock /></div>
              </div>
            </Reveal>
            <Reveal>
              <div className="m-up flex h-full flex-col rounded-3xl bg-white p-7 ring-1 ring-slate-900/5 sm:p-8" style={d(120)}>
                <FeatureIcon icon={StickyNote} />
                <h3 className="mt-5 text-xl font-semibold text-slate-900">Bayramlar ve notlar</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600">Resmî tatiller ve bayramlar planda kendiliğinden görünür. Bir güne ya da bütün haftaya not ekleyebilirsiniz, örneğin kampanya, etkinlik, denetim ya da kapalı gün. Notu planı açan herkes görür.</p>
                <div className="mt-7 flex-1 rounded-2xl bg-cream p-4"><CalendarMock /></div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── Bütün özellikler ─────────────────────────────────── */}
      <section id="tum-ozellikler" className="scroll-mt-20 bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <p className="m-up mb-3 text-sm font-semibold text-ember-600">Bütün özellikler</p>
            <h2 className="m-up font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl" style={d(80)}>Uygulamanın bütün özellikleri</h2>
          </Reveal>
          <Reveal threshold={0.05}><FeatureCatalog /></Reveal>
        </div>
      </section>

      {/* ─── İşletme Asistanı ─────────────────────────────────── */}
      <section id="asistan" className="relative overflow-hidden bg-forest-900 py-20 text-white sm:py-28">
        <div className="pointer-events-none absolute -right-40 top-10 h-[560px] w-[560px] rounded-full bg-ember-500/20 blur-[140px]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <Reveal>
            <p className="m-up mb-3 text-sm font-semibold text-ember-300">Yapay zekâ</p>
            <h2 className="m-up font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-5xl" style={d(80)}>İşletmenizle ilgili sorularınızı asistana sorabilirsiniz.</h2>
            <p className="m-up mt-5 max-w-lg text-base leading-relaxed text-forest-100/80 sm:text-lg" style={d(160)}>
              İşletme Asistanı planınızdaki, ekibinizdeki, izinlerdeki ve bekleyen onaylardaki bilgileri kullanır. Sorunuzu yazdığınızda birkaç saniye içinde cevap verir.
            </p>
            <p className="m-up mt-4 text-sm text-forest-100/55" style={d(220)}>Asistan kayıtlarınızı değiştirmez, sadece bilgi ve öneri verir.</p>
            <div className="m-up relative mt-10 hidden aspect-[4/3] max-w-sm overflow-hidden rounded-3xl lg:block" style={d(300)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marketing/assistant.webp" alt="Telefonundan asistana soru soran restoran sorumlusu" className="h-full w-full object-cover" loading="lazy" />
            </div>
          </Reveal>
          <Reveal threshold={0.25}>
            <div className="m-up" style={d(200)}><AssistantDemo /></div>
          </Reveal>
        </div>
      </section>

      {/* ─── Şubeler arası personel ───────────────────────────── */}
      <section id="subeler" className="bg-white py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
          <Reveal className="relative">
            <div className="m-up relative aspect-[4/3] overflow-hidden rounded-3xl bg-forest-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marketing/rotation.webp" alt="Başka şubeye geçen ekip üyesi" className="h-full w-full object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-t from-forest-900/50 to-transparent" />
            </div>
            <RotationBoard className="m-up relative z-10 mx-auto -mt-24 w-[88%] max-w-[340px] sm:absolute sm:-bottom-10 sm:-right-4 sm:mt-0 sm:w-[320px] lg:-right-8" />
          </Reveal>
          <Reveal>
            <p className="m-up mb-3 text-sm font-semibold text-ember-600">Birden çok şube</p>
            <h2 className="m-up font-serif text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl" style={d(80)}>Bir kişi birden çok şubede çalışabilir.</h2>
            <p className="m-up mt-5 text-base leading-relaxed text-slate-600 sm:text-lg" style={d(160)}>
              Bir kişinin bütün şubelerdeki çalışma saatleri, dinlenme süresi ve hafta tatili birlikte hesaplanır.
            </p>
            <ul className="mt-9 space-y-6">
              {[
                { icon: Building2, t: "Birden çok şubede çalışma", x: "Kişinin çalıştığı şubeleri seçersiniz. Bir şubedeki vardiyası diğer şubenin planında da görünür ve aynı gün iki şubeye yazılmaz." },
                { icon: Repeat, t: "Şubeler arasında sırayla çalışma", x: "Örneğin iki hafta Moda, sonraki iki hafta Kadıköy şubesi gibi bir sıra kurarsınız. Kişi o hafta sırası gelen şubenin planına otomatik eklenir." },
                { icon: Users, t: "Başka şubeden yedek", x: "Biri gelemediğinde diğer şubelerdeki uygun kişilere de bildirim gider. Vardiyayı alan kişi o şubenin planına eklenir." },
              ].map(({ icon: Icon, t, x }, i) => (
                <li key={t} className="m-up flex gap-4" style={d(240 + i * 100)}>
                  <FeatureIcon icon={Icon} />
                  <span>
                    <span className="block font-semibold text-slate-900">{t}</span>
                    <span className="mt-1 block text-[15px] leading-relaxed text-slate-600">{x}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ─── Ekip ─────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
          <Reveal className="order-2 lg:order-1">
            <p className="m-up mb-3 text-sm font-semibold text-ember-600">Ekibiniz için</p>
            <h2 className="m-up font-serif text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl" style={d(80)}>Ekibiniz vardiyalarını telefonundan takip eder.</h2>
            <p className="m-up mt-5 text-base leading-relaxed text-slate-600 sm:text-lg" style={d(160)}>
              Ekip üyeleri uygulamayı telefonlarının tarayıcısından açar, bir şey indirmeleri gerekmez. Giriş bağlantısını WhatsApp ile gönderirsiniz. İsteyen Google hesabıyla giriş yapar.
            </p>
            <ul className="mt-9 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {[
                { icon: Smartphone, t: "Vardiyalarını görür", x: "Haftanın vardiyalarını, sıradaki vardiyasını ve aynı vardiyada kimlerle çalışacağını görür." },
                { icon: CalendarClock, t: "Gelemeyeceği günleri bildirir", x: "Uygun olmadığı günleri girer, plan buna göre hazırlanır." },
                { icon: ArrowLeftRight, t: "Vardiya değiştirme ve izin ister", x: "Kurala uymayan bir istek için göndermeden önce uyarı görür." },
                { icon: Megaphone, t: "Boşta kalan vardiyayı alır", x: "Biri gelemediğinde vardiyayı alabilecek kişilere bildirim gider." },
              ].map(({ icon: Icon, t, x }, i) => (
                <li key={t} className="m-up flex gap-3.5" style={d(220 + i * 80)}>
                  <FeatureIcon icon={Icon} />
                  <span>
                    <span className="block font-semibold text-slate-900">{t}</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-slate-600">{x}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="m-up mt-7 flex items-center gap-2.5 rounded-2xl bg-white px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-900/5" style={d(560)}>
              <Siren size={17} className="shrink-0 text-red-500" /> Acil bir durumda tek dokunuşla sorumluya bildirim gönderir.
            </p>
            <div className="m-up mt-8 flex flex-wrap items-center gap-3" style={d(640)}>
              <StoreBadge store="App Store" />
              <StoreBadge store="Google Play" />
              <span className="text-[13px] text-slate-500">Ekip uygulaması yakında App Store ve Google Play&apos;de olacak.</span>
            </div>
          </Reveal>
          <Reveal className="relative order-1 lg:order-2">
            <div className="m-up relative aspect-[4/3] overflow-hidden rounded-3xl bg-forest-900 lg:aspect-[5/4]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marketing/briefing.webp" alt="Vardiya başında kısa toplantı yapan ekip" className="h-full w-full object-cover" loading="lazy" />
            </div>
            <div className="m-up absolute -bottom-12 -left-4 z-10 hidden sm:block lg:-left-10" style={d(300)}>
              <div className="m-float"><PhoneMock sector={KAFE} className="origin-bottom-left scale-[0.8]" /></div>
            </div>
            <div className="m-up absolute -right-3 top-8 z-10 hidden sm:block" style={d(800)}>
              <Toast icon="bell" title="Açık vardiya: Cumartesi 15:00" text="Mert gelemiyor. Almak ister misiniz?" />
            </div>
          </Reveal>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

function FeatureIcon({ icon: Icon, dark = false }: { icon: typeof Check; dark?: boolean }) {
  return (
    <span className={dark
      ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-ember-300"
      : "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-700"}>
      <Icon size={20} />
    </span>
  );
}

function Bento({ icon, title, text, children }: { icon: typeof Check; title: string; text: string; children?: React.ReactNode }) {
  return (
    <Reveal>
      <div className="m-up flex h-full flex-col rounded-3xl bg-white p-7 ring-1 ring-slate-900/5 sm:p-8">
        <FeatureIcon icon={icon} />
        <h3 className="mt-5 text-xl font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{text}</p>
        {children && <div className="mt-7 flex-1 rounded-2xl bg-cream p-4">{children}</div>}
      </div>
    </Reveal>
  );
}

/** Adım 1 görseli: ihtiyaç tablosu */
function DemandMini() {
  const rows = [
    { l: "Açılış", v: [2, 2, 2, 2, 3, 4, 3] },
    { l: "Kapanış", v: [2, 2, 3, 3, 4, 5, 4] },
  ];
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-900/5" aria-hidden="true">
      <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-1 text-[10.5px]">
        <div />
        {["P", "S", "Ç", "P", "C", "C", "P"].map((x, i) => (
          <div key={i} className={i >= 5 ? "text-center font-medium text-ember-600" : "text-center font-medium text-slate-400"}>{x}</div>
        ))}
        {rows.map((r, ri) => (
          <DemandRow key={r.l} label={r.l} values={r.v} offset={ri * 260} />
        ))}
      </div>
    </div>
  );
}

function DemandRow({ label, values, offset }: { label: string; values: number[]; offset: number }) {
  return (
    <>
      <div className="flex items-center font-medium text-slate-600">{label}</div>
      {values.map((v, i) => (
        <div key={i} className="m-pop flex h-7 items-center justify-center rounded-md bg-slate-50 font-semibold text-slate-800 ring-1 ring-inset ring-slate-200" style={d(500 + i * 70 + offset)}>{v}</div>
      ))}
    </>
  );
}

/** Adım 2 görseli: plan kontrolü */
function ChecksMini() {
  return (
    <div className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-slate-900/5" aria-hidden="true">
      {["Her vardiyada gereken sayıda kişi var", "Herkes iki vardiya arasında 11 saat dinleniyor", "Kimse haftalık saat sınırını aşmıyor", "Hafta sonu vardiyaları eşit dağıldı"].map((t, i) => (
        <div key={t} className="m-up flex items-center gap-2.5 text-[13px] text-slate-700" style={d(600 + i * 220)}>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-forest-100 text-forest-700">
            <Check size={11} strokeWidth={3} />
          </span>
          {t}
        </div>
      ))}
    </div>
  );
}

/** "Ya şöyle olursa?" görseli: iki planın kısa karşılaştırması */
function ScenarioMini() {
  const rows = [
    { l: "Vardiya", a: "38", b: "38" },
    { l: "Eksik kişi", a: "0", b: "1", warn: true },
    { l: "Sorun", a: "0", b: "0" },
  ];
  return (
    <div className="text-[12.5px]" aria-hidden="true">
      <div className="mb-2 grid grid-cols-[1fr_auto_auto] gap-x-4 text-[11px] font-semibold text-slate-400">
        <span /><span>Şimdi</span><span>Can izinde</span>
      </div>
      {rows.map((r) => (
        <div key={r.l} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-t border-slate-900/5 py-2">
          <span className="text-slate-600">{r.l}</span>
          <span className="w-10 text-center font-semibold text-slate-900">{r.a}</span>
          <span className={r.warn ? "w-[72px] text-center font-semibold text-ember-600" : "w-[72px] text-center font-semibold text-slate-900"}>{r.b}</span>
        </div>
      ))}
    </div>
  );
}
