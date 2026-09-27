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

// Onaylar rozeti: Onaylar sayfasının "bekleyen" saydığı dört kalemin toplamı
// (takas, değişiklik, izin, fazla mesai). Aynı filtreler requests/page.tsx'te.
function usePendingApprovals(orgId: string | undefined) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!orgId) return;
    const tick = () => {
      const locId = localStorage.getItem("optishift_selected_location") || "";
      const list = (url: string) => fetch(url).then(r => r.json()).then(d => (Array.isArray(d) ? d : [])).catch(() => []);
      Promise.all([
        list(`/api/swap-requests?org_id=${orgId}&location_id=${locId}&status=peer_accepted`),
        list(`/api/shift-edit-requests?org_id=${orgId}&location_id=${locId}`),
        list(`/api/leave-requests?location_id=${locId}`),
        list(`/api/overtime?location_id=${locId}&status=pending`),
      ]).then(([swaps, edits, leaves, overtimes]) => setCount(
        swaps.filter((s: any) => s.status === "peer_accepted").length +
        edits.filter((e: any) => e.status === "pending").length +
        leaves.filter((l: any) => l.status === "pending").length +
        overtimes.filter((o: any) => o.status === "pending").length
      ));
    };
    tick();
    const id = setInterval(tick, 30_000);
    window.addEventListener("optishift_location_changed", tick);
    return () => { clearInterval(id); window.removeEventListener("optishift_location_changed", tick); };
  }, [orgId]);
  return count;
}
import { LayoutDashboard, Users, CalendarClock, Plug, Settings, LogOut, ChevronDown, Check, MessageSquare, Megaphone, ClipboardList, Coffee, CreditCard, X, BarChart2, UserCog, Timer, HelpCircle, Wallet, ClipboardCheck } from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { FEATURES, type FeatureKey } from "@/lib/features";
import { isModuleOn, parseRules, type ModuleKey } from "@/lib/moduleVisibility";

// group: "main"  → her zaman görünen 4 ana bağlantı (üstte)
// group: "more"  → katlanır "Daha Fazla" grubu (kapalı başlar)
// group: "footer"→ en altta, her zaman görünür (Ayarlar)
// feature → lib/features.ts bayrağı kapalıysa link hiç gösterilmez (build geneli)
// module  → aktif şubede bu özellik kapalıysa link hiç gösterilmez (varsayılanlar lib/moduleVisibility.ts'te)
// Yayın Arşivi Vardiya Planı'nın, Adalet Puanı Raporlar'ın içinde; menüde ayrı bağlantıları yok.
const NAV = [
  { href: "/dashboard",    label: "Ana Sayfa",              icon: LayoutDashboard, group: "main" },
  { href: "/schedule",     label: "Vardiya Planı",          icon: CalendarClock,   group: "main" },
  { href: "/personnel",    label: "Ekip",                   icon: Users,           group: "main" },
  { href: "/requests",     label: "Onaylar",                icon: ClipboardList,   group: "main" },
  { href: "/reports",      label: "Raporlar",               icon: BarChart2,       group: "more" },
  { href: "/chat",         label: "Mesajlaşma",             icon: MessageSquare,   group: "more", module: "chat_enabled" },
  { href: "/open-shifts",  label: "Açık Vardiyalar",        icon: Megaphone,       group: "more", module: "open_shifts_enabled" },
  { href: "/overtime",     label: "Fazla Mesai",            icon: Timer,           group: "more", module: "overtime_tracking_enabled" },
  { href: "/tip-pools",    label: "Bahşiş Havuzu",          icon: Wallet,          group: "more", module: "tip_pooling_enabled" },
  { href: "/handovers",    label: "Devir-Teslim Kayıtları", icon: ClipboardCheck,  group: "more", module: "handover_log_enabled" },
  { href: "/breaks",       label: "Mola Takibi",            icon: Coffee,          group: "more", feature: "breaks" },
  { href: "/integrations", label: "Entegrasyonlar",         icon: Plug,            group: "more", feature: "integrations" },
  { href: "/billing",      label: "Faturalandırma",         icon: CreditCard,      group: "more", feature: "billing" },
  { href: "/settings",     label: "Ayarlar",                icon: Settings,        group: "footer" },
] as const;

