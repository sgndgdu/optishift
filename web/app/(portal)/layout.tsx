"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Home, Calendar, Clock, Inbox, MessageSquare, UserCircle, Zap, LogOut, X, BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import ImpersonationBanner from "@/components/ImpersonationBanner";

function useChatUnread() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const tick = () => fetch("/api/messages/unread-count").then(r => r.json()).then(d => {
      const n = d?.count ?? 0;
      setCount(n);
      document.title = n > 0 ? `(${n}) OptiShift` : "OptiShift";
    }).catch(() => {});
    tick();
    const id = setInterval(tick, 5_000);
    return () => clearInterval(id);
  }, []);
  return count;
}

function useNotifUnread() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const tick = () => fetch("/api/notifications/unread-count").then(r => r.json()).then(d => {
      setCount(d?.count ?? 0);
    }).catch(() => {});
    tick();
    const id = setInterval(tick, 15_000);
    // Bildirim okunduğunda sayfadan event gelirse anında sıfırla
    const onRead = () => tick();
    window.addEventListener("notif-read", onRead);
    return () => { clearInterval(id); window.removeEventListener("notif-read", onRead); };
  }, []);
  return count;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const NAV = [
  { href: "/portal",              label: "Özet",        icon: Home,          exact: true },
  { href: "/portal/calendar",     label: "Vardiyalar",  icon: Calendar },
  { href: "/portal/availability", label: "Müsaitlik",   icon: Clock },
  { href: "/portal/requests",     label: "Talepler",    icon: Inbox },
  { href: "/portal/chat",         label: "Sohbet",      icon: MessageSquare },
  { href: "/portal/notifications", label: "Bildirimler", icon: BellRing },
  { href: "/portal/settings",     label: "Hesabım",     icon: UserCircle },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [availCollectionEnabled, setAvailCollectionEnabled] = useState(true);
  const chatUnread = useChatUnread();
  const notifUnread = useNotifUnread();

  useEffect(() => {
    try {
      const raw = localStorage.getItem("optishift_portal_user");
      if (raw) {
        const u = JSON.parse(raw);
        setUser(u);
        // Müsaitlik toplama kapalıysa nav'dan Müsaitlik linkini gizle (locations.rules)
        if (u?.location_id) {
          fetch(`/api/locations?id=${u.location_id}`)
            .then(r => r.json())
            .then(data => {
              const loc = Array.isArray(data) ? data[0] : null;
              if (!loc?.rules) return;
              const rules = typeof loc.rules === "string" ? JSON.parse(loc.rules) : loc.rules;
              setAvailCollectionEnabled(rules?.availability_collection_enabled !== false);
            })
            .catch(() => {});
        }
      }
    } catch {}
    setMounted(true);
  }, []);

  const nav = NAV.filter(i => availCollectionEnabled || i.href !== "/portal/availability");
  const bottomNav = nav.slice(0, 5);

  if (!mounted) return null;

  const handleLogout = () => {
    localStorage.removeItem("optishift_portal_user");
    router.push("/login");
  };

  return (
    <div className="flex h-screen bg-slate-50/50 overflow-hidden">
      <ImpersonationBanner />

      {/* ── DESKTOP SIDEBAR (md ve üzeri) ─────────────────────────────────── */}
      <aside className="hidden md:flex w-64 h-screen shrink-0 bg-white border-r border-slate-100 flex-col pt-8 pb-6 px-4">
        <Link href="/portal" className="flex items-center gap-3 px-3 mb-8 group">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-md shadow-primary/20 group-hover:shadow-primary/30 transition-shadow">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-none">OptiShift</h1>
            <p className="text-[10px] font-medium text-slate-400 mt-1 uppercase tracking-wider">Personel</p>
          </div>
        </Link>

        <nav className="flex-1 space-y-1 px-1 overflow-y-auto">
          {nav.map(({ href, label, icon: Icon, exact }) => {
            const isActive = exact ? pathname === href : pathname.startsWith(href);
            const badge =
              href === "/portal/chat" ? chatUnread :
              href === "/portal/notifications" ? notifUnread : 0;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 group relative",
                  isActive
                    ? "bg-primary/5 text-primary"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />
                )}
                <div className="relative shrink-0">
                  <Icon size={18} className={cn("transition-colors", isActive ? "text-primary" : "text-slate-400 group-hover:text-slate-600")} />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">{badge}</span>
                  )}
                </div>
                {label}
                {badge > 0 && (
                  <span className="ml-auto text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{badge}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto px-3 pt-6">
          <div className="bg-slate-50 rounded-2xl p-4 flex items-center justify-between border border-slate-100">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-indigo-600 uppercase">{user?.name?.charAt(0) ?? "P"}</span>
              </div>
              <div className="truncate">
                <p className="text-sm font-bold text-slate-800 truncate">{user?.name ?? "Personel"}</p>
                <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">Personel</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors shrink-0"
              title="Çıkış Yap"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ──────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobil Top Bar */}
        <div className="md:hidden flex items-center justify-between px-4 h-14 shrink-0 bg-white border-b border-slate-100 z-30">
          <Link href="/portal" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <Zap size={13} className="text-white" />
            </div>
            <span className="font-bold text-slate-800">OptiShift</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link href="/portal/notifications" className={cn("relative p-2 rounded-xl transition-colors", pathname === "/portal/notifications" ? "text-primary bg-primary/8" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100")}>
              <BellRing size={21} />
              {notifUnread > 0 && (
                <span className="absolute top-1 right-1 min-w-[14px] h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">{notifUnread}</span>
              )}
            </Link>
            <Link href="/portal/settings" className={cn("p-2 rounded-xl transition-colors", pathname === "/portal/settings" ? "text-primary bg-primary/8" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100")}>
              <UserCircle size={22} />
            </Link>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="pb-20 md:pb-0">
            {children}
          </div>
        </div>

        {/* Mobil Alt Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-border/40 px-3 py-2 z-50">
          <ul className="flex items-center justify-around">
            {bottomNav.map(({ href, label, icon: Icon, exact }) => {
              const isActive = exact ? pathname === href : pathname.startsWith(href);
              const isChat   = href === "/portal/chat";
              return (
                <li key={href} className="flex-1">
                  <Link href={href} className={cn("flex flex-col items-center gap-1 w-full py-1.5 rounded-2xl transition-all duration-150 relative", isActive ? "text-primary" : "text-slate-400")}>
                    {isActive && <span className="absolute inset-0 bg-primary/5 rounded-2xl" />}
                    <div className="relative">
                      <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className="relative" />
                      {isChat && chatUnread > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">{chatUnread}</span>
                      )}
                    </div>
                    <span className={cn("text-[10px] relative", isActive ? "font-bold" : "font-medium")}>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </main>
    </div>
  );
}
