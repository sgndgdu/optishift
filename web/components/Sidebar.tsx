"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

function usePendingAccounts(isAdmin: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    const tick = () => fetch("/api/users?approval_status=pending")
      .then(r => r.json())
      .then(d => setCount(Array.isArray(d) ? d.length : 0))
      .catch(() => {});
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [isAdmin]);
  return count;
}

function usePendingOvertime() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const locId = localStorage.getItem("optishift_selected_location") || "";
    const tick = () => fetch(`/api/overtime?location_id=${locId}&status=pending`)
      .then(r => r.json())
      .then(d => setCount(Array.isArray(d) ? d.length : 0))
      .catch(() => {});
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return count;
}
import { LayoutDashboard, Users, CalendarClock, Plug, Settings, Zap, LogOut, ChevronDown, Check, Star, MessageSquare, Megaphone, ClipboardList, Coffee, CreditCard, X, BarChart2, UserCog, Archive, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

// simple: true → Basit Mod'da (rules.simple_mode) her zaman görünür; kalanlar "Gelişmiş" grubuna katlanır
const NAV = [
  { href: "/dashboard",    label: "Dashboard",       icon: LayoutDashboard, simple: true },
  { href: "/personnel",    label: "Personel & Hesaplar", icon: Users,       simple: true },
  { href: "/schedule",         label: "Vardiya Planı",  icon: CalendarClock, simple: true },
  { href: "/schedule/archive", label: "Yayın Arşivi",   icon: Archive,       simple: false },
  { href: "/fairness",         label: "Adalet Puanı",   icon: Star,          simple: false },
  { href: "/requests",     label: "Onaylar",           icon: ClipboardList,  simple: true },
  { href: "/open-shifts",  label: "Açık Vardiyalar",   icon: Megaphone,      simple: false },
  { href: "/overtime",     label: "Fazla Mesai",        icon: Timer,          simple: false },
  { href: "/breaks",       label: "Mola Takibi",       icon: Coffee,         simple: false },
  { href: "/reports",      label: "Raporlar",          icon: BarChart2,      simple: false },
  { href: "/chat",         label: "Mesajlaşma",        icon: MessageSquare,  simple: true },
  { href: "/integrations", label: "Entegrasyonlar",   icon: Plug,            simple: false },
  { href: "/billing",      label: "Faturalandırma",   icon: CreditCard,      simple: false },
  { href: "/settings",     label: "Ayarlar",          icon: Settings,        simple: true },
] as const;

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const chatUnread = useChatUnread();
  const pendingAccounts = usePendingAccounts(user?.role === "admin" || user?.role === "supervisor");
  const pendingOvertime = usePendingOvertime();
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [showAdvancedNav, setShowAdvancedNav] = useState(false); // Basit Mod'da "Gelişmiş" grubu
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    let parsedUser: any = null;
    let initialLoc = "";

    try {
      const stored = localStorage.getItem("optishift_manager_user");
      parsedUser = stored ? JSON.parse(stored) : null;
    } catch {}

    if (parsedUser) setUser(parsedUser);

    // Manager: her zaman kendi location_id'sini kullan, localStorage'daki eski değeri yok say
    if (parsedUser?.role === "manager") {
      initialLoc = parsedUser.location_id || "";
    } else {
      try {
        const savedLoc = localStorage.getItem("optishift_selected_location");
        initialLoc = savedLoc || parsedUser?.location_id || "";
      } catch {}
    }

    if (initialLoc) {
      setSelectedLocationId(initialLoc);
      localStorage.setItem("optishift_selected_location", initialLoc);
    }

    // Manager sadece kendi şubesini görür — admin tüm şubelere erişir
    if (parsedUser?.role === "admin" && parsedUser?.org_id) {
      fetch(`/api/locations`)
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setLocations(data);
            const isValid = data.some((l: { id: string }) => l.id === initialLoc);
            if (!isValid) {
              const fallbackId = data[0].id;
              setSelectedLocationId(fallbackId);
              localStorage.setItem("optishift_selected_location", fallbackId);
              const updated = { ...parsedUser, location_id: fallbackId };
              localStorage.setItem("optishift_manager_user", JSON.stringify(updated));
              setUser(updated);
              window.dispatchEvent(new Event("optishift_location_changed"));
            }
          }
        })
        .catch(() => {});
    } else if (parsedUser?.location_id) {
      // Manager: sadece kendi şubesi, dropdown yok
      fetch(`/api/locations`)
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) setLocations(data);
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLocationChange = (locId: string) => {
    setSelectedLocationId(locId);
    const updated = { ...user, location_id: locId };
    localStorage.setItem("optishift_manager_user", JSON.stringify(updated));
    localStorage.setItem("optishift_selected_location", locId);
    setUser(updated);
    setIsDropdownOpen(false);
    window.dispatchEvent(new Event("optishift_location_changed"));
  };

  const handleLogout = () => {
    localStorage.removeItem("optishift_manager_user");
    router.push("/login");
  };

  const activeLocation = locations.find(l => l.id === selectedLocationId);

  // Basit Mod: aktif lokasyonun rules.simple_mode alanından okunur
  const simpleMode = (() => {
    try {
      const r = typeof activeLocation?.rules === "string" ? JSON.parse(activeLocation.rules) : activeLocation?.rules;
      return r?.simple_mode === true;
    } catch { return false; }
  })();

  return (
    <aside className="relative w-72 h-screen shrink-0 bg-white border-r border-slate-100 flex flex-col pt-8 pb-6 px-4">
      {/* Brand */}
      <div className="flex items-center gap-3 px-3 mb-8">
        <Link href="/dashboard" className="flex items-center gap-3 flex-1 group">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-md shadow-primary/20 group-hover:shadow-primary/30 transition-shadow">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-none">OptiShift</h1>
            <p className="text-[10px] font-medium text-slate-400 mt-1 uppercase tracking-wider">Business</p>
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

      {/* Location Selector (Custom Dropdown) */}
      <div className="px-3 mb-8">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Aktif Şube</p>
        <div className="relative">
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full flex items-center justify-between bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-3 hover:bg-slate-100/80 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <div className="flex flex-col items-start truncate">
              <span className="text-sm font-semibold text-slate-800 truncate">
                {activeLocation?.name ?? "Yükleniyor..."}
              </span>
              <span className="text-xs text-slate-500 truncate">
                {user?.org_name ?? "Şirket"}
              </span>
            </div>
            {locations.length > 1 && (
              <ChevronDown size={16} className={cn("text-slate-400 transition-transform duration-200", isDropdownOpen && "rotate-180")} />
            )}
          </button>

          {isDropdownOpen && locations.length > 1 && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setIsDropdownOpen(false)} 
              />
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-xl shadow-xl shadow-slate-200/50 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="max-h-[200px] overflow-y-auto p-1.5 space-y-0.5">
                  {locations.map(loc => {
                    const isSelected = loc.id === selectedLocationId;
                    return (
                      <button
                        key={loc.id}
                        onClick={() => handleLocationChange(loc.id)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-left transition-colors",
                          isSelected ? "bg-primary/5 text-primary font-semibold" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium"
                        )}
                      >
                        <span className="truncate">{loc.name}</span>
                        {isSelected && <Check size={16} className="text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1.5 px-1 overflow-y-auto">
        {(() => {
          const items = NAV.filter(item => !("adminOnly" in item && (item as any).adminOnly) || (user?.role === "admin" || user?.role === "supervisor"));
          const renderItem = ({ href, label, icon: Icon }: { href: string; label: string; icon: any }) => {
            const active       = pathname.startsWith(href);
            const isChat       = href === "/chat";
            const isAccounts   = href === "/personnel";
            const isOvertime   = href === "/overtime";
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 group relative",
                  active
                    ? "bg-primary/5 text-primary"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />
                )}
                <div className="relative shrink-0">
                  <Icon size={18} className={cn("transition-colors", active ? "text-primary" : "text-slate-400 group-hover:text-slate-600")} />
                  {isChat && chatUnread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">{chatUnread}</span>
                  )}
                  {isAccounts && pendingAccounts > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-amber-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">{pendingAccounts}</span>
                  )}
                  {isOvertime && pendingOvertime > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-amber-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">{pendingOvertime}</span>
                  )}
                </div>
                {label}
                {isChat && chatUnread > 0 && (
                  <span className="ml-auto text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{chatUnread}</span>
                )}
                {isAccounts && pendingAccounts > 0 && (
                  <span className="ml-auto text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{pendingAccounts}</span>
                )}
                {isOvertime && pendingOvertime > 0 && (
                  <span className="ml-auto text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{pendingOvertime}</span>
                )}
              </Link>
            );
          };

          if (!simpleMode) return items.map(renderItem);

          // Basit Mod: çekirdek sayfalar + katlanır "Gelişmiş" grubu.
          // Gelişmiş grupta bekleyen mesai onayı varsa veya aktif sayfa oradaysa grup açık başlar.
          const core = items.filter(i => i.simple);
          const advanced = items.filter(i => !i.simple);
          const advancedActive = advanced.some(i => pathname.startsWith(i.href));
          const open = showAdvancedNav || advancedActive || pendingOvertime > 0;
          return (
            <>
              {core.map(renderItem)}
              <button
                onClick={() => setShowAdvancedNav(v => !v)}
                className="w-full flex items-center gap-2 px-3 pt-4 pb-1 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
              >
                Gelişmiş
                <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
                {!open && pendingOvertime > 0 && (
                  <span className="ml-auto bg-amber-500 text-white text-[8px] font-bold rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5">{pendingOvertime}</span>
                )}
              </button>
              {open && advanced.map(renderItem)}
            </>
          );
        })()}
      </nav>

      {/* User Profile & Logout */}
      <div className="mt-auto px-3 pt-6">
        <div className="bg-slate-50 rounded-2xl p-4 flex items-center justify-between border border-slate-100">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-indigo-600 uppercase">
                {user?.name?.charAt(0) ?? "U"}
              </span>
            </div>
            <div className="truncate">
              <p className="text-sm font-bold text-slate-800 truncate">{user?.name ?? "Kullanıcı"}</p>
              <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">
                {user?.role === "manager" ? "Yönetici" : user?.role === "admin" ? "Admin" : "Personel"}
              </p>
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