const MORE_OPEN_KEY = "optishift_nav_more_open";

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const chatUnread = useChatUnread();
  const pendingAccounts = usePendingAccounts(user?.role === "admin" || user?.role === "supervisor");
  const pendingApprovals = usePendingApprovals(user?.org_id);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [orgName, setOrgName] = useState<string>(""); // şube kutusundaki işletme adı (/api/organizations)
  const [moreOpen, setMoreOpen] = useState(false); // "Daha Fazla" grubu, tercih localStorage'da hatırlanır

  const toggleMore = () => setMoreOpen(v => {
    try { localStorage.setItem(MORE_OPEN_KEY, v ? "0" : "1"); } catch { /* yok say */ }
    return !v;
  });
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    let parsedUser: any = null;
    let initialLoc = "";

    try {
      const stored = localStorage.getItem("optishift_manager_user");
      parsedUser = stored ? JSON.parse(stored) : null;
    } catch {}

    if (parsedUser) setUser(parsedUser);
    try { if (localStorage.getItem(MORE_OPEN_KEY) === "1") setMoreOpen(true); } catch { /* yok say */ }

    // Giriş yanıtı işletme adını taşımıyor; oturumdaki işletmeyi ayrıca sor
    fetch("/api/organizations")
      .then(r => (r.ok ? r.json() : null))
      .then(org => { if (typeof org?.name === "string") setOrgName(org.name); })
      .catch(() => {});

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

  // Aktif şubenin rules objesi — özellik aç/kapa bayrakları buradan okunur
  const rules = parseRules(activeLocation?.rules);


  const items = NAV
    .filter(item => !("feature" in item) || FEATURES[(item as any).feature as FeatureKey])
    .filter(item => !("module" in item) || isModuleOn(rules, item.module as ModuleKey))
    .filter(item => !("adminOnly" in item && (item as any).adminOnly) || (user?.role === "admin" || user?.role === "supervisor"));
  const badgeOf = (href: string) =>
    href === "/chat"      ? { n: chatUnread,       tone: "bg-red-500" } :
    href === "/personnel" ? { n: pendingAccounts,  tone: "bg-amber-500" } :
    href === "/requests"  ? { n: pendingApprovals, tone: "bg-amber-500" } :
    { n: 0, tone: "" };
  const renderItem = ({ href, label, icon: Icon }: { href: string; label: string; icon: any }) => {
    const active = pathname.startsWith(href);
    const badge  = badgeOf(href);
    return (
      <Link
        key={href}
        href={href}
        onClick={onClose}
        className={cn(
          "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 group relative",
          active
            ? "bg-primary/10 text-primary"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
        )}
      >
        {active && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />
        )}
        <Icon size={18} className={cn("shrink-0 transition-colors", active ? "text-primary" : "text-slate-400 group-hover:text-slate-600")} />
        {label}
        {badge.n > 0 && (
          <span className={cn("ml-auto text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center", badge.tone)}>{badge.n}</span>
        )}
      </Link>
    );
  };

  const main   = items.filter(i => i.group === "main");
  const more   = items.filter(i => i.group === "more");
  const footer = items.filter(i => i.group === "footer");
  // Aktif sayfa gruptaysa grup açık görünür; kapalıyken grup içindeki okunmamış mesaj başlıkta gösterilir
  const open = moreOpen || more.some(i => pathname.startsWith(i.href));
  const hiddenUnread = more.some(i => i.href === "/chat") ? chatUnread : 0;

  return (
    <aside className="relative w-72 h-screen shrink-0 bg-white border-r border-slate-100 flex flex-col pt-8 pb-6 px-4">
      {/* Brand */}
      <div className="flex items-center gap-3 px-3 mb-8">
        <Link href="/dashboard" className="flex items-center gap-3 flex-1 group">
          <Logo size="md" className="shadow-md shadow-primary/20 group-hover:shadow-primary/30 transition-shadow" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-none">OptiShift</h1>
            <p className="text-[10px] font-medium text-slate-400 mt-1 uppercase tracking-wider">Yönetim Paneli</p>
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
              {(orgName || user?.org_name) && (
                <span className="text-xs text-slate-500 truncate">
                  {orgName || user?.org_name}
                </span>
              )}
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

      {/* Navigation: ana bağlantılar + katlanır grup (kaydırılabilir) */}
      <nav className="flex-1 space-y-1.5 px-1 overflow-y-auto">
        {main.map(renderItem)}
        {more.length > 0 && (
          <>
            <button
              onClick={toggleMore}
              aria-expanded={open}
              className="w-full flex items-center gap-2 px-3 pt-4 pb-1 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
            >
              Daha Fazla
              <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
              {!open && hiddenUnread > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[8px] font-bold rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5">{hiddenUnread}</span>
              )}
            </button>
            {open && more.map(renderItem)}
          </>
        )}
      </nav>

      {/* Ayarlar: kaydırma alanının dışında, grup açıkken de hep görünür */}
      {footer.length > 0 && <div className="px-1 pt-3 mt-2 border-t border-slate-100 space-y-1.5">{footer.map(renderItem)}</div>}

      {/* Yardım */}
      <div className="px-1 pt-2">
        <a
          href="/kilavuz?role=manager"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        >
          <HelpCircle size={18} className="text-slate-400" />
          Yardım
        </a>
      </div>

      {/* User Profile & Logout */}
      <div className="mt-auto px-3 pt-6">
        <div className="bg-slate-50 rounded-2xl p-4 flex items-center justify-between border border-slate-100">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-full bg-forest-100 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-forest-600 uppercase">
                {user?.name?.charAt(0) ?? "U"}
              </span>
            </div>
            <div className="truncate">
              <p className="text-sm font-bold text-slate-800 truncate">{user?.name ?? "Kullanıcı"}</p>
              <p className={cn(
                "text-[10px] font-medium tracking-wide uppercase",
                user?.role === "admin" ? "text-ember-600" : user?.role === "manager" ? "text-forest-600" : "text-slate-500"
              )}>
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
