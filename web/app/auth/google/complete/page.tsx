"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { routeAfterLogin } from "@/lib/sessionRouting";

// Google OAuth callback oturum cookie'sini set edip buraya yönlendirir.
// /api/auth/login ile aynı şekilli veriyi çekip AYNI yönlendirmeyi uygular (lib/sessionRouting.ts).
export default function GoogleAuthCompletePage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/auth/google/session");
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setError(data.error ?? "Google girişi tamamlanamadı");
          return;
        }

        await routeAfterLogin(data, router.push);
      } catch {
        if (!cancelled) setError("Sunucuya bağlanılamadı");
      }
    })();

    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        {error ? (
          <>
            <p className="text-red-600 font-semibold mb-2">{error}</p>
            <button
              onClick={() => router.push("/login")}
              className="text-forest-600 font-bold hover:text-forest-700 transition-colors"
            >
              Giriş sayfasına dön
            </button>
          </>
        ) : (
          <>
            <Loader2 size={32} className="animate-spin text-forest-600 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Google girişiniz tamamlanıyor…</p>
          </>
        )}
      </div>
    </div>
  );
}
