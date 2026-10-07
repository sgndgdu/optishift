import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureCatalog } from "@/components/marketing/FeatureShowcase";

export const metadata: Metadata = { title: "Bütün özellikler" };

/** Ana sayfadan taşınan bütün özellik listesi (2026-10-07 sadeleştirme). */
export default function FeaturesPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-cream font-sans text-slate-900">
      <PublicHeader />
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Bütün özellikler</h1>
            <p className="mt-4 text-base text-slate-600 sm:text-lg">Uygulamada bulunan bütün özellikler, konularına göre gruplanmış olarak aşağıda listelenmiştir.</p>
          </div>
          <Reveal threshold={0.05}><FeatureCatalog /></Reveal>
          <div className="mt-12 text-center">
            <Link href="/register" className="inline-flex items-center gap-2 rounded-2xl bg-forest-700 px-7 py-4 text-base font-bold text-white hover:bg-forest-800">
              14 gün ücretsiz deneyin <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
