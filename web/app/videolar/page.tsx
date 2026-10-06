import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import { VideoGallery } from "@/components/marketing/VideoGallery";
import { BRAND } from "@/lib/brand";

export const metadata = {
  title: `Özellik videoları · ${BRAND.name}`,
  description: "Uygulamanın gerçek ekran kayıtları: plan oluşturma, onaylar, yedek bulma, ekip telefonu ve daha fazlası.",
};

const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

export default function VideosPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-cream font-sans text-slate-900">
      <PublicHeader active="videos" />

      <section className="motion-auto relative overflow-hidden bg-forest-900 pb-16 pt-14 text-white sm:pb-20 sm:pt-20">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full bg-ember-500/25 blur-[140px]" />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <p className="m-up mb-3 text-sm font-semibold text-ember-300">Gerçek ekranlar</p>
          <h1 className="m-up font-serif text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl" style={d(80)}>
            Her özelliği kısa bir videoda görün.
          </h1>
          <p className="m-up mx-auto mt-5 max-w-xl text-base text-forest-100/80 sm:text-lg" style={d(180)}>
            Görüntüler uygulamanın kendisinden, örnek bir kafenin bir haftası. Büyütmek için videoya dokunun.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <VideoGallery />
        <div className="rounded-[2rem] bg-forest-900 px-6 py-12 text-center text-white sm:py-16">
          <h2 className="font-serif text-3xl font-semibold sm:text-4xl">Kendi ekibinizle deneyin.</h2>
          <p className="mx-auto mt-3 max-w-md text-forest-100/80">14 gün boyunca bütün özellikler açık.</p>
          <Link href="/register" className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-ember-400 px-7 py-4 font-bold text-forest-900 hover:bg-ember-300">
            14 gün ücretsiz deneyin <ArrowRight size={18} />
          </Link>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
