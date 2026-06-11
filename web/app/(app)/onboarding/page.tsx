"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Store, Users, CalendarClock, Settings2, Sparkles, MapPin,
  ArrowRight, ArrowLeft, Plus, Trash2, Check, Zap, X,
  Coffee, ShoppingBag, Hotel, UtensilsCrossed, Factory, Copy,
} from "lucide-react";

// ─── Sabitler ────────────────────────────────────────────────────────────────

const SECTORS = [
  { id: "cafe",       label: "Kafe / Bar",      icon: Coffee,          color: "bg-amber-100 text-amber-700" },
  { id: "retail",     label: "Perakende",        icon: ShoppingBag,    color: "bg-blue-100 text-blue-700" },
  { id: "hotel",      label: "Otel / Konaklama", icon: Hotel,           color: "bg-violet-100 text-violet-700" },
  { id: "restaurant", label: "Restoran",         icon: UtensilsCrossed, color: "bg-rose-100 text-rose-700" },
  { id: "factory",    label: "Fabrika / Üretim", icon: Factory,         color: "bg-slate-200 text-slate-700" },
];

const DEPT_PRESETS: Record<string, string[]> = {
  cafe:       ["Mutfak", "Bar", "Salon", "Kasa"],
  retail:     ["Kasa", "Reyon", "Depo", "Güvenlik"],
  hotel:      ["Resepsiyon", "Kat Hizmetleri", "Restaurant", "Bar", "Mutfak"],
  restaurant: ["Mutfak", "Servis", "Bar", "Kasa"],
  factory:    ["Üretim", "Kalite Kontrol", "Depo", "Bakım"],
};

const SHIFT_PRESETS: Record<string, ShiftDef[]> = {
  cafe: [
    { id: "s1", name: "Açılış",  start: "07:00", end: "13:00", base_points: 5 },
    { id: "s2", name: "Öğlen",   start: "11:00", end: "17:00", base_points: 3 },
    { id: "s3", name: "Kapanış", start: "15:00", end: "22:00", base_points: 8 },
  ],
  retail: [
    { id: "s1", name: "Sabah",      start: "09:00", end: "17:00", base_points: 3 },
    { id: "s2", name: "Akşam",      start: "14:00", end: "22:00", base_points: 5 },
    { id: "s3", name: "Hafta Sonu", start: "10:00", end: "19:00", base_points: 8 },
  ],
  hotel: [
    { id: "s1", name: "Gündüz", start: "07:00", end: "15:00", base_points: 3 },
    { id: "s2", name: "Akşam",  start: "15:00", end: "23:00", base_points: 5 },
    { id: "s3", name: "Gece",   start: "23:00", end: "07:00", base_points: 10 },
  ],
  restaurant: [
    { id: "s1", name: "Öğle Servisi",  start: "10:00", end: "16:00", base_points: 3 },
    { id: "s2", name: "Akşam Servisi", start: "17:00", end: "24:00", base_points: 7 },
  ],
  factory: [
    { id: "s1", name: "Sabah Vardiyası",  start: "06:00", end: "14:00", base_points: 5 },
    { id: "s2", name: "Öğleden Sonra",    start: "14:00", end: "22:00", base_points: 7 },
    { id: "s3", name: "Gece Vardiyası",   start: "22:00", end: "06:00", base_points: 10 },
  ],
};

const STEPS = [
  { label: "Sektör",      icon: Store },
  { label: "Şubeler",     icon: MapPin },
  { label: "Departmanlar",icon: Users },
  { label: "Vardiyalar",  icon: CalendarClock },
  { label: "Kurallar",    icon: Settings2 },
];

