"use client";

import { useEffect } from "react";

// Google'ın tek dokunuşla giriş kartı: tarayıcıda Google'a girmiş kişiye sağ üstte
// "... olarak devam et" gösterir. Kart çıkmazsa (Google'a girilmemiş, kapatılmış) sayfadaki düğme kalır.
type GoogleId = {
  initialize: (o: Record<string, unknown>) => void;
  prompt: () => void;
  cancel: () => void;
};
declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? Object.assign(document.createElement("script"), { src: SCRIPT_SRC, async: true });
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Google betiği yüklenemedi")));
    if (!existing) document.head.appendChild(script);
  });
}

export function GoogleOneTap() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await fetch("/api/auth/google/onetap").then(r => r.json());
        if (!config.enabled || cancelled) return;
        await loadScript();
        if (cancelled || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: config.client_id,
          nonce: config.nonce,
          context: "signin",
          cancel_on_tap_outside: true,
          itp_support: true,
          use_fedcm_for_prompt: true,
          callback: async ({ credential }: { credential: string }) => {
            const res = await fetch("/api/auth/google/onetap", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential }),
            });
            const data = await res.json().catch(() => ({}));
            window.location.href = data.redirect ?? "/login?google_error=exchange_failed";
          },
        });
        window.google.accounts.id.prompt();
      } catch {
        // Kart çıkmazsa sessizce vazgeç: "Google ile Giriş Yap" düğmesi her zaman var
      }
    })();
    return () => {
      cancelled = true;
      window.google?.accounts?.id?.cancel();
    };
  }, []);
  return null;
}
