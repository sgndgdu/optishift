"use client";

import { useState, useEffect } from "react";
import { Lock, Save, Check, Eye, EyeOff, AlertCircle, Pencil } from "lucide-react";

type StorageKey = "optishift_portal_user" | "optishift_manager_user" | "optishift_supervisor_user";

interface Props {
  storageKey: StorageKey;
  allowNameEdit?: boolean;
}

export default function AccountTab({ storageKey, allowNameEdit = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({ name: "", email: "", username: "" });
  const [profilePassword, setProfilePassword] = useState("");
  // Kayıtlı bilgi: profil önce okunur görünür, "Düzenle" ile açılır; her değişiklik şifreyle kaydedilir
  const [saved, setSaved] = useState({ name: "", email: "", username: "" });
  const [editing, setEditing] = useState(false);
  const dirty = profile.name.trim() !== saved.name || profile.email.trim() !== saved.email || profile.username.trim() !== saved.username;
  const [showProfilePw, setShowProfilePw] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    // Mevcut değerleri localStorage'dan hemen göster
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const obj = JSON.parse(raw);
        const p = { name: obj.name ?? "", email: obj.email ?? "", username: obj.username ?? "" };
        setProfile(p); setSaved(p);
      }
    } catch {}

    // Sunucudan güncel verileri çek
    fetch("/api/auth/account")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          const p = { name: data.name ?? "", email: data.email ?? "", username: data.username ?? "" };
          setProfile(p); setSaved(p);
        }
      })
      .finally(() => setLoading(false));
  }, [storageKey]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty) { setEditing(false); return; }
    if (!profilePassword) { setProfileError("Değişikliği kaydetmek için şifrenizi girin"); return; }
    setProfileSaving(true);
    setProfileError("");
    try {
      const res = await fetch("/api/auth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profile.name, email: profile.email, username: profile.username, confirmPassword: profilePassword }),
      });
      const data = await res.json();
      if (!res.ok) { setProfileError(data.error ?? "Hata"); setProfileSaving(false); return; }
      // localStorage'daki ismi güncelle
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const obj = JSON.parse(raw);
          obj.name = data.name;
          if (data.email) obj.email = data.email;
          localStorage.setItem(storageKey, JSON.stringify(obj));
        }
      } catch {}
      setProfile(prev => ({ ...prev, name: data.name, email: data.email ?? prev.email, username: data.username ?? prev.username }));
      setSaved({ name: data.name, email: data.email ?? profile.email, username: data.username ?? profile.username });
      setProfilePassword("");
      setEditing(false);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 2500);
    } catch {
      setProfileError("Sunucu hatası");
    }
    setProfileSaving(false);
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    if (passwords.next !== passwords.confirm) { setPwError("Yeni şifreler eşleşmiyor"); return; }
    if (passwords.next.length < 6) { setPwError("Yeni şifre en az 6 karakter olmalı"); return; }
    setPwSaving(true);
    try {
      const res = await fetch("/api/auth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: passwords.current, newPassword: passwords.next }),
      });
      const data = await res.json();
      if (!res.ok) { setPwError(data.error ?? "Hata"); return; }
      setPasswords({ current: "", next: "", confirm: "" });
      setPwSuccess(true);
      setTimeout(() => setPwSuccess(false), 2500);
    } catch {
      setPwError("Sunucu hatası");
    }
    setPwSaving(false);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profil Bilgileri */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-5 pt-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Profil</h2>
            <p className="text-xs text-slate-500">
              {allowNameEdit ? "Ad ve e-posta adresinizi güncelleyin" : "E-posta adresinizi güncelleyin"}
            </p>
          </div>
        </div>
        {!editing ? (
          <div className="p-4 sm:p-5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="field-label">Ad Soyad</p>
                <p className="text-sm text-slate-900">{profile.name || "Yok"}</p>
              </div>
              <div>
                <p className="field-label">E-posta</p>
                <p className="text-sm text-slate-900 break-all">{profile.email || "Yok"}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              {profileSuccess && <span className="inline-flex items-center gap-1 text-sm font-semibold text-forest-700"><Check size={15} /> Kaydedildi</span>}
              <button type="button" onClick={() => { setEditing(true); setProfileError(""); }}
                className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl">
                <Pencil size={14} /> Düzenle
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleProfileSave} className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {allowNameEdit ? (
              <div>
                <label className="field-label">Ad Soyad</label>
                <input className="field-input" value={profile.name} required placeholder="Ad Soyad" autoFocus
                  onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
              </div>
            ) : (
              <div>
                <label className="field-label">Ad Soyad</label>
                <div className="field-input bg-slate-50 text-slate-500 cursor-default select-none">{profile.name || "Yok"}</div>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="field-label">E-posta</label>
              <input type="email" className="field-input" value={profile.email} placeholder="ornek@email.com"
                onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <label className="field-label">Şifreniz</label>
            <p className="mb-2 text-xs text-slate-500">Bilgilerinizi korumak için değişikliği şifrenizle onaylayın.</p>
            <div className="relative">
              <input type={showProfilePw ? "text" : "password"} className="field-input pr-10" value={profilePassword}
                onChange={e => setProfilePassword(e.target.value)} placeholder="Mevcut şifreniz" autoComplete="current-password" />
              <button type="button" aria-label={showProfilePw ? "Şifreyi gizle" : "Şifreyi göster"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => setShowProfilePw(v => !v)}>
                {showProfilePw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {profileError && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <AlertCircle size={15} />
              {profileError}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setProfile(saved); setProfilePassword(""); setProfileError(""); setEditing(false); }}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 rounded-xl hover:bg-slate-100">Vazgeç</button>
            <button type="submit" disabled={profileSaving || !dirty || !profilePassword}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
              {profileSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save size={15} /> Kaydet</>}
            </button>
          </div>
        </form>
        )}
      </div>

      {/* Şifre Değiştir */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-5 pt-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Şifre değiştir</h2>
            <p className="text-xs text-slate-500">En az 6 karakter, güvenli bir şifre kullanın</p>
          </div>
        </div>
        <form onSubmit={handlePasswordSave} className="p-4 sm:p-5 space-y-4">
          <div>
            <label className="field-label">Mevcut Şifre</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                className="field-input pr-10"
                value={passwords.current}
                onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))}
                required
                placeholder="••••••••"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => setShowCurrent(v => !v)}
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Yeni Şifre</label>
              <div className="relative">
                <input
                  type={showNext ? "text" : "password"}
                  className="field-input pr-10"
                  value={passwords.next}
                  onChange={e => setPasswords(p => ({ ...p, next: e.target.value }))}
                  required
                  placeholder="••••••••"
                  minLength={6}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowNext(v => !v)}
                >
                  {showNext ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="field-label">Yeni Şifre (Tekrar)</label>
              <input
                type="password"
                className="field-input"
                value={passwords.confirm}
                onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                required
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Güç göstergesi */}
          {passwords.next && (
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4].map(level => {
                const strength = passwords.next.length >= 12 ? 4 : passwords.next.length >= 8 ? 3 : passwords.next.length >= 6 ? 2 : 1;
                return (
                  <div
                    key={level}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      level <= strength
                        ? strength <= 1 ? "bg-red-400" : strength <= 2 ? "bg-amber-400" : strength <= 3 ? "bg-yellow-400" : "bg-emerald-400"
                        : "bg-slate-100"
                    }`}
                  />
                );
              })}
              <span className="text-xs text-slate-500 w-14 text-right">
                {passwords.next.length >= 12 ? "Güçlü" : passwords.next.length >= 8 ? "İyi" : passwords.next.length >= 6 ? "Orta" : "Zayıf"}
              </span>
            </div>
          )}

          {pwError && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <AlertCircle size={15} />
              {pwError}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pwSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {pwSaving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : pwSuccess ? (
                <><Check size={15} /> Güncellendi</>
              ) : (
                <><Lock size={15} /> Şifreyi Güncelle</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
