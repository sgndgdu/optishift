"use client";

/**
 * "Haftayı Oluştur" sihirbazı: 1) Kaç kişi gerekli? 2) Kontrol 3) Oluştur.
 * Otomatik planlamanın kendisi değişmedi; sayfa zaten var olan /api/generate
 * çağrısını (runGenerate) onGenerate olarak verir. Sihirbaz sadece kararları
 * sıraya koyar ve sorunları oluşturmadan ÖNCE gösterir.
 */

import { useState, type ReactNode } from "react";
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
  weekLabel, demandTable, demandEmpty, capacityWarnings, personnelCount,
  availabilityEnabled, noAvailCount, onRemindAvailability,
  existingCellCount, pinnedCount, keepPinned, onKeepPinnedChange, generating, error, generatedCount, seniorViolationCount, excludedCount,
  onGenerate, onPublish, onClose,
}: {
  weekLabel: string;
  demandTable: ReactNode;
  demandEmpty: boolean;
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
  generating: boolean;
  error: string | null;
  generatedCount: number;
  seniorViolationCount: number;
  excludedCount: number;
  onGenerate: () => Promise<void>;
  onPublish: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [ran, setRan] = useState(false);
  const [reminded, setReminded] = useState(false);
  // Sihirbaz açıldığındaki vardiya sayısı: oluşturma sonrası değişeceği için ilk değer saklanır
  const [initialCells] = useState(existingCellCount);
  const [initialPinned] = useState(pinnedCount);

  const run = async () => {
    await onGenerate();
    setRan(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start md:items-center justify-center p-3 md:p-6 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Haftayı Oluştur">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl my-auto">
        <div className="flex items-center justify-between px-5 md:px-8 pt-5 md:pt-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Haftayı Oluştur · {weekLabel}</p>
          <button onClick={onClose} disabled={generating} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30" aria-label="Kapat">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 md:px-8 pb-6 md:pb-8 pt-4">
          <WizardProgress steps={STEPS} current={step} className="mb-6" />

          {step === 0 && (
            <WizardStep icon={<Users size={24} />} color="bg-forest-100 text-forest-700"
              title="Kaç kişi gerekli?"
              sub="Her gün, her vardiya için kaç kişiye ihtiyacınız olduğunu girin. Tablo haftadan haftaya aynı kalır; öneriyi tek tıkla uygulayıp sadece değişeni düzeltebilirsiniz.">
              <div className="rounded-2xl border border-slate-200 overflow-hidden">{demandTable}</div>
              {demandEmpty && (
                <p className="text-xs text-slate-500">Tabloyu boş bırakırsanız ekip, uygunluğa göre mümkün olduğunca adil dağıtılır.</p>
              )}
            </WizardStep>
          )}

          {step === 1 && (
            <WizardStep icon={<ClipboardCheck size={24} />} color="bg-sky-100 text-sky-700"
              title="Oluşturmadan önce kontrol"
              sub="Sorun varsa şimdi görün, sonradan değil.">
              <div className="space-y-2.5">
                <CheckRow tone="ok">{personnelCount} personel planlanacak.</CheckRow>

                {capacityWarnings.length > 0 ? (
                  <CheckRow tone="danger">
                    <p className="font-bold text-red-800">Bazı günlerde yeterli kişi yok</p>
                    <ul className="text-xs text-red-700 mt-1 space-y-0.5 list-disc list-inside">
                      {capacityWarnings.slice(0, 6).map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                    <p className="text-xs text-red-700 mt-1">Bu haliyle plan oluşturulamaz. Geri dönüp o günlerin sayılarını azaltın.</p>
                  </CheckRow>
                ) : !demandEmpty ? (
                  <CheckRow tone="ok">Personel ihtiyacı mevcut ekiple karşılanabilir görünüyor.</CheckRow>
                ) : (
                  <CheckRow tone="info">Personel ihtiyacı girilmedi, ekip mümkün olduğunca adil dağıtılacak.</CheckRow>
                )}

                {availabilityEnabled && (noAvailCount > 0 ? (
                  <CheckRow tone="warn" action={
                    <button onClick={() => { onRemindAvailability(); setReminded(true); }} disabled={reminded}
                      className="shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-800 hover:bg-amber-100 disabled:opacity-60">
                      {reminded ? <><Check size={12} /> Gönderildi</> : <><Bell size={12} /> Hatırlat</>}
                    </button>
                  }>
                    <span className="font-bold">{noAvailCount} kişi uygunluk girmedi.</span> Plan engellenmez, bu kişiler tamamen uygun sayılır.
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
                    <span className="font-bold">Bu haftada {initialCells} vardiya var.</span> Oluşturunca silinip yeniden yazılacak.
                  </CheckRow>
                ))}
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
                    <span className="font-bold">{generatedCount} vardiya yazıldı.</span> Plan taslak olarak kaydedildi, personel siz yayınlayana kadar göremez.
                  </CheckRow>
                  {seniorViolationCount > 0 && (
                    <CheckRow tone="warn">{seniorViolationCount} vardiyada kıdemli personel bulunamadı. Ayrıntılar planın üstündeki uyarılarda.</CheckRow>
                  )}
                  {excludedCount > 0 && (
                    <CheckRow tone="warn">{excludedCount} kişi geçersiz belge nedeniyle plana alınmadı.</CheckRow>
                  )}
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button onClick={onClose} className="sm:flex-1 py-3 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50">Taslak Olarak Bırak, Gözden Geçir</button>
                    <button onClick={() => { onClose(); onPublish(); }} className="sm:flex-1 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700">Şimdi Yayınla</button>
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
