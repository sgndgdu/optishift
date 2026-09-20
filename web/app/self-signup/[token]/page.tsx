"use client";

import { useState, useEffect, use } from "react";
import { Lock, User, Phone, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { LogoMark } from "@/components/Logo";

export default function SelfSignupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenError, setTokenError] = useState("");
  const [orgName, setOrgName] = useState("");
  const [locationName, setLocationName] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ username: string } | null>(null);

  useEffect(() => {
    fetch(`/api/self-signup?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          setOrgName(data.org_name);
          setLocationName(data.location_name);
        } else {
          setTokenError(data.error ?? "Geçersiz kayıt linki");
        }
      })
      .catch(() => setTokenError("Sunucuya bağlanılamadı"))
      .finally(() => setTokenLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== passwordConfirm) {
      setError("Şifreler eşleşmiyor");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/self-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: name.trim(), phone: phone.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Bir hata oluştu");
        setLoading(false);
        return;
      }
      setResult({ username: data.username });
    } catch {
      setError("Sunucuya bağlanılamadı");
      setLoading(false);
    }
  };

  if (tokenLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Loader2 size={28} className="text-forest-500 animate-spin" />
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} className="text-red-500" />
          </div>
          <h1 className="text-xl font-black text-slate-900 mb-2">Bu link kullanılamıyor</h1>
          <p className="text-slate-500 text-sm">{tokenError}</p>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-emerald-600" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-2">Kaydınız alındı!</h1>
          <p className="text-slate-500 text-sm mb-4">
            Yöneticiniz hesabınızı onayladığında giriş yapabilirsiniz.
          </p>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Kullanıcı Adınız</p>
            <p className="text-lg font-black text-slate-900">{result.username}</p>
            <p className="text-xs text-slate-400 mt-1">Giriş için bunu not edin.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-6">
            <LogoMark size="md" />
            <span className="font-black text-slate-900 text-lg">OptiShift</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-2">Ekibe Katıl</h1>
          <p className="text-slate-500 text-sm">
            <span className="font-semibold text-slate-700">{orgName}</span>
            {locationName && <> — {locationName}</>}
            <br />hesabınızı oluşturmak için bilgilerinizi girin.
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
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-slate-900 font-medium focus:outline-none focus:border-forest-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                Telefon <span className="text-slate-400 font-normal normal-case">(isteğe bağlı)</span>
              </label>
              <div className="relative">
                <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="0555 123 45 67"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-slate-900 font-medium focus:outline-none focus:border-forest-500 transition-colors"
                />
              </div>
            </div>

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
                  className="w-full pl-11 pr-12 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-slate-900 font-medium focus:outline-none focus:border-forest-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                Şifre Tekrar
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={passwordConfirm}
                  onChange={e => setPasswordConfirm(e.target.value)}
                  placeholder="Şifrenizi tekrar girin"
                  required
                  autoComplete="new-password"
                  className={`w-full pl-11 pr-4 py-3 bg-slate-50 border-2 rounded-2xl text-slate-900 font-medium focus:outline-none transition-colors ${
                    passwordConfirm && password !== passwordConfirm
                      ? "border-red-300 focus:border-red-500"
                      : "border-slate-200 focus:border-forest-500"
                  }`}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-forest-700 hover:bg-forest-800 text-white font-bold py-3.5 rounded-2xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : "Kaydımı Tamamla"}
            </button>
            <p className="text-center text-xs text-slate-400">
              Hesabınız, yöneticiniz onayladıktan sonra aktif olur.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
