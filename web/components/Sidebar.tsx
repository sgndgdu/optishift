"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, CalendarClock, Plug, Settings } from "lucide-react";

const NAV = [
  { href: "/dashboard",  label: "Dashboard",     icon: LayoutDashboard },
  { href: "/personnel",  label: "Personel",       icon: Users },
  { href: "/schedule",   label: "Vardiya Planı",  icon: CalendarClock },
  { href: "/integrations", label: "Entegrasyonlar", icon: Plug },
  { href: "/settings",   label: "Ayarlar",        icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 min-h-screen bg-indigo-700 text-white flex flex-col shrink-0">
      <div className="px-5 py-6 border-b border-indigo-600">
        <span className="text-xl font-bold tracking-tight">OptiShift</span>
        <p className="text-indigo-300 text-xs mt-0.5">İzmir Merkez Mağazası</p>
      </div>
      <nav className="flex-1 py-4">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
                active
                  ? "bg-indigo-900 text-white font-medium"
                  : "text-indigo-200 hover:bg-indigo-600 hover:text-white"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 border-t border-indigo-600 text-xs text-indigo-400">
        Müdür: Sefa Gündoğdu
      </div>
    </aside>
  );
}
