"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, AtSign, Eye, EyeOff, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { GoogleOneTap } from "@/components/GoogleOneTap";
import { FEATURES } from "@/lib/features";
import { routeAfterLogin as routeAfterLoginShared, type LoginData } from "@/lib/sessionRouting";
import { AuthVisual } from "@/components/marketing/AuthVisual";
import { BRAND } from "@/lib/brand";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  denied: "Google girişi iptal edildi.",
  invalid_request: "Google ile giriş yapılamadı. Tekrar deneyin.",
  invalid_state: "Google girişi için verilen süre doldu. Tekrar deneyin.",
  exchange_failed: "Google ile bağlantı kurulamadı, lütfen tekrar deneyin.",
  account_pending: "Hesabınız henüz onaylanmadı. Sorumlunuz onaylayınca girebilirsiniz.",
  account_rejected: "Hesabınız onaylanmadı. Lütfen sorumlunuzla iletişime geçin.",
  already_linked: "Bu Gmail başka bir hesaba bağlı. Farklı bir Gmail seçin ya da o hesapla giriş yapın.",
  signup_closed: "Bu kayıt bağlantısı kapatılmış. Sorumlunuzdan yeni bir bağlantı isteyin.",
};

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // SessionGuard oturum düşünce ?expired=1 ile yönlendirir. Adres çizimden sonra okunur
  // (ilk çizimde okumak sunucu çizimiyle uyuşmuyor, hydration hatası veriyordu)
  const [sessionExpired, setSessionExpired] = useState(false);
  const [googleError, setGoogleError] = useState("");
  // Bu Gmail'e bağlı hesap yok: hata değil, iki yol gösterilir (çalışan bağlantı ister, sahip işletme açar)
  const [unknownGmail, setUnknownGmail] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect */
    setSessionExpired(params.get("expired") === "1");
    const code = params.get("google_error");
    if (code && code !== "not_found") setGoogleError(GOOGLE_ERROR_MESSAGES[code] ?? "Google ile giriş yapılamadı. Tekrar deneyin.");
    if (code === "not_found") setUnknownGmail(params.get("google_email") ?? "Bu Gmail");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  // Giriş başarılı olduktan sonra doğru panele yönlendirir (şifreli ve Google aynı kural)
  const routeAfterLogin = (data: LoginData) => routeAfterLoginShared(data, router.push);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Giriş yapılamadı. Bilgilerinizi kontrol edip tekrar deneyin.");
        setLoading(false);
        return;
      }

      routeAfterLogin(data);
    } catch {
      setError("Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sol: form */}
      <div className="w-full lg:w-[52%] flex flex-col bg-white">
        <header className="flex items-center justify-between px-5 pt-5 sm:px-8 lg:px-12 lg:pt-10">
          <Link href="/" className="flex items-center gap-2.5 text-slate-900 font-bold tracking-tight hover:text-forest-700 transition-colors">
            <Logo size="sm" />
            {BRAND.name}
          </Link>
          <p className="text-sm text-slate-500">
            <span className="hidden sm:inline">Hesabınız yok mu? </span>
            <Link href="/register" className="font-semibold text-forest-700 hover:text-forest-800 transition-colors">14 gün ücretsiz deneyin</Link>
          </p>
        </header>

        <main className="flex-1 flex items-start justify-center px-5 pt-10 pb-12 sm:px-8 lg:items-center lg:py-10">
          <div className="w-full max-w-[400px]">
  
            <div className="mb-8">
              <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-tight">Giriş yapın</h1>
            </div>

            {FEATURES.googleAuth && !unknownGmail && <GoogleOneTap />}

            {unknownGmail && (
              <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 space-y-3">
                <p><span className="font-semibold text-slate-900">{unknownGmail}</span> hiçbir hesaba bağlı değil.</p>
                <p><span className="font-semibold text-slate-800">Bir işletmede çalışıyorsanız:</span> sorumlunuzdan giriş bağlantısı isteyin. Bağlantıyı açıp &quot;Google ile devam et&quot;e basınca bu Gmail hesabınıza bağlanır.</p>
                <p><span className="font-semibold text-slate-800">İşletme sahibiyseniz:</span> bu Gmail ile yeni işletme hesabı açabilirsiniz.</p>
                <a href="/api/auth/google/start?intent=register" className="block text-center w-full py-3 rounded-2xl bg-forest-700 hover:bg-forest-800 text-white font-semibold transition-colors">
                  Yeni işletme aç
                </a>
              </div>
            )}

            {(sessionExpired && !error) && (
              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                Oturumunuz kapandı. Tekrar giriş yapın.
              </div>
            )}
            {(error || googleError) && (
              <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error || googleError}
              </div>
            )}

            {FEATURES.googleAuth && (
              <>
                <GoogleAuthButton intent="login" label="Google ile devam et" />
                <div className="my-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-medium text-slate-400">veya bilgilerinizle</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
              </>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label htmlFor="login-id" className="mb-2 block text-sm font-semibold text-slate-700">Telefon, e-posta veya kullanıcı adı</label>
                <div className="relative">
                  <AtSign size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="login-id"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="0555 123 45 67"
                    required
                    autoComplete="username"
                    className="w-full pl-12 pr-4 py-3.5 bg-white border-2 border-slate-200 rounded-2xl text-slate-900 font-medium focus:outline-none focus:border-forest-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="login-password" className="text-sm font-semibold text-slate-700">Şifre</label>
                  <Link href="/forgot-password" className="text-sm font-medium text-forest-700 hover:text-forest-800 transition-colors">
                    Şifremi unuttum
                  </Link>
                </div>
                <div className="relative">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Şifreniz"
                    required
                    autoComplete="current-password"
                    className="w-full pl-12 pr-12 py-3.5 bg-white border-2 border-slate-200 rounded-2xl text-slate-900 font-medium focus:outline-none focus:border-forest-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-forest-700 hover:bg-forest-800 active:bg-forest-900 disabled:opacity-60 text-white font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-colors group"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Giriş yap <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" /></>
                )}
              </button>
            </form>

          </div>
        </main>

        <footer className="hidden lg:flex items-center justify-between px-12 pb-8 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} {BRAND.name}</span>
          <span>Bağlantınız şifrelidir</span>
        </footer>
      </div>

      <AuthVisual variant="login" />
    </div>
  );
}

