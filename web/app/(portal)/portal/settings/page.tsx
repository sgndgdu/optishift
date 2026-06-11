"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AccountTab from "@/components/AccountTab";

export default function PortalSettingsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("optishift_portal_user");
    if (!raw) { router.replace("/login"); return; }
    setMounted(true);
  }, [router]);

  if (!mounted) return null;

  return (
    <div className="p-5 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Hesabım</h1>
        <p className="text-sm text-slate-500 mt-1">Profil ve şifre ayarları</p>
      </div>
      <AccountTab storageKey="optishift_portal_user" />
    </div>
  );
}
