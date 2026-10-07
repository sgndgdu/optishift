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
    if (!user) { router.push(managerFallbackPath()); return; }
  }, [mounted, user, router]);

  return { user, mounted };
}

/** Şube paneli oturumu yoksa gidilecek yer: hesap sahibi / bölge sorumlusu şubeye girmeden şube sayfası açarsa
 *  (yer imi, eski bağlantı) Tüm Şubeler'e döner; oturumu açıkken giriş ekranına atılıyordu (tam test 2026-10-05). */
export function managerFallbackPath(): string {
  try {
    const sup = JSON.parse(localStorage.getItem("optishift_supervisor_user") || "null");
    if (sup && (sup.role === "admin" || sup.role === "supervisor")) return "/supervisor";
    // Ekip üyesi yönetim adresini açarsa kendi ekranına
    if (localStorage.getItem("optishift_portal_user")) return "/portal";
  } catch { /* yok say */ }
  return "/login";
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
    // Tüm Şubeler yetkisi olmayan: şube sorumlusu kendi paneline, ekip üyesi kendi ekranına
    const elsewhere = () => {
      try {
        if (localStorage.getItem("optishift_manager_user")) return "/dashboard";
        if (localStorage.getItem("optishift_portal_user")) return "/portal";
      } catch { /* yok say */ }
      return "/login";
    };
    if (!user) { router.push(elsewhere()); return; }
    if (user.role !== "supervisor" && user.role !== "admin") { router.push(elsewhere()); return; }
  }, [mounted, user, router]);

  return { user, mounted };
}
