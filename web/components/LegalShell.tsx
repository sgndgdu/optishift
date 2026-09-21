import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";

/** Yasal sayfaların (gizlilik, kullanım şartları) ortak kabuğu. */
export default function LegalShell({ title, updatedAt, children }: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream">
      <PublicHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2">{title}</h1>
        <p className="text-sm text-slate-400 mb-8">Son güncelleme: {updatedAt}</p>
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 space-y-6 text-[15px] leading-relaxed text-slate-600 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-slate-800">
          {children}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
