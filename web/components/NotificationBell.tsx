"use client";

/**
 * Yönetim paneli bildirim zili: hesaba (notifications.user_id) yazılan bildirimler, /api/notifications/mine.
 * Masaüstünde kenar menünün üstünde, telefonda üst çubukta. Okunmamış sayısı dakikada bir ve sayfaya
 * dönünce tazelenir. Pencerede "Telefon bildirimlerini aç" (lib/pushClient, hesaba bağlı abonelik).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell, BellRing, Check, X } from "lucide-react";
import { timeAgo } from "@/lib/date";
import { pushSupported, subscribePush } from "@/lib/pushClient";
import { cn } from "@/lib/utils";
import { CountBadge } from "@/components/ui/StatusPill";

type Item = { id: number; type: string; title: string; message: string; link: string | null; is_read: boolean; created_at: number };
type PushState = "unsupported" | "default" | "granted" | "denied" | "saving";

const POLL_MS = 60_000;

export default function NotificationBell({ placement }: { placement: "sidebar" | "topbar" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [push, setPush] = useState<PushState>("unsupported");
  const synced = useRef(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/notifications/mine").then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (!d) return;
    setItems(Array.isArray(d.items) ? d.items : []);
    setUnread(Number(d.unread ?? 0));
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, POLL_MS);
    const onFocus = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => { clearTimeout(first); clearInterval(t); document.removeEventListener("visibilitychange", onFocus); };
  }, [load]);

  // İzin daha önce verildiyse abonelik bu hesaba sessizce yeniden bağlanır (oturum başına bir kez)
  useEffect(() => {
    const t = setTimeout(() => {
      if (!pushSupported()) { setPush("unsupported"); return; }
      const perm = Notification.permission as PushState;
      setPush(perm);
      if (perm === "granted" && !synced.current) { synced.current = true; subscribePush({ scope: "user" }); }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const enablePush = async () => {
    setPush("saving");
    const perm = await Notification.requestPermission().catch(() => "denied" as NotificationPermission);
    if (perm !== "granted") { setPush(perm === "denied" ? "denied" : "default"); return; }
    const ok = await subscribePush({ scope: "user" });
    setPush(ok ? "granted" : "default");
  };

  const markAll = async () => {
    setItems(list => list?.map(i => ({ ...i, is_read: true })) ?? list);
    setUnread(0);
    await fetch("/api/notifications/mine", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }).catch(() => {});
  };

  const openItem = async (it: Item) => {
    if (!it.is_read) {
      setItems(list => list?.map(i => (i.id === it.id ? { ...i, is_read: true } : i)) ?? list);
      setUnread(n => Math.max(0, n - 1));
      fetch("/api/notifications/mine", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id }) }).catch(() => {});
    }
    setOpen(false);
    if (it.link) router.push(it.link);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button onClick={() => { setOpen(o => !o); if (!open) load(); }} aria-label={unread ? `Bildirimler, ${unread} okunmamış` : "Bildirimler"}
        aria-expanded={open}
        className={cn("relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700",
          placement === "topbar" && "ml-auto")}>
        <Bell size={20} />
        {unread > 0 && (
          <CountBadge className="absolute right-0.5 top-0.5" count={unread > 9 ? "9+" : unread} />
        )}
      </button>

      {/* Sayfanın en üst katmanına: kenar menünün kapsayıcısı (transform) fixed pencereyi kendi içine hapsediyordu */}
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[60] bg-black/20 lg:bg-transparent" onClick={() => setOpen(false)} />
          <div role="dialog" aria-label="Bildirimler"
            className={cn("fixed z-[61] flex flex-col overflow-hidden bg-white shadow-xl ring-1 ring-slate-900/10",
              "inset-x-0 top-0 max-h-[85vh] rounded-b-2xl lg:inset-x-auto lg:top-6 lg:left-[19rem] lg:w-[400px] lg:max-h-[640px] lg:rounded-2xl")}>
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <p className="flex-1 text-sm font-bold text-slate-900">Bildirimler</p>
              {unread > 0 && (
                <button onClick={markAll} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-forest-700 hover:bg-forest-50">
                  <Check size={14} /> Tümünü okundu say
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Kapat" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
            </div>

            {push !== "granted" && (
              <div className="border-b border-slate-100 bg-forest-50/60 px-4 py-3">
                {push === "unsupported" ? (
                  <p className="text-xs text-slate-600">Bu tarayıcı telefon bildirimini desteklemiyor. iPhone&apos;da önce Safari&apos;de Paylaş › Ana Ekrana Ekle ile uygulamayı ekleyin, sonra oradan açın.</p>
                ) : push === "denied" ? (
                  <p className="text-xs text-slate-600">Telefon bildirimleri bu tarayıcıda engellenmiş. Tarayıcı ayarlarından bu site için bildirimlere izin verin.</p>
                ) : (
                  <div className="flex items-center gap-3">
                    <BellRing size={18} className="shrink-0 text-forest-700" />
                    <p className="flex-1 text-xs text-forest-900">Biri izin istediğinde ya da vardiyasına gelemeyeceğinde telefonunuza hemen haber gelsin.</p>
                    <button onClick={enablePush} disabled={push === "saving"}
                      className="min-h-[36px] shrink-0 rounded-lg bg-forest-700 px-3 text-xs font-semibold text-white hover:bg-forest-800 disabled:opacity-60">
                      {push === "saving" ? "Açılıyor…" : "Telefon bildirimlerini aç"}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {items === null ? (
                <p className="px-4 py-6 text-sm text-slate-400">Yükleniyor…</p>
              ) : items.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-500">Henüz bildiriminiz yok.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {items.map(it => (
                    <li key={it.id}>
                      <button onClick={() => openItem(it)} className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50", !it.is_read && "bg-forest-50/40")}>
                        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", it.is_read ? "bg-transparent" : "bg-red-500")} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-slate-800">{it.title}</span>
                          <span className="mt-0.5 block text-sm text-slate-600">{it.message}</span>
                          <span className="mt-1 block text-xs text-slate-400">{timeAgo(it.created_at)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
