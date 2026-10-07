import { Check } from "lucide-react";
import { SECTORS, SECTOR_ICONS } from "@/components/marketing/sectors";
import { AppWindow, ScheduleBoard, Toast } from "@/components/marketing/Mockups";
import { SectorPhoto } from "@/components/marketing/SectorPhoto";

/**
 * Giriş ve kayıt sayfalarının sağ tarafı (sadece geniş ekranda). İki sayfa aynı kabuğu kullanır,
 * sadece metin ve öne çıkan sektör değişir.
 */
export function AuthVisual({ variant }: { variant: "login" | "register" }) {
  const sector = variant === "login" ? SECTORS[0] : SECTORS[1];
  return (
    <aside className="motion-auto relative hidden overflow-hidden bg-forest-900 lg:flex lg:w-[48%] flex-col">
      <SectorPhoto sector={sector} className="m-zoom absolute inset-0 opacity-40" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-forest-900/60 via-forest-900/70 to-forest-900" />

      <div className="relative z-10 flex flex-1 flex-col justify-center px-12 py-14 xl:px-16">
        {variant === "login" ? (
          <>
            <h2 className="m-up max-w-[460px] font-serif text-[40px] font-semibold leading-[1.08] tracking-tight text-white">
              Planı yayınladığınızda<br />ekibinize bildirim gider.
            </h2>
          </>
        ) : (
          <>
            <h2 className="m-up max-w-[480px] font-serif text-[40px] font-semibold leading-[1.08] tracking-tight text-white">
              İlk planınızı<br />bugün yayınlayabilirsiniz.
            </h2>
            <ul className="m-up mt-6 space-y-3" style={{ "--d": "120ms" } as React.CSSProperties}>
              {["İşletme türünüzü seçin, vardiyalar buna göre kurulur", "Ekibinizi ekleyin, bağlantıyı WhatsApp ile gönderin", "Kaç kişi gerektiğini yazın, uygulama planı hazırlar"].map((t, i) => (
                <li key={t} className="flex items-center gap-3 text-[15px] text-forest-50/90">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[12px] font-semibold text-ember-300">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="m-up relative mt-10 max-w-[560px]" style={{ "--d": "200ms" } as React.CSSProperties}>
          <AppWindow title={`${sector.location} · Vardiya Planı`}>
            <ScheduleBoard sector={sector} compact animate />
          </AppWindow>
          <div className="m-up absolute -bottom-8 -right-6" style={{ "--d": "1900ms" } as React.CSSProperties}>
            <div className="m-float">
              {variant === "login" ? (
                <Toast icon="swap" title="Vardiya değiştirme onaylandı" text="Elif ile Mert cumartesi vardiyalarını değiştirdi." />
              ) : (
                <Toast icon="check" title="Plan yayınlandı" text="5 kişiye bildirim gitti." />
              )}
            </div>
          </div>
        </div>

        {variant === "register" ? (
          <div className="m-up mt-16 flex flex-wrap gap-2" style={{ "--d": "400ms" } as React.CSSProperties}>
            {SECTORS.map((s) => {
              const Icon = SECTOR_ICONS[s.id];
              return (
                <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-medium text-forest-50/90 ring-1 ring-white/10">
                  <Icon size={14} className="text-ember-300" /> {s.label}
                </span>
              );
            })}
          </div>
        ) : (
          <ul className="m-up mt-16 space-y-2.5" style={{ "--d": "400ms" } as React.CSSProperties}>
            {["Vardiyalar ekibe eşit dağıtılır", "İzin ve vardiya değiştirme istekleri tek ekranda toplanır", "İş Kanunu dinlenme kuralları uygulanır"].map((t) => (
              <li key={t} className="flex items-center gap-3 text-[15px] text-forest-50/90">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ember-500/20 text-ember-300">
                  <Check size={12} strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
