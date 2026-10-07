/**
 * Tanıtım: sektör fotoğrafları sürekli kayan bir şeritte (globals.css .m-marquee).
 * Liste iki kez çizilir, şerit yarısı kadar kayınca başa döner. Üstüne gelince durur, hareketi azaltta kaydırılabilir.
 */
const ITEMS = [
  { src: "/marketing/sector-kafe.webp", label: "Kafe" },
  { src: "/marketing/sector-restoran.webp", label: "Restoran" },
  { src: "/marketing/sector-otel.webp", label: "Otel" },
  { src: "/marketing/sector-perakende.webp", label: "Mağaza" },
  { src: "/marketing/sector-market.webp", label: "Market" },
  { src: "/marketing/sector-saglik.webp", label: "Hastane ve klinik" },
  { src: "/marketing/sector-uretim.webp", label: "Fabrika" },
  { src: "/marketing/sector-depo.webp", label: "Depo" },
];

export function SectorMarquee() {
  return (
    <div className="m-marquee-wrap relative overflow-hidden">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-cream to-transparent sm:w-32" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-cream to-transparent sm:w-32" />
      <ul className="m-marquee flex w-max gap-4 sm:gap-5">
        {[...ITEMS, ...ITEMS].map((it, i) => (
          <li key={i} aria-hidden={i >= ITEMS.length} className="relative h-[260px] w-[200px] shrink-0 overflow-hidden rounded-3xl bg-forest-900 sm:h-[340px] sm:w-[260px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.src} alt={i < ITEMS.length ? it.label : ""} loading="lazy" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-forest-900/85 via-transparent to-transparent" />
            <span className="absolute bottom-4 left-5 font-serif text-xl font-semibold text-white sm:text-2xl">{it.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
