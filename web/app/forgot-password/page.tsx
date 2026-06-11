"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, AtSign, ArrowLeft, CheckCircle2, Copy, Check, AlertCircle, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading]       = useState(false);
  const [done, setDone]             = useState(false);
  const [emailSent, setEmailSent]   = useState(false);
  const [resetUrl, setResetUrl]     = useState<string | null>(null);
  const [copied, setCopied]         = useState(false);
  const [error, setError]           = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Hata oluştu"); return; }

      setDone(true);
      setEmailSent(data.emailSent);
      if (data.resetUrl) setResetUrl(data.resetUrl);
    } catch {
      setError("Sunucuya bağlanılamadı.");
    } finally {
      setLoading(false);
    }
  }

  function copyUrl() {
    if (!resetUrl) return;
    navigator.clipboard.writeText(resetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] space-y-6">
        {/* Logo */}
        <div className="text-center">
          <Link href="/login" className="inline-flex items-center gap-2 text-slate-900 font-bold hover:text-indigo-600 transition-colors">
            <Zap size={20} className="text-indigo-600" />
            OptiShift
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">
          {!done ? (
            <>
              <div className="text-center">
                <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <AtSign size={22} className="text-indigo-600" />
                </div>
                <h1 className="text-xl font-black text-slate-900 tracking-tight">Şifremi Unuttum</h1>
                <p className="text-sm text-slate-500 mt-1.5">
                  Hesabınıza kayıtlı e-posta adresinizi veya kullanıcı adınızı girin.
                </p>
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
                    E-posta veya Kullanıcı Adı
                  </label>
                  <div className="relative">
                    <AtSign size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                      placeholder="ornek@email.com veya kullanici_adi"
                      required
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-400 placeholder:font-normal text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !identifier.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    "Sıfırlama Talebi Gönder"
                  )}
                </button>
              </form>
            </>
          ) : emailSent ? (
            /* E-posta gönderildi */
            <div className="text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
                <Mail size={26} className="text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900">E-posta Gönderildi</h2>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                  Kayıtlı e-posta adresinize şifre sıfırlama bağlantısı gönderdik.
                  Gelen kutunuzu kontrol edin.
                </p>
              </div>
              <p className="text-xs text-slate-400">
                E-posta gelmiyorsa spam klasörünü kontrol edin veya birkaç dakika bekleyin.
              </p>
            </div>
          ) : resetUrl ? (
            /* E-posta gönderilemiyor — linki göster */
            <div className="space-y-4">
              <div className="text-center">
                <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 size={26} className="text-amber-600" />
                </div>
                <h2 className="text-lg font-black text-slate-900">Sıfırlama Linki Hazır</h2>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                  E-posta servisi yapılandırılmamış. Linki kopyalayıp tarayıcınıza yapıştırabilir
                  ya da yöneticinizden bu linki WhatsApp veya SMS ile almanızı isteyin.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2">
                <p className="text-xs text-slate-600 break-all flex-1 font-mono leading-relaxed">{resetUrl}</p>
                <button
                  onClick={copyUrl}
                  className="shrink-0 p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                  title="Kopyala"
                >
                  {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                </button>
              </div>
              <p className="text-xs text-slate-400 text-center">⏱ Bu link 1 saat geçerlidir.</p>
            </div>
          ) : (
            /* Kullanıcı bulunamadı ama güvenlik için aynı mesaj */
            <div className="text-center space-y-3">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle2 size={26} className="text-slate-400" />
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Eğer bu e-posta / kullanıcı adı sistemimizde kayıtlıysa, size talimat gönderdik.
              </p>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 font-semibold transition-colors"
            >
              <ArrowLeft size={14} /> Giriş sayfasına dön
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
