import Link from "next/link";
import { Logo } from "@/components/Logo";

/**
 * Herkese açık içerik sayfalarının (landing, pricing, kılavuz, gizlilik,
 * kullanım şartları) tek ortak alt bilgisi. PublicHeader'ın eşleniği,
 * aynı gerekçeyle: her sayfa kendi footer'ını yazınca link seti sayfadan
 * sayfaya sessizce farklılaşıyordu (kılavuz'un hiç footer'ı yoktu, yasal
 * sayfalarda sadece 3 link vardı, landing/pricing'de 6).
 */
export default function PublicFooter() {
  return (
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
            <Link href="/kilavuz" className="hover:text-primary transition-colors">Kılavuz</Link>
            <Link href="/gizlilik" className="hover:text-primary transition-colors">Gizlilik &amp; KVKK</Link>
            <Link href="/kullanim-sartlari" className="hover:text-primary transition-colors">Kullanım Şartları</Link>
          </div>
        </div>
        <div className="text-center text-slate-400 text-sm font-medium border-t border-slate-100 pt-8">
          <p>© 2026 OptiShift. Tüm hakları saklıdır.</p>
        </div>
      </div>
    </footer>
  );
}
