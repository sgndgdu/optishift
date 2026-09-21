"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

/**
 * Herkese açık içerik sayfalarının (landing, pricing, kılavuz, gizlilik,
 * kullanım şartları) tek ortak üst navigasyonu. Önceden her sayfa kendi
 * header'ını ayrı yazıyordu (farklı arka plan, farklı link seti, farklı
 * buton metni), aynı üründe 4 farklı üst şerit gibi duruyordu.
 *
 * Giriş/kayıt akışı sayfaları (login, register, forgot-password, setup)
 * bilinçli olarak bunu kullanmıyor, o sayfalar odaklanmış form akışı için
 * minimal/farklı bir kalıba sahip (sektör standardı, dikkat dağıtıcı nav yok).
 */
export default function PublicHeader({ active }: { active?: "pricing" }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/60 backdrop-blur-xl border-b border-slate-200/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <Logo size="md" className="sm:w-10 sm:h-10 group-hover:scale-105 transition-transform duration-300" />
          <span className="text-lg sm:text-xl font-black tracking-tight text-slate-900">OptiShift</span>
        </Link>

        <div className="hidden md:flex items-center gap-10">
          <Link href="/#features" className="text-sm font-bold text-slate-600 hover:text-primary transition-colors">Platform</Link>
          <Link href="/pricing" className={active === "pricing" ? "text-sm font-black text-primary" : "text-sm font-bold text-slate-600 hover:text-primary transition-colors"}>Fiyatlandırma</Link>
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

      {mobileMenuOpen && (
        <div className="md:hidden bg-white/95 backdrop-blur-xl border-t border-slate-100 px-4 py-4 space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
          <Link href="/#features" onClick={() => setMobileMenuOpen(false)} className="flex items-center h-11 px-3 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors">Platform</Link>
          <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} className="flex items-center h-11 px-3 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors">Fiyatlandırma</Link>
          <div className="pt-2 flex flex-col gap-2">
            <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="flex items-center justify-center h-11 px-4 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">Giriş Yap</Link>
            <Link href="/register" onClick={() => setMobileMenuOpen(false)} className="flex items-center justify-center h-11 px-4 rounded-xl bg-slate-900 text-sm font-bold text-white hover:bg-slate-800 transition-colors">Hemen Başla</Link>
          </div>
        </div>
      )}
    </header>
  );
}
