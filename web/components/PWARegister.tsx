"use client";

import { useEffect } from "react";
import { subscribePush } from "@/lib/pushClient";

export function PWARegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Development'ta SW'yi kaldır (cache sorunlarını önler)
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {});

    // Portal kullanıcısı (personel) giriş yapmışsa push'a abone ol
    try {
      const stored = localStorage.getItem("optishift_portal_user");
      const user = stored ? JSON.parse(stored) : null;
      if (user?.personnel_id) {
        // Bildirim izni iste ve abone ol
        Notification.requestPermission().then((perm) => {
          if (perm === "granted") subscribePush({ personnel_id: user.personnel_id });
        });
      }
    } catch { /* localStorage erişim hatası */ }
  }, []);

  return null;
}
