"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, CalendarCheck, TrendingUp, ArrowRight, ShieldCheck, Cpu, Star, PlayCircle, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 font-sans selection:bg-primary/20 selection:text-primary relative overflow-hidden">

      {/* Stripe-style Colorful Gradients */}
      <div className="absolute top-[-10%] right-[-5%] w-[800px] h-[800px] bg-gradient-to-br from-indigo-200 via-purple-200 to-pink-100 rounded-full blur-[120px] opacity-70 pointer-events-none transform -rotate-12" />
      <div className="absolute top-[30%] left-[-10%] w-[600px] h-[600px] bg-gradient-to-tr from-cyan-100 to-blue-200 rounded-full blur-[100px] opacity-60 pointer-events-none" />

      {/* Grid Pattern (Subtle) */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/60 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-primary to-indigo-600 rounded-[0.8rem] flex items-center justify-center shadow-[0_8px_16px_rgba(79,70,229,0.25)] group-hover:scale-105 transition-transform duration-300">
              <Zap size={18} className="text-white" />
            </div>
            <span className="text-lg sm:text-xl font-black tracking-tight text-slate-900">OptiShift</span>
          </div>

          <div className="hidden md:flex items-center gap-10">
            <Link href="#features" className="text-sm font-bold text-slate-600 hover:text-primary transition-colors">Platform</Link>
            <Link href="/pricing" className="text-sm font-bold text-slate-600 hover:text-primary transition-colors">Fiyatlandırma</Link>
            <Link href="#" className="text-sm font-bold text-slate-600 hover:text-primary transition-colors">Kaynaklar</Link>
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            <Link href="/login" className="text-sm font-bold text-slate-600 hover:text-primary transition-colors hidden sm:block">
              Giriş Yap
            </Link>
            <Link href="/register" className="hidden sm:block">
              <Button className="rounded-full px-5 sm:px-6 font-bold bg-slate-900 text-white hover:bg-slate-800 shadow-[0_4px_14px_0_rgb(0,0,0,0.1)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.15)] hover:-translate-y-0.5 transition-all duration-300 text-sm">
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
            <Link href="#" onClick={() => setMobileMenuOpen(false)} className="flex items-center h-11 px-3 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors">Kaynaklar</Link>
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

          <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full bg-white border border-slate-200/60 shadow-sm text-xs sm:text-sm text-primary mb-6 sm:mb-8 font-bold animate-in fade-in slide-in-from-bottom-4 duration-700">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse"></span>
            Yapay Zeka Destekli Planlama Motoru Yayında
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-[5rem] font-black tracking-tighter mb-6 sm:mb-8 leading-[1.1] animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 text-slate-900">
            Vardiya Planlamanın <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-indigo-500 to-purple-500">
              En Akıllı Yolu
            </span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed font-medium animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 px-2">
            İşletmenizi Excel sayfalarından kurtarın. OptiShift, personelinizi yasal sınırlara ve adalet skorlarına göre <strong className="text-slate-900 font-bold">saniyeler içinde</strong> optimize eder.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full max-w-sm sm:max-w-none animate-in fade-in slide-in-from-bottom-8 duration-700 delay-500">
            <Link href="/register" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto h-12 sm:h-14 px-6 sm:px-8 bg-primary hover:bg-indigo-600 text-white font-bold rounded-full transition-all flex items-center justify-center gap-2 text-base sm:text-lg shadow-[0_8px_20px_rgba(79,70,229,0.3)] hover:shadow-[0_12px_25px_rgba(79,70,229,0.4)] hover:-translate-y-1">
                Ücretsiz Dene <ArrowRight size={18} />
              </Button>
            </Link>
            <Link href="/pricing" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 sm:h-14 px-6 sm:px-8 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 font-bold rounded-full transition-all flex items-center justify-center text-base sm:text-lg shadow-sm hover:shadow-md hover:-translate-y-1 gap-2">
                <PlayCircle size={18} className="text-slate-400" />
                Nasıl Çalışır?
              </Button>
            </Link>
          </div>

          {/* Social Proof */}
          <div className="mt-14 sm:mt-20 pt-8 sm:pt-10 border-t border-slate-200/60 animate-in fade-in duration-1000 delay-700 w-full max-w-4xl">
            <p className="text-xs sm:text-sm font-bold text-slate-400 mb-6 sm:mb-8 uppercase tracking-widest">100+ LİDER İŞLETME TARAFINDAN TERCİH EDİLİYOR</p>
            <div className="flex flex-wrap justify-center items-center gap-6 sm:gap-10 md:gap-16 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
              <div className="text-base sm:text-xl font-black italic tracking-tighter text-slate-800">COFFEESHOP</div>
              <div className="text-base sm:text-xl font-black tracking-widest text-slate-800">BURGER.CO</div>
              <div className="text-base sm:text-xl font-bold flex items-center gap-1 text-slate-800"><Star size={18} className="fill-current"/> RESTAURANT</div>
              <div className="text-base sm:text-xl font-black font-serif text-slate-800">HOTEL SUITES</div>
            </div>
          </div>
        </div>
      </section>

      {/* Modern Bento Grid Features */}
      <section id="features" className="py-16 sm:py-24 relative z-10 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 sm:mb-16 md:mb-24">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight mb-4 sm:mb-6 text-slate-900">Güçlü. Akıllı. Basit.</h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-base sm:text-lg font-medium px-4">
              Sıradan bir çizelge uygulamasından çok daha fazlası. İşletmeniz için sıfır çakışma garantisi veren tam otonom bir İK asistanı.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {/* Büyük Kutu */}
            <div className="md:col-span-2 stripe-card p-7 sm:p-10 md:p-12 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-bl from-indigo-100/80 to-transparent rounded-full blur-[60px] group-hover:scale-110 transition-transform duration-700" />
              <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white border border-slate-100 shadow-[0_8px_16px_rgba(0,0,0,0.06)] text-primary rounded-2xl flex items-center justify-center mb-6 sm:mb-8 relative z-10">
                <CalendarCheck size={28} />
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mb-3 sm:mb-4 relative z-10">Tam Otonom Planlama</h3>
              <p className="text-slate-600 text-base sm:text-lg leading-relaxed max-w-md relative z-10 font-medium">
                Siz sadece kuralları belirleyin. OptiShift, tüm personelin müsaitliklerini ve şube ihtiyaçlarını saniyeler içinde mükemmel bir şekilde eşleştirsin. Çakışma sıfır, operasyon kusursuz.
              </p>
            </div>

            {/* Küçük Kutu 1 */}
            <div className="stripe-card p-7 sm:p-10 relative overflow-hidden group">
              <div className="absolute bottom-0 right-0 w-[200px] h-[200px] bg-gradient-to-tl from-emerald-100/80 to-transparent rounded-full blur-[50px] group-hover:scale-110 transition-transform duration-700" />
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white border border-slate-100 shadow-[0_8px_16px_rgba(0,0,0,0.06)] text-emerald-500 rounded-2xl flex items-center justify-center mb-5 sm:mb-6 relative z-10">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2 sm:mb-3 relative z-10">Adalet Motoru</h3>
              <p className="text-slate-600 leading-relaxed font-medium relative z-10 text-sm sm:text-base">
                Ağırlıklı Adalet Skoru ile hafta sonu ve akşam nöbetleri tüm personele tamamen adil bir şekilde dağıtılır.
              </p>
            </div>

            {/* Küçük Kutu 2 */}
            <div className="stripe-card p-7 sm:p-10 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-[200px] h-[200px] bg-gradient-to-br from-purple-100/80 to-transparent rounded-full blur-[50px] group-hover:scale-110 transition-transform duration-700" />
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white border border-slate-100 shadow-[0_8px_16px_rgba(0,0,0,0.06)] text-purple-500 rounded-2xl flex items-center justify-center mb-5 sm:mb-6 relative z-10">
                <TrendingUp size={24} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2 sm:mb-3 relative z-10">Hazır SaaS Modülü</h3>
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
                <Link href="/pricing" className="inline-flex items-center gap-2 mt-4 sm:mt-6 text-primary font-bold hover:text-indigo-600 transition-colors text-sm sm:text-base">
                  Kurumsal Planlar <ArrowRight size={16} />
                </Link>
              </div>
              <div className="w-full md:w-auto grid grid-cols-2 gap-3 sm:gap-4 shrink-0 relative z-10">
                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm text-center">
                  <div className="text-2xl sm:text-3xl font-black text-primary mb-1">10k+</div>
                  <div className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">Vardiya</div>
                </div>
                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm text-center">
                  <div className="text-2xl sm:text-3xl font-black text-emerald-500 mb-1">0</div>
                  <div className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">Çakışma</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-24 relative z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="bg-primary rounded-[2rem] sm:rounded-[3rem] p-8 sm:p-12 md:p-20 text-center relative overflow-hidden shadow-[0_20px_50px_rgba(79,70,229,0.3)]">
            <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-white/20 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] bg-indigo-900/40 rounded-full blur-[80px] pointer-events-none" />

            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 tracking-tight relative z-10 text-white">Vardiyaları Dert Etmeyi <br className="hidden sm:block"/> Bırakın.</h2>
            <p className="text-base sm:text-xl text-indigo-100 mb-8 sm:mb-10 max-w-2xl mx-auto font-medium relative z-10">
              OptiShift&apos;i bugün kullanmaya başlayın ve ayda onlarca saatlik planlama mesaisinden kurtulun. Üstelik kurulum sadece 2 dakika.
            </p>
            <div className="flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-4 relative z-10">
              <Link href="/register" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto h-14 sm:h-16 px-8 sm:px-10 bg-white text-slate-900 hover:bg-slate-50 font-black rounded-full transition-all text-base sm:text-lg hover:scale-105 shadow-[0_8px_20px_rgba(0,0,0,0.1)]">
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
