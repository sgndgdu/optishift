/**
 * Tarayıcıda telefon bildirimi (Web Push) aboneliği: TEK KAYNAK. Ekip üyesi portalı (components/PWARegister,
 * personnel_id ile) ve yönetim paneli bildirim zili (components/NotificationBell, hesaba bağlı) kullanır.
 */
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}

/** Bu tarayıcıda telefon bildirimi mümkün mü (iPhone'da sadece ana ekrana eklenmiş uygulamada) */
export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!VAPID_PUBLIC_KEY;
}

/** Aboneliği açar (yoksa oluşturur) ve sunucuya kaydeder. body: { personnel_id } ya da { scope: "user" } */
export async function subscribePush(body: Record<string, unknown>): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    // Geliştirmede SW kaydı yok (PWARegister); burada kendimiz kaydederiz ki zil yerelde de denenebilsin
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
    await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const r = await fetch("/api/push-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, subscription: sub.toJSON() }),
    });
    return r.ok;
  } catch {
    // İzin verilmediyse ya da tarayıcı desteklemiyorsa sessizce geç
    return false;
  }
}
