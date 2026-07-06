"use client";

import Link from "next/link";
import { Zap, ArrowRight, CheckCircle2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 font-sans selection:bg-primary/20 selection:text-primary relative overflow-hidden">
      
      {/* Stripe-style Colorful Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-br from-indigo-200 via-purple-200 to-pink-100 rounded-full blur-[120px] opacity-70 pointer-events-none" />
      <div className="absolute top-[20%] -left-[10%] w-[500px] h-[500px] bg-gradient-to-tr from-cyan-100 to-blue-200 rounded-full blur-[100px] opacity-60 pointer-events-none" />
      
      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/60 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-primary to-indigo-600 rounded-[0.8rem] flex items-center justify-center shadow-[0_8px_16px_rgba(79,70,229,0.25)] border border-white/50 group-hover:scale-105 transition-transform duration-300">
                <Zap size={18} className="text-white" />
              </div>
              <span className="text-lg sm:text-xl font-black tracking-tight text-slate-900">OptiShift</span>
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-10">
            <Link href="/#features" className="text-sm font-bold text-slate-600 hover:text-primary transition-colors">Platform</Link>
            <Link href="/pricing" className="text-sm font-black text-primary transition-colors">Fiyatlandırma</Link>
            <Link href="#" className="text-sm font-bold text-slate-600 hover:text-primary transition-colors">Kaynaklar</Link>
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            <Link href="/login" className="text-sm font-bold text-slate-600 hover:text-primary transition-colors hidden sm:block">
              Giriş Yap
            </Link>
            <Link href="/register">
              <Button className="rounded-full px-4 sm:px-6 font-bold bg-slate-900 text-white hover:bg-slate-800 shadow-[0_4px_14px_0_rgb(0,0,0,0.1)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,0.15)] text-sm">
                Ücretsiz Başla
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-12 sm:pt-40 sm:pb-20 md:pt-48 md:pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 text-center">
          <h1 className="text-3xl sm:text-5xl md:text-7xl font-black tracking-tighter mb-4 sm:mb-6 leading-[1.1] animate-in fade-in slide-in-from-bottom-4 duration-700 text-slate-900">
            Sürpriz Ücret Yok. <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-indigo-500 to-purple-500">
              Sadece Verimlilik.
            </span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed font-medium animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 px-2">
            İşletmenizin büyüklüğüne uygun planı seçin. 14 gün ücretsiz deneyin, kredi kartı gerektirmez.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20 sm:pb-32 relative z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            
            {/* Starter Plan */}
            <div className="stripe-card p-8 sm:p-10 flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
              <div className="mb-8">
                <h3 className="text-2xl font-black text-slate-900 mb-2">Başlangıç</h3>
                <p className="text-slate-500 font-medium h-12">Tek şubeli kafeler ve butik restoranlar için ideal.</p>
              </div>
              <div className="mb-8 flex items-baseline gap-2">
                <span className="text-5xl font-black text-slate-900">₺499</span>
                <span className="text-slate-500 font-bold">/ ay</span>
              </div>
              <Link href="/register" className="w-full mb-8">
                <Button variant="outline" className="w-full h-14 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 rounded-[1rem] font-bold text-lg transition-all shadow-sm">
                  Hemen Başla
                </Button>
              </Link>
              <div className="space-y-4 flex-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Neler Dahil?</p>
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-primary" />
                  <span className="text-slate-700 font-medium">1 Şube</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-primary" />
                  <span className="text-slate-700 font-medium">15 Personele kadar</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-primary" />
                  <span className="text-slate-700 font-medium">Temel Yapay Zeka Planlaması</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-primary" />
                  <span className="text-slate-700 font-medium">Mobil Portal (Personel)</span>
                </div>
              </div>
            </div>

            {/* Pro Plan (Highlighted) */}
            <div className="bg-white border-2 border-primary rounded-[2rem] p-8 sm:p-10 flex flex-col relative shadow-[0_20px_50px_rgba(79,70,229,0.15)] animate-in fade-in slide-in-from-bottom-8 duration-700 delay-500 z-10 group md:scale-105">
              <div className="absolute inset-0 overflow-hidden rounded-[2rem] pointer-events-none">
                <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-gradient-to-bl from-indigo-100/60 to-transparent rounded-full blur-[40px] group-hover:scale-110 transition-transform duration-700" />
              </div>
              
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primary to-indigo-500 text-white text-xs font-black uppercase tracking-widest px-5 py-2 rounded-full shadow-[0_4px_10px_rgba(79,70,229,0.3)]">
                EN ÇOK TERCİH EDİLEN
              </div>
              <div className="mb-8 relative z-10">
                <h3 className="text-2xl font-black text-slate-900 mb-2">Profesyonel</h3>
                <p className="text-slate-600 font-medium h-12">Büyüyen işletmeler ve zincir mağazalar için.</p>
              </div>
              <div className="mb-8 flex items-baseline gap-2 relative z-10">
                <span className="text-5xl font-black text-slate-900">₺1,299</span>
                <span className="text-slate-500 font-bold">/ ay</span>
              </div>
              <Link href="/register" className="w-full mb-8 relative z-10">
                <Button className="w-full h-14 bg-primary hover:bg-indigo-600 text-white rounded-[1rem] font-bold text-lg transition-all shadow-[0_8px_20px_rgba(79,70,229,0.25)] hover:shadow-[0_12px_25px_rgba(79,70,229,0.35)] hover:-translate-y-0.5">
                  Ücretsiz Dene
                </Button>
              </Link>
              <div className="space-y-4 flex-1 relative z-10">
                <p className="text-xs font-bold text-primary uppercase tracking-widest mb-4">Neler Dahil?</p>
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-primary" />
                  <span className="text-slate-900 font-bold">10 Şubeye kadar</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-primary" />
                  <span className="text-slate-900 font-bold">Sınırsız Personel</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-primary" />
                  <span className="text-slate-700 font-semibold">Gelişmiş Adalet Puanı</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-primary" />
                  <span className="text-slate-700 font-semibold">SMS & E-Posta Bildirimleri</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-primary" />
                  <span className="text-slate-700 font-semibold">API Erişimi</span>
                </div>
              </div>
            </div>

            {/* Enterprise Plan */}
            <div className="stripe-card p-8 sm:p-10 flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-700 delay-700">
              <div className="mb-8">
                <h3 className="text-2xl font-black text-slate-900 mb-2 flex items-center gap-2">
                  <Building2 size={24} className="text-purple-500"/> Kurumsal
                </h3>
                <p className="text-slate-500 font-medium h-12">10&apos;dan fazla şubesi olan kurumsal markalar için.</p>
              </div>
              <div className="mb-8">
                <span className="text-4xl font-black text-slate-900">Özel Fiyat</span>
              </div>
              <div className="w-full mb-8">
                <Button className="w-full h-14 bg-slate-900 text-white hover:bg-slate-800 rounded-[1rem] font-bold text-lg transition-all flex items-center gap-2 shadow-[0_4px_14px_0_rgb(0,0,0,0.1)] hover:-translate-y-0.5" onClick={() => alert("Satış ekibimize yönlendiriliyorsunuz...")}>
                  Teklif Al <ArrowRight size={18} />
                </Button>
              </div>
              <div className="space-y-4 flex-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">HER ŞEYE EK OLARAK</p>
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-purple-500" />
                  <span className="text-slate-700 font-medium">10+ Şube (Sınırsız)</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-purple-500" />
                  <span className="text-slate-700 font-medium">Bölge Yöneticisi Rolleri</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-purple-500" />
                  <span className="text-slate-700 font-medium">Özel SSO Entegrasyonu</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-purple-500" />
                  <span className="text-slate-700 font-medium">7/24 Özel Destek Uzmanı</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white pt-12 sm:pt-16 pb-8 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-10 sm:mb-12">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Zap size={16} className="text-white" />
              </div>
              <span className="text-xl font-black text-slate-900 tracking-tight">OptiShift</span>
            </div>
            <div className="flex flex-wrap justify-center gap-6 sm:gap-8 text-sm font-bold text-slate-500">
              <Link href="/pricing" className="hover:text-primary transition-colors">Fiyatlandırma</Link>
              <Link href="/login" className="hover:text-primary transition-colors">Giriş Yap</Link>
              <Link href="/register" className="hover:text-primary transition-colors">Kayıt Ol</Link>
            </div>
          </div>
          <div className="text-center text-slate-400 text-sm font-medium border-t border-slate-100 pt-8">
            <p>© 2026 OptiShift. Tüm hakları saklıdır.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
