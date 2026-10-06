import Link from "next/link";
import {
  ArrowRight, Check, Scale, ShieldCheck, ArrowLeftRight, Tablet, FileSpreadsheet, Building2,
  ListChecks, Smartphone, MessageSquare, CalendarClock, Megaphone,
} from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import { BRAND } from "@/lib/brand";
import { SECTORS } from "@/components/marketing/sectors";
import { AppWindow, ScheduleBoard, PhoneMock, Toast, FairnessCard } from "@/components/marketing/Mockups";
import { SectorShowcase } from "@/components/marketing/SectorShowcase";
import { SectorPhoto } from "@/components/marketing/SectorPhoto";
import { Reveal } from "@/components/marketing/Reveal";
import { CountUp } from "@/components/marketing/CountUp";

const KAFE = SECTORS[0];

const FEATURES = [
  { icon: ShieldCheck, title: "İş Kanunu kuralları hazır", text: "İki vardiya arası en az 11 saat dinlenme, haftalık çalışma sınırı, hafta tatili ve gece çalışma süresi plan kurulurken gözetilir." },
  { icon: Scale, title: "Adalet puanı", text: "Kim kaç hafta sonu ve kaç zor vardiya çalıştı sayılır. Zor vardiyalar sırayla döner, kimse sürekli aynı yükü taşımaz." },
  { icon: ArrowLeftRight, title: "Takas, izin, açık vardiya", text: "Ekip takas ister, izin ister, boşta kalan vardiyayı üstlenir. Kurala uymayan değişiklik daha istek aşamasında durur." },
  { icon: Tablet, title: "Tablet ile giriş çıkış", text: "İş yerindeki ortak tablete PIN ile giriş. İsterseniz telefondan konum doğrulamalı giriş." },
  { icon: FileSpreadsheet, title: "Puantaj ve fazla mesai", text: "Çalışılan saat, geç kalma, fazla mesai ve izinler ay sonunda raporda. Excel olarak indirilir." },
  { icon: Building2, title: "Çok şube, tek panel", text: "Bütün şubeleri tek ekranda görün. Birden çok şubede çalışan kişinin saatleri birlikte sayılır." },
];

