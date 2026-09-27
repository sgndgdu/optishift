"use client";

/**
 * "Yeni Şube Aç" sihirbazı (amir paneli): 1) Şube bilgileri 2) Vardiya saatleri 3) Müdür.
 * Sadece mevcut API'leri sırayla çağırır:
 *   POST /api/locations            → şubeyi oluşturur (plan sınırı burada kontrol edilir)
 *   PATCH /api/locations?id=       → vardiyalar, çalışma saatleri, varsayılan kurallar, konum
 *   POST /api/users (role=manager) → isteğe bağlı müdür hesabı + davet bağlantısı
 */

import { useState } from "react";
import { Building2, CalendarClock, Check, Copy, MapPin, Plus, Trash2, UserPlus, X } from "lucide-react";
import { WizardProgress, WizardStep, WizardNav } from "@/components/ui/Wizard";
import { SECTOR_PRESETS, getSectorPreset } from "@/lib/presets";
import type { ShiftDefinition } from "@/lib/types";
import { cn } from "@/lib/utils";
import { geocodePlace } from "@/lib/geo";

const STEPS = [
  { label: "Şube",       icon: Building2 },
  { label: "Vardiyalar", icon: CalendarClock },
  { label: "Müdür",      icon: UserPlus },
];

type ExistingBranch = { id: string; name: string; shift_definitions?: unknown };

type Created = {
  name: string;
  manager?: { name: string; username: string; tempPassword: string; inviteUrl: string };
  warnings: string[];
};

