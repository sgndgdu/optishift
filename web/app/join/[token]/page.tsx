"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Zap, Check, Eye, EyeOff, ArrowRight, MapPin, Building2, AlertCircle } from "lucide-react";

type InviteInfo = {
  org_name: string;
  location_name: string;
  invited_name: string | null;
  role: string;
};

export default function JoinPage() {
  const router = useRouter();
  const { token } = useParams<{ token: string }>();

  const [invite, setInvite]   = useState<InviteInfo | null>(null);
  const [inviteErr, setInviteErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [name, setName]       = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]       = useState(false);
  const [finalUsername, setFinalUsername] = useState("");

  // Token doğrula
  useEffect(() => {
    if (!token) return;
    fetch(`/api/invites?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setInviteErr(data.error); }
        else { setInvite(data); setName(data.invited_name || ""); }
      })
      .catch(() => setInviteErr("Sunucuya bağlanılamadı."))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) { setError("Adınızı girin."); return; }
    if (username.trim().length < 3) { setError("Kullanıcı adı en az 3 karakter olmalı."); return; }
    if (password.length < 6) { setError("Şifre en az 6 karakter olmalı."); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/invites?token=${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setSubmitting(false); return; }
      setFinalUsername(data.username);
      setDone(true);
    } catch {
      setError("Sunucuya bağlanılamadı.");
      setSubmitting(false);
    }
  };

  const roleLabel: Record<string, string> = {
    employee: "Personel",
    manager: "Müdür",
    supervisor: "Süpervizör",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (inviteErr) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-10 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle size={28} className="text-red-500" />
          </div>
          <h2 className="text-xl font-black text-slate-900">Davet Linki Geçersiz</h2>
          <p className="text-slate-500 text-sm">{inviteErr}</p>
          <button onClick={() => router.push("/login")}
            className="text-indigo-600 font-bold text-sm hover:underline">
            Giriş sayfasına git
          </button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-10 max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <div className="w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center">
              <Check size={28} className="text-white" strokeWidth={3} />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900">Hesabınız Hazır!</h2>
            <p className="text-slate-500 mt-2 text-sm leading-relaxed">
              Artık <strong>{invite?.org_name}</strong> ekibinin bir parçasısınız.<br />
              Kullanıcı adınızla giriş yapabilirsiniz.
            </p>
          </div>
          <div className="bg-slate-50 rounded-2xl px-5 py-4 border border-slate-200 text-left space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kullanıcı Adınız</p>
            <p className="text-lg font-black text-indigo-600 font-mono">{finalUsername}</p>
          </div>
          <button
            onClick={() => router.push("/login")}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-colors group"
          >
            Giriş Yap <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Zap size={20} className="text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900">OptiShift</span>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 space-y-6">
          {/* Davet bilgisi */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full w-fit">
              Davet ile katılıyorsunuz
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-3">Hesabınızı Oluşturun</h1>
            <div className="flex flex-wrap gap-2 mt-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium bg-slate-100 px-3 py-1.5 rounded-full">
                <Building2 size={12} className="text-slate-400" />
                {invite?.org_name}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium bg-slate-100 px-3 py-1.5 rounded-full">
                <MapPin size={12} className="text-slate-400" />
                {invite?.location_name}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium bg-slate-100 px-3 py-1.5 rounded-full">
                {roleLabel[invite?.role ?? "employee"] ?? invite?.role}
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 font-medium flex items-center gap-2">
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                Adınız Soyadınız
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Zeynep Arslan"
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 min-h-[44px] text-sm font-medium focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                Kullanıcı Adı
              </label>
              <input
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                placeholder="zeynep.arslan"
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 min-h-[44px] text-sm font-medium font-mono focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <p className="text-[11px] text-slate-400 mt-1">Sadece harf, rakam, nokta ve tire. Giriş yaparken kullanacaksınız.</p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                Şifre
              </label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="En az 6 karakter"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 min-h-[44px] pr-12 text-sm font-medium focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1">
                  {showPass ? <Eye size={17} /> : <EyeOff size={17} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3.5 min-h-[48px] bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-2xl transition-colors shadow-lg shadow-indigo-200 group mt-2"
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Hesabı Oluştur <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" /></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
