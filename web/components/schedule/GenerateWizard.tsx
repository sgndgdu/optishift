"use client";

/**
 * "Planı Oluştur" sihirbazı: 1) Kaç kişi gerekli? 2) Kontrol 3) Oluştur.
 * Otomatik planlamanın kendisi değişmedi; sayfa zaten var olan /api/generate
 * çağrısını (runGenerate) onGenerate olarak verir. Sihirbaz sadece kararları
 * sıraya koyar ve sorunları oluşturmadan ÖNCE gösterir.
 */

import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, Bell, CalendarClock, Check, ClipboardCheck, Info, Sparkles, Users, X } from "lucide-react";
import { WizardProgress, WizardStep, WizardNav } from "@/components/ui/Wizard";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Kaç kişi?", icon: Users },
  { label: "Kontrol",   icon: ClipboardCheck },
  { label: "Oluştur",   icon: Sparkles },
];

function CheckRow({ tone, children, action }: { tone: "ok" | "warn" | "danger" | "info"; children: ReactNode; action?: ReactNode }) {
  const style = {
    ok:     { box: "bg-emerald-50 border-emerald-100", icon: <Check size={15} className="text-emerald-600" /> },
    warn:   { box: "bg-amber-50 border-amber-100",     icon: <AlertTriangle size={15} className="text-amber-600" /> },
    danger: { box: "bg-red-50 border-red-100",         icon: <AlertCircle size={15} className="text-red-600" /> },
    info:   { box: "bg-slate-50 border-slate-100",     icon: <Info size={15} className="text-slate-500" /> },
  }[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3", style.box)}>
      <span className="mt-0.5 shrink-0">{style.icon}</span>
      <div className="flex-1 min-w-0 text-sm text-slate-700">{children}</div>
      {action}
    </div>
  );
}

