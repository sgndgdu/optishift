"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarClock, Users, ClipboardList, BarChart2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncExternalStore } from "react";
import { departmentScope, parseAccess } from "@/lib/userAccess";

// Telefonda yönetim paneli alt menüsü (personel portalındaki gibi): en sık 4 sayfa tek dokunuşla.
// Geri kalan her şey ☰ menüde.
const BRANCH = [
  { href: "/dashboard", label: "Ana Sayfa", icon: LayoutDashboard },
  { href: "/schedule",  label: "Plan",      icon: CalendarClock },
  { href: "/personnel", label: "Ekip",      icon: Users },
  { href: "/requests",  label: "Onaylar",   icon: ClipboardList },
];
const ALL = [
  { href: "/supervisor",           label: "Genel Bakış", icon: LayoutDashboard, exact: true },
  { href: "/supervisor/personnel", label: "Personel",    icon: Users },
  { href: "/supervisor/reports",   label: "Raporlar",    icon: BarChart2 },
  { href: "/supervisor/chat",      label: "Mesajlar",    icon: MessageSquare },
];

const noopSubscribe = () => () => {};
function readIsChef(): boolean {
  try {
    const u = JSON.parse(localStorage.getItem("optishift_manager_user") || "{}");
    return !!departmentScope({ role: u.role ?? null, access: parseAccess(u.access) });
  } catch { return false; }
}

export default function MobileTabBar({ scope = "branch" }: { scope?: "branch" | "all" }) {
  const pathname = usePathname();
  // Departman şefi (lib/userAccess) onay vermez: Onaylar sekmesi gizli
  // Sunucuda false, tarayıcıda oturumdan okunur (hidrasyon uyumsuzluğu olmasın diye useSyncExternalStore)
  const isChef = useSyncExternalStore(noopSubscribe, readIsChef, () => false);
  const items = scope === "all" ? ALL : BRANCH.filter(i => !isChef || i.href !== "/requests");
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-200/70 px-3 py-2 z-40">
      <ul className="flex items-center justify-around">
        {items.map(({ href, label, icon: Icon, ...rest }) => {
          const active = "exact" in rest && rest.exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link href={href} className={cn("flex flex-col items-center gap-1 w-full py-1.5 rounded-2xl relative", active ? "text-primary" : "text-slate-400")}>
                {active && <span className="absolute inset-0 bg-primary/10 rounded-2xl" />}
                <Icon size={20} strokeWidth={active ? 2.5 : 2} className="relative" />
                <span className={cn("text-xs relative", active ? "font-bold" : "font-medium")}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
