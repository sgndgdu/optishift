import { cn } from "@/lib/utils";
import type { Sector } from "@/components/marketing/sectors";

/**
 * Sektör fotoğrafı. Fotoğraf yoksa (sector.image boş) aynı yerde koyu degrade zemin çizilir,
 * böylece sayfa fotoğrafsız da düzgün görünür.
 */
export function SectorPhoto({ sector, className }: { sector: Pick<Sector, "image" | "label">; className?: string }) {
  return (
    <div className={cn("relative bg-forest-900", className)}>
      {sector.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sector.image} alt={sector.label} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(232,135,58,0.35), transparent 45%), radial-gradient(circle at 80% 30%, rgba(82,144,124,0.45), transparent 50%), linear-gradient(160deg, #14453D, #0A211E)",
          }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-forest-900/70 via-forest-900/10 to-transparent" />
    </div>
  );
}
