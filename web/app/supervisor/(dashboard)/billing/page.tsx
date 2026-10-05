"use client";
import BillingView from "@/components/billing/BillingView";

// Tüm Şubeler'den paket yönetimi: bir şubenin paneline geçmeden (paket işletmenin, şubenin değil)
export default function SupervisorBillingPage() {
  return <BillingView storageKey="optishift_supervisor_user" returnPath="/supervisor/billing" />;
}
