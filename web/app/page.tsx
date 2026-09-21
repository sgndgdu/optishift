"use client";

import Link from "next/link";
import { CalendarCheck, ArrowRight, ShieldCheck, ChevronDown, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-cream text-slate-900 font-sans selection:bg-primary/20 selection:text-primary relative overflow-hidden">

      {/* Sıcak, tek gradient — jenerik çoklu-blob desenden kaçınıldı */}
      <div className="absolute top-[-15%] right-[-10%] w-[900px] h-[900px] bg-gradient-to-br from-forest-100 via-ember-100/70 to-transparent rounded-full blur-[130px] opacity-80 pointer-events-none" />

      <PublicHeader />

      {/* Hero Section */}
      <section className="relative pt-12 pb-16 sm:pt-16 sm:pb-24 md:pt-20 md:pb-32">
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

      <PublicFooter />
    </div>
  );
}
