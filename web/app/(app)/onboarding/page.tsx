"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Store, CalendarClock, Sparkles, MapPin,
  ArrowRight, ArrowLeft, Plus, Trash2, Check, Zap,
  Coffee, ShoppingBag, Hotel, UtensilsCrossed, Factory,
} from "lucide-react";
import { getSectorPreset } from "@/lib/presets";
import type { ShiftDefinition } from "@/lib/types";

// ─── Sabitler ────────────────────────────────────────────────────────────────
// Vardiya/kural preset'lerinin tek kaynağı lib/presets.ts — burada sadece görsel eşleme var.

const SECTORS = [
  { id: "cafe",       label: "Kafe / Bar",      icon: Coffee,          color: "bg-amber-100 text-amber-700" },
  { id: "retail",     label: "Perakende",        icon: ShoppingBag,    color: "bg-blue-100 text-blue-700" },
  { id: "hotel",      label: "Otel / Konaklama", icon: Hotel,           color: "bg-violet-100 text-violet-700" },
  { id: "restaurant", label: "Restoran",         icon: UtensilsCrossed, color: "bg-rose-100 text-rose-700" },
  { id: "factory",    label: "Fabrika / Üretim", icon: Factory,         color: "bg-slate-200 text-slate-700" },
];

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

  // Adım 0 — Sektör + şubeler
  const [sector, setSector] = useState("cafe");
  const [branches, setBranches] = useState<string[]>([""]);

  // Adım 1 — Vardiya tanımları (sektör preset'inden dolu gelir, düzenlenebilir)
  const [shifts, setShifts] = useState<ShiftDefinition[]>(getSectorPreset("cafe").shiftDefs);

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

  // Sektör değişince vardiya öneri seti güncelle
  useEffect(() => {
    setShifts(getSectorPreset(sector).shiftDefs.map(d => ({ ...d })));
  }, [sector]);

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
      const preset = getSectorPreset(sector);
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

      // 2. Sadece YENİ şubelere vardiyalar + çalışma saatleri + sektör kuralları.
      // Departman kurulumda oluşturulmaz — KOBİ akışını basit tutar (kapasite
      // matrisi düz kalır); ihtiyacı olan Ayarlar → Departmanlar'dan ekler.
      const defaultHours: Record<string, unknown> = {};
      for (let i = 0; i < 7; i++) defaultHours[i] = { isOpen: true, open: "09:00", close: "22:00" };

      await Promise.all(
        newLocationIds.map(id =>
          fetch(`/api/locations?id=${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              shift_definitions: shifts.filter(s => s.name.trim()),
              operating_hours: defaultHours,
              rules: {
                max_weekly_hours: 45,
                min_rest_hours: 11,
                simple_mode: preset.simpleMode,
              },
            }),
          })
        )
      );

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
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-50 to-indigo-50 overflow-auto flex flex-col items-center justify-start md:justify-center p-4 pt-8 md:pt-4">
      <div className="w-full max-w-2xl">

        {/* Progress bar */}
        {step < 2 && (
          <div className="flex items-center mb-6 md:mb-8">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done   = step > i;
              const active = step === i;
              return (
                <div key={i} className={`flex items-center ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                      done   ? "bg-primary text-white" :
                      active ? "bg-white border-2 border-primary text-primary shadow-md" :
                               "bg-slate-200 text-slate-400"
                    }`}>
                      {done ? <Check size={16} strokeWidth={3} /> : <Icon size={16} />}
                    </div>
                    <span className={`text-[10px] font-bold hidden sm:block ${
                      active ? "text-primary" : done ? "text-slate-600" : "text-slate-400"
                    }`}>{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 mb-4 transition-colors ${step > i ? "bg-primary" : "bg-slate-200"}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Kart */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100">
          <div className="p-5 md:p-8 lg:p-10">

            {/* ── Adım 0: Sektör + Şubeler ── */}
            {step === 0 && (
              <Shell icon={<Store size={24} />} color="bg-indigo-100 text-indigo-600"
                title="İşletmenizi Tanıyalım"
                sub="Sektörünüzü seçin, şubenizi adlandırın — vardiya şablonları ve ayarlar buna göre hazırlanır.">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 md:gap-2.5">
                  {SECTORS.map(s => {
                    const Icon = s.icon;
                    return (
                      <button key={s.id} onClick={() => setSector(s.id)}
                        className={`flex items-center gap-2.5 px-4 py-3.5 rounded-xl border-2 text-left transition-all ${
                          sector === s.id ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"
                        }`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${s.color}`}>
                          <Icon size={15} />
                        </div>
                        <span className={`text-xs font-bold ${sector === s.id ? "text-primary" : "text-slate-700"}`}>
                          {s.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-2.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Şubeler — tek şube de olabilir, sonradan da eklenebilir</p>
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
              </Shell>
            )}

            {/* ── Adım 1: Vardiya Tanımları ── */}
            {step === 1 && (
              <Shell icon={<CalendarClock size={24} />} color="bg-violet-100 text-violet-600"
                title="Vardiya Tanımları"
                sub="Sektörünüze özel öneriler yüklendi — saatleri işletmenize göre düzenlemeniz yeterli.">
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
                        <span className="text-[10px] text-slate-400 font-bold">{s.base_points}p</span>
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
                  Puan değeri, vardiyanın zorluğudur — vardiyalar bu yüke göre adil dağıtılır. Emin değilseniz olduğu gibi bırakın.
                </p>
              </Shell>
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
                    <strong>{branches.filter(b => b.trim()).length} şube</strong> vardiya şablonlarıyla birlikte kuruldu.
                    Sırada personel eklemek var — Vardiya Planı sayfasındaki <strong>Hızlı Kurulum</strong> bandı size yol gösterecek.
                  </p>
                </div>

                <div className="pt-2">
                  <button onClick={() => router.push("/supervisor")}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-primary text-white font-bold rounded-2xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25 group">
                    <Zap size={18} />
                    Yönetim Paneline Git
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
              <div className="flex gap-3 mt-8">
                {step > 0 && (
                  <button onClick={() => setStep(s => s - 1)}
                    className="flex items-center gap-2 px-5 py-3 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                    <ArrowLeft size={15} /> Geri
                  </button>
                )}
                <button onClick={next} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-md shadow-primary/20 group">
                  {saving ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Kaydediliyor…</>
                  ) : (
                    <>{step === 1 ? "Tamamla ve Başla" : "Devam Et"} <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" /></>
                  )}
                </button>
              </div>
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

// ─── Yardımcı bileşenler ──────────────────────────────────────────────────────

function Shell({ icon, color, title, sub, children }: {
  icon: React.ReactNode;
  color: string;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${color}`}>{icon}</div>
        <div>
          <h2 className="text-2xl font-black text-slate-900">{title}</h2>
          <p className="text-slate-500 text-sm mt-1">{sub}</p>
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}
