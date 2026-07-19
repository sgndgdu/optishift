import Link from "next/link";
import { Zap } from "lucide-react";

/** Yasal sayfaların (gizlilik, kullanım şartları) ortak kabuğu. */
export default function LegalShell({ title, updatedAt, children }: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <span className="text-lg font-black text-slate-900 tracking-tight">OptiShift</span>
          </Link>
          <Link href="/login" className="text-sm font-bold text-slate-600 hover:text-primary transition-colors">
            Giriş Yap
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2">{title}</h1>
        <p className="text-sm text-slate-400 mb-8">Son güncelleme: {updatedAt}</p>
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 space-y-6 text-[15px] leading-relaxed text-slate-600 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-slate-800">
          {children}
        </div>
      </main>

      <footer className="max-w-3xl mx-auto px-4 sm:px-6 pb-10 text-center text-sm text-slate-400">
        <div className="flex justify-center gap-6 mb-3 font-semibold text-slate-500">
          <Link href="/gizlilik" className="hover:text-primary transition-colors">Gizlilik &amp; KVKK</Link>
          <Link href="/kullanim-sartlari" className="hover:text-primary transition-colors">Kullanım Şartları</Link>
        </div>
        <p>© 2026 OptiShift. Tüm hakları saklıdır.</p>
      </footer>
    </div>
  );
}
