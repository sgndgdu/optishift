"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Check, CreditCard, Zap, Shield, AlertCircle, Sparkles } from "lucide-react";
import { Suspense } from "react";

const PLANS = [
  {
    id: "free",
    name: "Başlangıç",
    price: "₺0",
    period: "/ay",
    desc: "Küçük işletmeler için.",
    color: "border-slate-200",
    features: ["1 Şube", "10 Personele kadar", "Temel OR-Tools Optimizasyonu", "E-posta Desteği"],
    cta: "Mevcut Plan",
    dark: false,
  },
  {
    id: "pro",
    name: "Profesyonel",
    price: "₺999",
    period: "/ay",
    desc: "Büyüyen zincirler için sınırsız erişim.",
    color: "border-primary",
    features: ["Sınırsız Şube", "Sınırsız Personel", "Gelişmiş Adalet Motoru", "ERP Entegrasyonu (SAP, Nebim)", "SMS + E-posta Bildirimi", "7/24 Telefon Desteği"],
    cta: "Pro'ya Geç",
    dark: true,
  },
  {
    id: "enterprise",
    name: "Kurumsal",
    price: "Teklif Al",
    period: "",
    desc: "750+ şubeli zincirler için özel SLA.",
    color: "border-slate-300",
    features: ["Tüm Pro özellikleri", "Özel SLA & Uptime Garantisi", "Dedicated Onboarding", "On-Premise Seçeneği"],
    cta: "İletişime Geç",
    dark: false,
  },
];

function BillingContent() {
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [org, setOrg]                 = useState<any>(null);
  const [loading, setLoading]         = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [toast, setToast]             = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  const loadOrg = useCallback(async () => {
    if (!user) return;
    try {
      const r = await fetch(`/api/admin/organizations?id=${user.org_id}`);
      const data = await r.json();
      setOrg(Array.isArray(data) ? data[0] : data);
    } finally { setLoading(false); }
  }, [user]);


  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_manager_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed) setUser(parsed);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { loadOrg(); }, [loadOrg]);

  useEffect(() => {
    if (searchParams.get("success") === "1") showToast("Ödeme başarılı! Planınız güncellendi.");
    if (searchParams.get("cancelled") === "1") showToast("Ödeme iptal edildi.");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCheckout = async (planId: string) => {
    if (planId === "enterprise") {
      window.open("mailto:sales@optishift.io?subject=Kurumsal%20Plan%20Talebi", "_blank");
      return;
    }
    if (planId === "free") return;
    if (planId === currentPlan) return;

    setCheckoutLoading(planId);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: user.org_id, plan: planId }),
      });
      const data = await r.json();

      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else if (data.success) {
        showToast(data.message ?? "Plan güncellendi (demo mod).");
        await loadOrg();
      } else {
        showToast(data.error ?? "Hata oluştu.");
      }
    } finally { setCheckoutLoading(null); }
  };

  if (loading) return <div className="p-8 text-slate-400 text-sm animate-pulse">Yükleniyor…</div>;

  const currentPlan: string = org?.plan ?? "free";
  const isStripeConfigured = true; // server-side; shown from /api/checkout response

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8 md:space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Faturalandırma ve Plan</h1>
        <p className="text-slate-500 mt-2">{org?.name} — abonelik yönetimi</p>
      </div>

      {/* Current plan strip */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 flex items-center gap-3 md:gap-4 shadow-sm flex-wrap">
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white shadow-sm shrink-0">
          <Shield size={20} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mevcut Plan</p>
          <p className="text-lg md:text-xl font-black text-slate-900 flex items-center gap-2">
            {PLANS.find(p => p.id === currentPlan)?.name ?? currentPlan}
            {currentPlan === "pro" && <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Aktif</span>}
          </p>
        </div>
        {!isStripeConfigured && (
          <div className="ml-auto flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs font-bold text-amber-700">
            <AlertCircle size={13} />
            Demo mod — STRIPE_SECRET_KEY yapılandırılmamış
          </div>
        )}
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {PLANS.map(plan => {
          const isCurrent = currentPlan === plan.id;
          return (
            <div
              key={plan.id}
              className={`relative rounded-3xl border-2 p-7 flex flex-col transition-all ${
                plan.dark
                  ? "bg-slate-900 border-primary shadow-xl"
                  : `bg-white ${plan.color} ${isCurrent ? "shadow-md scale-[1.02]" : ""}`
              }`}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-black px-3 py-1 rounded-full shadow">
                  Mevcut Plan
                </div>
              )}
              {plan.dark && (
                <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
                  <div className="absolute -top-16 -right-16 w-48 h-48 bg-primary/30 blur-3xl rounded-full" />
                </div>
              )}

              <div className="relative">
                <p className={`text-sm font-bold mb-1 ${plan.dark ? "text-slate-400" : "text-slate-500"}`}>{plan.name}</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className={`text-3xl font-black ${plan.dark ? "text-white" : "text-slate-900"}`}>{plan.price}</span>
                  {plan.period && <span className={`text-sm ${plan.dark ? "text-slate-400" : "text-slate-500"}`}>{plan.period}</span>}
                </div>
                <p className={`text-xs mb-6 ${plan.dark ? "text-slate-400" : "text-slate-500"}`}>{plan.desc}</p>

                <ul className="space-y-2.5 mb-8">
                  {plan.features.map((f, i) => (
                    <li key={i} className={`flex items-center gap-2.5 text-sm font-medium ${plan.dark ? "text-slate-300" : "text-slate-700"}`}>
                      <Check size={14} className={plan.dark ? "text-emerald-400" : "text-primary"} />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleCheckout(plan.id)}
                  disabled={isCurrent || checkoutLoading === plan.id}
                  className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                    isCurrent
                      ? plan.dark ? "bg-white/10 text-white/50" : "bg-slate-100 text-slate-400"
                      : plan.dark
                        ? "bg-gradient-to-r from-primary to-primary/70 text-white hover:shadow-lg hover:shadow-primary/30"
                        : "border-2 border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {checkoutLoading === plan.id ? (
                    <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  ) : isCurrent ? (
                    "Mevcut Planınız"
                  ) : plan.id === "pro" ? (
                    <><CreditCard size={15} /> {plan.cta}</>
                  ) : plan.id === "enterprise" ? (
                    <><Sparkles size={15} /> {plan.cta}</>
                  ) : plan.cta}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Plan limits info */}
      <div className="bg-slate-50 rounded-2xl p-4 md:p-5 border border-slate-200">
        <h3 className="text-sm font-black text-slate-800 mb-3">Plan Limitleri</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 text-center">
          {[
            { label: "Şube Limiti",    free: "1",        pro: "Sınırsız" },
            { label: "Personel",       free: "10",       pro: "Sınırsız" },
            { label: "ERP Entegrasyon",free: "—",        pro: "✓" },
            { label: "Excel Export",   free: "✓",        pro: "✓" },
          ].map(row => (
            <div key={row.label} className="bg-white rounded-xl p-3 border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{row.label}</p>
              <div className="flex justify-around text-xs font-bold">
                <div><p className="text-slate-400 mb-0.5">Free</p><p className="text-slate-700">{row.free}</p></div>
                <div><p className="text-primary mb-0.5">Pro</p><p className="text-primary">{row.pro}</p></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 md:bottom-8 md:right-8 bg-slate-900 text-white text-xs font-bold px-5 py-3 rounded-2xl shadow-xl z-50 animate-in fade-in slide-in-from-bottom-4 max-w-[calc(100vw-2rem)]">
          {toast}
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400 text-sm">Yükleniyor…</div>}>
      <BillingContent />
    </Suspense>
  );
}
