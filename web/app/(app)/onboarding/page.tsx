"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { getPlan, limitMessage } from "@/lib/plans";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Store, CalendarClock, ArrowRight, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { buildIndustryDefaults, getIndustry, getVariant } from "@/lib/templates";
import IndustryPicker from "@/components/IndustryPicker";
import type { ShiftDefinition } from "@/lib/types";
import { WizardProgress, WizardStep, WizardNav } from "@/components/ui/Wizard";
import { openBranchPanel } from "@/lib/sessionRouting";
import { AuthLogo } from "@/components/AuthLogo";

// ─── Sabitler ────────────────────────────────────────────────────────────────
// Vardiya/kural preset'lerinin tek kaynağı lib/presets.ts — burada sadece görsel eşleme var.


const STEPS = [
  { label: "İşletmeniz", icon: Store },
  { label: "Vardiyalar", icon: CalendarClock },
];

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function OnboardingWizard() {
  const router = useRouter();
  const [user, setUser]       = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [step, setStep]       = useState(0);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [singleLocationId, setSingleLocationId] = useState<string | null>(null);
  const [readyCount, setReadyCount] = useState(0);
  // Ücretsiz plan tek şube: sihirbaz ikinci şubeyi baştan kabul etmez (sonda hata vermek yerine)
  const [freePlan, setFreePlan] = useState(false);

  // Adım 0 — Sektör + şubeler
  // İşletme türü + çalışma düzeni (lib/templates): vardiyalar, kurallar ve özellikler buna göre gelir
  const [industry, setIndustry] = useState("hospitality");
  const [variant, setVariant] = useState("cafe");
  const [branches, setBranches] = useState<string[]>([""]);

  // Adım 1 — Vardiya tanımları (sektör preset'inden dolu gelir, düzenlenebilir)
  const [shifts, setShifts] = useState<ShiftDefinition[]>(() => getVariant(getIndustry("hospitality")!, "cafe").shifts.map(d => ({ ...d })));

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_supervisor_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed && (parsed.role === "admin" || parsed.role === "supervisor")) {
        setUser(parsed);
      }
    } catch {}
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !user) router.push("/login");
  }, [mounted, user, router]);

  // Tek şubeli işletme için ad yazdırma: ilk şube işletmenin adıyla dolu gelir, isteyen değiştirir
  useEffect(() => {
    if (!user) return;
    fetch("/api/organizations")
      .then(r => (r.ok ? r.json() : null))
      .then(org => {
        if (typeof org?.name === "string" && org.name.trim()) setBranches(b => (b.length === 1 && !b[0].trim() ? [org.name.trim()] : b));
        setFreePlan(getPlan(org?.plan).maxLocations === 1);
      })
      .catch(() => {});
  }, [user]);

  // İşletme türü / çalışma düzeni değişince vardiya önerisi güncellenir
  const pickIndustry = (ind: string, v: string) => {
    setIndustry(ind);
    setVariant(v);
    setShifts(getVariant(getIndustry(ind)!, v).shifts.map(d => ({ ...d })));
  };

  // ── Şube işlemleri ────────────────────────────────────────────────────────
  const addBranch = () => setBranches(p => [...p, ""]);
  const removeBranch = (i: number) => {
    if (branches.length <= 1) return;
    setBranches(p => p.filter((_, j) => j !== i));
  };
  const updateBranch = (i: number, val: string) =>
    setBranches(p => p.map((b, j) => (j === i ? val : b)));

  // ── Kaydet (son adımda) ───────────────────────────────────────────────────
  const saveAll = async () => {
    setSaving(true);
    setError("");
    try {
      const validBranches = branches.map(n => n.trim()).filter(Boolean);

      // Mevcut şubeleri çek — aynı isme sahip olanları yeniden oluşturma (idempotent)
      const existingRes = await fetch("/api/locations");
      const existingLocs: Array<{ id: string; name: string; shift_definitions?: unknown; rules?: unknown; operating_hours?: unknown; task_templates?: unknown }> = existingRes.ok
        ? await existingRes.json()
        : [];
      const existingByName = new Map(
        Array.isArray(existingLocs)
          ? existingLocs.map(l => [l.name.toLowerCase(), l.id])
          : []
      );

      // 1. Şubeleri oluştur. Aynı isimli şube zaten varsa yeniden açılmaz. Önceki denemede
      // açılıp ayarlanamamış (vardiyasız) şube aşağıda kurulur; kurulu şubeye dokunulmaz.
      const newLocationIds: string[] = [];
      for (const name of validBranches) {
        if (existingByName.has(name.toLowerCase())) continue;
        const res = await fetch("/api/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ org_id: user.org_id, name }),
        });
        const data = await res.json().catch(() => ({}));
        if (!data.id) throw new Error(data.error ?? ("Şube açılamadı: " + name));
        newLocationIds.push(data.id);
      }

      // Önceki denemeden kalan, vardiyası tanımlanmamış şubeler (aynı adla girilenler)
      const parse = (v: unknown) => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return null; } };
      const isEmpty = (v: unknown) => { const x = parse(v); return !x || (Array.isArray(x) ? x.length === 0 : typeof x === "object" && Object.keys(x as object).length === 0); };
      const unconfigured = (Array.isArray(existingLocs) ? existingLocs : [])
        .filter(l => validBranches.some(n => n.toLowerCase() === l.name.toLowerCase()) && isEmpty(l.shift_definitions));

      // 2. Sadece YENİ şubelere vardiyalar + akıllı varsayılanlar (sektör kuralları,
      // özellikler, görev listeleri, çalışma saatleri). Departman kurulumda oluşturulmaz —
      // KOBİ akışını basit tutar (personel ihtiyacı tablosu düz kalır).
      const defaults = buildIndustryDefaults(industry, variant)!;

      const targets = [
        ...newLocationIds.map(id => ({ id, prev: null as null | (typeof existingLocs)[number] })),
        ...unconfigured.map(l => ({ id: l.id, prev: l })),
      ];
      const results = await Promise.all(
        targets.map(({ id, prev }) =>
          fetch(`/api/locations?id=${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              shift_definitions: shifts.filter(s => s.name.trim()),
              // Yarım kalmış şubede elle girilmiş değerler korunur (PATCH rules'u değiştirir, birleştirmez)
              operating_hours: prev && !isEmpty(prev.operating_hours) ? parse(prev.operating_hours) : defaults.operating_hours,
              rules: { ...defaults.rules, ...((prev ? parse(prev.rules) : null) as object ?? {}) },
              task_templates: prev && !isEmpty(prev.task_templates) ? parse(prev.task_templates) : defaults.task_templates,
            }),
          }).then(r => r.ok)
        )
      );
      if (results.some(ok => !ok)) throw new Error("Şube ayarları kaydedilemedi, lütfen tekrar deneyin.");

      // İşletmenin tek şubesi varsa sahip doğrudan o şubenin müdür paneline geçer
      const allIds = [...existingByName.values(), ...newLocationIds];
      setSingleLocationId(allIds.length === 1 ? allIds[0] : null);
      setReadyCount(targets.length);
      setStep(2);
    } catch (e: any) {
      setError(e.message ?? "Beklenmedik bir hata oluştu.");
    } finally {
      setSaving(false);
    }
  };

  // ── Navigasyon ────────────────────────────────────────────────────────────
  const next = async () => {
    setError("");
    if (step === 0 && !branches.some(b => b.trim())) {
      setError("En az bir şube adı girin.");
      return;
    }
    if (step === 0 && freePlan && branches.filter(b => b.trim()).length > 1) {
      setError(limitMessage("locations"));
      return;
    }
    if (step === 1) await saveAll();
    else setStep(s => s + 1);
  };

  if (!mounted || !user) return <div />;

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 overflow-auto flex flex-col items-center justify-start md:justify-center p-4 pt-8 md:pt-4">
      <div className="w-full max-w-2xl">
        <AuthLogo className="mb-6" />

        {/* Progress bar */}
        {step < 2 && <WizardProgress steps={STEPS} current={step} className="mb-6 md:mb-8" />}

        {/* Kart */}
        <div className="bg-white rounded-2xl border border-slate-200">
          <div className="p-5 md:p-8 lg:p-10">

            {/* ── Adım 0: Sektör + Şubeler ── */}
            {step === 0 && (
              <WizardStep icon={<Store size={24} />} color="bg-forest-100 text-forest-600"
                title="İşletmenizi Tanıyalım"
                sub="İşletme türünüzü seçin, şubenizi adlandırın. Vardiyalar, yasal kurallar ve gereken özellikler buna göre hazırlanır.">
                <IndustryPicker industry={industry} variant={variant} onChange={pickIndustry} />

                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-slate-400">Şubeler (tek şube de olabilir, sonradan da eklenebilir)</p>
                  {branches.map((b, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                        {i + 1}
                      </div>
                      <input
                        value={b}
                        onChange={e => updateBranch(i, e.target.value)}
                        placeholder={["Kadıköy Şube", "Beşiktaş Şube", "Şişli Merkez", "Yeni Şube"][i] ?? "Şube adı"}
                        className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-primary transition-colors"
                      />
                      <button onClick={() => removeBranch(i)} disabled={branches.length <= 1} aria-label="Şubeyi kaldır" title="Şubeyi kaldır"
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-20 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  {freePlan && (
                    <p className="text-xs text-slate-500">{limitMessage("locations")}</p>
                  )}
                  {branches.length < 30 && !(freePlan && branches.length >= 1) && (
                    <button onClick={addBranch}
                      className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                      <Plus size={15} /> Şube ekle
                    </button>
                  )}
                </div>
              </WizardStep>
            )}

            {/* ── Adım 1: Vardiya Tanımları ── */}
            {step === 1 && (
              <WizardStep icon={<CalendarClock size={24} />} color="bg-ember-100 text-ember-600"
                title="Vardiya Tanımları"
                sub="Sektörünüze özel öneriler yüklendi, saatleri işletmenize göre düzenlemeniz yeterli.">
                <div className="space-y-3">
                  {shifts.map((s, i) => (
                    <div key={i} className="flex flex-wrap md:grid md:grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center bg-slate-50 rounded-xl p-3">
                      <input value={s.name}
                        onChange={e => setShifts(p => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                        placeholder="Vardiya adı"
                        className="text-sm font-bold border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary bg-white" />
                      <input type="time" value={s.start}
                        onChange={e => setShifts(p => p.map((x, j) => j === i ? { ...x, start: e.target.value } : x))}
                        className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary bg-white" />
                      <span className="text-slate-400 text-xs font-bold">→</span>
                      <input type="time" value={s.end}
                        onChange={e => setShifts(p => p.map((x, j) => j === i ? { ...x, end: e.target.value } : x))}
                        className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary bg-white" />
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-400 font-bold whitespace-nowrap">Zorluk {s.base_points}</span>
                        <input type="range" min={1} max={10} value={s.base_points}
                          onChange={e => setShifts(p => p.map((x, j) => j === i ? { ...x, base_points: +e.target.value } : x))}
                          className="w-14 accent-primary" />
                        <button onClick={() => setShifts(p => p.filter((_, j) => j !== i))} aria-label="Vardiyayı kaldır" title="Vardiyayı kaldır"
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {shifts.length < 6 && (
                    <button
                      onClick={() => setShifts(p => [...p, { id: `s${Date.now()}`, name: "", start: "09:00", end: "17:00", base_points: 3 }])}
                      className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                      <Plus size={15} /> Vardiya ekle
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Puan değeri, vardiyanın zorluğudur. Vardiyalar bu yüke göre adil dağıtılır. Emin değilseniz olduğu gibi bırakın.
                </p>
              </WizardStep>
            )}

            {/* ── Adım 2: Tamamlandı ── */}
            {step === 2 && (
              <div className="text-center space-y-6 py-4">
                <CheckCircle2 size={40} className="mx-auto text-emerald-600" />

                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Her şey hazır</h2>
                  <p className="text-slate-500 mt-3 leading-relaxed max-w-sm mx-auto">
                    {readyCount > 0
                      ? <><strong>{readyCount} şube</strong> vardiya şablonlarıyla birlikte kuruldu.{" "}</>
                      : <>Şubeleriniz zaten kurulu.{" "}</>}
                    {singleLocationId ? (
                      <>Sırada personel eklemek var. Vardiya Planı sayfasındaki <strong>Hızlı Kurulum</strong> bandı size yol gösterecek.</>
                    ) : (
                      <>Genel bakışta her şubenin kartındaki <strong>Şubeye gir</strong> ile o şubeye geçip personel ekleyebilirsiniz.</>
                    )}
                  </p>
                </div>

                <div className="pt-2">
                  <button onClick={() => {
                    if (singleLocationId) {
                      openBranchPanel(user, singleLocationId);
                      // Tam yükleme: kenar menü kurulum sırasında (şube yokken) yüklendi, yeniden okumalı
                      window.location.assign("/schedule");
                    } else {
                      router.push("/supervisor");
                    }
                  }}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-white font-bold rounded-2xl hover:bg-primary/90 transition-colors group">
                    {singleLocationId ? "Vardiya Planına Git" : "Yönetim Paneline Git"}
                    <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            )}

            {/* Hata */}
            {error && (
              <div className="mt-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 font-medium">
                {error}
              </div>
            )}

            {/* Navigasyon */}
            {step < 2 && (
              <WizardNav current={step} total={STEPS.length} busy={saving}
                onBack={() => setStep(s => s - 1)} onNext={next} finishLabel="Tamamla ve Başla" />
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6 font-medium">
          Departman, kural ve diğer tüm detayları istediğiniz zaman Ayarlar sayfasından ekleyebilirsiniz.
        </p>
      </div>
    </div>
  );
}
