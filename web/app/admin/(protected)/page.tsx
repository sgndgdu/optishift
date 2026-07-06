"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  Building2, Users, Cpu, AlertTriangle,
  LogIn, Zap, Activity, TrendingUp
} from "lucide-react";

type Metrics = {
  total_orgs: number;
  pro_orgs: number;
  free_orgs: number;
  total_users: number;
  active_personnel: number;
  shifts_this_week: number;
  logins_24h: number;
  or_tools_calls_24h: number;
  avg_or_tools_latency: number;
  at_risk_orgs: number;
};

type PlatformEvent = {
  id: number;
  type: string;
  org_id: string | null;
  org_name: string | null;
  meta: any;
  created_at: number;
};

type OrgSummary = {
  id: string;
  name: string;
  plan: string;
  health_score: number;
  churn_risk: "high" | "medium" | "low";
  personnel_count: number;
  last_activity_at: number | null;
};

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s once`;
  if (diff < 3600) return `${Math.floor(diff / 60)}dk once`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa once`;
  return `${Math.floor(diff / 86400)}g once`;
}

function eventIcon(type: string) {
  if (type === "login") return <LogIn size={13} className="text-blue-400" />;
  if (type === "or_tools_call") return <Cpu size={13} className="text-violet-400" />;
  if (type === "shift_created") return <Zap size={13} className="text-emerald-400" />;
  return <Activity size={13} className="text-slate-400" />;
}

function eventLabel(ev: PlatformEvent): string {
  if (ev.type === "login") return `${ev.meta?.user_name ?? "Kullanici"} giris yapti`;
  if (ev.type === "or_tools_call") return `OR-Tools çalıştırıldı (${ev.meta?.latency_ms ?? "?"}ms)`;
  if (ev.type === "shift_created") return "Vardiya olusturuldu";
  return ev.type;
}

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

function MetricCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-5 flex items-start gap-4 hover:bg-white/5 transition-colors">
      <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center shrink-0`}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
        <p className="text-xs font-medium text-slate-400 truncate">{label}</p>
        {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [atRiskOrgs, setAtRiskOrgs] = useState<OrgSummary[]>([]);
  const lastIdRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/god/metrics")
        .then((r) => r.json())
        .then(setMetrics)
        .catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch("/api/god/orgs")
      .then((r) => r.json())
      .then((orgs: OrgSummary[]) => {
        const atRisk = orgs
          .filter((o) => o.health_score < 60)
          .sort((a, b) => a.health_score - b.health_score)
          .slice(0, 8);
        setAtRiskOrgs(atRisk);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const connect = () => {
      const es = new EventSource(`/api/god/stream?since_id=${lastIdRef.current}`);
      esRef.current = es;
      es.onmessage = (e) => {
        try {
          const ev: PlatformEvent = JSON.parse(e.data);
          if (ev.id > lastIdRef.current) {
            lastIdRef.current = ev.id;
            setEvents((prev) => [ev, ...prev].slice(0, 50));
          }
        } catch { /* ignore */ }
      };
      es.onerror = () => {
        es.close();
        setTimeout(connect, 3000);
      };
    };
    connect();
    return () => { esRef.current?.close(); };
  }, []);

  return (
    <div className="p-6 space-y-6 min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Platform Genel Bakis</h1>
          <p className="text-sm text-slate-500 mt-0.5">OptiShift God Mode</p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-medium text-emerald-400">Canli</span>
        </div>
      </div>

      {/* Metrik Rail */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard
          label="Toplam Org"
          value={metrics?.total_orgs ?? "—"}
          sub={`${metrics?.pro_orgs ?? 0} Pro, ${metrics?.free_orgs ?? 0} Free`}
          icon={Building2}
          color="bg-violet-600"
        />
        <MetricCard
          label="Toplam Kullanici"
          value={metrics?.total_users ?? "—"}
          icon={Users}
          color="bg-blue-600"
        />
        <MetricCard
          label="Aktif Personel"
          value={metrics?.active_personnel ?? "—"}
          icon={Users}
          color="bg-cyan-600"
        />
        <MetricCard
          label="OR-Tools/24s"
          value={metrics?.or_tools_calls_24h ?? "—"}
          sub={metrics ? `Ort. ${metrics.avg_or_tools_latency}ms` : undefined}
          icon={Cpu}
          color="bg-indigo-600"
        />
        <MetricCard
          label="Girisler/24s"
          value={metrics?.logins_24h ?? "—"}
          icon={TrendingUp}
          color="bg-emerald-600"
        />
        <MetricCard
          label="Risk Alti Org"
          value={metrics?.at_risk_orgs ?? "—"}
          icon={AlertTriangle}
          color="bg-red-600"
        />
      </div>

      {/* Alt iki panel */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* Live Feed */}
        <div className="xl:col-span-3 bg-white/3 border border-white/8 rounded-2xl p-5 flex flex-col" style={{ minHeight: 400 }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Canli Olay Akisi</h2>
            <span className="text-[10px] font-medium text-slate-500 tabular-nums">
              {events.length} olay
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-3">
                <Activity size={24} className="text-slate-700" />
                <p className="text-sm text-slate-600">Olay bekleniyor...</p>
              </div>
            ) : (
              events.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-white/4 transition-colors"
                >
                  <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
                    {eventIcon(ev.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">
                      {eventLabel(ev)}
                    </p>
                    <p className="text-[10px] text-slate-600 truncate">
                      {ev.org_name ?? ev.org_id ?? "Bilinmeyen org"}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-600 shrink-0 mt-0.5 tabular-nums">
                    {timeAgo(ev.created_at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Churn Radar */}
        <div className="xl:col-span-2 bg-white/3 border border-white/8 rounded-2xl p-5 flex flex-col" style={{ minHeight: 400 }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Kayip Riski Radari</h2>
            <Link
              href="/admin/orgs"
              className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
            >
              Tumunu goster
            </Link>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto">
            {atRiskOrgs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-3">
                <AlertTriangle size={24} className="text-slate-700" />
                <p className="text-sm text-slate-600">Risk alti org yok</p>
              </div>
            ) : (
              atRiskOrgs.map((org) => (
                <Link
                  key={org.id}
                  href={`/admin/orgs/${org.id}`}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-colors group"
                >
                  <HealthOrb score={org.health_score} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                      {org.name}
                    </p>
                    <p className="text-[10px] text-slate-600">
                      {org.personnel_count} personel
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className="text-xs font-bold tabular-nums"
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
                    <RiskBadge risk={org.churn_risk} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
