"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, AtSign, Eye, EyeOff, ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { GoogleOneTap } from "@/components/GoogleOneTap";
import { FEATURES } from "@/lib/features";
import { routeAfterLogin as routeAfterLoginShared, type LoginData } from "@/lib/sessionRouting";
import { AuthLogo } from "@/components/AuthLogo";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  denied: "Google girişi iptal edildi.",
  invalid_request: "Google girişi başarısız oldu, lütfen tekrar deneyin.",
  invalid_state: "Oturum süresi doldu, lütfen tekrar deneyin.",
  exchange_failed: "Google ile bağlantı kurulamadı, lütfen tekrar deneyin.",
  account_pending: "Hesabınız henüz onaylanmadı. Lütfen sorumlunuzla iletişime geçin.",
  account_rejected: "Hesabınız reddedildi. Lütfen sorumlunuzla iletişime geçin.",
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
  // SessionGuard oturum düşünce ?expired=1 ile yönlendirir
  const [sessionExpired] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("expired") === "1"
  );
  const [googleError] = useState(() => {
    if (typeof window === "undefined") return "";
    const code = new URLSearchParams(window.location.search).get("google_error");
    if (!code || code === "not_found") return "";
    return GOOGLE_ERROR_MESSAGES[code] ?? "Google girişi başarısız oldu.";
  });
  // Bu Gmail'e bağlı hesap yok: hata değil, iki yol gösterilir (çalışan bağlantı ister, sahip işletme açar)
  const [unknownGmail] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("google_error") === "not_found" ? (params.get("google_email") ?? "Bu Gmail") : "";
  });
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
        setError(data.error ?? "Giriş başarısız");
        setLoading(false);
        return;
      }

      routeAfterLogin(data);
    } catch {
      setError("Sunucuya bağlanılamadı. Lütfen tekrar deneyin.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sol: form */}
      <div className="w-full lg:w-[52%] flex flex-col bg-white">
        <header className="hidden lg:flex items-center justify-between px-12 pt-10">
          <Link href="/" className="flex items-center gap-2.5 text-slate-900 font-bold tracking-tight hover:text-forest-700 transition-colors">
            <Logo size="sm" />
            OptiShift
          </Link>
          <p className="text-sm text-slate-500">
            Hesabınız yok mu?{" "}
            <Link href="/register" className="font-semibold text-forest-700 hover:text-forest-800 transition-colors">Kayıt olun</Link>
          </p>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-[400px]">
            <AuthLogo className="lg:hidden" />

            <div className="mb-8">
              <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-tight">Giriş yapın</h1>
              <p className="mt-2 text-[15px] text-slate-500">Hesabınıza girin, size ait ekran otomatik açılır.</p>
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
                Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.
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

            <p className="mt-8 text-center text-sm text-slate-500 lg:hidden">
              Hesabınız yok mu?{" "}
              <Link href="/register" className="font-semibold text-forest-700 hover:text-forest-800 transition-colors">Kayıt olun</Link>
            </p>
          </div>
        </main>

        <footer className="hidden lg:flex items-center justify-between px-12 pb-8 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} OptiShift</span>
          <span>Bağlantınız şifrelidir</span>
        </footer>
      </div>

      {/* Sağ: ürün önizlemesi */}
      <aside className="hidden lg:flex lg:w-[48%] relative overflow-hidden bg-forest-900 flex-col justify-center px-14 xl:px-20">
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "48px 48px" }}
        />
        <div className="absolute -top-40 -right-40 w-[520px] h-[520px] rounded-full bg-forest-600/40 blur-[120px] pointer-events-none" />

        <div className="relative z-10 max-w-[480px]">
          <h2 className="font-serif text-[40px] font-semibold text-white leading-[1.1] tracking-tight">
            Haftalık plan,<br />dakikalar içinde hazır.
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-forest-100/70">
            Hesap sahibi, sorumlu ya da ekip üyesi: herkes aynı kapıdan girer, kendi ekranını görür.
          </p>

          {/* Plan önizlemesi (süs, gerçek veri değil) */}
          <div className="mt-10 rounded-2xl bg-white p-5 shadow-2xl shadow-black/30" aria-hidden="true">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">Bu hafta</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-forest-50 px-2.5 py-1 text-[11px] font-semibold text-forest-700">
                <Check size={12} strokeWidth={3} /> Yayında
              </span>
            </div>
            <div className="grid grid-cols-[72px_repeat(5,1fr)] gap-1.5 text-[11px]">
              <div />
              {["Pzt", "Sal", "Çar", "Per", "Cum"].map((d) => (
                <div key={d} className="text-center font-medium text-slate-400">{d}</div>
              ))}
              {PREVIEW_ROWS.map((row) => (
                <PreviewRow key={row.name} {...row} />
              ))}
            </div>
          </div>

          <ul className="mt-8 space-y-3">
            {["Adil dağıtım, herkesin yükü dengede", "İzin ve takas istekleri tek yerde", "Ekip planı telefonundan görür"].map((t) => (
              <li key={t} className="flex items-center gap-3 text-[15px] text-forest-50/90">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ember-500/20 text-ember-300">
                  <Check size={12} strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

type Shift = "A" | "K" | null;
const PREVIEW_ROWS: { name: string; shifts: Shift[] }[] = [
  { name: "Ayşe", shifts: ["A", "A", null, "K", "K"] },
  { name: "Mehmet", shifts: ["K", null, "A", "A", null] },
  { name: "Zeynep", shifts: [null, "K", "K", null, "A"] },
  { name: "Can", shifts: ["A", "K", "A", null, "K"] },
];

function PreviewRow({ name, shifts }: { name: string; shifts: Shift[] }) {
  return (
    <>
      <div className="flex items-center font-medium text-slate-600">{name}</div>
      {shifts.map((s, i) => (
        <div
          key={i}
          className={
            s === "A" ? "h-7 rounded-md bg-forest-100 text-forest-800 flex items-center justify-center font-semibold"
            : s === "K" ? "h-7 rounded-md bg-ember-100 text-ember-800 flex items-center justify-center font-semibold"
            : "h-7 rounded-md border border-dashed border-slate-200"
          }
        >
          {s === "A" ? "Açılış" : s === "K" ? "Kapanış" : ""}
        </div>
      ))}
    </>
  );
}
