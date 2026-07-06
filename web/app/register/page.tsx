"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, ArrowRight, Check, Eye, EyeOff, Store, User, AtSign } from "lucide-react";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [registeredUser, setRegisteredUser] = useState<Record<string, unknown> | null>(null);

  const [form, setForm] = useState({ org_name: "", owner_name: "", username: "", email: "", password: "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

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
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/30 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Zap size={20} className="text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">OptiShift</span>
        </div>

        <div className="relative z-10 max-w-lg mt-20">
          <h2 className="text-4xl md:text-5xl font-black text-white mb-6 leading-tight">
            Tüm şubelerinizi<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">tek ekrandan</span> yönetin.
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed mb-8">
            1 cafe veya 50 şube — fark etmez. OptiShift&apos;in adil vardiya dağıtımı her ölçekte çalışır.
          </p>
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
              <div className="text-2xl font-black text-white mb-1">%90</div>
              <div className="text-sm text-slate-400 font-medium">Zaman Tasarrufu</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
              <div className="text-2xl font-black text-white mb-1">0</div>
              <div className="text-sm text-slate-400 font-medium">Vardiya Çakışması</div>
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
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Zap size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">OptiShift</span>
          </div>

          {!registeredUser ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-6 sm:mb-8">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mb-2 tracking-tight">Ücretsiz Hesap Oluştur</h1>
                <p className="text-slate-500 font-medium text-sm sm:text-base">İşletmenizi 1 dakikadan kısa sürede sisteme kaydedin.</p>
              </div>

              {error && (
                <div className="mb-6 bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600 font-medium flex items-center gap-3">
                  <div className="w-1.5 h-1.5 bg-red-600 rounded-full shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-5">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Store size={14} className="text-indigo-500" />
                    İşletme Adı
                  </label>
                  <input
                    value={form.org_name}
                    onChange={(e) => set("org_name", e.target.value)}
                    placeholder="Örn: Cup & Go Cafe"
                    className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-medium bg-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <User size={14} className="text-indigo-500" />
                    Adınız Soyadınız
                  </label>
                  <input
                    value={form.owner_name}
                    onChange={(e) => set("owner_name", e.target.value)}
                    placeholder="Ahmet Yılmaz"
                    className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-medium bg-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AtSign size={14} className="text-indigo-500" />
                    Kullanıcı Adı
                  </label>
                  <input
                    value={form.username}
                    onChange={(e) => set("username", e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                    placeholder="ahmet.yilmaz"
                    className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-medium font-mono bg-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
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
                    className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-medium bg-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
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
                      className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 pr-12 text-slate-900 font-medium bg-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-400 placeholder:font-normal"
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

              <p className="text-center text-sm text-slate-500 mt-8 font-medium">
                Zaten hesabın var mı?{" "}
                <Link href="/login" className="text-indigo-600 font-bold hover:text-indigo-700 transition-colors">
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
              <div className="pt-2">
                <button
                  onClick={handleStart}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 group"
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
