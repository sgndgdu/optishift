"use client";
/**
 * Şube Ayarları › Hesabım. Profil/şifre formunun TEK yeri: çok şubeli patron ve bölge müdürü için
 * Tüm Şubeler › Ayarlar (orada zaten var), burada sadece oraya bağlantı. Tek şubeli patron ve şube
 * müdürü için form burada; patron paket ve ödemeye de buradan geçer (menüdeki ayrı öğe kaldırıldı).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, CreditCard, UserCog } from "lucide-react";
import AccountTab from "@/components/AccountTab";
import { FEATURES } from "@/lib/features";

export default function BranchAccountTab({ viewerRole }: { viewerRole: string | null }) {
  const [multi, setMulti] = useState<boolean | null>(null);
  useEffect(() => {
    if (viewerRole !== "admin" && viewerRole !== "supervisor") { void Promise.resolve().then(() => setMulti(false)); return; }
    fetch("/api/locations").then(r => r.json())
      .then(d => setMulti(Array.isArray(d) && d.length > 1))
      .catch(() => setMulti(false));
  }, [viewerRole]);

  if (multi === null) return null;
  if (multi) {
    return (
      <Link href="/supervisor/settings" className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 hover:bg-slate-50">
        <UserCog size={18} className="text-forest-600 shrink-0" />
        <span className="flex-1 text-sm text-slate-700">
          Ad, e-posta, şifre{viewerRole === "admin" ? " ve paket" : ""} <b>Tüm Şubeler › Ayarlar</b>&apos;da.
        </span>
        <ChevronRight size={16} className="text-slate-400" />
      </Link>
    );
  }
  return (
    <div className="space-y-4">
      {viewerRole === "admin" && FEATURES.billing && (
        <Link href="/billing" className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 hover:bg-slate-50">
          <CreditCard size={18} className="text-forest-600 shrink-0" />
          <span className="flex-1 text-sm font-semibold text-slate-700">Paket ve ödeme</span>
          <ChevronRight size={16} className="text-slate-400" />
        </Link>
      )}
      <AccountTab storageKey="optishift_manager_user" allowNameEdit={true} />
    </div>
  );
}
