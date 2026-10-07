"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import SystemBanner from "@/components/SystemBanner";
import { MobileBrand } from "@/components/MobileBrand";
import MobileTabBar from "@/components/MobileTabBar";
import NotificationBell from "@/components/NotificationBell";
import AssistantPanel from "@/components/AssistantPanel";
import OwnerBranchBanner from "@/components/OwnerBranchBanner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50/50 overflow-hidden">
      <SystemBanner />
      <ImpersonationBanner />
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:relative inset-y-0 left-0 z-50 lg:z-auto
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-2 pl-2 pr-4 h-16 shrink-0 bg-white border-b border-slate-100 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Menü"
            className="p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <Menu size={24} />
          </button>
          <MobileBrand />
          <NotificationBell placement="topbar" />
        </div>

        <OwnerBranchBanner />
        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl p-4 md:p-8 lg:p-10 pb-40 lg:pb-24">
            {children}
          </div>
        </div>
        <MobileTabBar />
        <AssistantPanel />
      </main>
    </div>
  );
}
