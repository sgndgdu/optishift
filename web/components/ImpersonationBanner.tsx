"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, X } from "lucide-react";

type ImpersonationInfo = {
  org_name: string | null;
  user_name: string | null;
  user_id: string;
  org_id: string;
  started_at: number;
};

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; path=/`;
}

export default function ImpersonationBanner() {
  const router = useRouter();
  const [info, setInfo] = useState<ImpersonationInfo | null>(null);

  useEffect(() => {
    const raw = getCookie("optishift_impersonation");
    if (!raw) return;
    try {
      setInfo(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  if (!info) return null;

  const handleExit = () => {
    deleteCookie("optishift_impersonation");
    deleteCookie("optishift_session");
    router.push("/admin");
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between text-sm font-medium shadow-lg">
      <div className="flex items-center gap-2">
        <Shield size={15} />
        <span>
          God Mode: <strong>{info.user_name ?? "Kullanici"}</strong> olarak goruntuleniyor
          {info.org_name ? ` — ${info.org_name}` : ""}
        </span>
      </div>
      <button
        onClick={handleExit}
        className="flex items-center gap-1.5 bg-amber-950/15 hover:bg-amber-950/25 rounded-lg px-3 py-1 text-xs font-semibold transition-colors"
      >
        <X size={13} />
        God Mode&apos;a Don
      </button>
    </div>
  );
}
