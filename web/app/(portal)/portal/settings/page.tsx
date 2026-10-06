"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AccountTab from "@/components/AccountTab";
import { HelpCircle, LogOut } from "lucide-react";
import { Page, PageHeader } from "@/components/ui/PageHeader";

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
    <Page width="narrow">
      <PageHeader title="Hesabım" description="Profil, şifre ve giriş ayarları" />
      <AccountTab storageKey="optishift_portal_user" />
      {/* Telefonda üst çubuktan kaldırılan Yardım ve Çıkış burada */}
      <div className="grid grid-cols-2 gap-3">
        <a href="/kilavuz?role=employee" target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
          <HelpCircle size={16} /> Yardım
        </a>
        <button
          onClick={() => { localStorage.removeItem("optishift_portal_user"); router.push("/login"); }}
          className="flex items-center justify-center gap-2 py-3 rounded-xl border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50 transition-colors">
          <LogOut size={16} /> Oturumu kapat
        </button>
      </div>
    </Page>
  );
}