export default function GenerateWizard({
  weekLabel, demandTable, demandEmpty, demandAutoFilled, demandGaps = [], onFillGaps, pastDayCount = 0, capacityWarnings, personnelCount,
  availabilityEnabled, noAvailCount, onRemindAvailability,
  existingCellCount, pinnedCount, keepPinned, onKeepPinnedChange, minimizeChanges, onMinimizeChangesChange, generating, error, generatedCount, excludedCount,
  onGenerate, onClose,
}: {
  weekLabel: string;
  demandTable: ReactNode;
  demandEmpty: boolean;
  /** Tablo boştu, öneri kendiliğinden dolduruldu */
  demandAutoFilled?: boolean;
  /** Yarım dolu tablo: sayı girilmemiş açık günler ("Mutfak: Sal, Çar") */
  demandGaps?: string[];
  onFillGaps?: () => void;
  /** Haftanın bugünden önceki gün sayısı: bu günler planlanmaz, mevcut vardiyaları korunur */
  pastDayCount?: number;
  capacityWarnings: string[];
  personnelCount: number;
  availabilityEnabled: boolean;
  noAvailCount: number;
  onRemindAvailability: () => void;
  existingCellCount: number;
  /** Elle düzeltilip korunan vardiya sayısı */
  pinnedCount: number;
  keepPinned: boolean;
  onKeepPinnedChange: (v: boolean) => void;
  /** En az değişiklik: mevcut planı olabildiğince koru */
  minimizeChanges: boolean;
  onMinimizeChangesChange: (v: boolean) => void;
  /** Oluşturma sonrası değişen hücre sayısı (mevcut plan varsa) */
  generating: boolean;
  error: string | null;
  generatedCount: number;
  excludedCount: number;
  onGenerate: () => Promise<void>;
  /** "Planı yayınlama" yetkisi yoksa (lib/userAccess) boş geçilir; düğme gizlenir. */
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [ran, setRan] = useState(false);
  const [reminded, setReminded] = useState(false);
  // Sihirbaz açıldığındaki vardiya sayısı: oluşturma sonrası değişeceği için ilk değer saklanır
  const [initialCells] = useState(existingCellCount);
  const [initialPinned] = useState(pinnedCount);

  // Esc ile kapanır (oluşturma sürerken kapanmaz)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !generating) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [generating, onClose]);

  const run = async () => {
    await onGenerate();
    setRan(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start md:items-center justify-center p-3 md:p-6 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Planı Oluştur">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-auto">
        <div className="flex items-center justify-between px-5 md:px-8 pt-5 md:pt-6">
          <p className="text-xs font-semibold text-slate-400">Planı Oluştur · {weekLabel}</p>
          <button onClick={onClose} disabled={generating} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30" aria-label="Kapat">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 md:px-8 pb-6 md:pb-8 pt-4">
          <WizardProgress steps={STEPS} current={step} className="mb-6" />

          {step === 0 && (
            <WizardStep icon={<Users size={24} />} color="bg-forest-100 text-forest-700"
              title="Kaç kişi gerekli?"
              sub="Her gün, her vardiya için kaç kişiye ihtiyacınız olduğunu girin. Bir günü yazıp “Boş günleri doldur” ile tüm haftaya kopyalayabilirsiniz. Tablo sonraki haftalarda da aynı kalır.">
              <div className="rounded-2xl border border-slate-200 overflow-hidden">{demandTable}</div>
              {demandAutoFilled && !demandEmpty && (
                <p className="text-xs text-forest-700 font-medium">Tablo boştu, öneriyle dolduruldu. Sayıları işletmenize göre değiştirebilirsiniz.</p>
              )}
              {demandEmpty && (
                <p className="text-xs text-amber-700 font-medium">Tablo boş kalırsa ekip, haftalık çalışma sınırına kadar vardiyaya yazılır (herkes 5-6 gün). Kaç kişi gerektiğini girmeniz önerilir.</p>
              )}
            </WizardStep>
          )}

          {step === 1 && (
            <WizardStep icon={<ClipboardCheck size={24} />} color="bg-sky-100 text-sky-700"
              title="Oluşturmadan önce kontrol"
              sub="Plan oluşturulmadan önce sorunlar burada gösterilir.">
              <div className="space-y-2.5">
                <CheckRow tone="ok">{personnelCount} kişi planlanacak.</CheckRow>
                {pastDayCount > 0 && pastDayCount < 7 && (
                  <CheckRow tone="info">Haftanın {pastDayCount} günü geçti. Sadece bugün ve sonrası planlanır; geçmiş günlerdeki vardiyalar olduğu gibi kalır.</CheckRow>
                )}

                {capacityWarnings.length > 0 ? (
                  <CheckRow tone="danger">
                    <p className="font-bold text-red-800">Bazı günlerde yeterli kişi yok</p>
                    <ul className="text-xs text-red-700 mt-1 space-y-0.5 list-disc list-inside">
                      {capacityWarnings.slice(0, 6).map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                    <p className="text-xs text-red-700 mt-1">Bu haliyle plan oluşturulamaz. Geri dönüp o günlerin sayılarını azaltın.</p>
                  </CheckRow>
                ) : demandGaps.length > 0 ? (
                  <CheckRow tone="danger" action={onFillGaps && (
                    <button onClick={onFillGaps} className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-800 hover:bg-red-100">Boş günleri doldur</button>
                  )}>
                    <p className="font-bold text-red-800">Bazı günlere kaç kişi gerektiği girilmedi</p>
                    <p className="text-xs text-red-700 mt-1">{demandGaps.join(" · ")}. Bu günlere herkes haftalık sınırına kadar yazılır, açılış ya da kapanış boş kalabilir.</p>
                  </CheckRow>
                ) : !demandEmpty ? (
                  <CheckRow tone="ok">İhtiyaç mevcut ekiple karşılanabilir görünüyor.</CheckRow>
                ) : (
                  <CheckRow tone="warn">Kaç kişi gerektiği girilmedi: herkes haftalık çalışma sınırına kadar vardiyaya yazılacak.</CheckRow>
                )}

                {availabilityEnabled && (noAvailCount > 0 ? (
                  <CheckRow tone="warn" action={
                    <button onClick={() => { onRemindAvailability(); setReminded(true); }} disabled={reminded}
                      className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-800 hover:bg-amber-100 disabled:opacity-60">
                      {reminded ? <><Check size={12} /> Gönderildi</> : <><Bell size={12} /> Hatırlat</>}
                    </button>
                  }>
                    <span className="font-bold">{noAvailCount} kişi uygunluk girmedi.</span> Bu durum planı engellemez. Uygunluk girmeyen kişiler bütün günlerde uygun sayılır.
                  </CheckRow>
                ) : (
                  <CheckRow tone="ok">Herkes bu hafta için uygunluğunu girdi.</CheckRow>
                ))}

                {initialCells > 0 && (initialPinned > 0 ? (
                  <CheckRow tone={keepPinned ? "ok" : "warn"}>
                    <span className="font-bold">Elle düzenlediğiniz {initialPinned} vardiya {keepPinned ? "korunacak" : "da silinecek"}.</span>{" "}
                    {keepPinned ? `Kalan ${initialCells - initialPinned} vardiya yeniden oluşturulur.` : "Hafta baştan oluşturulur."}
                    <label className="flex items-center gap-2 mt-1.5 text-xs font-semibold cursor-pointer">
                      <input type="checkbox" checked={keepPinned} onChange={e => onKeepPinnedChange(e.target.checked)} className="accent-forest-600" />
                      Elle düzenlediklerimi koru
                    </label>
                  </CheckRow>
                ) : (
                  <CheckRow tone="warn">
                    <span className="font-bold">Bu haftada {initialCells} vardiya var.</span> {minimizeChanges ? "Olabildiğince korunacak; sadece gereken yerler değişecek." : "Oluşturunca silinip yeniden yazılacak."}
                  </CheckRow>
                ))}
                {initialCells > 0 && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer px-1">
                    <input type="checkbox" checked={minimizeChanges} onChange={e => onMinimizeChangesChange(e.target.checked)} className="accent-forest-600" />
                    Mevcut planı olabildiğince koru (izin, istifa gibi değişikliklerde sadece gerekeni değiştir)
                  </label>
                )}
              </div>
            </WizardStep>
          )}

          {step === 2 && (
            <WizardStep icon={<Sparkles size={24} />} color="bg-ember-100 text-ember-600"
              title={ran && !generating && !error ? "Plan hazır" : "Planı oluşturun"}
              sub="Uygunluk, yasal dinlenme süreleri ve kimin son haftalarda daha çok çalıştığı birlikte dikkate alınır.">
              {generating ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <div className="w-12 h-12 rounded-2xl bg-forest-100 flex items-center justify-center">
                    <CalendarClock size={22} className="text-forest-600 animate-pulse" />
                  </div>
                  <p className="text-base font-bold text-slate-800">Planınız hazırlanıyor</p>
                  <p className="text-sm text-slate-400">5 ile 15 saniye sürebilir…</p>
                </div>
              ) : !ran ? (
                <button onClick={run}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-primary text-white text-base font-bold rounded-2xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
                  <Sparkles size={18} /> Planı Oluştur
                </button>
              ) : error ? (
                <div className="space-y-3">
                  <CheckRow tone="danger"><p className="font-bold text-red-800">Plan oluşturulamadı</p><p className="text-xs text-red-700 mt-0.5">{error}</p></CheckRow>
                  <div className="flex gap-3">
                    <button onClick={() => { setRan(false); setStep(0); }} className="px-5 py-3 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50">Sayıları Düzelt</button>
                    <button onClick={run} className="flex-1 py-3 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90">Tekrar Dene</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <CheckRow tone="ok">
                    <span className="font-bold">{generatedCount} vardiya yazıldı.</span> Plan taslak olarak kaydedildi. Ekibiniz plan yayınlanana kadar göremez. Önce planı inceleyin, uygunsa yayınlayın.
                  </CheckRow>
                  {excludedCount > 0 && (
                    <CheckRow tone="warn">{excludedCount} kişi geçersiz belge nedeniyle plana alınmadı.</CheckRow>
                  )}
                  {/* Yayınla burada yok: sorumlu önce planı görsün (kullanıcı kararı 2026-10-07) */}
                  <div className="pt-2">
                    <button onClick={onClose} className="w-full py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700">Plana bak</button>
                  </div>
                </div>
              )}
            </WizardStep>
          )}

          {step < 2 && (
            <WizardNav current={step} total={STEPS.length}
              onBack={() => setStep(s => s - 1)}
              onNext={() => setStep(s => s + 1)}
              nextLabel="İleri" />
          )}
          {step === 2 && !ran && !generating && (
            <button onClick={() => setStep(1)} className="mt-4 text-sm font-semibold text-slate-500 hover:text-slate-800">← Geri</button>
          )}
        </div>
      </div>
    </div>
  );
}
