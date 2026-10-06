"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, EyeOff, Gift, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { FEATURES } from "@/lib/features";
import { Logo } from "@/components/Logo";
import { AuthVisual } from "@/components/marketing/AuthVisual";
import { BRAND } from "@/lib/brand";


/** Kampanya kodu alanı şimdilik kapalı (2026-10-06 kullanıcı kararı). Açmak için true yap. */
const PROMO_CODES_ENABLED = false;
export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [registeredUser, setRegisteredUser] = useState<Record<string, unknown> | null>(null);
  const [promoResult, setPromoResult] = useState<{ applied: boolean; trial_ends_at: number | null } | null>(null);

  // Reklam kampanyası linki (?ref=KOD) kampanya kodu alanını otomatik doldurur.
  const [initialPromo] = useState(() => {
    if (typeof window === "undefined") return "";
    if (!PROMO_CODES_ENABLED) return "";
    return new URLSearchParams(window.location.search).get("ref") ?? "";
  });

  const [form, setForm] = useState({ org_name: "", owner_name: "", username: "", email: "", password: "", promo_code: initialPromo });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Alan sadece ?ref= linkinden gelenlerde otomatik açık — organik kayıtta
  // formu uzatmasın; isteyen "Kampanya kodun var mı?" ile elle açabilir.
  const [showPromoField, setShowPromoField] = useState(!!initialPromo);

  // Kod yazılırken/otomatik dolarken canlı doğrulama — submit'e kadar beklemeden geçerliliği gösterir.
  const [promoCheck, setPromoCheck] = useState<{ status: "idle" | "checking" | "valid" | "invalid"; freeMonths?: number }>({ status: "idle" });
  useEffect(() => {
    const code = form.promo_code.trim();
    if (!code) { setPromoCheck({ status: "idle" }); return; }
    setPromoCheck({ status: "checking" });
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/promo/validate?code=${encodeURIComponent(code)}`);
        const d = await r.json();
        setPromoCheck(d.valid ? { status: "valid", freeMonths: d.free_months } : { status: "invalid" });
      } catch {
        setPromoCheck({ status: "invalid" });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [form.promo_code]);

  // Google ile "yeni işletme kur" akışı: callback bu üç query param'ı ile geri döner.
  const [googlePending] = useState(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("google_pending");
    if (!token) return null;
    return {
      token,
      name: params.get("google_name") ?? "",
      email: params.get("google_email") ?? "",
    };
  });
  const [googleForm, setGoogleForm] = useState({ org_name: "" });

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.org_name || !form.owner_name || !form.email || !form.password) {
      setError("Eksik alanları doldurun.");
      return;
    }
    if (form.password.length < 6) {
      setError("Şifre en az 6 karakterden oluşmalıdır.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        setLoading(false);
        return;
      }
      setPromoResult({ applied: !!data.promo_applied, trial_ends_at: data.trial_ends_at ?? null });
      setRegisteredUser(data.user);
    } catch {
      setError("Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.");
    }
    setLoading(false);
  };

  const handleGoogleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!googlePending) return;

    if (!googleForm.org_name.trim()) {
      setError("İşletmenizin adını yazın.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/google/complete-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pending_token: googlePending.token,
          org_name: googleForm.org_name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        setLoading(false);
        return;
      }
      setForm((f) => ({ ...f, org_name: googleForm.org_name }));
      setRegisteredUser(data.user);
    } catch {
      setError("Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.");
    }
    setLoading(false);
  };

  const handleStart = () => {
    if (!registeredUser) return;
    localStorage.setItem("optishift_supervisor_user", JSON.stringify(registeredUser));
    router.push("/onboarding");
  };

  return (
    <div className="min-h-screen bg-white flex">
      <div className="w-full lg:w-[52%] flex flex-col bg-white">
        <header className="flex items-center justify-between px-5 pt-5 sm:px-8 lg:px-12 lg:pt-10">
          <Link href="/" className="flex items-center gap-2.5 text-slate-900 font-bold tracking-tight hover:text-forest-700 transition-colors">
            <Logo size="sm" />
            {BRAND.name}
          </Link>
          <p className="text-sm text-slate-500">
            <span className="hidden sm:inline">Hesabınız var mı? </span>
            <Link href="/login" className="font-semibold text-forest-700 hover:text-forest-800 transition-colors">Giriş yapın</Link>
          </p>
        </header>

        <main className="flex-1 flex items-start justify-center px-5 pt-10 pb-12 sm:px-8 lg:items-center lg:py-10">
        <div className="w-full max-w-[420px]">

          {!registeredUser && googlePending ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-8">
                <h1 className="text-[28px] font-bold text-slate-900 mb-2 tracking-tight leading-tight">Son bir adım</h1>
                <p className="text-slate-500 font-medium text-sm sm:text-base">
                  <strong>{googlePending.name}</strong> ({googlePending.email}) ile devam ediyorsunuz. Son olarak işletmenizin adını yazın.
                </p>
                <p className="mt-3 text-xs sm:text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  {BRAND.name}&apos;e kayıtlı bir işletmede çalışıyorsanız, sorumlunuzdan giriş bağlantısı isteyin ve bağlantıda &quot;Google ile devam et&quot;e basın.
                </p>
              </div>

              {error && (
                <div className="mb-6 bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600 font-medium flex items-center gap-3">
                  <div className="w-1.5 h-1.5 bg-red-600 rounded-full shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleGoogleRegister} className="space-y-5">
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                    İşletme adı
                  </label>
                  <input
                    value={googleForm.org_name}
                    onChange={(e) => setGoogleForm((f) => ({ ...f, org_name: e.target.value }))}
                    placeholder="Örn. Moda Kahve"
                    className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-medium bg-white focus:outline-none focus:border-forest-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-forest-700 hover:bg-forest-800 active:bg-forest-900 disabled:opacity-60 text-white font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-colors mt-2 group"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>Hesabı oluştur <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" /></>
                  )}
                </button>
              </form>
            </div>
          ) : !registeredUser ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-8">
                <h1 className="text-[28px] font-bold text-slate-900 mb-2 tracking-tight leading-tight">Ücretsiz hesap açın</h1>
                <p className="text-[15px] text-slate-500">Kredi kartı gerekmez. Tek bir şube ve toplam 10 kullanıcıya kadar, sonsuza dek ücretsiz.</p>
              </div>

              {FEATURES.googleAuth && (
                <div className="space-y-6 mb-6">
                  <GoogleAuthButton intent="register" label="Google ile devam et" />
                  <div className="flex items-center gap-3">
                    <div className="h-px bg-slate-200 flex-1" />
                    <span className="text-xs font-medium text-slate-400">veya e-posta ile</span>
                    <div className="h-px bg-slate-200 flex-1" />
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-6 bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600 font-medium flex items-center gap-3">
                  <div className="w-1.5 h-1.5 bg-red-600 rounded-full shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-5">
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                    İşletme adı
                  </label>
                  <input
                    value={form.org_name}
                    onChange={(e) => set("org_name", e.target.value)}
                    placeholder="Örn. Moda Kahve"
                    className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-medium bg-white focus:outline-none focus:border-forest-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                    Adınız soyadınız
                  </label>
                  <input
                    value={form.owner_name}
                    onChange={(e) => set("owner_name", e.target.value)}
                    placeholder="Ahmet Yılmaz"
                    className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-medium bg-white focus:outline-none focus:border-forest-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-2 block">E-posta</label>
                  {/* Kullanıcı adı ayrıca sorulmaz: giriş e-postayla yapılır, kullanıcı adı sunucuda türetilir */}
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="ahmet@gmail.com"
                    className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-medium bg-white focus:outline-none focus:border-forest-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-2 block">Şifre</label>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => set("password", e.target.value)}
                      placeholder="En az 6 karakter"
                      className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 pr-12 text-slate-900 font-medium bg-white focus:outline-none focus:border-forest-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPass ? <Eye size={18} /> : <EyeOff size={18} />}
                    </button>
                  </div>
                </div>

                {PROMO_CODES_ENABLED && (showPromoField ? (
                  <div>
                    <label className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                      <Gift size={14} className="text-ember-500" />
                      Kampanya kodu <span className="text-slate-400 normal-case font-medium">(isteğe bağlı)</span>
                    </label>
                    <div className="relative">
                      <input
                        value={form.promo_code}
                        onChange={(e) => set("promo_code", e.target.value.toUpperCase())}
                        placeholder="Örn: OPTI3AY"
                        autoFocus={!initialPromo}
                        className={`w-full border-2 rounded-2xl px-4 py-3.5 pr-11 text-slate-900 font-bold font-mono bg-white focus:outline-none transition-colors placeholder:text-slate-400 placeholder:font-normal placeholder:normal-case ${
                          promoCheck.status === "valid"
                            ? "border-emerald-400 focus:border-emerald-500"
                            : promoCheck.status === "invalid"
                              ? "border-red-300 focus:border-red-400"
                              : "border-slate-200 focus:border-ember-500"
                        }`}
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        {promoCheck.status === "checking" && <Loader2 size={18} className="text-slate-400 animate-spin" />}
                        {promoCheck.status === "valid" && <Check size={18} className="text-emerald-500" />}
                        {promoCheck.status === "invalid" && <XCircle size={18} className="text-red-400" />}
                      </div>
                    </div>
                    {promoCheck.status === "valid" && (
                      <p className="text-xs font-bold text-emerald-600 mt-1.5 flex items-center gap-1">
                        <Check size={12} /> Kod geçerli, {promoCheck.freeMonths} ay ücretsiz Pro paket!
                      </p>
                    )}
                    {promoCheck.status === "invalid" && (
                      <p className="text-xs font-bold text-red-500 mt-1.5">Bu kod geçersiz veya süresi dolmuş.</p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPromoField(true)}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-ember-600 transition-colors"
                  >
                    <Gift size={13} /> Kampanya kodunuz var mı?
                  </button>
                ))}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-forest-700 hover:bg-forest-800 active:bg-forest-900 disabled:opacity-60 text-white font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-colors mt-2 group"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>Hesabı oluştur <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" /></>
                  )}
                </button>

                <p className="text-center text-xs text-slate-400 leading-relaxed">
                  Hesap oluşturarak{" "}
                  <Link href="/kullanim-sartlari" className="underline hover:text-slate-600">Kullanım Şartları</Link>
                  {"'nı ve "}
                  <Link href="/gizlilik" className="underline hover:text-slate-600">Gizlilik Politikası</Link>
                  {"'nı kabul etmiş olursunuz."}
                </p>
              </form>

            </div>
          ) : (
            <div className="animate-in zoom-in duration-500 text-center space-y-6">
              <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center">
                  <Check size={32} className="text-white" />
                </div>
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Hesabınız hazır</h2>
                <p className="text-slate-500 mt-3 font-medium leading-relaxed">
                  Şimdi işletme türünüzü seçin, vardiyalar hazır gelsin. Dilerseniz vardiyalarınızı özelleştirebilir, yeni vardiyalar ekleyebilirsiniz.
                </p>
              </div>
              {promoResult?.applied && (
                <div className="bg-ember-50 border border-ember-200 rounded-2xl p-4 flex items-center gap-3 text-left">
                  <Gift size={20} className="text-ember-600 shrink-0" />
                  <p className="text-sm text-ember-800 font-bold">
                    Kampanya kodu uygulandı, Profesyonel plan{" "}
                    {promoResult.trial_ends_at
                      ? new Date(promoResult.trial_ends_at * 1000).toLocaleDateString("tr-TR")
                      : ""}{" "}
                    tarihine kadar ücretsiz.
                  </p>
                </div>
              )}
              <div className="pt-2">
                <button
                  onClick={handleStart}
                  className="w-full bg-forest-700 hover:bg-forest-800 text-white font-semibold py-3.5 rounded-2xl transition-colors flex items-center justify-center gap-2 group"
                >
                  Kuruluma başla <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          )}
        </div>
        </main>

        <footer className="hidden lg:flex items-center justify-between px-12 pb-8 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} {BRAND.name}</span>
          <span>Bağlantınız şifrelidir</span>
        </footer>
      </div>

      <AuthVisual variant="register" />
    </div>
  );
}
