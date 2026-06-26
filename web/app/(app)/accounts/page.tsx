"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function AccountsPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/personnel"); }, [router]);
  return null;
}
