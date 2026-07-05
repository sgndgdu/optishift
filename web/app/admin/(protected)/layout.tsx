import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import Link from "next/link";
import { LayoutDashboard, Building2, ClipboardList, Shield, Users, Megaphone } from "lucide-react";

async function verifyGodCookie(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("optishift_god_session")?.value;
  if (!token) return false;
  try {
    const secret = new TextEncoder().encode(
      process.env.GOD_MODE_JWT_SECRET ?? "god-mode-dev-secret-change-in-production"
    );
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

const NAV = [
  { href: "/admin",         label: "Genel Bakis",      icon: LayoutDashboard },
  { href: "/admin/orgs",    label: "Organizasyonlar",  icon: Building2 },
  { href: "/admin/users",   label: "Kullanicilar",     icon: Users },
  { href: "/admin/banners", label: "Duyurular",        icon: Megaphone },
  { href: "/admin/audit",   label: "Audit Logu",       icon: ClipboardList },
];

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const ok = await verifyGodCookie();
  if (!ok) redirect("/admin/login");

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar — 64px daralt, hover'da 224px genisle */}
      <aside className="w-16 hover:w-56 transition-[width] duration-200 ease-in-out group shrink-0 bg-[#0f0f17] border-r border-white/5 flex flex-col py-6 gap-1 overflow-hidden">
        {/* Logo */}
        <div className="flex items-center justify-center w-16 shrink-0 mb-4">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <Shield size={16} className="text-white" />
          </div>
        </div>

        <nav className="flex flex-col gap-1 px-2">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Icon size={18} className="shrink-0" />
              <span className="text-sm font-medium whitespace-nowrap overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                {label}
              </span>
            </Link>
          ))}
        </nav>

        <div className="mt-auto px-2">
          <form action="/api/god/auth/logout" method="POST">
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm font-medium"
            >
              <span className="shrink-0 w-[18px] text-center leading-none">&#x2715;</span>
              <span className="whitespace-nowrap overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                Cikis Yap
              </span>
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