const STEPS = [
  {
    n: "1",
    title: "İhtiyacı bir kez girin",
    text: "Hangi gün, hangi vardiyada kaç kişi gerektiğini tabloya yazın. Geçmiş haftalarınızdan öneri de alabilirsiniz.",
  },
  {
    n: "2",
    title: "Plan saniyeler içinde hazır",
    text: "Uygunluklar, yasal kurallar ve adalet puanı birlikte hesaplanır. Beğenmediğiniz hücreyi elle değiştirin, gerisi korunur.",
  },
  {
    n: "3",
    title: "Yayınlayın, ekip telefondan görsün",
    text: "Yayınladığınız an herkese bildirim gider. Ekip vardiyasını, takas ve izin isteklerini telefonundan yönetir.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-cream text-slate-900 font-sans selection:bg-forest-200 selection:text-forest-900">
      <PublicHeader />

      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section className="motion-auto relative overflow-hidden">
        <div className="m-drift pointer-events-none absolute -top-40 right-[-15%] h-[720px] w-[720px] rounded-full bg-gradient-to-br from-forest-100 via-ember-100/60 to-transparent blur-[120px]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[1fr_1.1fr] lg:gap-8 lg:pb-28 lg:pt-20">
          <div className="min-w-0 max-w-xl">
            <Link href="#nasil" className="m-up group mb-7 flex w-fit max-w-full items-center gap-2.5 rounded-full bg-white py-1 pl-1 pr-3.5 text-[13px] text-slate-600 ring-1 ring-slate-200 transition-colors hover:ring-forest-300">
              <span className="rounded-full bg-forest-700 px-2.5 py-0.5 text-[11px] font-semibold text-white">Yeni</span>
              <span className="truncate">Otomatik Pilot: gelecek haftanın planı her perşembe hazır</span>
              <ArrowRight size={14} className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <h1 className="font-serif text-[42px] font-semibold leading-[1.04] tracking-tight text-slate-900 sm:text-6xl lg:text-[68px]">
              <span className="m-up block" style={{ "--d": "80ms" } as React.CSSProperties}>Vardiya planı,</span>
              <span className="m-up block text-forest-700" style={{ "--d": "180ms" } as React.CSSProperties}>dakikalar içinde</span>
              <span className="m-up block" style={{ "--d": "280ms" } as React.CSSProperties}>ve herkese adil.</span>
            </h1>
            <p className="m-up mt-6 text-[17px] leading-relaxed text-slate-600 sm:text-lg" style={{ "--d": "400ms" } as React.CSSProperties}>
              Kaç kişiye ihtiyacınız olduğunu söyleyin, {BRAND.name}{" "}haftanın planını İş Kanunu&apos;na uygun ve dengeli şekilde kursun.
              Ekibiniz vardiyasını, takasını ve iznini telefonundan yönetsin.
            </p>
            <div className="m-up mt-9 flex flex-col gap-3 sm:flex-row" style={{ "--d": "500ms" } as React.CSSProperties}>
              <Link href="/register" className="inline-flex h-13 items-center justify-center gap-2 rounded-2xl bg-forest-700 px-7 py-3.5 text-base font-semibold text-white shadow-[0_10px_30px_-10px_rgba(20,69,61,0.7)] transition-colors hover:bg-forest-800">
                Ücretsiz başlayın <ArrowRight size={18} />
              </Link>
              <Link href="#nasil" className="inline-flex h-13 items-center justify-center rounded-2xl bg-white px-7 py-3.5 text-base font-semibold text-slate-800 ring-1 ring-slate-200 transition-colors hover:bg-slate-50">
                Nasıl çalışır?
              </Link>
            </div>
            <ul className="m-up mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500" style={{ "--d": "600ms" } as React.CSSProperties}>
              {["Kredi kartı gerekmez", "Küçük işletmeye süresiz ücretsiz", "Telefonda tam çalışır"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check size={15} className="text-forest-600" strokeWidth={2.5} /> {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Ürün kompozisyonu */}
          <div className="relative mx-auto w-full min-w-0 max-w-[640px] lg:mr-0">
            <div className="m-up relative z-10" style={{ "--d": "150ms" } as React.CSSProperties}>
              <AppWindow title={`${KAFE.location} · Vardiya Planı`}>
                {/* Telefonda 5 gün, geniş ekranda 7 gün (7 sütun dar ekrana sığmaz) */}
                <div className="sm:hidden"><ScheduleBoard sector={KAFE} compact animate /></div>
                <div className="hidden sm:block"><ScheduleBoard sector={KAFE} animate /></div>
              </AppWindow>
            </div>
            <div className="m-up absolute -bottom-16 left-4 z-20 hidden md:block xl:-left-6" style={{ "--d": "1100ms" } as React.CSSProperties}>
              <div className="m-float" style={{ animationDelay: "2s" }}>
                <PhoneMock sector={KAFE} className="scale-[0.82] origin-bottom-left" />
              </div>
            </div>
            <div className="m-up absolute -right-4 -top-6 z-20 hidden sm:block lg:-right-10" style={{ "--d": "2100ms" } as React.CSSProperties}>
              <div className="m-float">
                <Toast icon="swap" title="Takas onaylandı" text="Burak ile Selin cumartesi vardiyalarını değiştirdi." />
              </div>
            </div>
            <div className="m-up absolute -bottom-10 -right-4 z-20 hidden lg:block lg:-right-10" style={{ "--d": "1700ms" } as React.CSSProperties}>
              <div className="m-float" style={{ animationDelay: "3.5s" }}>
                <FairnessCard animate />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Kurallar şeridi ──────────────────────────────────── */}
      <section className="border-y border-slate-200/70 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
          {[
            { k: "11 saat", v: "vardiyalar arası dinlenme" },
            { k: "45 saat", v: "haftalık sınır, kişiye göre" },
            { k: "7,5 saat", v: "gece çalışma süresi" },
            { k: "1 gün", v: "hafta tatili her hafta" },
          ].map((x) => (
            <div key={x.k} className="bg-white px-5 py-6 text-center sm:py-8">
              <p className="font-serif text-2xl font-semibold text-forest-700 sm:text-3xl"><CountUp value={x.k} /></p>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">{x.v}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto max-w-7xl px-4 pb-5 text-center text-xs text-slate-400 sm:px-6">
          4857 sayılı İş Kanunu&apos;nun vardiya kuralları varsayılan olarak açıktır, işletmenize göre ayarlanabilir.
        </p>
      </section>

      {/* ─── Sektörler ────────────────────────────────────────── */}
      <section id="sektorler" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="mx-auto mb-10 max-w-2xl text-center">
            <p className="m-up mb-3 text-sm font-semibold text-ember-600">Sektörünüze göre</p>
            <h2 className="m-up font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl" style={{ "--d": "80ms" } as React.CSSProperties}>Her işletmenin vardiyası farklı.</h2>
            <p className="m-up mt-4 text-base text-slate-600 sm:text-lg">
              İşletme türünüzü seçtiğinizde vardiya saatleri, departmanlar ve kurallar hazır gelir. Sonra dilediğiniz gibi değiştirirsiniz.
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
            <h2 className="m-up font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl" style={{ "--d": "80ms" } as React.CSSProperties}>Pazar akşamı Excel başında oturmaya son.</h2>
          </Reveal>
          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} className="flex">
              <div className="m-up flex w-full flex-col rounded-3xl bg-cream p-7 ring-1 ring-slate-900/5 sm:p-8" style={{ "--d": `${i * 120}ms` } as React.CSSProperties}>
                <span className="mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-forest-700 font-serif text-lg font-semibold text-white">{s.n}</span>
                <h3 className="text-xl font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{s.text}</p>
                <div className="mt-8 flex-1">
                  {i === 0 && <DemandMini />}
                  {i === 1 && <ChecksMini />}
                  {i === 2 && (
                    <div className="space-y-2">
                      <Toast icon="bell" title="Yeni haftanın planı yayında" text="13 - 19 Ekim vardiyaların hazır." className="m-up w-full" style={{ "--d": "700ms" } as React.CSSProperties} />
                      <Toast icon="check" title="Selin izin istedi" text="Perşembe · yerine 3 uygun kişi var" className="m-up w-full" style={{ "--d": "1300ms" } as React.CSSProperties} />
                    </div>
                  )}
                </div>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Ekip tarafı ──────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-forest-900 py-20 text-white sm:py-28">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "56px 56px" }}
        />
        <div className="pointer-events-none absolute -left-40 top-0 h-[600px] w-[600px] rounded-full bg-forest-600/30 blur-[140px]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
          <div className="relative order-2 flex justify-center lg:order-1">
            <Reveal className="relative h-[480px] w-full max-w-[460px]">
              <div className="m-up absolute inset-y-0 left-0 right-20 overflow-hidden rounded-3xl">
                <SectorPhoto sector={{ image: "/marketing/team.webp", label: "Vardiyasını telefonundan kontrol eden ekip üyesi" }} className="h-full w-full" />
              </div>
              <div className="m-up absolute -bottom-2 right-0 z-10" style={{ "--d": "300ms" } as React.CSSProperties}>
                <div className="m-float">
                  <PhoneMock sector={KAFE} className="scale-[0.86] origin-bottom-right" />
                </div>
              </div>
              <div className="m-up absolute bottom-10 -left-4 z-20 hidden sm:block" style={{ "--d": "900ms" } as React.CSSProperties}>
                <Toast icon="bell" title="Açık vardiya: Cumartesi 15:00" text="Mert gelemiyor. Almak ister misin?" />
              </div>
            </Reveal>
          </div>
          <Reveal className="order-1 lg:order-2">
            <p className="m-up mb-3 text-sm font-semibold text-ember-300">Ekibiniz için</p>
            <h2 className="font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">WhatsApp grubunda vardiya kovalamak yok.</h2>
            <p className="mt-5 text-base leading-relaxed text-forest-100/75 sm:text-lg">
              Ekip üyeleri uygulama indirmeden, telefonun tarayıcısından girer. Bağlantıyı WhatsApp ile gönderirsiniz, Google hesabıyla tek dokunuşta bağlanırlar.
            </p>
            <ul className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {[
                { icon: Smartphone, t: "Vardiyasını görür", d: "Haftası, kiminle çalıştığı, sıradaki vardiyası." },
                { icon: CalendarClock, t: "Uygunluğunu girer", d: "Gelemeyeceği günler plana kendiliğinden yansır." },
                { icon: ArrowLeftRight, t: "Takas ve izin ister", d: "Kurala uymayan takas daha gönderilmeden uyarır." },
                { icon: Megaphone, t: "Açık vardiyayı alır", d: "Biri gelemezse uygun olanlara anında haber gider." },
                { icon: MessageSquare, t: "Ekiple yazışır", d: "Şube sohbeti ve sorumluya doğrudan mesaj." },
                { icon: ListChecks, t: "Devir notunu okur", d: "Önceki vardiyanın bıraktığı not girişte karşılar." },
              ].map(({ icon: Icon, t, d }, i) => (
                <li key={t} className="m-up flex gap-3.5" style={{ "--d": `${200 + i * 80}ms` } as React.CSSProperties}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-ember-300">
                    <Icon size={18} />
                  </span>
                  <span>
                    <span className="block font-semibold">{t}</span>
                    <span className="mt-0.5 block text-sm text-forest-100/65">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ─── Özellikler ───────────────────────────────────────── */}
      <section id="features" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <p className="mb-3 text-sm font-semibold text-ember-600">Platform</p>
            <h2 className="font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Planlamadan puantaja, tek yerde.</h2>
          </div>
          <Reveal className="grid gap-px overflow-hidden rounded-3xl bg-slate-200/70 ring-1 ring-slate-200/70 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }, i) => (
              <div key={title} className="m-up group bg-white p-7 transition-colors hover:bg-forest-50/40 sm:p-9" style={{ "--d": `${i * 80}ms` } as React.CSSProperties}>
                <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-forest-50 text-forest-700 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:rotate-[-4deg]">
                  <Icon size={21} />
                </span>
                <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{text}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ─── Kapanış ──────────────────────────────────────────── */}
      <section className="px-4 pb-20 sm:px-6 sm:pb-28">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-forest-800 px-6 py-16 text-center sm:px-12 sm:py-24">
          <SectorPhoto sector={SECTORS[2]} className="absolute inset-0 opacity-30" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-forest-900/40 to-forest-900/80" />
          <Reveal className="relative">
            <h2 className="m-up mx-auto max-w-3xl font-serif text-3xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
              Gelecek haftanın planını bugün, on dakikada hazırlayın.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base text-forest-100/80 sm:text-lg">
              Bir şube ve on kişiye kadar süresiz ücretsiz. Büyüdüğünüzde paketinizi yükseltirsiniz.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-semibold text-forest-900 transition-colors hover:bg-cream">
                Ücretsiz hesap açın <ArrowRight size={18} />
              </Link>
              <Link href="/pricing" className="inline-flex items-center justify-center rounded-2xl px-8 py-4 text-base font-semibold text-white ring-1 ring-white/30 transition-colors hover:bg-white/10">
                Paketleri görün
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <PublicFooter />
    </div>
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
        {["P", "S", "Ç", "P", "C", "C", "P"].map((d, i) => (
          <div key={i} className={i >= 5 ? "text-center font-medium text-ember-600" : "text-center font-medium text-slate-400"}>{d}</div>
        ))}
        {rows.map((r, ri) => (
          <Row key={r.l} label={r.l} values={r.v} offset={ri * 260} />
        ))}
      </div>
    </div>
  );
}

function Row({ label, values, offset }: { label: string; values: number[]; offset: number }) {
  return (
    <>
      <div className="flex items-center font-medium text-slate-600">{label}</div>
      {values.map((v, i) => (
        <div key={i} className="m-pop flex h-7 items-center justify-center rounded-md bg-slate-50 font-semibold text-slate-800 ring-1 ring-inset ring-slate-200" style={{ "--d": `${500 + i * 70 + offset}ms` } as React.CSSProperties}>{v}</div>
      ))}
    </>
  );
}

/** Adım 2 görseli: plan kontrolü */
function ChecksMini() {
  return (
    <div className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-slate-900/5" aria-hidden="true">
      {["Her vardiyada ihtiyaç kadar kişi", "11 saat dinlenme herkes için", "Haftalık sınırı aşan yok", "Hafta sonları dengeli dağıldı"].map((t, i) => (
        <div key={t} className="m-up flex items-center gap-2.5 text-[13px] text-slate-700" style={{ "--d": `${600 + i * 220}ms` } as React.CSSProperties}>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-forest-100 text-forest-700">
            <Check size={11} strokeWidth={3} />
          </span>
          {t}
        </div>
      ))}
    </div>
  );
}
