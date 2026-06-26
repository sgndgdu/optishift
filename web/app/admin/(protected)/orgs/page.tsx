"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Building2, ChevronRight } from "lucide-react";

type Org = {
  id: string;
  name: string;
  plan: string;
  suspended_at: number | null;
  health_score: number;
  churn_risk: "high" | "medium" | "low";
  location_count: number;
  user_count: number;
  personnel_count: number;
  shifts_7d: number;
  or_tools_calls_7d: number;
  last_activity_at: number | null;
};

function HealthOrb({ score }: { score: number }) {
  const color = score >= 60 ? "bg-emerald-400" : score >= 35 ? "bg-amber-400" : "bg-red-400";
  const ping = score < 35;
  return (
    <span className="relative flex items-center justify-center w-3 h-3">
      {ping && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-50`} />
      )}
      <span className={`relative inline-flex rounded-full w-3 h-3 ${color}`} />
    </span>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const map: Record<string, string> = {
    enterprise: "bg-violet-500/15 text-violet-300 border-violet-500/20",
    pro: "bg-blue-500/15 text-blue-300 border-blue-500/20",
    free: "bg-slate-500/10 text-slate-400 border-slate-500/15",
  };
  const labels: Record<string, string> = { enterprise: "Enterprise", pro: "Pro", free: "Free" };
  const cls = map[plan] ?? map.free;
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {labels[plan] ?? plan}
    </span>
  );
}

function RiskBadge({ risk }: { risk: "high" | "medium" | "low" }) {
  const map = {
    high: "bg-red-500/15 text-red-400 border-red-500/20",
    medium: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  };
  const labels = { high: "Yuksek", medium: "Orta", low: "Dusuk" };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${map[risk]}`}>
      {labels[risk]}
    </span>
  );
}

function timeAgo(ts: number | null): string {
  if (!ts) return "Hic";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa once`;
  return `${Math.floor(diff / 86400)}g once`;
}

export default function OrgsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/god/orgs")
      .then((r) => r.json())
      .then((data) => setOrgs(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = orgs.filter((o) => {
    const matchSearch = o.name.toLowerCase().includes(search.toLowerCase());
    const matchPlan = planFilter === "all" || o.plan === planFilter;
    return matchSearch && matchPlan;
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Organizasyonlar</h1>
          <p className="text-sm text-slate-500 mt-0.5">{orgs.length} toplam org</p>
        </div>
      </div>

      {/* Filtreler */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Org ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition-colors"
          />
        </div>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors"
        >
          <option value="all">Tum Planlar</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>

      {/* Tablo */}
      <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Isim</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Plan</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Saglik</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Personel</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Son Aktivite</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">OR-Tools/7g</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Risk</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((org) => (
                  <tr
                    key={org.id}
                    className="border-b border-white/4 hover:bg-white/3 transition-colors group"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-violet-600/20 flex items-center justify-center shrink-0">
                          <Building2 size={13} className="text-violet-400" />
                        </div>
                        <div>
                          <p className="font-medium text-white">{org.name}</p>
                          {org.suspended_at && (
                            <p className="text-[10px] text-red-400">Askiya alinmis</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <PlanBadge plan={org.plan} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <HealthOrb score={org.health_score} />
                        <span
                          className="text-sm font-bold tabular-nums"
                          style={{
                            color:
                              org.health_score >= 60
                                ? "#34d399"
                                : org.health_score >= 35
                                ? "#fbbf24"
                                : "#f87171",
                          }}
                        >
                          {org.health_score}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-300 tabular-nums">{org.personnel_count}</td>
                    <td className="px-4 py-4 text-slate-400 text-xs tabular-nums">
                      {timeAgo(org.last_activity_at)}
                    </td>
                    <td className="px-4 py-4 text-slate-300 tabular-nums">{org.or_tools_calls_7d}</td>
                    <td className="px-4 py-4">
                      <RiskBadge risk={org.churn_risk} />
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/admin/orgs/${org.id}`}
                        className="flex items-center gap-1 text-violet-400 hover:text-violet-300 transition-colors text-xs font-medium opacity-0 group-hover:opacity-100"
                      >
                        Detay <ChevronRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-slate-600 text-sm">
                      Sonuc bulunamadi
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