function parseDefs(raw: unknown): ShiftDefinition[] {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

const inputCls = "w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-primary transition-colors";

export default function NewBranchWizard({ existing, planLimited, onClose, onCreated }: {
  existing: ExistingBranch[];
  /** Ücretsiz planda zaten bir şube varsa true: sunucu yeni şubeyi reddedecek */
  planLimited: boolean;
  onClose: () => void;
  /** Şube açıldığında (sihirbaz sonuç ekranındayken) çağrılır */
  onCreated?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  // 1. Şube
  const [name, setName] = useState("");
  const [city, setCity] = useState("");

  // 2. Vardiyalar: hazır şablon ya da mevcut bir şubeden kopya
  const copySources = existing.filter(b => parseDefs(b.shift_definitions).length > 0);
  const [source, setSource] = useState<string>(copySources.length ? `copy:${copySources[0].id}` : "preset:cafe");
  const [shifts, setShifts] = useState<ShiftDefinition[]>(() =>
    copySources.length ? parseDefs(copySources[0].shift_definitions).map(d => ({ ...d })) : getSectorPreset("cafe").shiftDefs.map(d => ({ ...d })));

  const pickSource = (value: string) => {
    setSource(value);
    const [kind, key] = value.split(":");
    const defs = kind === "copy"
      ? parseDefs(existing.find(b => b.id === key)?.shift_definitions)
      : getSectorPreset(key).shiftDefs;
    setShifts(defs.map(d => ({ ...d })));
  };

  // 3. Müdür
  const [addManager, setAddManager] = useState(true);
  const [managerName, setManagerName] = useState("");
  const [managerPhone, setManagerPhone] = useState("");

  const next = () => {
    setError("");
    if (step === 0 && !name.trim()) { setError("Şube adı girin."); return; }
    if (step === 1 && !shifts.some(s => s.name.trim())) { setError("En az bir vardiya tanımlayın."); return; }
    if (step === 2) { finish(); return; }
    setStep(s => s + 1);
  };

  const finish = async () => {
    if (addManager && !managerName.trim()) { setError("Müdürün adını girin ya da “Şimdilik atla” seçin."); return; }
    setSaving(true);
    setError("");
    const warnings: string[] = [];
    try {
      // 1) Şube
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) { setError(data.error ?? "Şube oluşturulamadı."); setSaving(false); return; }
      const locationId: string = data.id;

      // 2) Konum (isteğe bağlı, bulunamazsa şube yine açılır)
      let coords: { latitude: number; longitude: number } | null = null;
      if (city.trim()) {
        try {
          const hit = await geocodePlace(city.trim());
          if (hit) coords = { latitude: hit.latitude, longitude: hit.longitude };
          else warnings.push(`“${city.trim()}” bulunamadı, konumu sonra Ayarlar'dan girebilirsiniz.`);
        } catch { warnings.push("Konum aranamadı, sonra Ayarlar'dan girebilirsiniz."); }
      }

      // 3) Vardiyalar + çalışma saatleri + varsayılan kurallar (ilk kurulumla aynı varsayılanlar)
      const hours: Record<string, unknown> = {};
      for (let i = 0; i < 7; i++) hours[i] = { isOpen: true, open: "09:00", close: "22:00" };
      const patch = await fetch(`/api/locations?id=${locationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shift_definitions: shifts.filter(s => s.name.trim()),
          operating_hours: hours,
          rules: { max_weekly_hours: 45, min_rest_hours: 11 },
          ...(coords ?? {}),
        }),
      });
      if (!patch.ok) warnings.push("Vardiya saatleri kaydedilemedi, şubenin Ayarlar sayfasından ekleyin.");

      // 4) Müdür (isteğe bağlı)
      let manager: Created["manager"];
      if (addManager) {
        const u = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: managerName.trim(), phone: managerPhone.trim() || undefined, role: "manager", location_id: locationId }),
        });
        const ud = await u.json().catch(() => ({}));
        if (u.ok && ud.credentials) {
          manager = {
            name: managerName.trim(),
            username: ud.credentials.username,
            tempPassword: ud.credentials.temp_password,
            inviteUrl: `${window.location.origin}/setup?token=${ud.inviteToken}`,
          };
        } else {
          warnings.push(`Müdür hesabı oluşturulamadı${ud.error ? `: ${ud.error}` : ""}. Personel sayfasından ekleyebilirsiniz.`);
        }
      }

      setCreated({ name: name.trim(), manager, warnings });
      onCreated?.();
    } catch {
      setError("Sunucuya ulaşılamadı, tekrar deneyin.");
    }
    setSaving(false);
  };

  const copyCredentials = () => {
    if (!created?.manager) return;
    const m = created.manager;
    navigator.clipboard.writeText(`OptiShift giriş bilgileriniz\nKullanıcı adı: ${m.username}\nGeçici şifre: ${m.tempPassword}\nİlk giriş bağlantısı: ${m.inviteUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start md:items-center justify-center p-3 md:p-6 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Yeni Şube Aç">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-auto">
        <div className="flex items-center justify-between px-5 md:px-8 pt-5 md:pt-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Yeni Şube Aç</p>
          <button onClick={onClose} disabled={saving} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30" aria-label="Kapat">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 md:px-8 pb-6 md:pb-8 pt-4">
          {created ? (
            <div className="space-y-5">
              <div className="text-center py-2">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                  <Check size={30} className="text-emerald-600" strokeWidth={3} />
                </div>
                <h2 className="text-2xl font-black text-slate-900 mt-4">{created.name} açıldı</h2>
                <p className="text-sm text-slate-500 mt-1">Vardiya saatleri hazır. Sırada personel eklemek ve ilk haftayı planlamak var.</p>
              </div>

              {created.manager && (
                <div className="rounded-2xl border border-slate-200 p-4 space-y-2">
                  <p className="text-sm font-bold text-slate-800">{created.manager.name} için giriş bilgileri</p>
                  <div className="text-sm text-slate-600 space-y-1 font-mono bg-slate-50 rounded-xl px-4 py-3">
                    <p>Kullanıcı adı: <strong>{created.manager.username}</strong></p>
                    <p>Geçici şifre: <strong>{created.manager.tempPassword}</strong></p>
                    <p className="break-all text-xs">{created.manager.inviteUrl}</p>
                  </div>
                  <p className="text-xs text-slate-500">Bu bilgileri müdüre iletin. İlk girişte kendi şifresini belirleyecek. Şifre bir daha gösterilmez.</p>
                  <button onClick={copyCredentials}
                    className={cn("flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors", copied ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>
                    {copied ? <><Check size={13} /> Kopyalandı</> : <><Copy size={13} /> Bilgileri Kopyala</>}
                  </button>
                </div>
              )}

              {created.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">{w}</p>
              ))}

              <button onClick={onClose} className="w-full py-3 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90">Tamam</button>
            </div>
          ) : (
            <>
              <WizardProgress steps={STEPS} current={step} className="mb-6" />

              {step === 0 && (
                <WizardStep icon={<Building2 size={24} />} color="bg-ember-100 text-ember-600"
                  title="Şube bilgileri" sub="Şubeye bir ad verin. Konum, vardiya takviminde hava durumunu göstermek için kullanılır.">
                  {planLimited && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
                      Ücretsiz planda tek şube açılabilir. Yeni şube için planınızı yükseltmeniz gerekecek.
                    </p>
                  )}
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1.5 block">Şube adı</label>
                    <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="örn. Kadıköy Şube" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1.5 block">Şehir / ilçe <span className="font-normal text-slate-400">(isteğe bağlı)</span></label>
                    <div className="relative">
                      <MapPin size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input value={city} onChange={e => setCity(e.target.value)} placeholder="İstanbul, Kadıköy" className={cn(inputCls, "pl-10")} />
                    </div>
                  </div>
                </WizardStep>
              )}

              {step === 1 && (
                <WizardStep icon={<CalendarClock size={24} />} color="bg-forest-100 text-forest-700"
                  title="Vardiya saatleri" sub="Hazır bir şablon seçin ya da mevcut bir şubenin saatlerini kopyalayın. Saatleri burada düzeltebilirsiniz.">
                  <select value={source} onChange={e => pickSource(e.target.value)} className={inputCls}>
                    {copySources.length > 0 && (
                      <optgroup label="Mevcut şubeden kopyala">
                        {copySources.map(b => <option key={b.id} value={`copy:${b.id}`}>{b.name} ile aynı</option>)}
                      </optgroup>
                    )}
                    <optgroup label="Hazır şablonlar">
                      {SECTOR_PRESETS.map(p => <option key={p.key} value={`preset:${p.key}`}>{p.label}</option>)}
                    </optgroup>
                  </select>
                  <div className="space-y-2">
                    {shifts.map((s, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2 bg-slate-50 rounded-xl p-2.5">
                        <input value={s.name} onChange={e => setShifts(p => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                          placeholder="Vardiya adı" className="flex-1 min-w-[120px] text-sm font-bold border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-primary" />
                        <input type="time" value={s.start} onChange={e => setShifts(p => p.map((x, j) => j === i ? { ...x, start: e.target.value } : x))}
                          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-primary" />
                        <span className="text-slate-400 text-xs font-bold">→</span>
                        <input type="time" value={s.end} onChange={e => setShifts(p => p.map((x, j) => j === i ? { ...x, end: e.target.value } : x))}
                          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-primary" />
                        <button onClick={() => setShifts(p => p.filter((_, j) => j !== i))} aria-label="Vardiyayı sil"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {shifts.length < 6 && (
                      <button onClick={() => setShifts(p => [...p, { id: `s${Date.now()}`, name: "", start: "09:00", end: "17:00", base_points: 5 }])}
                        className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:border-primary hover:text-primary">
                        <Plus size={15} /> Vardiya Ekle
                      </button>
                    )}
                  </div>
                </WizardStep>
              )}

              {step === 2 && (
                <WizardStep icon={<UserPlus size={24} />} color="bg-sky-100 text-sky-700"
                  title="Şube müdürü" sub="Müdür hesabını şimdi açarsanız giriş bilgileri bir sonraki ekranda çıkar.">
                  <div className="grid grid-cols-2 gap-2">
                    {[{ v: true, l: "Müdür hesabı aç" }, { v: false, l: "Şimdilik atla" }].map(o => (
                      <button key={String(o.v)} onClick={() => setAddManager(o.v)}
                        className={cn("px-4 py-3 rounded-xl border-2 text-sm font-bold transition-colors",
                          addManager === o.v ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                  {addManager ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-bold text-slate-600 mb-1.5 block">Ad soyad</label>
                        <input value={managerName} onChange={e => setManagerName(e.target.value)} placeholder="örn. Ayşe Yılmaz" className={inputCls} />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-600 mb-1.5 block">Telefon <span className="font-normal text-slate-400">(isteğe bağlı)</span></label>
                        <input value={managerPhone} onChange={e => setManagerPhone(e.target.value)} placeholder="05xx xxx xx xx" inputMode="tel" className={inputCls} />
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Müdürü sonra Personel sayfasından ekleyebilirsiniz.</p>
                  )}
                </WizardStep>
              )}

              {error && <div className="mt-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 font-medium">{error}</div>}

              <WizardNav current={step} total={STEPS.length} busy={saving}
                onBack={() => { setError(""); setStep(s => s - 1); }} onNext={next}
                nextLabel="İleri" finishLabel="Şubeyi Aç" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
