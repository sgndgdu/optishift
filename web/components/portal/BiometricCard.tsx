"use client";

/**
 * Personel portalı → Hesabım: bu cihazda Face ID / parmak izi ile giriş (WebAuthn).
 * Cihaz desteklemiyorsa hiç görünmez. Eskiden portal ana sayfasındaydı; bir kerelik
 * kurulum olduğu için Hesabım'a taşındı.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startRegistration } from "@simplewebauthn/browser";
import { Sheet, sheetPrimaryClass } from "@/components/ui/Sheet";

export default function BiometricCard() {
  const [available, setAvailable] = useState(false);
  const [creds, setCreds] = useState<any[] | null>(null); // null = henüz yüklenmedi
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  const loadCreds = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/webauthn/credentials");
      if (r.ok) setCreds(await r.json());
    } catch { /* sessiz */ }
  }, []);

  useEffect(() => {
    if (!browserSupportsWebAuthn()) return;
    platformAuthenticatorIsAvailable().then(avail => {
      setAvailable(avail);
      if (avail) loadCreds();
    }).catch(() => {});
  }, [loadCreds]);

  const enroll = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const optionsRes = await fetch("/api/auth/webauthn/register-options", { method: "POST" });
      const optionsJSON = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(optionsJSON.error ?? "Kayıt başlatılamadı");

      const regResponse = await startRegistration({ optionsJSON });

      const verifyRes = await fetch("/api/auth/webauthn/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(regResponse),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(data.error ?? "Kayıt tamamlanamadı");

      setMsg({ text: "Bu cihaz için biyometrik giriş etkinleştirildi." });
      await loadCreds();
    } catch (err: any) {
      if (err?.name !== "NotAllowedError") {
        setMsg({ text: err?.message ?? "Biyometrik kayıt başarısız", error: true });
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setBusy(true);
    try {
      await fetch(`/api/auth/webauthn/credentials?id=${id}`, { method: "DELETE" });
      await loadCreds();
    } finally {
      setBusy(false);
    }
  };

  if (!available || creds === null) return null;

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        {creds.length === 0 ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-forest-50 text-forest-600 flex items-center justify-center shrink-0">
              <Fingerprint size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-800">Bu cihazda hızlı giriş</p>
              <p className="text-xs text-slate-400">Face ID / parmak izi ile şifresiz giriş yap</p>
            </div>
            <button
              onClick={enroll}
              disabled={busy}
              className="px-3 py-1.5 text-xs font-bold text-forest-700 bg-forest-50 rounded-lg hover:bg-forest-100 transition-colors disabled:opacity-50 shrink-0"
            >
              {busy ? "…" : "Etkinleştir"}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Fingerprint size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-800">Biyometrik giriş aktif</p>
              <p className="text-xs text-slate-400">{creds.length} cihaz kayıtlı</p>
            </div>
            <button
              onClick={() => setManageOpen(true)}
              className="px-3 py-1.5 text-xs font-bold text-slate-500 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
            >
              Yönet
            </button>
          </div>
        )}
        {msg && (
          <p className={`text-xs font-semibold mt-2 ${msg.error ? "text-red-500" : "text-emerald-600"}`}>
            {msg.text}
          </p>
        )}
      </div>

      <Sheet open={manageOpen} onClose={() => setManageOpen(false)} title="Biyometrik cihazlar"
        footer={<button onClick={enroll} disabled={busy} className={sheetPrimaryClass}>{busy ? "…" : "Bu cihazı ekle"}</button>}>
        <ul className="border border-slate-200 rounded-xl divide-y divide-slate-100">
          {creds.map(c => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{c.device_name ?? "Cihaz"}</p>
                <p className="text-xs text-slate-500">{new Date(c.created_at * 1000).toLocaleDateString("tr-TR")} tarihinde eklendi</p>
              </div>
              <button onClick={() => remove(c.id)} disabled={busy} className="shrink-0 px-2 min-h-[36px] text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50">Kaldır</button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
