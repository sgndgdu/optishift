"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, CalendarClock, Settings,
  Zap, LogOut, MessageSquare, Building2, BarChart3, X, UserCog
} from "lucide-react";
import { cn } from "@/lib/utils";

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

function usePendingAccounts() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const tick = () => fetch("/api/users?approval_status=pending")
      .then(r => r.json())
      .then(d => setCount(Array.isArray(d) ? d.length : 0))
      .catch(() => {});
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);
  return count;
}

const NAV = [
  { href: "/supervisor",            label: "Genel Bakış",    icon: LayoutDashboard, exact: true },
  { href: "/supervisor/schedule",   label: "Vardiya Planı",  icon: CalendarClock },
  { href: "/supervisor/personnel",  label: "Personel & Hesaplar", icon: Users },
  { href: "/supervisor/reports",    label: "Raporlar",       icon: BarChart3 },
  { href: "/supervisor/chat",       label: "Mesajlaşma",     icon: MessageSquare },
  { href: "/supervisor/settings",   label: "Ayarlar",        icon: Settings },
];

export default function SupervisorSidebar({ onClose }: { onClose?: () => void }) {
  const pathname  = usePathname();
  const router    = useRouter();
  const [user, setUser]       = useState<any>(null);
  const [orgName, setOrgName] = useState<string>("");
  const chatUnread = useChatUnread();
  const pendingAccounts = usePendingAccounts();

  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_supervisor_user");
      if (stored) {
        const parsed = JSON.parse(stored);
        setUser(parsed);
        if (parsed?.org_id) {
          fetch(`/api/admin/organizations?id=${parsed.org_id}`)
            .then(r => r.json())
            .then(data => { if (data?.[0]?.name) setOrgName(data[0].name); })
            .catch(() => {});
        }
      }
    } catch {}
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("optishift_supervisor_user");
    router.push("/login");
  };

  const roleLabel = user?.role === "admin" ? "Admin" : "Süpervizör";

  return (
    <aside className="relative w-72 h-screen shrink-0 bg-white border-r border-slate-100 flex flex-col pt-8 pb-6 px-4">
      {/* Brand */}
      <div className="flex items-center gap-3 px-3 mb-8">
        <Link href="/supervisor" className="flex items-center gap-3 flex-1 group">
          <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center shadow-md shadow-violet-200 group-hover:shadow-violet-300 transition-shadow">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-none">OptiShift</h1>
            <p className="text-[10px] font-medium text-violet-500 mt-1 uppercase tracking-wider">Supervisor</p>
          </div>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Org Info */}
      {user?.org_id && (
        <div className="px-3 mb-8">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Organizasyon</p>
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-3">
            <Building2 size={16} className="text-violet-500 shrink-0" />
            <div className="truncate">
              <span className="text-sm font-semibold text-slate-800 truncate block">
                {orgName || user?.org_name || "Organizasyon"}
              </span>
              <span className="text-xs text-slate-500">{roleLabel}</span>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-1.5 px-1">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active      = exact ? pathname === href : pathname.startsWith(href);
          const isChat      = href === "/supervisor/chat";
          const isAccounts  = href === "/supervisor/personnel";
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 group relative",
                active
                  ? "bg-violet-50 text-violet-700"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-violet-600 rounded-r-full" />
              )}
              <div className="relative shrink-0">
                <Icon size={18} className={cn("transition-colors", active ? "text-violet-600" : "text-slate-400 group-hover:text-slate-600")} />
                {isChat && chatUnread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">{chatUnread}</span>
                )}
                {isAccounts && pendingAccounts > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-amber-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">{pendingAccounts}</span>
                )}
              </div>
              {label}
              {isChat && chatUnread > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{chatUnread}</span>
              )}
              {isAccounts && pendingAccounts > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{pendingAccounts}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Profile & Logout */}
      <div className="mt-auto px-3 pt-6">
        <div className="bg-slate-50 rounded-2xl p-4 flex items-center justify-between border border-slate-100">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-violet-600 uppercase">
                {user?.name?.charAt(0) ?? "S"}
              </span>
            </div>
            <div className="truncate">
              <p className="text-sm font-bold text-slate-800 truncate">{user?.name ?? "Kullanıcı"}</p>
              <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">{roleLabel}</p>
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
  );
}
