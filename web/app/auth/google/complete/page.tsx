"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// Google OAuth callback oturum cookie'sini set edip buraya yönlendirir.
// /api/auth/login ile aynı şekilli veriyi çekip AYNI rol bazlı yönlendirme +
// localStorage mantığını uygular (bkz. app/login/page.tsx handleLogin).
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

        if (data.is_temp_password) {
          localStorage.setItem("optishift_setup_user", JSON.stringify(data));
          router.push("/setup");
          return;
        }

        if (data.role === "supervisor" || (data.role === "admin" && !data.location_id)) {
          localStorage.removeItem("optishift_portal_user");
          localStorage.removeItem("optishift_manager_user");
          localStorage.setItem("optishift_supervisor_user", JSON.stringify(data));
          router.push("/supervisor");
        } else if (data.role === "manager" || data.role === "admin") {
          localStorage.removeItem("optishift_portal_user");
          localStorage.removeItem("optishift_supervisor_user");
          localStorage.setItem("optishift_manager_user", JSON.stringify(data));
          router.push("/dashboard");
        } else {
          localStorage.removeItem("optishift_manager_user");
          localStorage.removeItem("optishift_supervisor_user");
          localStorage.setItem("optishift_portal_user", JSON.stringify(data));
          router.push("/portal");
        }
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
              className="text-indigo-600 font-bold hover:text-indigo-700 transition-colors"
            >
              Giriş sayfasına dön
            </button>
          </>
        ) : (
          <>
            <Loader2 size={32} className="animate-spin text-indigo-600 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Google girişiniz tamamlanıyor…</p>
          </>
        )}
      </div>
    </div>
  );
}
