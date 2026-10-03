"use client";

import { PLANS, SALES_EMAIL } from "@/lib/plans";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";

const [FREE, PRO, ENT] = PLANS;

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-cream text-slate-900 font-sans selection:bg-primary/20 selection:text-primary relative overflow-hidden">

      {/* Sıcak, tek gradient — jenerik çoklu-blob desenden kaçınıldı */}
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gradient-to-b from-forest-100 via-ember-100/60 to-transparent rounded-full blur-[130px] opacity-80 pointer-events-none" />

      <PublicHeader active="pricing" />

      {/* Hero Section */}
      <section className="relative pt-12 pb-12 sm:pt-16 sm:pb-20 md:pt-20 md:pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 text-center">
          <h1 className="font-serif text-3xl sm:text-5xl md:text-7xl font-semibold tracking-tight mb-4 sm:mb-6 leading-[1.05] animate-in fade-in slide-in-from-bottom-4 duration-700 text-slate-900">
            Sürpriz Ücret Yok. <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-forest-500 to-ember-500">
              Sadece Verimlilik.
            </span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed font-medium animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 px-2">
            İşletmenizin büyüklüğüne uygun planı seçin. Kredi kartı gerekmez, küçük işletmeler için ücretsiz plan süresiz.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20 sm:pb-32 relative z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            
            {/* Free Plan */}
            <div className="stripe-card p-8 sm:p-10 flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
              <div className="mb-8">
                <h3 className="text-2xl font-black text-slate-900 mb-2">{FREE.name}</h3>
                <p className="text-slate-500 font-medium h-12">{FREE.desc}</p>
              </div>
              <div className="mb-8 flex items-baseline gap-2">
                <span className="text-5xl font-black text-slate-900">{FREE.price}</span>
                <span className="text-slate-500 font-bold">/ ay</span>
              </div>
              <Link href="/register" className="w-full mb-8">
                <Button variant="outline" className="w-full h-14 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 rounded-[1rem] font-bold text-lg transition-all shadow-sm">
                  Ücretsiz Başla
                </Button>
              </Link>
              <div className="space-y-4 flex-1">
                <p className="text-xs font-bold text-slate-400 mb-4">Neler Dahil?</p>
                {FREE.features.map(f => (
                  <div key={f} className="flex items-center gap-3">
                    <CheckCircle2 size={20} className="text-primary" />
                    <span className="text-slate-700 font-medium">{f}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pro Plan (Highlighted) */}
            <div className="bg-white border-2 border-primary rounded-[2rem] p-8 sm:p-10 flex flex-col relative shadow-[0_20px_50px_rgba(20,69,61,0.15)] animate-in fade-in slide-in-from-bottom-8 duration-700 delay-500 z-10 group md:scale-105">
              <div className="absolute inset-0 overflow-hidden rounded-[2rem] pointer-events-none">
                <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-gradient-to-bl from-forest-100/60 to-transparent rounded-full blur-[40px] group-hover:scale-110 transition-transform duration-700" />
              </div>
              
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primary to-forest-500 text-white text-xs font-black px-5 py-2 rounded-full shadow-[0_4px_10px_rgba(20,69,61,0.3)]">
                ÖNERİLEN
              </div>
              <div className="mb-8 relative z-10">
                <h3 className="text-2xl font-black text-slate-900 mb-2">{PRO.name}</h3>
                <p className="text-slate-600 font-medium h-12">{PRO.desc}</p>
              </div>
              <div className="mb-8 flex items-baseline gap-2 relative z-10">
                <span className="text-5xl font-black text-slate-900">{PRO.price}</span>
                <span className="text-slate-500 font-bold">/ ay</span>
              </div>
              <Link href="/register" className="w-full mb-8 relative z-10">
                <Button className="w-full h-14 bg-primary hover:bg-forest-600 text-white rounded-[1rem] font-bold text-lg transition-all shadow-[0_8px_20px_rgba(20,69,61,0.25)] hover:shadow-[0_12px_25px_rgba(20,69,61,0.35)] hover:-translate-y-0.5">
                  Ücretsiz Başla
                </Button>
              </Link>
              <div className="space-y-4 flex-1 relative z-10">
                <p className="text-xs font-bold text-primary mb-4">Neler Dahil?</p>
                {PRO.features.map(f => (
                  <div key={f} className="flex items-center gap-3">
                    <CheckCircle2 size={20} className="text-primary" />
                    <span className="text-slate-700 font-semibold">{f}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Enterprise Plan */}
            <div className="stripe-card p-8 sm:p-10 flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-700 delay-700">
              <div className="mb-8">
                <h3 className="text-2xl font-black text-slate-900 mb-2 flex items-center gap-2">
                  <Building2 size={24} className="text-ember-500"/> {ENT.name}
                </h3>
                <p className="text-slate-500 font-medium h-12">{ENT.desc}</p>
              </div>
              <div className="mb-8">
                <span className="text-4xl font-black text-slate-900">{ENT.price}</span>
              </div>
              <a href={`mailto:${SALES_EMAIL}?subject=Kurumsal%20Paket%20Teklif%20Talebi`} className="w-full mb-8 block">
                <Button className="w-full h-14 bg-slate-900 text-white hover:bg-slate-800 rounded-[1rem] font-bold text-lg transition-all flex items-center gap-2 shadow-[0_4px_14px_0_rgb(0,0,0,0.1)] hover:-translate-y-0.5">
                  Teklif Al <ArrowRight size={18} />
                </Button>
              </a>
              <div className="space-y-4 flex-1">
                <p className="text-xs font-bold text-slate-400 mb-4">Neler Dahil?</p>
                {ENT.features.map(f => (
                  <div key={f} className="flex items-center gap-3">
                    <CheckCircle2 size={20} className="text-ember-500" />
                    <span className="text-slate-700 font-medium">{f}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
