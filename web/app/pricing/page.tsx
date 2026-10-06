import Link from "next/link";
import { ArrowRight, Check, Building2 } from "lucide-react";
import { PLANS, SALES_EMAIL, TRIAL_DAYS } from "@/lib/plans";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";

// Ücretsiz paket yok (2026-10-06): fiyat sayfası Pro ve Kurumsal'ı gösterir
const PRO = PLANS.find((p) => p.id === "pro")!;
const ENT = PLANS.find((p) => p.id === "enterprise")!;
const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

export default function PricingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-cream font-sans text-slate-900">
      <PublicHeader active="pricing" />

      <section className="motion-auto relative overflow-hidden bg-forest-900 pb-48 pt-16 text-white sm:pt-24">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[620px] w-[620px] rounded-full bg-ember-500/25 blur-[140px]" />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h1 className="font-serif text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            <span className="m-up block">Sürpriz ücret yok.</span>
            <span className="m-up block italic text-ember-300" style={d(120)}>{TRIAL_DAYS} gün ücretsiz deneyin.</span>
          </h1>
          <p className="m-up mx-auto mt-6 max-w-xl text-base text-forest-100/80 sm:text-lg" style={d(220)}>
            İşletmenizin büyüklüğüne uygun paketi seçin.
          </p>
        </div>
      </section>

      <section className="relative z-10 -mt-36 pb-20 sm:pb-28">
        <div className="motion-auto mx-auto grid max-w-5xl gap-6 px-4 sm:px-6 md:grid-cols-[1.15fr_1fr]">
          {/* Pro */}
          <div className="m-up relative flex flex-col rounded-[2rem] bg-white p-8 shadow-[0_40px_90px_-40px_rgba(10,33,30,0.55)] ring-2 ring-forest-700 sm:p-10" style={d(300)}>
            <span className="absolute -top-3.5 left-8 rounded-full bg-ember-400 px-3.5 py-1 text-xs font-bold text-forest-900">Önerilen</span>
            <h2 className="text-2xl font-bold text-slate-900">{PRO.name}</h2>
            <p className="mt-1.5 text-slate-500">{PRO.desc}</p>
            <p className="mt-7 flex items-baseline gap-2">
              <span className="font-serif text-5xl font-semibold text-slate-900">{PRO.price}</span>
              <span className="font-semibold text-slate-500">{PRO.period}</span>
            </p>
            <Link href="/register" className="mt-7 inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-forest-700 text-lg font-bold text-white transition-colors hover:bg-forest-800">
              {TRIAL_DAYS} gün ücretsiz deneyin <ArrowRight size={18} />
            </Link>
            <ul className="mt-8 space-y-3.5">
              {PRO.features.map((f) => (
                <li key={f} className="flex items-center gap-3 text-slate-700">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest-50 text-forest-700"><Check size={13} strokeWidth={3} /></span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Kurumsal */}
          <div className="m-up flex flex-col rounded-[2rem] bg-white p-8 ring-1 ring-slate-900/5 sm:p-10" style={d(420)}>
            <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
              <Building2 size={22} className="text-ember-500" /> {ENT.name}
            </h2>
            <p className="mt-1.5 text-slate-500">{ENT.desc}</p>
            <p className="mt-7 font-serif text-4xl font-semibold text-slate-900">{ENT.price}</p>
            <a href={`mailto:${SALES_EMAIL}?subject=Kurumsal%20Paket%20Teklif%20Talebi`} className="mt-8 inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-slate-900 text-lg font-bold text-white transition-colors hover:bg-slate-800">
              Teklif iste <ArrowRight size={18} />
            </a>
            <ul className="mt-8 space-y-3.5">
              {ENT.features.map((f) => (
                <li key={f} className="flex items-center gap-3 text-slate-700">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ember-50 text-ember-700"><Check size={13} strokeWidth={3} /></span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
