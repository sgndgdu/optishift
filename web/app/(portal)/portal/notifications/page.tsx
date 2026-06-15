"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, CalendarDays, RefreshCw, AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";

function getNotifHref(notif: any): string | null {
  switch (notif.type) {
    case "schedule":      return "/portal/calendar";
    case "leave_approved":
    case "leave_rejected":
    case "trade_request":
    case "open_shift":    return "/portal/requests";
    case "availability":  return "/portal/availability";
    default:              return null;
  }
}

const TYPE_CONFIG: Record<string, { Icon: any; color: string }> = {
  schedule:      { Icon: CalendarDays,  color: "bg-blue-100 text-blue-600" },
  leave_approved: { Icon: CheckCircle2, color: "bg-emerald-100 text-emerald-600" },
  leave_rejected: { Icon: AlertTriangle, color: "bg-red-100 text-red-600" },
  trade_request:  { Icon: RefreshCw,    color: "bg-purple-100 text-purple-600" },
  alert:          { Icon: AlertTriangle, color: "bg-amber-100 text-amber-600" },
};

function timeAgo(ts: number | null): string {
  if (!ts) return "";
  const diff = Date.now() - ts * 1000;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "Az önce";
  if (hours < 1) return `${minutes} dakika önce`;
  if (hours < 24) return `${hours} saat önce`;
  return `${days} gün önce`;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_portal_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed) setUser(parsed);
      setMounted(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!mounted) return;
    if (!user) router.push("/login");
  }, [mounted, user, router]);

  useEffect(() => {
    if (!user?.personnel_id) return;

    fetch(`/api/notifications?personnel_id=${user.personnel_id}`)
      .then((r) => r.json())
      .then((data) => setNotifs(Array.isArray(data) ? data : []))
      .catch(() => setNotifs([]))
      .finally(() => setLoading(false));
  }, [user]);

  const markRead = async (id: number) => {
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    await fetch(`/api/notifications?id=${id}&personnel_id=${user.personnel_id}`, { method: "PUT" });
  };

  const markAllRead = async () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await fetch(`/api/notifications?personnel_id=${user.personnel_id}`, { method: "PUT" });
  };

  if (!mounted) return <div className="space-y-4" />;

  const unreadCount = notifs.filter((n) => !n.is_read).length;

  return (
    <div className="p-5 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/portal" className="p-2 -ml-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors shrink-0">
          <ArrowLeft size={22} />
        </Link>
        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
          <Bell size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-slate-800">Bildirimler</h1>
          <p className="text-xs text-slate-500">{unreadCount > 0 ? `${unreadCount} okunmamış` : "Tümü okundu"}</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-xs text-indigo-600 font-bold hover:underline shrink-0">
            Tümünü Oku
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse flex gap-4">
              <div className="w-10 h-10 bg-slate-100 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-slate-100 rounded w-1/2" />
                <div className="h-2 bg-slate-100 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : notifs.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Bell size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Henüz bildirim yok</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifs.map((notif) => {
            const cfg = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG.alert;
            const Icon = cfg.Icon;
            return (
              <div
                key={notif.id}
                onClick={async () => {
                  if (!notif.is_read) await markRead(notif.id);
                  const href = getNotifHref(notif);
                  if (href) router.push(href);
                }}
                className={`p-4 rounded-2xl border transition-all flex gap-4 cursor-pointer ${notif.is_read ? "bg-white border-slate-200" : "bg-indigo-50/50 border-indigo-100 shadow-sm"}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${cfg.color}`}>
                  <Icon size={18} />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <h3 className={`text-sm ${notif.is_read ? "font-semibold text-slate-700" : "font-bold text-indigo-900"}`}>
                      {notif.title}
                      {!notif.is_read && <span className="ml-2 inline-block w-2 h-2 bg-indigo-500 rounded-full align-middle" />}
                    </h3>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap mt-0.5">{timeAgo(notif.created_at)}</span>
                  </div>
                  <p className={`text-xs leading-relaxed ${notif.is_read ? "text-slate-500" : "text-indigo-800/80 font-medium"}`}>
                    {notif.message}
                  </p>

                  {!notif.is_read && notif.type === "trade_request" && (
                    <div className="flex gap-2 mt-3">
                      <button className="flex-1 bg-white border border-slate-200 text-slate-600 py-1.5 text-xs font-bold rounded-lg hover:bg-slate-50">Reddet</button>
                      <button className="flex-1 bg-indigo-600 text-white py-1.5 text-xs font-bold rounded-lg hover:bg-indigo-700">İncele</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
