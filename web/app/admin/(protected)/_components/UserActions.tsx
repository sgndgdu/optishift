"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { LogIn, KeyRound, Copy, Check, X } from "lucide-react";

export type GodUser = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: string;
};

// Impersonate: cookie'yi API set eder; portallar localStorage'dan okuduğu için
// login akışıyla aynı anahtarları biz doldurup yönlendiririz.
export async function impersonate(userId: string): Promise<string | null> {
  const res = await fetch(`/api/god/impersonate/${userId}`, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.user) return data.error ?? "Impersonate başarısız";

  const u = data.user;
  localStorage.removeItem("optishift_portal_user");
  localStorage.removeItem("optishift_manager_user");
  localStorage.removeItem("optishift_supervisor_user");
  if (u.role === "supervisor") localStorage.setItem("optishift_supervisor_user", JSON.stringify(u));
  else if (u.role === "manager" || u.role === "admin") localStorage.setItem("optishift_manager_user", JSON.stringify(u));
  else localStorage.setItem("optishift_portal_user", JSON.stringify(u));
  if (u.location_id) localStorage.setItem("optishift_selected_location", u.location_id);

  window.location.href = data.redirect ?? "/dashboard";
  return null;
}

export default function UserActions({ user }: { user: GodUser }) {
  const [busy, setBusy] = useState<"imp" | "pwd" | null>(null);
  const [tempPwd, setTempPwd] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImpersonate = async () => {
    if (!confirm(`${user.name} (${user.role}) olarak giriş yapılacak. Devam?`)) return;
    setBusy("imp");
    const err = await impersonate(user.id);
    if (err) { setError(err); setBusy(null); }
  };

  const handleResetPassword = async () => {
    if (!confirm(`${user.name} için yeni geçici şifre üretilsin mi? Eski şifre geçersiz olur.`)) return;
    setBusy("pwd");
    setError(null);
    try {
      const res = await fetch("/api/god/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, action: "reset_password" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Hata");
      setTempPwd(data.temp_password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Şifre sıfırlanamadı");
    }
    setBusy(null);
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleImpersonate}
        disabled={busy !== null}
        title="Bu kullanıcı olarak giriş yap"
        className="flex items-center gap-1 text-[11px] font-medium text-violet-400 hover:text-violet-200 border border-violet-500/20 hover:border-violet-400/40 bg-violet-500/10 rounded-lg px-2 py-1 transition-colors disabled:opacity-40"
      >
        <LogIn size={11} /> {busy === "imp" ? "…" : "Gir"}
      </button>
      <button
        onClick={handleResetPassword}
        disabled={busy !== null}
        title="Geçici şifre üret"
        className="flex items-center gap-1 text-[11px] font-medium text-amber-400 hover:text-amber-200 border border-amber-500/20 hover:border-amber-400/40 bg-amber-500/10 rounded-lg px-2 py-1 transition-colors disabled:opacity-40"
      >
        <KeyRound size={11} /> {busy === "pwd" ? "…" : "Şifre"}
      </button>

      {error && <span className="text-[10px] text-red-400">{error}</span>}

      {/* Temp şifre modalı */}
      {tempPwd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setTempPwd(null); }}>
          <div className="bg-[#16161f] border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Geçici Şifre — {user.name}</h3>
              <button onClick={() => setTempPwd(null)} className="text-slate-500 hover:text-white"><X size={16} /></button>
            </div>
            <p className="text-xs text-slate-400">
              Kullanıcı adı: <span className="font-mono text-slate-200">{user.username}</span>.
              İlk girişte yeni şifre belirlemesi istenecek. Bu şifre bir daha gösterilmez.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-lg font-mono font-bold text-emerald-400 text-center tracking-widest">
                {tempPwd}
              </code>
              <button
                onClick={() => { navigator.clipboard.writeText(tempPwd); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="p-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white transition-colors"
              >
                {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
