"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Check, CreditCard, Shield, AlertCircle, Sparkles } from "lucide-react";
import { Suspense } from "react";
import { FEATURES } from "@/lib/features";
import FeatureDisabled from "@/components/FeatureDisabled";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { PLANS, SALES_EMAIL, getPlan, type PlanId } from "@/lib/plans";

// Ad, fiyat ve sınırlar lib/plans'tan (tek kaynak); burada sadece görünüm
const PLAN_STYLE: Record<PlanId, { color: string; dark: boolean; cta: string }> = {
  free:       { color: "border-slate-200", dark: false, cta: "" },
  pro:        { color: "border-primary",   dark: true,  cta: "Pro'ya Geç" },
  enterprise: { color: "border-slate-300", dark: false, cta: "İletişime Geç" },
};
const PLAN_CARDS = PLANS.map(p => ({ ...p, ...PLAN_STYLE[p.id] }));

function BillingContent() {
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [org, setOrg]                 = useState<any>(null);
  const [loading, setLoading]         = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [toast, setToast]             = useState("");
  const [stripeConfigured, setStripeConfigured] = useState(true);

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
    fetch("/api/checkout")
      .then((r) => r.json())
      .then((d) => setStripeConfigured(!!d.configured))
      .catch(() => setStripeConfigured(false));
  }, []);

  useEffect(() => {
    if (searchParams.get("success") === "1") showToast("Ödeme başarılı! Planınız güncellendi.");
    if (searchParams.get("cancelled") === "1") showToast("Ödeme iptal edildi.");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCheckout = async (planId: string) => {
    if (planId === "enterprise") {
      window.open(`mailto:${SALES_EMAIL}?subject=Kurumsal%20Paket%20Talebi`, "_blank");
      return;
    }
    if (planId === "free") return;
    if (planId === currentPlan) return;
    if (!stripeConfigured) {
      window.open(`mailto:${SALES_EMAIL}?subject=Pro%20Paket%20Talebi`, "_blank");
      return;
    }

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
      } else {
        showToast(data.error ?? "Hata oluştu.");
      }
    } finally { setCheckoutLoading(null); }
  };

  if (loading) return <div className="p-8 text-slate-400 text-sm animate-pulse">Yükleniyor…</div>;

  const currentPlan: string = org?.plan ?? "free";
  const isStripeConfigured = stripeConfigured;

  return (
    <Page>
      {/* Header */}
      <PageHeader title="Faturalandırma ve Plan" description={`${org?.name ?? ""} · abonelik yönetimi`} />

      {/* Current plan strip */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 flex items-center gap-3 md:gap-4 shadow-sm flex-wrap">
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white shadow-sm shrink-0">
          <Shield size={20} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-400">Mevcut Plan</p>
          <p className="text-lg md:text-xl font-bold text-slate-900 flex items-center gap-2">
            {getPlan(currentPlan).name}
            {currentPlan === "pro" && <StatusPill tone="positive">Aktif</StatusPill>}
          </p>
        </div>
        {!isStripeConfigured && (
          <div className="ml-auto flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs font-bold text-amber-700">
            <AlertCircle size={13} />
            Online ödeme yakında. Paket yükseltmek için bize e-postayla yazın.
          </div>
        )}
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {PLAN_CARDS.map(plan => {
          const isCurrent = currentPlan === plan.id;
          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl border-2 p-7 flex flex-col transition-all ${
                plan.dark
                  ? "bg-slate-900 border-primary shadow-xl"
                  : `bg-white ${plan.color} ${isCurrent ? "shadow-md scale-[1.02]" : ""}`
              }`}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-bold px-3 py-1 rounded-full shadow">
                  Mevcut Plan
                </div>
              )}
              {plan.dark && (
                <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                  <div className="absolute -top-16 -right-16 w-48 h-48 bg-primary/30 blur-3xl rounded-full" />
                </div>
              )}

              <div className="relative">
                <p className={`text-sm font-bold mb-1 ${plan.dark ? "text-slate-400" : "text-slate-500"}`}>{plan.name}</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className={`text-3xl font-bold ${plan.dark ? "text-white" : "text-slate-900"}`}>{plan.price}</span>
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

                {/* Mevcut pakette üstteki rozet yeter; ücretsize geçiş düğmesi yok (paket düşürme destekle) */}
                {!isCurrent && plan.id !== "free" && (
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
                    <><CreditCard size={15} /> {stripeConfigured ? plan.cta : "E-postayla İste"}</>
                  ) : plan.id === "enterprise" ? (
                    <><Sparkles size={15} /> {plan.cta}</>
                  ) : plan.cta}
                </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 right-4 lg:bottom-8 md:right-8 bg-slate-900 text-white text-xs font-bold px-5 py-3 rounded-2xl shadow-xl z-50 animate-in fade-in slide-in-from-bottom-4 max-w-[calc(100vw-2rem)]">
          {toast}
        </div>
      )}
    </Page>
  );
}

export default function BillingPage() {
  if (!FEATURES.billing) return <FeatureDisabled title="Faturalandırma" />;
  return (
    <Suspense fallback={<div className="p-8 text-slate-400 text-sm">Yükleniyor…</div>}>
      <BillingContent />
    </Suspense>
  );
}
