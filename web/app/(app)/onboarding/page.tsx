"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Store, CalendarClock, Sparkles, MapPin,
  ArrowRight, Plus, Trash2, Check, Zap,
} from "lucide-react";
import { buildIndustryDefaults, getIndustry, getVariant } from "@/lib/templates";
import IndustryPicker from "@/components/IndustryPicker";
import type { ShiftDefinition } from "@/lib/types";
import { WizardProgress, WizardStep, WizardNav } from "@/components/ui/Wizard";
import { openBranchPanel } from "@/lib/sessionRouting";

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
      const existingLocs: Array<{ id: string; name: string }> = existingRes.ok
        ? await existingRes.json()
        : [];
      const existingByName = new Map(
        Array.isArray(existingLocs)
          ? existingLocs.map(l => [l.name.toLowerCase(), l.id])
          : []
      );

      // 1. Şubeleri oluştur. Aynı isimli şube zaten varsa DOKUNULMAZ:
      // locations PATCH rules'u merge değil replace eder — kurulu bir şubenin
      // tüm ayarlarını 3 anahtarlı wizard objesiyle ezmek veri kaybıdır.
      const newLocationIds: string[] = [];
      for (const name of validBranches) {
        if (existingByName.has(name.toLowerCase())) continue;
        const res = await fetch("/api/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ org_id: user.org_id, name }),
        });
        const data = await res.json();
        if (!data.id) throw new Error(data.error ?? ("Şube oluşturulamadı: " + name));
        newLocationIds.push(data.id);
      }

      // 2. Sadece YENİ şubelere vardiyalar + akıllı varsayılanlar (sektör kuralları,
      // özellikler, görev listeleri, çalışma saatleri). Departman kurulumda oluşturulmaz —
      // KOBİ akışını basit tutar (personel ihtiyacı tablosu düz kalır).
      const defaults = buildIndustryDefaults(industry, variant)!;

      await Promise.all(
        newLocationIds.map(id =>
          fetch(`/api/locations?id=${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              shift_definitions: shifts.filter(s => s.name.trim()),
              operating_hours: defaults.operating_hours,
              rules: defaults.rules,
              task_templates: defaults.task_templates,
            }),
          })
        )
      );

      // İşletmenin tek şubesi varsa sahip doğrudan o şubenin müdür paneline geçer
      const allIds = [...existingByName.values(), ...newLocationIds];
      setSingleLocationId(allIds.length === 1 ? allIds[0] : null);
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
    if (step === 1) await saveAll();
    else setStep(s => s + 1);
  };

  if (!mounted || !user) return <div />;

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-50 to-forest-50 overflow-auto flex flex-col items-center justify-start md:justify-center p-4 pt-8 md:pt-4">
      <div className="w-full max-w-2xl">

        {/* Progress bar */}
        {step < 2 && <WizardProgress steps={STEPS} current={step} className="mb-6 md:mb-8" />}

        {/* Kart */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100">
          <div className="p-5 md:p-8 lg:p-10">

            {/* ── Adım 0: Sektör + Şubeler ── */}
            {step === 0 && (
              <WizardStep icon={<Store size={24} />} color="bg-forest-100 text-forest-600"
                title="İşletmenizi Tanıyalım"
                sub="İşletme türünüzü seçin, şubenizi adlandırın. Vardiyalar, yasal kurallar ve gereken özellikler buna göre hazırlanır.">
                <IndustryPicker industry={industry} variant={variant} onChange={pickIndustry} />

                <div className="space-y-2.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Şubeler (tek şube de olabilir, sonradan da eklenebilir)</p>
                  {branches.map((b, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center text-xs font-black text-slate-500 shrink-0">
                        {i + 1}
                      </div>
                      <input
                        value={b}
                        onChange={e => updateBranch(i, e.target.value)}
                        placeholder={["Kadıköy Şube", "Beşiktaş Şube", "Şişli Merkez", "Yeni Şube"][i] ?? "Şube adı"}
                        className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-primary transition-colors"
                      />
                      <button onClick={() => removeBranch(i)} disabled={branches.length <= 1}
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-20 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  {branches.length < 30 && (
                    <button onClick={addBranch}
                      className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:border-primary hover:text-primary transition-colors">
                      <Plus size={15} /> Şube Ekle
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
                        <span className="text-[10px] text-slate-400 font-bold whitespace-nowrap">Zorluk {s.base_points}</span>
                        <input type="range" min={1} max={10} value={s.base_points}
                          onChange={e => setShifts(p => p.map((x, j) => j === i ? { ...x, base_points: +e.target.value } : x))}
                          className="w-14 accent-primary" />
                        <button onClick={() => setShifts(p => p.filter((_, j) => j !== i))}
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {shifts.length < 6 && (
                    <button
                      onClick={() => setShifts(p => [...p, { id: `s${Date.now()}`, name: "", start: "09:00", end: "17:00", base_points: 3 }])}
                      className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:border-primary hover:text-primary transition-colors">
                      <Plus size={15} /> Vardiya Ekle
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
                <div className="relative inline-block">
                  <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                    <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center">
                      <Check size={32} className="text-white" strokeWidth={3} />
                    </div>
                  </div>
                  <div className="absolute -top-1 -right-1 w-8 h-8 bg-amber-400 rounded-full flex items-center justify-center animate-bounce">
                    <Sparkles size={14} className="text-white" />
                  </div>
                </div>

                <div>
                  <h2 className="text-3xl font-black text-slate-900">Her Şey Hazır!</h2>
                  <p className="text-slate-500 mt-3 leading-relaxed max-w-sm mx-auto">
                    <strong>{branches.filter(b => b.trim()).length} şube</strong> vardiya şablonlarıyla birlikte kuruldu.{" "}
                    {singleLocationId ? (
                      <>Sırada personel eklemek var. Vardiya Planı sayfasındaki <strong>Hızlı Kurulum</strong> bandı size yol gösterecek.</>
                    ) : (
                      <>Genel bakışta her şubenin kartındaki <strong>Planı Yönet</strong> ile o şubeye geçip personel ekleyebilirsiniz.</>
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
                    className="w-full flex items-center justify-center gap-2 py-4 bg-primary text-white font-bold rounded-2xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25 group">
                    <Zap size={18} />
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