interface ShiftDef {
  id: string;
  name: string;
  start: string;
  end: string;
  base_points: number;
}

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function OnboardingWizard() {
  const router = useRouter();
  const [user, setUser]       = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [step, setStep]       = useState(0);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  // Adım 0 — Sektör
  const [sector, setSector] = useState("cafe");

  // Adım 1 — Şubeler
  const [branches, setBranches] = useState<string[]>([""]);

  // Adım 2 — Her şube için departmanlar
  const [deptsByBranch, setDeptsByBranch] = useState<string[][]>([[]]);
  const [deptInputs, setDeptInputs]       = useState<string[]>([""]);

  // Adım 3 — Vardiya tanımları
  const [shifts, setShifts] = useState<ShiftDef[]>(SHIFT_PRESETS.cafe);

  // Adım 4 — Kurallar
  const [maxWeeklyHours, setMaxWeeklyHours]       = useState(45);
  const [minRestHours, setMinRestHours]             = useState(11);
  const [forceSkillsMatch, setForceSkillsMatch]   = useState(false);

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
    setShifts(SHIFT_PRESETS[sector] ?? SHIFT_PRESETS.cafe);
  }, [sector]);

  // Şube sayısı değişince departman dizilerini senkronize et
  useEffect(() => {
    setDeptsByBranch(prev => {
      const next: string[][] = [];
      for (let i = 0; i < branches.length; i++) {
        next.push(prev[i] ?? [...(DEPT_PRESETS[sector] ?? [])]);
      }
      return next;
    });
    setDeptInputs(prev => {
      const next = [...prev];
      while (next.length < branches.length) next.push("");
      return next.slice(0, branches.length);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches.length]);

  // ── Şube işlemleri ────────────────────────────────────────────────────────
  const addBranch = () => setBranches(p => [...p, ""]);
  const removeBranch = (i: number) => {
    if (branches.length <= 1) return;
    setBranches(p => p.filter((_, j) => j !== i));
    setDeptsByBranch(p => p.filter((_, j) => j !== i));
  };
  const updateBranch = (i: number, val: string) =>
    setBranches(p => p.map((b, j) => (j === i ? val : b)));

  // ── Departman işlemleri ───────────────────────────────────────────────────
  const addDept = (bi: number, name: string) => {
    if (!name.trim()) return;
    setDeptsByBranch(p => {
      const next = p.map(a => [...a]);
      if (!next[bi].includes(name.trim())) next[bi].push(name.trim());
      return next;
    });
    setDeptInputs(p => p.map((v, i) => (i === bi ? "" : v)));
  };
  const removeDept = (bi: number, di: number) =>
    setDeptsByBranch(p => p.map((a, i) => (i === bi ? a.filter((_, j) => j !== di) : a)));
  const copyFromFirst = (bi: number) =>
    setDeptsByBranch(p => p.map((a, i) => (i === bi ? [...p[0]] : a)));

  // ── Kaydet (son adımda) ───────────────────────────────────────────────────
  const saveAll = async () => {
    setSaving(true);
    setError("");
    try {
      const validBranches = branches
        .map((name, i) => ({ name: name.trim(), depts: deptsByBranch[i] ?? [] }))
        .filter(b => b.name);

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

      // 1. Şubeleri oluştur (sıralı — ID'ler departman için gerekli)
      const locationIds: string[] = [];
      for (const branch of validBranches) {
        const existingId = existingByName.get(branch.name.toLowerCase());
        if (existingId) {
          locationIds.push(existingId);
          continue;
        }
        const res = await fetch("/api/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ org_id: user.org_id, name: branch.name }),
        });
        const data = await res.json();
        if (!data.id) throw new Error(data.error ?? ("Şube oluşturulamadı: " + branch.name));
        locationIds.push(data.id);
      }

      // 2. Her şubeye vardiya tanımlarını ve çalışma saatlerini ata (paralel)
      const defaultHours: Record<string, unknown> = {};
      for (let i = 0; i < 7; i++) defaultHours[i] = { isOpen: true, open: "09:00", close: "22:00" };

      await Promise.all(
        locationIds.map(id =>
          fetch(`/api/locations?id=${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              shift_definitions: shifts,
              operating_hours: defaultHours,
              rules: {
                max_weekly_hours: maxWeeklyHours,
                min_rest_hours: minRestHours,
                force_skills_match: forceSkillsMatch,
              },
            }),
          })
        )
      );

      // 3. Departmanları oluştur
      for (let i = 0; i < validBranches.length; i++) {
        for (const deptName of validBranches[i].depts.filter(d => d.trim())) {
          await fetch("/api/departments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ location_id: locationIds[i], name: deptName }),
          });
        }
      }

      setStep(5);
    } catch (e: any) {
      setError(e.message ?? "Beklenmedik bir hata oluştu.");
    } finally {
      setSaving(false);
    }
  };

  // ── Navigasyon ────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    if (step === 1 && !branches.some(b => b.trim())) {
      setError("En az bir şube adı girin.");
      return false;
    }
    return true;
  };

  const next = async () => {
    setError("");
    if (!validate()) return;
    if (step === 4) await saveAll();
    else setStep(s => s + 1);
  };

  if (!mounted || !user) return <div />;

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-50 to-indigo-50 overflow-auto flex flex-col items-center justify-start md:justify-center p-4 pt-8 md:pt-4">
      <div className="w-full max-w-2xl">

        {/* Progress bar */}
        {step < 5 && (
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

            {/* ── Adım 0: Sektör ── */}
            {step === 0 && (
              <Shell icon={<Store size={24} />} color="bg-indigo-100 text-indigo-600"
                title="Sektörünüzü Seçin"
                sub="Vardiya şablonları ve departman önerileri buna göre hazırlanır.">
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
              </Shell>
            )}

            {/* ── Adım 1: Şubeler ── */}
            {step === 1 && (
              <Shell icon={<MapPin size={24} />} color="bg-sky-100 text-sky-600"
                title="Şubelerinizi Ekleyin"
                sub="Tek şube de olabilir, 50 şube de. Sonradan da ekleyebilirsiniz.">
                <div className="space-y-2.5">
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
                </div>
                {branches.length < 30 && (
                  <button onClick={addBranch}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:border-primary hover:text-primary transition-colors">
                    <Plus size={15} /> Şube Ekle
                  </button>
                )}
              </Shell>
            )}

            {/* ── Adım 2: Departmanlar ── */}
            {step === 2 && (
              <Shell icon={<Users size={24} />} color="bg-emerald-100 text-emerald-600"
                title="Departmanlar"
                sub="Her şube için bölümleri tanımlayın. Departmansız da bırakabilirsiniz.">
                <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
                  {branches.filter(b => b.trim()).map((branchName, bi) => (
                    <div key={bi} className="border-2 border-slate-100 rounded-2xl p-4 space-y-3">
                      {/* Başlık */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MapPin size={13} className="text-slate-400" />
                          <span className="text-sm font-black text-slate-700">{branchName}</span>
                        </div>
                        {bi > 0 && (
                          <button onClick={() => copyFromFirst(bi)}
                            className="flex items-center gap-1 text-[11px] text-indigo-500 hover:text-indigo-700 font-bold transition-colors">
                            <Copy size={11} /> 1. şubeden kopyala
                          </button>
                        )}
                      </div>

                      {/* Hızlı ekle (sektör önerileri) */}
                      <div className="flex flex-wrap gap-1.5">
                        {(DEPT_PRESETS[sector] ?? []).map(preset => {
                          const added = deptsByBranch[bi]?.includes(preset);
                          return (
                            <button key={preset}
                              onClick={() => added
                                ? removeDept(bi, deptsByBranch[bi].indexOf(preset))
                                : addDept(bi, preset)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                                added
                                  ? "bg-primary border-primary text-white"
                                  : "border-slate-200 text-slate-500 hover:border-primary hover:text-primary"
                              }`}>
                              {added ? <><Check size={9} className="inline mr-0.5" />{preset}</> : `+ ${preset}`}
                            </button>
                          );
                        })}
                      </div>

                      {/* Özel departmanlar (preset dışı) */}
                      {(deptsByBranch[bi] ?? []).filter(d => !(DEPT_PRESETS[sector] ?? []).includes(d)).length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {(deptsByBranch[bi] ?? [])
                            .filter(d => !(DEPT_PRESETS[sector] ?? []).includes(d))
                            .map((dept, di) => (
                              <span key={di}
                                className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 rounded-lg text-[11px] font-bold text-slate-700">
                                {dept}
                                <button onClick={() => removeDept(bi, deptsByBranch[bi].indexOf(dept))}
                                  className="text-slate-400 hover:text-red-500">
                                  <X size={10} />
                                </button>
                              </span>
                            ))}
                        </div>
                      )}

                      {/* Özel departman girişi */}
                      <div className="flex gap-2">
                        <input
                          value={deptInputs[bi] ?? ""}
                          onChange={e => setDeptInputs(p => p.map((v, i) => i === bi ? e.target.value : v))}
                          onKeyDown={e => e.key === "Enter" && addDept(bi, deptInputs[bi])}
                          placeholder="Özel departman ekle..."
                          className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-primary transition-colors"
                        />
                        <button onClick={() => addDept(bi, deptInputs[bi])}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-primary hover:text-white rounded-lg text-xs font-bold text-slate-600 transition-colors">
                          Ekle
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Shell>
            )}

            {/* ── Adım 3: Vardiya Tanımları ── */}
            {step === 3 && (
              <Shell icon={<CalendarClock size={24} />} color="bg-violet-100 text-violet-600"
                title="Vardiya Tanımları"
                sub="Tüm şubelerinizde kullanılacak vardiya tiplerini belirleyin. Sektörünüze özel öneriler yüklendi.">
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
                  Puan değerleri adalet motorunun vardiyaları dengeli dağıtmak için kullandığı ağırlıklardır.
                </p>
              </Shell>
            )}

            {/* ── Adım 4: Kurallar ── */}
            {step === 4 && (
              <Shell icon={<Settings2 size={24} />} color="bg-amber-100 text-amber-600"
                title="Kural Motoru"
                sub="Bu ayarları istediğiniz zaman Ayarlar sayfasından değiştirebilirsiniz.">
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Haftalık Maksimum Çalışma Saati</Label>
                      <span className="text-sm font-black text-primary">{maxWeeklyHours} saat</span>
                    </div>
                    <input type="range" min={20} max={60} step={1} value={maxWeeklyHours}
                      onChange={e => setMaxWeeklyHours(+e.target.value)}
                      className="w-full accent-primary h-2 rounded-full" />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-medium">
                      <span>20 sa</span><span>Türkiye yasal sınır: 45 sa</span><span>60 sa</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Vardiyalar Arası Minimum Dinlenme</Label>
                      <span className="text-sm font-black text-primary">{minRestHours} saat</span>
                    </div>
                    <input type="range" min={8} max={16} step={1} value={minRestHours}
                      onChange={e => setMinRestHours(+e.target.value)}
                      className="w-full accent-primary h-2 rounded-full" />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-medium">
                      <span>8 sa</span><span>Türkiye yasal minimum: 11 sa</span><span>16 sa</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-4 border border-slate-200">
                    <div>
                      <p className="text-sm font-bold text-slate-800">Yetenek Eşleştirmesi</p>
                      <p className="text-xs text-slate-500 mt-0.5">Personelin yeteneği yoksa uyarı ver, engelleme</p>
                    </div>
                    <button onClick={() => setForceSkillsMatch(v => !v)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${forceSkillsMatch ? "bg-primary" : "bg-slate-200"}`}>
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${forceSkillsMatch ? "left-5" : "left-0.5"}`} />
                    </button>
                  </div>
                </div>
              </Shell>
            )}

            {/* ── Adım 5: Tamamlandı ── */}
            {step === 5 && (
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
                    <strong>{branches.filter(b => b.trim()).length} şube</strong> oluşturuldu. Artık her şubeye müdür atayıp personel ekleyebilirsiniz.
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
            {step < 5 && (
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
                    <>{step === 4 ? "Tamamla ve Başla" : "Devam Et"} <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" /></>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6 font-medium">
          Bu adımları istediğiniz zaman Ayarlar sayfasından değiştirebilirsiniz.
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

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{children}</p>;
}
