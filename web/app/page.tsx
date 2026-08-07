"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, ArrowRight, ShieldCheck, ChevronDown, Menu, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream text-slate-900 font-sans selection:bg-primary/20 selection:text-primary relative overflow-hidden">

      {/* Sıcak, tek gradient — jenerik çoklu-blob desenden kaçınıldı */}
      <div className="absolute top-[-15%] right-[-10%] w-[900px] h-[900px] bg-gradient-to-br from-forest-100 via-ember-100/70 to-transparent rounded-full blur-[130px] opacity-80 pointer-events-none" />

      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/60 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer">
            <Logo size="md" className="sm:w-10 sm:h-10 group-hover:scale-105 transition-transform duration-300" />
            <span className="text-lg sm:text-xl font-black tracking-tight text-slate-900">OptiShift</span>
          </div>

          <div className="hidden md:flex items-center gap-10">
            <Link href="#features" className="text-sm font-bold text-slate-600 hover:text-primary transition-colors">Platform</Link>
            <Link href="/pricing" className="text-sm font-bold text-slate-600 hover:text-primary transition-colors">Fiyatlandırma</Link>
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            <Link href="/login" className="text-sm font-bold text-slate-600 hover:text-primary transition-colors hidden sm:block">
              Giriş Yap
            </Link>
            <Link href="/register" className="hidden sm:block">
              <Button className="rounded-xl px-5 sm:px-6 font-bold bg-slate-900 text-white hover:bg-slate-800 shadow-[0_4px_14px_0_rgb(0,0,0,0.1)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.15)] hover:-translate-y-0.5 transition-all duration-300 text-sm">
                Hemen Başla
              </Button>
            </Link>
            <button
              className="md:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Menü"
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white/95 backdrop-blur-xl border-t border-slate-100 px-4 py-4 space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
            <Link href="#features" onClick={() => setMobileMenuOpen(false)} className="flex items-center h-11 px-3 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors">Platform</Link>
            <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} className="flex items-center h-11 px-3 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors">Fiyatlandırma</Link>
            <div className="pt-2 flex flex-col gap-2">
              <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="flex items-center justify-center h-11 px-4 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">Giriş Yap</Link>
              <Link href="/register" onClick={() => setMobileMenuOpen(false)} className="flex items-center justify-center h-11 px-4 rounded-xl bg-slate-900 text-sm font-bold text-white hover:bg-slate-800 transition-colors">Hemen Başla</Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-16 sm:pt-40 sm:pb-24 md:pt-48 md:pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 text-center flex flex-col items-center">

          <h1 className="font-serif text-4xl sm:text-5xl md:text-7xl lg:text-[5rem] font-semibold tracking-tight mb-6 sm:mb-8 leading-[1.05] animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 text-slate-900">
            Vardiya Planlamasını <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-forest-500 to-ember-500">
              Excel&apos;den Kurtarın
            </span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed font-medium animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 px-2">
            Personelinizi <strong className="text-slate-900 font-bold">yasal dinlenme sürelerine ve adalet puanına</strong> göre otomatik planlayın. Hafta sonu ve gece nöbetleri herkese eşit dağılsın.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full max-w-sm sm:max-w-none animate-in fade-in slide-in-from-bottom-8 duration-700 delay-500">
            <Link href="/register" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto h-12 sm:h-14 px-6 sm:px-8 bg-primary hover:bg-forest-600 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 text-base sm:text-lg shadow-[0_8px_20px_rgba(20,69,61,0.3)] hover:shadow-[0_12px_25px_rgba(20,69,61,0.4)] hover:-translate-y-1">
                Ücretsiz Dene <ArrowRight size={18} />
              </Button>
            </Link>
            <Link href="#features" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 sm:h-14 px-6 sm:px-8 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 font-bold rounded-2xl transition-all flex items-center justify-center text-base sm:text-lg shadow-sm hover:shadow-md hover:-translate-y-1 gap-2">
                <ChevronDown size={18} className="text-slate-400" />
                Nasıl Çalışır?
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Modern Bento Grid Features */}
      <section id="features" className="py-16 sm:py-24 relative z-10 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 sm:mb-16 md:mb-24">
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight mb-4 sm:mb-6 text-slate-900">İşinizi Kolaylaştıran Özellikler</h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-base sm:text-lg font-medium px-4">
              Kurallarınızı bir kez tanımlayın. OptiShift, kapasite ihtiyacınızı, personel müsaitliğini ve adalet puanını birlikte hesaba katarak planı sizin yerinize hazırlar.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {/* Büyük Kutu */}
            <div className="md:col-span-2 stripe-card p-7 sm:p-10 md:p-12 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-bl from-forest-100/80 to-transparent rounded-full blur-[60px] group-hover:scale-110 transition-transform duration-700" />
              <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white border border-slate-100 shadow-[0_8px_16px_rgba(0,0,0,0.06)] text-primary rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl rounded-br-md flex items-center justify-center mb-6 sm:mb-8 relative z-10">
                <CalendarCheck size={28} />
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mb-3 sm:mb-4 relative z-10">Otomatik Planlama</h3>
              <p className="text-slate-600 text-base sm:text-lg leading-relaxed max-w-md relative z-10 font-medium">
                Kapasite matrisinde her gün için kaç kişi gerektiğini belirleyin. Motor; personelin müsaitliğini, yasal dinlenme sürelerini ve adalet puanını aynı anda gözeterek planı oluşturur.
              </p>
            </div>

            {/* Küçük Kutu 1 */}
            <div className="stripe-card p-7 sm:p-10 relative overflow-hidden group">
              <div className="absolute bottom-0 right-0 w-[200px] h-[200px] bg-gradient-to-tl from-emerald-100/80 to-transparent rounded-full blur-[50px] group-hover:scale-110 transition-transform duration-700" />
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mb-5 sm:mb-6 relative z-10">
                <ShieldCheck size={22} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2 sm:mb-3 relative z-10">Adil Dağıtım</h3>
              <p className="text-slate-600 leading-relaxed font-medium relative z-10 text-sm sm:text-base">
                Ağırlıklı Adalet Skoru ile hafta sonu ve akşam nöbetleri tüm personele tamamen adil bir şekilde dağıtılır.
              </p>
            </div>

            {/* Küçük Kutu 2 */}
            <div className="stripe-card p-7 sm:p-10 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-[200px] h-[200px] bg-gradient-to-br from-ember-100/80 to-transparent rounded-full blur-[50px] group-hover:scale-110 transition-transform duration-700" />
              <div className="text-ember-600 mb-5 sm:mb-6 relative z-10">
                <Smartphone size={34} strokeWidth={1.75} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2 sm:mb-3 relative z-10">Anında Kurulum</h3>
              <p className="text-slate-600 leading-relaxed font-medium relative z-10 text-sm sm:text-base">
                Dakikalar içinde kayıt olun, şubelerinizi ekleyin. Personelinize anında mobil uygulamadan bildirim gitsin.
              </p>
            </div>

            {/* Yatay Kutu */}
            <div className="md:col-span-2 stripe-card p-7 sm:p-10 bg-gradient-to-r from-white to-slate-50 flex flex-col md:flex-row items-start md:items-center gap-6 sm:gap-8 relative overflow-hidden">
              <div className="flex-1 relative z-10">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 mb-2 sm:mb-3">Çoklu Şube Yönetimi</h3>
                <p className="text-slate-600 font-medium leading-relaxed text-sm sm:text-base">
                  İster 1 şube, ister 100 şube. Tüm lokasyonlarınızı tek bir panelden yönetin, personellerinizi şubeler arası kaydırın. 10+ şubesi olan markalar için kurumsal çözümleri inceleyin.
                </p>
                <Link href="/pricing" className="inline-flex items-center gap-2 mt-4 sm:mt-6 text-primary font-bold hover:text-forest-600 transition-colors text-sm sm:text-base">
                  Kurumsal Planlar <ArrowRight size={16} />
                </Link>
              </div>
              <div className="w-full md:w-auto grid grid-cols-2 gap-3 sm:gap-4 shrink-0 relative z-10">
                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm text-center">
                  <div className="text-2xl sm:text-3xl font-black text-primary mb-1">Sınırsız</div>
                  <div className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">Şube</div>
                </div>
                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm text-center">
                  <div className="text-2xl sm:text-3xl font-black text-emerald-500 mb-1">0</div>
                  <div className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">Çakışma Garantisi</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-24 relative z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="bg-primary rounded-[2rem] sm:rounded-[3rem] p-8 sm:p-12 md:p-20 text-center relative overflow-hidden shadow-[0_20px_50px_rgba(20,69,61,0.3)]">
            <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-white/20 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] bg-forest-900/40 rounded-full blur-[80px] pointer-events-none" />

            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-semibold mb-4 sm:mb-6 tracking-tight relative z-10 text-white">Vardiyaları Dert Etmeyi <br className="hidden sm:block"/> Bırakın.</h2>
            <p className="text-base sm:text-xl text-forest-100 mb-8 sm:mb-10 max-w-2xl mx-auto font-medium relative z-10">
              OptiShift&apos;i bugün deneyin, vardiya planlamayı bir daha elle yapmak zorunda kalmayın.
            </p>
            <div className="flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-4 relative z-10">
              <Link href="/register" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto h-14 sm:h-16 px-8 sm:px-10 bg-white text-slate-900 hover:bg-slate-50 font-black rounded-2xl transition-all text-base sm:text-lg hover:scale-105 shadow-[0_8px_20px_rgba(0,0,0,0.1)]">
                  Hemen Kayıt Ol <ArrowRight size={20} className="ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white pt-12 sm:pt-16 pb-8 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-10 sm:mb-12">
            <div className="flex items-center gap-2">
              <Logo size="sm" />
              <span className="text-xl font-black text-slate-900 tracking-tight">OptiShift</span>
            </div>
            <div className="flex flex-wrap justify-center gap-6 sm:gap-8 text-sm font-bold text-slate-500">
              <Link href="/pricing" className="hover:text-primary transition-colors">Fiyatlandırma</Link>
              <Link href="/login" className="hover:text-primary transition-colors">Giriş Yap</Link>
              <Link href="/register" className="hover:text-primary transition-colors">Kayıt Ol</Link>
              <Link href="/gizlilik" className="hover:text-primary transition-colors">Gizlilik &amp; KVKK</Link>
              <Link href="/kullanim-sartlari" className="hover:text-primary transition-colors">Kullanım Şartları</Link>
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
