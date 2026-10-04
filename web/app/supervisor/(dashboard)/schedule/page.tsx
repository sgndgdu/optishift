"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { openBranchPanel } from "@/lib/sessionRouting";

// Eski salt okunur plan görünümü kaldırıldı: patron/bölge müdürü şubenin gerçek planını açar
// (tek panel). Eski bağlantılar (?location_id=) çalışmaya devam etsin diye burası yönlendirir.
function Redirect() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("optishift_supervisor_user") || "null");
      const loc = params.get("location_id");
      if (user && loc) openBranchPanel(user, loc);
    } catch { /* oturum yoksa /schedule girişe yönlendirir */ }
    const week = params.get("week");
    router.replace(week ? `/schedule?week=${encodeURIComponent(week)}` : "/schedule");
  }, [params, router]);
  return <div className="p-8 text-slate-500">Plan açılıyor...</div>;
}

export default function SupervisorScheduleRedirect() {
  return <Suspense><Redirect /></Suspense>;
}
