"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, User, Phone, Eye, EyeOff, Zap, CheckCircle, ArrowRight, Shield, AlertCircle } from "lucide-react";

function SetupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [mounted, setMounted] = useState(false);
  const [setupUser, setSetupUser] = useState<{ name: string; username: string; role: string } | null>(null);
  const [tokenError, setTokenError] = useState("");
  const [tokenLoading, setTokenLoading] = useState(!!token);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setMounted(true);

    if (token) {
      // Davet linki akışı: token doğrula → session kur
      fetch(`/api/invite?token=${encodeURIComponent(token)}`)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setSetupUser({ name: data.user.name, username: data.user.username ?? "", role: data.user.role });
            setName(data.user.name ?? "");
          } else {
            setTokenError(data.error ?? "Geçersiz davet linki");
          }
        })
        .catch(() => setTokenError("Sunucuya bağlanılamadı"))
        .finally(() => setTokenLoading(false));
    } else {
      // Geleneksel localStorage akışı
      const raw = localStorage.getItem("optishift_setup_user");
      if (!raw) {
        router.replace("/login");
        return;
      }
      const u = JSON.parse(raw);
      setSetupUser(u);
      setName(u.name ?? "");
    }
  }, [router, token]);

  if (!mounted || tokenLoading) return null;

  // Token hata durumu
  if (tokenError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={40} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-2">Davet Linki Geçersiz</h1>
          <p className="text-slate-500 mb-6">{tokenError}</p>
          <a href="/login" className="inline-flex items-center gap-2 bg-indigo-600 text-white font-bold px-6 py-3 rounded-2xl hover:bg-indigo-700 transition-colors">
            Giriş Sayfasına Git
          </a>
        </div>
      </div>
    );
  }

  if (!setupUser) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== passwordConfirm) {
      setError("Şifreler eşleşmiyor");
      return;
    }
    if (password.length < 6) {
      setError("Şifre en az 6 karakter olmalı");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), new_password: password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Bir hata oluştu");
        setLoading(false);
        return;
      }

      localStorage.removeItem("optishift_setup_user");
      setDone(true);

      setTimeout(() => {
        const user = data.user;
        if (user.role === "supervisor" || (user.role === "admin" && !user.location_id)) {
          localStorage.setItem("optishift_supervisor_user", JSON.stringify(user));
          router.push("/supervisor");
        } else if (user.role === "manager" || user.role === "admin") {
          localStorage.setItem("optishift_manager_user", JSON.stringify(user));
          router.push("/dashboard");
        } else {
          localStorage.setItem("optishift_portal_user", JSON.stringify(user));
          router.push("/portal");
        }
      }, 1800);
    } catch {
      setError("Sunucuya bağlanılamadı");
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-emerald-600" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-2">Hesabınız Hazır!</h1>
          <p className="text-slate-500">Yönlendiriliyorsunuz...</p>
        </div>
      </div>
    );
  }

  const passwordStrength = (() => {
    if (password.length === 0) return null;
    if (password.length < 6) return { label: "Zayıf", color: "bg-red-500", width: "w-1/4" };
    if (password.length < 8) return { label: "Orta", color: "bg-yellow-500", width: "w-2/4" };
    if (/[A-Z]/.test(password) && /[0-9]/.test(password)) return { label: "Güçlü", color: "bg-emerald-500", width: "w-full" };
    return { label: "İyi", color: "bg-blue-500", width: "w-3/4" };
  })();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Zap size={22} className="text-indigo-600" />
            <span className="font-black text-slate-900 text-lg">OptiShift</span>
          </div>
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield size={32} className="text-indigo-600" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-2">Hesabınızı Kurun</h1>
          <p className="text-slate-500 text-sm">
            Hoş geldiniz, <span className="font-semibold text-slate-700">{setupUser.name}</span>!<br />
            Devam etmek için bilgilerinizi tamamlayın.
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600 font-medium">
                {error}
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                Ad Soyad
              </label>
              <div className="relative">
                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Adınız Soyadınız"
                  required
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-slate-900 font-medium focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                Telefon <span className="text-slate-400 font-normal normal-case">(opsiyonel)</span>
              </label>
              <div className="relative">
                <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="0555 123 45 67"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-slate-900 font-medium focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Yeni Şifreniz</p>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                    Şifre
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="En az 6 karakter"
                      required
                      autoComplete="new-password"
                      className="w-full pl-11 pr-12 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-slate-900 font-medium focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {passwordStrength && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${passwordStrength.color} ${passwordStrength.width} transition-all`} />
                      </div>
                      <span className="text-xs font-semibold text-slate-500">{passwordStrength.label}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                    Şifre Tekrar
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={passwordConfirm}
                      onChange={e => setPasswordConfirm(e.target.value)}
                      placeholder="Şifrenizi tekrar girin"
                      required
                      autoComplete="new-password"
                      className={`w-full pl-11 pr-12 py-3 bg-slate-50 border-2 rounded-2xl text-slate-900 font-medium focus:outline-none transition-colors ${
                        passwordConfirm && password !== passwordConfirm
                          ? "border-red-300 focus:border-red-500"
                          : "border-slate-200 focus:border-indigo-500"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {passwordConfirm && password !== passwordConfirm && (
                    <p className="text-xs text-red-500 font-medium mt-1">Şifreler eşleşmiyor</p>
                  )}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || (!!passwordConfirm && password !== passwordConfirm)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-100 mt-2 group"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Hesabımı Kur <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" /></>
              )}
            </button>
          </form>
        </div>

        {setupUser.username && (
          <p className="text-center text-xs text-slate-400 mt-6">
            Kullanıcı adınız: <span className="font-mono font-semibold text-slate-600">{setupUser.username}</span>
          </p>
        )}
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={null}>
      <SetupForm />
    </Suspense>
  );
}
