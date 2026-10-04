"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Home, Calendar, Clock, Inbox, MessageSquare, UserCircle, LogOut, BellRing, HelpCircle, Megaphone, LayoutDashboard } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import SystemBanner from "@/components/SystemBanner";
import { Logo } from "@/components/Logo";
import { AvailabilityEnabledContext, OpenShiftsEnabledContext, ShiftWordsContext } from "@/hooks/useShiftWords";
import { industryFromRules, shiftWords } from "@/lib/templates";
import { CountBadge } from "@/components/ui/StatusPill";
import { installEmployeeView, isEmployeeView, managementHome } from "@/lib/employeeView";

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

// Alt menü (telefon) sadece günlük işler: Ana Sayfa, Vardiyalarım, Talepler, Mesajlar.
// Uygunluk ve açık vardiyalar Ana Sayfa'daki kısayollardan ve masaüstü menüsünden açılır.
const NAV = [
  { href: "/portal",              label: "Ana Sayfa",   icon: Home,          exact: true, primary: true },
  { href: "/portal/calendar",     label: "Vardiyalarım", icon: Calendar,     primary: true },
  { href: "/portal/requests",     label: "Talepler",    icon: Inbox,         primary: true },
  { href: "/portal/chat",         label: "Mesajlar",    icon: MessageSquare, primary: true },
  { href: "/portal/availability", label: "Uygunluk",  icon: Clock },
  { href: "/portal/open-shifts",  label: "Açık Vardiyalar", icon: Megaphone },
  { href: "/portal/notifications", label: "Bildirimler", icon: BellRing },
  { href: "/portal/settings",     label: "Hesabım",     icon: UserCircle },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [availCollectionEnabled, setAvailCollectionEnabled] = useState(true);
  const [availKnown, setAvailKnown] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [openShiftsEnabled, setOpenShiftsEnabled] = useState(true);
  // Şubenin sektörü seçiliyse "vardiya" yerine sektörün kelimesi (nöbet, posta)
  const [words, setWords] = useState(() => shiftWords(null));
  const chatUnread = useChatUnread();
  const notifUnread = useNotifUnread();

  useEffect(() => {
    let uninstall = () => {};
    try {
      const raw = localStorage.getItem("optishift_portal_user");
      if (raw) {
        const u = JSON.parse(raw);
        setUser(u);
        // Vardiyaya giren yönetici kendi vardiyalarına bakıyor (lib/employeeView): istekler çalışan olarak gider.
        // Sayfalar bu satırdan sonra açılır (mounted), ilk istekleri de çalışan görünümünde olur.
        if (isEmployeeView(u)) uninstall = installEmployeeView(u.location_id);
        // Uygunluk toplama kapalıysa nav'dan Uygunluk linkini gizle (locations.rules)
        if (u?.location_id) {
          fetch(`/api/locations?id=${u.location_id}`)
            .then(r => r.json())
            .then(data => {
              const loc = Array.isArray(data) ? data[0] : null;
              setAvailKnown(true);
              if (!loc?.rules) return;
              const rules = typeof loc.rules === "string" ? JSON.parse(loc.rules) : loc.rules;
              setAvailCollectionEnabled(rules?.availability_collection_enabled !== false);
              setChatEnabled(rules?.chat_enabled !== false);
              setOpenShiftsEnabled(rules?.open_shifts_enabled !== false);
              setWords(shiftWords(industryFromRules(rules)?.nudges));
            })
            // Kurallar okunamazsa varsayılan: uygunluk açık (eski davranış)
            .catch(() => setAvailKnown(true));
        } else {
          setAvailKnown(true);
        }
      }
    } catch {}
    setMounted(true);
    return () => uninstall();
  }, []);

  const nav = NAV
    .filter(i => availCollectionEnabled || i.href !== "/portal/availability")
    .filter(i => chatEnabled || i.href !== "/portal/chat")
    .filter(i => openShiftsEnabled || i.href !== "/portal/open-shifts")
    .map(i => i.href === "/portal/calendar" ? { ...i, label: words.MyShifts }
      : i.href === "/portal/open-shifts" ? { ...i, label: words.OpenShifts } : i);
  const bottomNav = nav.filter(i => i.primary);

  if (!mounted) return null;

  const handleLogout = () => {
    localStorage.removeItem("optishift_portal_user");
    router.push("/login");
  };

  return (
    <div className="flex h-screen bg-slate-50/50 overflow-hidden">
      <SystemBanner />
      <ImpersonationBanner />

      {/* ── DESKTOP SIDEBAR (md ve üzeri) ─────────────────────────────────── */}
      <aside className="hidden md:flex w-64 h-screen shrink-0 bg-white border-r border-slate-100 flex-col pt-8 pb-6 px-4">
        <Link href="/portal" className="flex items-center gap-3 px-3 mb-8 group">
          <Logo size="md" className="group-hover:shadow-md transition-shadow" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-none">OptiShift</h1>
            <p className="text-xs font-medium text-slate-400 mt-1">Personel</p>
          </div>
        </Link>

        <nav className="flex-1 space-y-1 px-1 overflow-y-auto">
          {nav.map(({ href, label, icon: Icon, exact, primary }, idx) => {
            const isActive = exact ? pathname === href : pathname.startsWith(href);
            const firstSecondary = !primary && nav[idx - 1]?.primary;
            const badge =
              href === "/portal/chat" ? chatUnread :
              href === "/portal/notifications" ? notifUnread : 0;
            return (
              <div key={href}>
              {firstSecondary && <div className="my-3 mx-3 border-t border-slate-100" />}
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 group relative",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />
                )}
                <div className="relative shrink-0">
                  <Icon size={18} className={cn("transition-colors", isActive ? "text-primary" : "text-slate-400 group-hover:text-slate-600")} />
                  {badge > 0 && (
                    <CountBadge size="sm" className="absolute -top-1.5 -right-1.5">{badge}</CountBadge>
                  )}
                </div>
                {label}
                {badge > 0 && (
                  <CountBadge count={badge} className="ml-auto" />
                )}
              </Link>
              </div>
            );
          })}
        </nav>

        {isEmployeeView(user) && (
          <div className="px-1 pt-2">
            <Link href={managementHome()} className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-forest-700 hover:bg-forest-50 transition-colors">
              <LayoutDashboard size={18} />
              Yönetim paneline dön
            </Link>
          </div>
        )}
        <div className="px-1 pt-2">
          <a
            href="/kilavuz?role=employee"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            <HelpCircle size={18} className="text-slate-400" />
            Yardım
          </a>
        </div>

        <div className="mt-auto px-3 pt-6">
          <div className="bg-slate-50 rounded-2xl p-4 flex items-center justify-between border border-slate-100">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 rounded-full bg-forest-100 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-forest-600 uppercase">{user?.name?.charAt(0) ?? "P"}</span>
              </div>
              <div className="truncate">
                <p className="text-sm font-bold text-slate-800 truncate">{user?.name ?? "Personel"}</p>
                <p className="text-xs text-slate-500 font-medium tracking-wide">Personel</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors shrink-0"
              title="Oturumu kapat"
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
            <Logo size="sm" />
            <span className="font-bold text-slate-800">OptiShift</span>
          </Link>
          <div className="flex items-center gap-1">
            {isEmployeeView(user) && (
              <Link href={managementHome()} aria-label="Yönetim paneline dön" title="Yönetim paneline dön" className="p-2.5 rounded-xl text-forest-700 hover:bg-forest-50 transition-colors">
                <LayoutDashboard size={21} />
              </Link>
            )}
            <Link href="/portal/notifications" aria-label="Bildirimler" title="Bildirimler" className={cn("relative p-2.5 rounded-xl transition-colors", pathname === "/portal/notifications" ? "text-primary bg-primary/8" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100")}>
              <BellRing size={21} />
              {notifUnread > 0 && (
                <CountBadge size="sm" className="absolute top-1 right-1">{notifUnread}</CountBadge>
              )}
            </Link>
            <Link href="/portal/settings" aria-label="Hesabım" title="Hesabım" className={cn("p-2.5 rounded-xl transition-colors", pathname === "/portal/settings" ? "text-primary bg-primary/8" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100")}>
              <UserCircle size={22} />
            </Link>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {/* Portal sayfalarının genişliği ve dolgusu TEK YERDE (components/ui/PageHeader → Page) */}
          <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-8 md:py-8 pb-24 md:pb-8">
            <ShiftWordsContext.Provider value={words}>
              <AvailabilityEnabledContext.Provider value={availKnown ? availCollectionEnabled : null}>
                <OpenShiftsEnabledContext.Provider value={openShiftsEnabled}>{children}</OpenShiftsEnabledContext.Provider>
              </AvailabilityEnabledContext.Provider>
            </ShiftWordsContext.Provider>
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
                    {isActive && <span className="absolute inset-0 bg-primary/10 rounded-2xl" />}
                    <div className="relative">
                      <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className="relative" />
                      {isChat && chatUnread > 0 && (
                        <CountBadge size="sm" className="absolute -top-1.5 -right-1.5">{chatUnread}</CountBadge>
                      )}
                    </div>
                    <span className={cn("text-xs relative", isActive ? "font-bold" : "font-medium")}>{label}</span>
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
