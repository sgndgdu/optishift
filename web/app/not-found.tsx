import Link from "next/link";
import PublicHeader from "@/components/PublicHeader";

// Olmayan adres: Next'in İngilizce varsayılan sayfası yerine
export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-5xl font-bold text-primary">404</p>
          <h1 className="mt-3 text-xl font-bold text-slate-900">Bu sayfa bulunamadı</h1>
          <p className="mt-2 text-sm text-slate-500">Adres yanlış yazılmış ya da sayfa kaldırılmış olabilir.</p>
          <Link href="/" className="mt-6 inline-flex px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90">
            Ana sayfaya dön
          </Link>
        </div>
      </main>
    </div>
  );
}
