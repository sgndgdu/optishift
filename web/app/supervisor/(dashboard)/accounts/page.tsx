"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SupervisorAccountsPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/supervisor/personnel"); }, [router]);
  return null;
}
