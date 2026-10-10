"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import TimeInput from "@/components/ui/TimeInput";
import { getPlan, limitMessage } from "@/lib/plans";
import { BreakPicker } from "@/components/ui/BreakPicker";
import { DifficultyPicker } from "@/components/ui/DifficultyPicker";
import { useState, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import { Store, CalendarClock, Plus, Trash2, Users, Sparkles, UserPlus } from "lucide-react";
import { SetupChat } from "@/components/onboarding/SetupChat";
import type { SetupPerson, SetupProposal } from "@/lib/ai/setupAssistant";
import { buildIndustryDefaults, getIndustry, getVariant } from "@/lib/templates";
import IndustryPicker from "@/components/IndustryPicker";
import type { ShiftDefinition } from "@/lib/types";
import { WizardProgress, WizardStep, WizardNav } from "@/components/ui/Wizard";
import { openBranchPanel } from "@/lib/sessionRouting";
import { AuthLogo } from "@/components/AuthLogo";
import { shiftDifficultyPct } from "@/lib/fairness";

// ─── Sabitler ────────────────────────────────────────────────────────────────
// Vardiya/kural preset'lerinin tek kaynağı lib/presets.ts — burada sadece görsel eşleme var.


const BASE_STEPS = [
  { label: "İşletmeniz", icon: Store },
  { label: "Vardiyalar", icon: CalendarClock },
];
// Yapay zekâ önerisi kaç kişi gerektiğini de getirdiyse üçüncü adımda gösterilir
const DEMAND_STEP = { label: "Kaç kişi", icon: Users };
// Fotoğraftan/listeden ekip okunduysa son adımda gösterilir; onayda herkes eklenir
const TEAM_STEP = { label: "Ekibiniz", icon: UserPlus };
const FREE_TEAM_LIMIT = 10;
const DAY_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
// Yapay zekâ kurulumunun zorluğu Adalet Puanı ekine (lib/fairness): kolay ve orta sıradan, zor %50
const DIFFICULTY_PCT = { easy: 0, medium: 0, hard: 50 } as const;

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function OnboardingWizard() {
  const router = useRouter();
  const [user, setUser]       = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [step, setStep]       = useState(0);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  // Ücretsiz plan tek şube: sihirbaz ikinci şubeyi baştan kabul etmez (sonda hata vermek yerine)
  const [freePlan, setFreePlan] = useState(false);

  // Adım 0 — Sektör + şubeler
  // İşletme türü + çalışma düzeni (lib/templates): vardiyalar, kurallar ve özellikler buna göre gelir
  const [industry, setIndustry] = useState("hospitality");
  const [variant, setVariant] = useState("cafe");
  const [branches, setBranches] = useState<string[]>([""]);
  // Tek şubeli işletme "şube" kavramını görmez: tek alan "İşletmenizin adı"; birden çok şube isteğe bağlı açılır
  const [multiOpen, setMultiOpen] = useState(false);
  // Ad kayıtta girildi: tekrar sorulmaz, isteyen "Değiştir" ile düzenler
  const [nameEdit, setNameEdit] = useState(false);
  // İsteğe bağlı bölümler (alt türün önerileri): seçilenler kurulumda departman olarak açılır
  const [pickedDepts, setPickedDepts] = useState<string[]>([]);
  const multi = multiOpen || branches.length > 1;

  // Yapay zekâ ile kurulum (components/onboarding/SetupChat): anahtar varsa sihirbaz sohbetle başlar
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"ai" | "form">("form");
  const [aiApplied, setAiApplied] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  // Yapay zekâ türü seçtiyse uzun tür listesi kapalı gelir, "Değiştir" ile açılır
  const [typeEdit, setTypeEdit] = useState(false);
  // Önerinin çalışma saatleri ve kaç kişi gerektiği: departman adı ("" = departmansız) → vardiya id → 7 gün
  const [opHours, setOpHours] = useState<{ open: string; close: string; closedDays: number[] } | null>(null);
  const [demand, setDemand] = useState<Record<string, Record<string, number[]>>>({});
  // Fotoğraftan okunan ekip (lib/ai/setupAssistant SetupPerson); adım bir kez açılınca liste boşalsa da kalır
  const [team, setTeam] = useState<SetupPerson[]>([]);
  const [teamFound, setTeamFound] = useState(false);
  const stepKeys = ["business", "shifts", ...(aiApplied ? ["demand"] : []), ...(teamFound ? ["team"] : [])];
  const STEPS = stepKeys.map(k => (k === "business" ? BASE_STEPS[0] : k === "shifts" ? BASE_STEPS[1] : k === "demand" ? DEMAND_STEP : TEAM_STEP));
  const cur = stepKeys[step];

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

  // Kurulumu bitmiş işletme bu sayfaya tekrar düşmez (vardiyası tanımlı şube varsa)
  useEffect(() => {
    if (!user) return;
    fetch("/api/locations").then(r => (r.ok ? r.json() : [])).then((locs: any[]) => {
      if (!Array.isArray(locs)) return;
      const done = locs.filter(l => { try { const d = typeof l.shift_definitions === "string" ? JSON.parse(l.shift_definitions) : l.shift_definitions; return Array.isArray(d) && d.length > 0; } catch { return false; } });
      if (done.length === 0) return;
      if (locs.length === 1) { openBranchPanel(user, locs[0].id); window.location.assign("/schedule"); }
      else router.replace("/supervisor");
    }).catch(() => {});
  }, [user, router]);

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

  useEffect(() => {
    if (!user) return;
    fetch("/api/onboarding/assistant").then(r => (r.ok ? r.json() : null)).then(d => {
      const on = !!d?.enabled;
      setAiEnabled(on);
      if (on) setMode("ai");
    }).catch(() => setAiEnabled(false));
  }, [user]);

  // Yapay zekâ önerisini formlara yazar; kayıt yine sahibin onayıyla, son adımda yapılır
  const applyProposal = (p: SetupProposal) => {
    setIndustry(p.industry);
    setVariant(p.variant);
    setPickedDepts(p.departments);
    const defs: ShiftDefinition[] = p.shifts.map((s, i) => ({ id: `s-${i + 1}`, name: s.name, start: s.start, end: s.end, base_points: 5, difficulty_pct: DIFFICULTY_PCT[s.difficulty], ...(s.break_minutes !== undefined ? { break_minutes: s.break_minutes } : {}) }));
    setShifts(defs);
    setOpHours({ open: p.open, close: p.close, closedDays: p.closedDays });
    const byName = new Map(defs.map(d => [d.name, d.id]));
    const dm: Record<string, Record<string, number[]>> = {};
    for (const [dept, m] of Object.entries(p.demand)) {
      dm[dept] = {};
      for (const [shiftName, days] of Object.entries(m)) { const id = byName.get(shiftName); if (id) dm[dept][id] = [...days]; }
    }
    setDemand(dm);
    setAiSummary(p.summary);
    setTeam(p.team ?? []);
    setTeamFound((p.team ?? []).length > 0);
    setAiApplied(true);
    setMode("form");
    setStep(0);
  };

  // Departman seçimi değişse de kaç kişi tablosu uyumlu kalsın: seçili departmanlar (yoksa tek tablo)
  const demandKeys = pickedDepts.length ? pickedDepts : [""];
  const demandFor = (dept: string, shiftId: string): number[] => {
    const direct = demand[dept]?.[shiftId];
    if (direct) return direct;
    // Departman kaldırıldıysa ya da yeni eklendiyse: tek tabloda bütün departmanların toplamı, yeni departmanda 1
    if (dept === "") {
      const rows = Object.values(demand).map(m => m[shiftId]).filter(Boolean) as number[][];
      if (rows.length) return Array.from({ length: 7 }, (_, d) => rows.reduce((t, r) => t + r[d], 0));
    }
    return Array.from({ length: 7 }, (_, d) => (opHours?.closedDays.includes(d) ? 0 : 1));
  };
  const setDemandCell = (dept: string, shiftId: string, day: number, v: number) =>
    setDemand(prev => {
      const row = [...demandFor(dept, shiftId)];
      row[day] = Math.max(0, Math.min(50, Math.round(v) || 0));
      return { ...prev, [dept]: { ...(prev[dept] ?? {}), [shiftId]: row } };
    });

  // İşletme türü / çalışma düzeni değişince vardiya önerisi güncellenir
  const pickIndustry = (ind: string, v: string) => {
    setIndustry(ind);
    setVariant(v);
    setPickedDepts([]);
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
              operating_hours: prev && !isEmpty(prev.operating_hours) ? parse(prev.operating_hours)
                : opHours ? Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, { isOpen: !opHours.closedDays.includes(d), open: opHours.open, close: opHours.close }]))
                : defaults.operating_hours,
              rules: { ...defaults.rules, ...((prev ? parse(prev.rules) : null) as object ?? {}) },
              task_templates: prev && !isEmpty(prev.task_templates) ? parse(prev.task_templates) : defaults.task_templates,
            }),
          }).then(r => r.ok)
        )
      );
      if (results.some(ok => !ok)) throw new Error("Şube ayarları kaydedilemedi, lütfen tekrar deneyin.");

      // Seçilen bölümler yeni şubelerde departman olarak açılır (isteğe bağlı)
      const toMatrix = (dept: string) => Object.fromEntries(shifts.filter(s => s.name.trim()).map(s => [s.id, Object.fromEntries(demandFor(dept, s.id).map((n, d) => [d, n]))]));
      for (const id of newLocationIds) {
        for (const name of pickedDepts) {
          const dep = await fetch("/api/departments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location_id: id, name }) })
            .then(r => (r.ok ? r.json() : null)).catch(() => null);
          // Yapay zekâ önerisindeki kaç kişi tablosu departmana yazılır
          if (aiApplied && dep?.id) {
            await fetch(`/api/departments?id=${dep.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demand_matrix: toMatrix(name) }) }).catch(() => null);
          }
        }
      }
      // Departmansız kurulumda tablo şubeye yazılır
      if (aiApplied && pickedDepts.length === 0) {
        for (const { id } of targets) {
          await fetch(`/api/locations?id=${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demand_matrix: toMatrix("") }) }).catch(() => null);
        }
      }

      // Fotoğraftan okunan ekip ilk şubeye eklenir (departmanlar yukarıda açıldı; hesap + davet bağlantısı)
      const people = team.filter(t => t.name.trim().length >= 2);
      let teamAdded = 0;
      const teamTarget = newLocationIds[0] ?? targets[0]?.id;
      if (people.length && teamTarget) {
        const r = await fetch("/api/personnel/bulk", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location_id: teamTarget,
            rows: people.map((t, i) => ({ line: i + 1, name: t.name.trim(), department: t.department, phone: t.phone })),
          }),
        }).then(x => (x.ok ? x.json() : null)).catch(() => null);
        teamAdded = Number(r?.addedCount ?? 0);
      }

      // Ara ekran yok: tek şube doğrudan Vardiya Planı'na (Hızlı Kurulum yol gösterir), çok şube Tüm Şubeler'e
      const allIds = [...existingByName.values(), ...newLocationIds];
      if (allIds.length === 1) {
        openBranchPanel(user, allIds[0]);
        // Tam yükleme: kenar menü kurulum sırasında (şube yokken) yüklendi, yeniden okumalı.
        // Ekip ve kaç kişi tablosu hazırsa plan sihirbazı açık gelir: ilk plan tek dokunuşla oluşur
        window.location.assign(teamAdded > 0 && aiApplied ? "/schedule?wizard=1" : "/schedule");
        return;
      }
      router.push("/supervisor");
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
      setError(multi ? "En az bir şube adı girin." : "İşletmenizin adını girin.");
      return;
    }
    if (step === 0 && freePlan && branches.filter(b => b.trim()).length > 1) {
      setError(limitMessage("locations"));
      return;
    }
    if (step === STEPS.length - 1) await saveAll();
    else setStep(s => s + 1);
  };

  if (!mounted || !user) return <div />;

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 overflow-auto flex flex-col items-center justify-start md:justify-center p-4 pt-8 md:pt-4">
      <div className="w-full max-w-2xl">
        <AuthLogo className="mb-6" />

        {mode === "ai" ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-8">
            <SetupChat onProposal={applyProposal} onManual={() => setMode("form")} />
          </div>
        ) : (<>
        {/* Progress bar */}
        {<WizardProgress steps={STEPS} current={step} className="mb-6 md:mb-8" />}

        {/* Kart */}
        <div className="bg-white rounded-2xl border border-slate-200">
          <div className="p-5 md:p-8 lg:p-10">
            {aiApplied && (
              <div className="mb-6 flex items-start gap-3 rounded-2xl bg-forest-50 px-4 py-3 ring-1 ring-forest-100">
                <Sparkles size={18} className="mt-0.5 shrink-0 text-forest-700" />
                <div className="text-sm leading-relaxed text-forest-900">
                  <p className="font-semibold">{teamFound ? "Yapay zekâ bu bilgileri eklediğiniz fotoğrafa göre doldurdu." : "Yapay zekâ bu bilgileri sizin anlattıklarınıza göre doldurdu."}</p>
                  {aiSummary && step === 0 && <p className="mt-1 text-forest-800/80">{aiSummary}</p>}
                  <p className="mt-1 text-forest-800/80">Kontrol edin, istediğinizi değiştirin. Siz onaylayınca kaydedilir.</p>
                </div>
              </div>
            )}
            {!aiApplied && aiEnabled && step === 0 && (
              <button type="button" onClick={() => setMode("ai")} className="mb-6 flex w-full items-center gap-3 rounded-2xl bg-forest-700 px-4 py-3 text-left text-white hover:bg-forest-800">
                <Sparkles size={18} className="shrink-0 text-ember-300" />
                <span className="text-sm"><span className="font-semibold">Yapay zekâ ile kurun.</span> İşletmenizi anlatın, bu adımları asistan doldursun.</span>
              </button>
            )}

            {/* ── Adım 0: Sektör + Şubeler ── */}
            {step === 0 && (
              <WizardStep icon={<Store size={24} />} color="bg-forest-100 text-forest-600"
                title="İşletmenizi Tanıyalım"
                sub="İşletme türünüzü seçin. Vardiyalar, yasal kurallar ve gereken özellikler buna göre hazırlanır.">
                {aiApplied && !typeEdit ? (
                  <p className="text-sm text-slate-600">İşletme türü: <span className="font-semibold text-slate-900">{getIndustry(industry)?.label} · {getVariant(getIndustry(industry)!, variant).label}</span>{" "}
                    <button type="button" onClick={() => setTypeEdit(true)} className="text-sm font-semibold text-forest-700 hover:underline">Değiştir</button></p>
                ) : (
                  <IndustryPicker industry={industry} variant={variant} onChange={pickIndustry} />
                )}

                {/* İsteğe bağlı bölümler: alt türün önerileri, seçilen departman olarak açılır */}
                {[...new Set([...(getVariant(getIndustry(industry)!, variant).departments ?? []), ...pickedDepts])].length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-400">Bölümleriniz <span className="font-normal">(isteğe bağlı; her birine kaç kişi gerektiğini ayrı girersiniz)</span></p>
                    <div className="flex flex-wrap gap-2">
                      {[...new Set([...(getVariant(getIndustry(industry)!, variant).departments ?? []), ...pickedDepts])].map(d => {
                        const on = pickedDepts.includes(d);
                        return (
                          <button key={d} type="button" onClick={() => setPickedDepts(p => on ? p.filter(x => x !== d) : [...p, d])}
                            className={`px-3 min-h-[36px] rounded-full border text-sm font-semibold transition-colors ${on ? "bg-forest-600 border-forest-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                            {on ? "✓ " : ""}{d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!multi ? (
                  <div className="space-y-2.5">
                    {nameEdit || !(branches[0] ?? "").trim() ? (
                      <>
                        <p className="text-xs font-semibold text-slate-400">İşletmenizin adı</p>
                        <input
                          value={branches[0] ?? ""}
                          onChange={e => updateBranch(0, e.target.value)}
                          placeholder="Örn: Kuytu Bar"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-primary transition-colors"
                        />
                      </>
                    ) : (
                      <p className="text-sm text-slate-600">İşletme: <span className="font-semibold text-slate-900">{branches[0]}</span>{" "}
                        <button type="button" onClick={() => setNameEdit(true)} className="text-sm font-semibold text-forest-700 hover:underline">Değiştir</button></p>
                    )}
                    {!freePlan && (
                      <button onClick={() => { setMultiOpen(true); addBranch(); }} className="text-sm font-semibold text-forest-700 hover:underline">
                        Birden çok şubem var
                      </button>
                    )}
                  </div>
                ) : (
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-slate-400">Şubeler (sonradan da eklenebilir)</p>
                  {branches.map((b, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center text-xs font-semibold text-slate-500 shrink-0">
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
                )}
              </WizardStep>
            )}

            {/* ── Adım 1: Vardiya Tanımları ── */}
            {step === 1 && (
              <WizardStep icon={<CalendarClock size={24} />} color="bg-ember-100 text-ember-600"
                title="Vardiya Tanımları"
                sub="İşletme türünüze uygun vardiyalar eklendi. Saatleri kendi işletmenize göre düzenleyin.">
                <div className="space-y-3">
                  {shifts.map((s, i) => (
                    <div key={i} className="flex flex-wrap md:grid md:grid-cols-[1fr_auto_auto] gap-2 items-center bg-slate-50 rounded-xl p-3">
                      <input value={s.name}
                        onChange={e => setShifts(p => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                        placeholder="Vardiya adı"
                        className="w-full md:w-auto text-sm font-bold border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary bg-white" />
                      {/* Başlangıç ve bitiş birlikte kalır (telefonda bitiş alt satıra düşmesin) */}
                      <div className="flex items-center gap-1.5">
                        <TimeInput value={s.start}
                          onChange={v => setShifts(p => p.map((x, j) => j === i ? { ...x, start: v } : x))}
                          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary bg-white" />
                        <span className="text-slate-400 text-xs font-semibold">–</span>
                        <TimeInput value={s.end}
                          onChange={v => setShifts(p => p.map((x, j) => j === i ? { ...x, end: v } : x))}
                          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary bg-white" />
                      </div>
                      <div className="flex items-center gap-1 w-full md:w-auto">
                        {/* Zorluk: Ayarlar'la aynı seçici (components/ui/DifficultyPicker) */}
                        <DifficultyPicker className="flex-1 md:w-56" value={shiftDifficultyPct(s)}
                          onChange={v => setShifts(p => p.map((x, j) => j === i ? { ...x, difficulty_pct: v } : x))} />
                        <button onClick={() => setShifts(p => p.filter((_, j) => j !== i))} aria-label="Vardiyayı kaldır" title="Vardiyayı kaldır"
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                      {/* Mola: Ayarlar'la aynı seçici, çalışma süresine sayılmaz */}
                      <div className="w-full md:col-span-3">
                        <BreakPicker id={`ob-break-${i}`} start={s.start} end={s.end} value={s.break_minutes}
                          onChange={v => setShifts(p => p.map((x, j) => j === i ? { ...x, break_minutes: v } : x))} />
                      </div>
                    </div>
                  ))}
                  {shifts.length < 6 && (
                    <button
                      onClick={() => setShifts(p => [...p, { id: `s${Date.now()}`, name: "", start: "09:00", end: "17:00", base_points: 5, difficulty_pct: 0 }])}
                      className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                      <Plus size={15} /> Vardiya ekle
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Zorluk, vardiyaların adil dağıtılmasında kullanılır. Emin değilseniz olduğu gibi bırakın.
                </p>
              </WizardStep>
            )}

            {/* ── Adım 2: Kaç kişi (yapay zekâ önerisinden) ── */}
            {cur === "demand" && (
              <WizardStep icon={<Users size={24} />} color="bg-forest-100 text-forest-600"
                title="Her gün kaç kişi gerekli?"
                sub="Yapay zekâ anlattıklarınıza göre doldurdu. Plan bu sayılara göre hazırlanır. İstediğiniz kutuyu değiştirin.">
                <div className="space-y-5">
                  {demandKeys.map(dept => (
                    <div key={dept || "_"}>
                      {dept && <p className="mb-2 text-sm font-bold text-slate-800">{dept}</p>}
                      <div className="grid gap-1 text-[13px]" style={{ gridTemplateColumns: "minmax(64px,1.2fr) repeat(7, minmax(0,1fr))" }}>
                        <div />
                        {DAY_SHORT.map((d, i) => <div key={d} className={`text-center font-semibold ${i >= 5 ? "text-ember-600" : "text-slate-400"}`}>{d}</div>)}
                        {shifts.filter(s => s.name.trim()).map(s => (
                          <Fragment key={s.id}>
                            <div className="flex items-center truncate pr-1 font-semibold text-slate-600">{s.name}</div>
                            {demandFor(dept, s.id).map((n, d) => (
                              <input key={d} type="number" inputMode="numeric" min={0} max={50} value={n}
                                aria-label={`${dept ? dept + " " : ""}${s.name} ${DAY_SHORT[d]}`}
                                onChange={e => setDemandCell(dept, s.id, d, Number(e.target.value))}
                                className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white text-center text-[14px] font-semibold text-slate-800 focus:border-primary focus:outline-none" />
                            ))}
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400">Bu tabloyu sonra Vardiya Planı sayfasından da değiştirebilirsiniz.</p>
              </WizardStep>
            )}

            {/* ── Ekibiniz (fotoğraftan okunan) ── */}
            {cur === "team" && (
              <WizardStep icon={<UserPlus size={24} />} color="bg-forest-100 text-forest-600"
                title="Ekibiniz"
                sub="Yapay zekâ bu adları fotoğraftan okudu. Yanlış okunan adı düzeltin, olmayan kişiyi silin. Onaylayınca herkes ekibe eklenir ve giriş bağlantıları hazırlanır.">
                <div className="space-y-2">
                  {team.map((t, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-slate-200 p-2 sm:grid-cols-[1fr_10rem_auto]">
                      <input value={t.name} onChange={e => setTeam(p => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                        aria-label={`${i + 1}. kişinin adı`} placeholder="Ad Soyad" maxLength={60}
                        className="h-11 min-w-0 rounded-lg border border-slate-200 px-3 text-[15px] focus:border-primary focus:outline-none" />
                      {pickedDepts.length > 0 && (
                        <select value={t.department} onChange={e => setTeam(p => p.map((x, j) => (j === i ? { ...x, department: e.target.value } : x)))}
                          aria-label={`${t.name || "Kişi"} departmanı`}
                          className="order-3 col-span-2 h-11 min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-sm sm:order-none sm:col-span-1">
                          <option value="">Departman seçin</option>
                          {pickedDepts.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      )}
                      <button type="button" onClick={() => setTeam(p => p.filter((_, j) => j !== i))} aria-label={`${t.name || "Kişiyi"} sil`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setTeam(p => [...p, { name: "", department: "", phone: "" }])}
                    className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-forest-700 hover:bg-forest-50">
                    <Plus size={16} /> Kişi ekle
                  </button>
                </div>
                <div className="space-y-1 text-xs text-slate-500">
                  <p>Toplam {team.filter(t => t.name.trim().length >= 2).length} kişi. Telefon numaralarını ve haftalık sınırlarını sonra Ekip sayfasından ekleyebilirsiniz.</p>
                  {pickedDepts.length > 0 && team.some(t => t.name.trim() && !t.department) && (
                    <p className="font-semibold text-amber-700">Departmanı seçilmeyen kişiler otomatik plana alınmaz. Ekip sayfasından da seçebilirsiniz.</p>
                  )}
                  {freePlan && team.length > FREE_TEAM_LIMIT && (
                    <p className="font-semibold text-amber-700">Ücretsiz pakette ilk {FREE_TEAM_LIMIT} kişi eklenir. Kalanlar için paketi yükseltebilirsiniz.</p>
                  )}
                </div>
              </WizardStep>
            )}

            {/* Hata */}
            {error && (
              <div className="mt-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 font-medium">
                {error}
              </div>
            )}

            {/* Navigasyon */}
            <WizardNav current={step} total={STEPS.length} busy={saving}
              onBack={() => setStep(s => s - 1)} onNext={next} finishLabel="Onayla ve Başla" />
          </div>
        </div>
        </>)}

        <p className="text-center text-xs text-slate-400 mt-6 font-medium">
          Departman, kural ve diğer tüm detayları istediğiniz zaman Ayarlar sayfasından ekleyebilirsiniz.
        </p>
      </div>
    </div>
  );
}
