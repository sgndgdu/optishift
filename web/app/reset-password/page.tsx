"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Zap, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get("token") ?? "";

  const [name, setName]               = useState<string | null>(null);
  const [tokenValid, setTokenValid]   = useState<boolean | null>(null);
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [showPw, setShowPw]           = useState(false);
  const [loading, setLoading]         = useState(false);
  const [success, setSuccess]         = useState(false);
  const [error, setError]             = useState("");

  // Token geçerliliğini doğrula
  useEffect(() => {
    if (!token) { setTokenValid(false); return; }
    fetch(`/api/auth/reset-password?token=${token}`)
      .then(r => r.json())
      .then(d => { setTokenValid(d.valid); setName(d.name ?? null); })
      .catch(() => setTokenValid(false));
  }, [token]);

  const strength = password.length >= 12 ? 4 : password.length >= 8 ? 3 : password.length >= 6 ? 2 : password.length > 0 ? 1 : 0;
  const strengthLabel = ["", "Zayıf", "Orta", "İyi", "Güçlü"][strength];
  const strengthColor = ["", "bg-red-400", "bg-amber-400", "bg-yellow-400", "bg-emerald-400"][strength];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Şifreler eşleşmiyor"); return; }
    if (password.length < 6)  { setError("Şifre en az 6 karakter olmalı"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Hata oluştu"); return; }
      setSuccess(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch {
      setError("Sunucuya bağlanılamadı.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] space-y-6">
        <div className="text-center">
          <Link href="/login" className="inline-flex items-center gap-2 text-slate-900 font-bold hover:text-indigo-600 transition-colors">
            <Zap size={20} className="text-indigo-600" />
            OptiShift
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">
          {/* Token kontrol ediliyor */}
          {tokenValid === null && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
              <p className="text-sm text-slate-500 mt-3">Link doğrulanıyor…</p>
            </div>
          )}

          {/* Geçersiz token */}
          {tokenValid === false && (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto">
                <AlertCircle size={26} className="text-red-500" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900">Geçersiz Link</h2>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                  Bu şifre sıfırlama linki geçersiz veya süresi dolmuş.
                  Lütfen yeni bir sıfırlama talebi oluşturun.
                </p>
              </div>
              <Link
                href="/forgot-password"
                className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-bold hover:text-indigo-700 transition-colors"
              >
                Yeni Link İste <ArrowRight size={14} />
              </Link>
            </div>
          )}

          {/* Başarılı sıfırlama */}
          {success && (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle2 size={26} className="text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900">Şifre Güncellendi!</h2>
                <p className="text-sm text-slate-500 mt-1.5">
                  Şifreniz başarıyla değiştirildi. Giriş sayfasına yönlendiriliyorsunuz…
                </p>
              </div>
            </div>
          )}

          {/* Form */}
          {tokenValid === true && !success && (
            <>
              <div className="text-center">
                <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Lock size={22} className="text-indigo-600" />
                </div>
                <h1 className="text-xl font-black text-slate-900 tracking-tight">Yeni Şifre Belirle</h1>
                {name && (
                  <p className="text-sm text-slate-500 mt-1">Merhaba {name}, yeni şifrenizi girin.</p>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
                  <AlertCircle size={15} className="shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                    Yeni Şifre
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className="w-full pl-11 pr-11 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {/* Güç göstergesi */}
                  {password && (
                    <div className="flex items-center gap-2 mt-2">
                      {[1, 2, 3, 4].map(l => (
                        <div key={l} className={`h-1.5 flex-1 rounded-full transition-colors ${l <= strength ? strengthColor : "bg-slate-100"}`} />
                      ))}
                      <span className="text-xs text-slate-500 w-12 text-right">{strengthLabel}</span>
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
                      type="password"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                    />
                  </div>
                  {confirm && password !== confirm && (
                    <p className="text-xs text-red-500 mt-1.5">Şifreler eşleşmiyor</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !password || !confirm}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm mt-2"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><Lock size={15} /> Şifreyi Kaydet</>
                  )}
                </button>
              </form>
            </>
          )}

          {tokenValid !== null && (
            <div className="pt-2 border-t border-slate-100 text-center">
              <Link href="/login" className="text-sm text-slate-500 hover:text-indigo-600 font-semibold transition-colors">
                ← Giriş sayfasına dön
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
