"use client";

import { useEffect } from "react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}

async function subscribeToPush(personnelId: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (!VAPID_PUBLIC_KEY) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    await fetch("/api/push-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personnel_id: personnelId, subscription: sub.toJSON() }),
    });
  } catch {
    // Kullanıcı izni vermemişse veya tarayıcı desteklemiyorsa sessizce geç
  }
}

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
          if (perm === "granted") subscribeToPush(user.personnel_id);
        });
      }
    } catch { /* localStorage erişim hatası */ }
  }, []);

  return null;
}
