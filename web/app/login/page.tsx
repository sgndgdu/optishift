"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, AtSign, Eye, EyeOff, Zap, ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  denied: "Google girişi iptal edildi.",
  invalid_request: "Google girişi başarısız oldu, lütfen tekrar deneyin.",
  invalid_state: "Oturum süresi doldu, lütfen tekrar deneyin.",
  exchange_failed: "Google ile bağlantı kurulamadı, lütfen tekrar deneyin.",
  account_pending: "Hesabınız henüz onaylanmadı. Lütfen yöneticinizle iletişime geçin.",
  account_rejected: "Hesabınız reddedildi. Lütfen yöneticinizle iletişime geçin.",
};

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // SessionGuard oturum düşünce ?expired=1 ile yönlendirir
  const [sessionExpired] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("expired") === "1"
  );
  const [googleError] = useState(() => {
    if (typeof window === "undefined") return "";
    const code = new URLSearchParams(window.location.search).get("google_error");
    return code ? (GOOGLE_ERROR_MESSAGES[code] ?? "Google girişi başarısız oldu.") : "";
  });

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
        setError(data.error ?? "Giriş başarısız");
        setLoading(false);
        return;
      }

      // İlk giriş: şifre belirleme sayfasına yönlendir
      if (data.is_temp_password) {
        localStorage.setItem("optishift_setup_user", JSON.stringify(data));
        router.push("/setup");
        return;
      }

      if (data.role === "supervisor" || (data.role === "admin" && !data.location_id)) {
        localStorage.removeItem("optishift_portal_user");
        localStorage.removeItem("optishift_manager_user");
        localStorage.setItem("optishift_supervisor_user", JSON.stringify(data));
        router.push("/supervisor");
      } else if (data.role === "manager" || data.role === "admin") {
        localStorage.removeItem("optishift_portal_user");
        localStorage.removeItem("optishift_supervisor_user");
        localStorage.setItem("optishift_manager_user", JSON.stringify(data));
        router.push("/dashboard");
      } else {
        localStorage.removeItem("optishift_manager_user");
        localStorage.removeItem("optishift_supervisor_user");
        localStorage.setItem("optishift_portal_user", JSON.stringify(data));
        router.push("/portal");
      }
    } catch {
      setError("Sunucuya bağlanılamadı. Lütfen tekrar deneyin.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sol — Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 lg:p-12 bg-slate-50 relative">
        <div className="absolute top-4 sm:top-6 left-4 sm:left-6">
          <Link href="/" className="flex items-center gap-2 text-slate-900 font-bold hover:text-indigo-600 transition-colors text-sm sm:text-base">
            <Zap size={18} className="text-indigo-600" />
            OptiShift
          </Link>
        </div>

        <div className="w-full max-w-[400px] mt-10 sm:mt-12 lg:mt-0">
          <div className="mb-8 sm:mb-10 text-center lg:text-left">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mb-2 tracking-tight">Tekrar Hoş Geldiniz</h1>
            <p className="text-slate-500 font-medium text-sm sm:text-base">Hesabınızla giriş yapın — doğru panele otomatik yönlendirilirsiniz.</p>
          </div>

          <div className="space-y-5 mb-5">
            <GoogleAuthButton intent="login" label="Google ile Giriş Yap" />
            <div className="flex items-center gap-3">
              <div className="h-px bg-slate-200 flex-1" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">veya</span>
              <div className="h-px bg-slate-200 flex-1" />
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {sessionExpired && !error && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-amber-700 font-medium flex items-center gap-3">
                <div className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0" />
                Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.
              </div>
            )}
            {(error || googleError) && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600 font-medium flex items-center gap-3">
                <div className="w-1.5 h-1.5 bg-red-600 rounded-full shrink-0" />
                {error || googleError}
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">Kullanıcı Adı veya E-Posta</label>
              <div className="relative">
                <AtSign size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="kullanici.adi veya ad@sirket.com"
                  required
                  autoComplete="username"
                  className="w-full pl-12 pr-4 py-3.5 bg-white border-2 border-slate-200 rounded-2xl text-slate-900 font-medium focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Şifre</label>
                <Link href="/forgot-password" className="text-xs text-indigo-600 font-semibold hover:text-indigo-700 transition-colors">
                  Şifremi Unuttum
                </Link>
              </div>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-12 pr-12 py-3.5 bg-white border-2 border-slate-200 rounded-2xl text-slate-900 font-medium focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-indigo-400 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-indigo-200 mt-4 group"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Giriş Yap <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>
              )}
            </button>

            <p className="text-center text-sm text-slate-500 pt-6 font-medium">
              Hesabınız yok mu?{" "}
              <Link href="/register" className="text-indigo-600 font-bold hover:text-indigo-700 transition-colors">
                Kayıt Ol
              </Link>
            </p>
          </form>
        </div>
      </div>

      {/* Sağ — Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-950 relative flex-col justify-center items-center p-12 overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/30 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-600/20 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 max-w-md text-center">
          <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-center mx-auto mb-8 backdrop-blur-sm">
            <ShieldCheck size={40} className="text-indigo-400" />
          </div>
          <h2 className="text-3xl font-black text-white mb-4 leading-tight">
            Herkese Tek Kapı
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed">
            Personel, müdür ya da süpervizör — tek giriş sayfası, otomatik yönlendirme.
            Rol ne ise o portal açılır.
          </p>
        </div>
      </div>
    </div>
  );
}
