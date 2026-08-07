"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, EyeOff, Store, User, AtSign, Gift, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { FEATURES } from "@/lib/features";
import { Logo } from "@/components/Logo";

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
  const [googleForm, setGoogleForm] = useState({ org_name: "", username: "" });

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.org_name || !form.owner_name || !form.username || !form.email || !form.password) {
      setError("Lütfen tüm alanları doldurun.");
      return;
    }
    if (form.password.length < 6) {
      setError("Şifreniz en az 6 karakter olmalıdır.");
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
      setError("Sunucuya bağlanılamadı. Lütfen tekrar deneyin.");
    }
    setLoading(false);
  };

  const handleGoogleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!googlePending) return;

    if (!googleForm.org_name.trim() || !googleForm.username.trim()) {
      setError("Lütfen tüm alanları doldurun.");
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
          username: googleForm.username,
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
      setError("Sunucuya bağlanılamadı. Lütfen tekrar deneyin.");
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
      {/* Sol — Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-950 relative flex-col justify-between p-12 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-forest-600/30 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-ember-600/20 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 flex items-center gap-3">
          <Logo size="md" className="w-10 h-10" />
          <span className="text-xl font-bold tracking-tight text-white">OptiShift</span>
        </div>

        <div className="relative z-10 max-w-lg mt-20">
          <h2 className="font-serif text-4xl md:text-5xl font-semibold text-white mb-6 leading-tight">
            Tüm şubelerinizi<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-forest-400 to-ember-400">tek ekrandan</span> yönetin.
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed mb-8">
            1 cafe veya 50 şube — fark etmez. OptiShift&apos;in adil vardiya dağıtımı her ölçekte çalışır.
          </p>
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
              <div className="text-lg font-black text-white mb-1">Hazır Şablonlar</div>
              <div className="text-sm text-slate-400 font-medium">Sektörünüze göre gelir</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
              <div className="text-lg font-black text-white mb-1">Adil Dağıtım</div>
              <div className="text-sm text-slate-400 font-medium">Otomatik hesaplanır</div>
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-4 text-slate-500 text-sm font-medium">
            <span>© 2026 OptiShift</span>
            <span>·</span>
            <span>Tüm hakları saklıdır.</span>
          </div>
        </div>
      </div>

      {/* Sağ — Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 lg:p-12 bg-slate-50">
        <div className="w-full max-w-[440px]">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-10">
            <Logo size="md" className="w-10 h-10" />
            <span className="text-xl font-bold tracking-tight text-slate-900">OptiShift</span>
          </div>

          {!registeredUser && googlePending ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-6 sm:mb-8">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mb-2 tracking-tight">Son Bir Adım</h1>
                <p className="text-slate-500 font-medium text-sm sm:text-base">
                  <strong>{googlePending.name}</strong> ({googlePending.email}) ile devam ediyorsunuz — işletmenizin adını ve bir kullanıcı adı belirleyin.
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
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Store size={14} className="text-forest-500" />
                    İşletme Adı
                  </label>
                  <input
                    value={googleForm.org_name}
                    onChange={(e) => setGoogleForm((f) => ({ ...f, org_name: e.target.value }))}
                    placeholder="Örn: Cup & Go Cafe"
                    className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-medium bg-white focus:outline-none focus:border-forest-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AtSign size={14} className="text-forest-500" />
                    Kullanıcı Adı
                  </label>
                  <input
                    value={googleForm.username}
                    onChange={(e) => setGoogleForm((f) => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "") }))}
                    placeholder="ahmet.yilmaz"
                    className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-medium font-mono bg-white focus:outline-none focus:border-forest-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5">Giriş yaparken kullanacaksınız (Google ile de giriş yapabilirsiniz). Sadece harf, rakam, nokta ve tire.</p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-slate-950 hover:bg-black active:bg-slate-900 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-slate-200 mt-4 group"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>Hesabı Oluştur <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>
                  )}
                </button>
              </form>
            </div>
          ) : !registeredUser ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-6 sm:mb-8">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mb-2 tracking-tight">Ücretsiz Hesap Oluştur</h1>
                <p className="text-slate-500 font-medium text-sm sm:text-base">İşletmenizi 1 dakikadan kısa sürede sisteme kaydedin.</p>
              </div>

              {FEATURES.googleAuth && (
                <div className="space-y-5 mb-5">
                  <GoogleAuthButton intent="register" label="Google ile Kaydol" />
                  <div className="flex items-center gap-3">
                    <div className="h-px bg-slate-200 flex-1" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">veya</span>
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
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Store size={14} className="text-forest-500" />
                    İşletme Adı
                  </label>
                  <input
                    value={form.org_name}
                    onChange={(e) => set("org_name", e.target.value)}
                    placeholder="Örn: Cup & Go Cafe"
                    className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-medium bg-white focus:outline-none focus:border-forest-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <User size={14} className="text-forest-500" />
                    Adınız Soyadınız
                  </label>
                  <input
                    value={form.owner_name}
                    onChange={(e) => set("owner_name", e.target.value)}
                    placeholder="Ahmet Yılmaz"
                    className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-medium bg-white focus:outline-none focus:border-forest-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AtSign size={14} className="text-forest-500" />
                    Kullanıcı Adı
                  </label>
                  <input
                    value={form.username}
                    onChange={(e) => set("username", e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                    placeholder="ahmet.yilmaz"
                    className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-medium font-mono bg-white focus:outline-none focus:border-forest-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5">Giriş yaparken kullanacaksınız. Sadece harf, rakam, nokta ve tire.</p>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">E-posta Adresi</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="ahmet@gmail.com"
                    className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-medium bg-white focus:outline-none focus:border-forest-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">Şifre</label>
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

                {showPromoField ? (
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Gift size={14} className="text-ember-500" />
                      Kampanya Kodu <span className="text-slate-400 normal-case font-medium">(opsiyonel)</span>
                    </label>
                    <div className="relative">
                      <input
                        value={form.promo_code}
                        onChange={(e) => set("promo_code", e.target.value.toUpperCase())}
                        placeholder="Örn: OPTI3AY"
                        autoFocus={!initialPromo}
                        className={`w-full border-2 rounded-2xl px-4 py-3.5 pr-11 text-slate-900 font-bold font-mono uppercase tracking-wider bg-white focus:outline-none transition-colors placeholder:text-slate-400 placeholder:font-normal placeholder:normal-case ${
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
                        <Check size={12} /> Kod geçerli — {promoCheck.freeMonths} ay ücretsiz Profesyonel plan!
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
                    <Gift size={13} /> Kampanya kodun var mı?
                  </button>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-slate-950 hover:bg-black active:bg-slate-900 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-slate-200 mt-4 group"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>Hesabı Oluştur <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>
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

              <p className="text-center text-sm text-slate-500 mt-8 font-medium">
                Zaten hesabın var mı?{" "}
                <Link href="/login" className="text-forest-600 font-bold hover:text-forest-700 transition-colors">
                  Giriş Yap
                </Link>
              </p>
            </div>
          ) : (
            <div className="animate-in zoom-in duration-500 text-center space-y-6">
              <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center">
                  <Check size={32} className="text-white" />
                </div>
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Hesabınız Oluşturuldu!</h2>
                <p className="text-slate-500 mt-3 font-medium leading-relaxed">
                  <strong>{form.org_name}</strong> hazır. Şimdi şubelerinizi ve departmanlarınızı kuralım.
                </p>
              </div>
              {promoResult?.applied && (
                <div className="bg-ember-50 border border-ember-200 rounded-2xl p-4 flex items-center gap-3 text-left">
                  <Gift size={20} className="text-ember-600 shrink-0" />
                  <p className="text-sm text-ember-800 font-bold">
                    Kampanya kodu uygulandı — Profesyonel plan{" "}
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
                  className="w-full bg-forest-600 hover:bg-forest-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-forest-200 transition-all flex items-center justify-center gap-2 group"
                >
                  Kuruluma Başla <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
