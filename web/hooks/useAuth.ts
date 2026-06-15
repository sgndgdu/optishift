"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Müdür / admin portalı için auth
export function useManagerAuth() {
  const router = useRouter();
  const [user, setUser]     = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_manager_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed) setUser(parsed);
    } catch {}
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!user) { router.push("/login"); return; }
  }, [mounted, user, router]);

  return { user, mounted };
}

// Personel portalı için auth
export function usePortalAuth() {
  const router = useRouter();
  const [user, setUser]     = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_portal_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed) setUser(parsed);
    } catch {}
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!user) { router.push("/login"); return; }
  }, [mounted, user, router]);

  return { user, mounted };
}

// Süpervizör portalı için auth
export function useSupervisorAuth() {
  const router = useRouter();
  const [user, setUser]     = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_supervisor_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed) setUser(parsed);
    } catch {}
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!user) { router.push("/login"); return; }
    if (user.role !== "supervisor" && user.role !== "admin") { router.push("/login"); return; }
  }, [mounted, user, router]);

  return { user, mounted };
}
