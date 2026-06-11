"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { Building2, Users, CheckCircle, XCircle, Plus, Search, RefreshCw, Zap, TrendingUp } from "lucide-react";
import Link from "next/link";

type Org = {
  id: string;
  name: string;
  locations: { id: string; name: string }[];
  userCount: number;
  personnelCount: number;
  plan?: string;
};

export default function AdminPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchOrgs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/organizations");
      const data = await res.json();
      setOrgs(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchOrgs(); }, []);

  const handleDeactivate = async (id: string, name: string) => {
    if (!confirm(`"${name}" organizasyonunu devre dışı bırakmak istediğinize emin misiniz?`)) return;
    await fetch(`/api/admin/organizations?id=${id}`, { method: "DELETE" });
    fetchOrgs();
  };

  const filtered = orgs.filter(o => o.name.toLowerCase().includes(search.toLowerCase()));

  const totalPersonnel = orgs.reduce((s, o) => s + o.personnelCount, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-500 rounded-xl flex items-center justify-center shrink-0">
              <Zap size={18} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">OptiShift Admin</h1>
              <p className="text-indigo-300 text-xs sm:text-sm">Süper Yönetici Paneli</p>
            </div>
          </div>
          <button onClick={fetchOrgs} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors shrink-0">
            <RefreshCw size={18} />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: "Toplam Müşteri", value: orgs.length, icon: Building2, color: "from-indigo-500 to-indigo-700" },
            { label: "Toplam Personel", value: totalPersonnel, icon: Users, color: "from-purple-500 to-purple-700" },
            { label: "Pro Aboneler", value: orgs.filter(o => o.plan === "pro").length, icon: Zap, color: "from-emerald-500 to-emerald-700" },
            { label: "Aylık Gelir (MRR)", value: `₺${orgs.filter(o => o.plan === "pro").length * 999}`, icon: TrendingUp, color: "from-amber-500 to-amber-700" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className={`bg-gradient-to-br ${color} rounded-2xl p-4 shadow-lg`}>
              <Icon size={20} className="mb-2 opacity-80" />
              <div className="text-3xl font-black">{value}</div>
              <div className="text-xs opacity-70 mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Orgs */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4 sm:mb-5 gap-3">
            <h2 className="text-base sm:text-lg font-bold">Organizasyonlar</h2>
            <Link href="/register" className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white text-xs sm:text-sm font-bold px-3 sm:px-4 py-2 rounded-xl transition-colors shrink-0">
              <Plus size={14} /> Yeni Ekle
            </Link>
          </div>

          <div className="relative mb-4">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Organizasyon ara..."
              className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-400"
            />
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white/5 rounded-2xl p-4 animate-pulse flex gap-4">
                  <div className="w-10 h-10 bg-white/10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-white/10 rounded w-1/3" />
                    <div className="h-2 bg-white/10 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-white/40">
              <Building2 size={40} className="mx-auto mb-3 opacity-30" />
              <p>{search ? "Sonuç bulunamadı" : "Henüz organizasyon yok"}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((org: any) => (
                <div key={org.id} className="bg-white/10 border border-white/10 rounded-2xl p-4 flex items-center gap-4 hover:bg-white/15 transition-colors">
                  <div className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center font-bold text-lg shrink-0">
                    {org.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold">{org.name}</h3>
                      {org.plan === "pro" ? (
                        <span className="text-[10px] uppercase font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">Pro Plan</span>
                      ) : (
                        <span className="text-[10px] uppercase font-bold bg-white/10 text-white/50 px-2 py-0.5 rounded-full border border-white/10">Free Plan</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-white/50">
                      <span>{org.locations.length > 0 ? org.locations.map((l: any) => l.name).join(", ") : "Şube Yok"}</span>
                      <span>·</span>
                      <span>{org.personnelCount} personel</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/login`}
                      className="text-xs px-3 py-1.5 bg-white/10 rounded-lg hover:bg-white/20 transition-colors font-semibold min-h-[32px] flex items-center"
                    >
                      Panele Git
                    </Link>
                    <button
                      onClick={() => handleDeactivate(org.id, org.name)}
                      className="text-xs px-3 py-1.5 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors font-semibold min-h-[32px]"
                    >
                      Devre Dışı
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-white/20 text-xs">
          OptiShift Admin — Sadece yetkili operatörler erişebilir
        </div>
      </div>
    </div>
  );
}
