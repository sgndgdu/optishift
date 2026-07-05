"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import UserActions from "../_components/UserActions";

type GodUserRow = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: string;
  display_title: string | null;
  org_id: string;
  org_name: string | null;
  approval_status: string;
  is_temp_password: boolean;
  last_login_at: number | null;
  created_at: number;
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", supervisor: "Süpervizör", manager: "Müdür", employee: "Personel",
};

function timeAgo(ts: number | null): string {
  if (!ts) return "Hiç";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 3600) return `${Math.floor(diff / 60)}dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa önce`;
  return `${Math.floor(diff / 86400)}g önce`;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<GodUserRow[]>([]);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (orgFilter) params.set("org_id", orgFilter);
      if (roleFilter) params.set("role", roleFilter);
      const res = await fetch(`/api/god/users?${params.toString()}`);
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch { /* empty */ }
    setLoading(false);
  }, [q, orgFilter, roleFilter]);

  // İlk yük + filtre değişince (arama 400ms debounce)
  useEffect(() => {
    const t = setTimeout(load, 400);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    fetch("/api/god/orgs")
      .then(r => r.json())
      .then((data: any[]) => setOrgs(Array.isArray(data) ? data.map(o => ({ id: o.id, name: o.name })) : []))
      .catch(() => {});
  }, []);

  const setStatus = async (u: GodUserRow, status: string) => {
    await fetch("/api/god/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, action: "set_status", approval_status: status }),
    });
    load();
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Kullanıcılar</h1>
        <p className="text-sm text-slate-500 mt-0.5">Platform geneli kullanıcı arama ve yönetim</p>
      </div>

      {/* Filtreler */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="İsim, kullanıcı adı veya e-posta ara…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition-colors"
          />
        </div>
        <select
          value={orgFilter}
          onChange={e => setOrgFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50 max-w-[220px]"
        >
          <option value="">Tüm Org&apos;lar</option>
          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50"
        >
          <option value="">Tüm Roller</option>
          <option value="admin">Admin</option>
          <option value="supervisor">Süpervizör</option>
          <option value="manager">Müdür</option>
          <option value="employee">Personel</option>
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
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">İsim</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Kullanıcı Adı</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Org</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Rol</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Durum</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Son Giriş</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-white/4 hover:bg-white/3 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-200">{u.name}</p>
                      {u.email && <p className="text-[10px] text-slate-600">{u.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                      {u.username}
                      {u.is_temp_password && (
                        <span className="ml-1.5 text-[9px] text-amber-400" title="Geçici şifre — ilk girişte değiştirilecek">⏳</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/orgs/${u.org_id}`} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                        {u.org_name ?? u.org_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{ROLE_LABELS[u.role] ?? u.role}</td>
                    <td className="px-4 py-3">
                      {u.approval_status === "active" ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Aktif</span>
                      ) : u.approval_status === "pending" ? (
                        <button
                          onClick={() => setStatus(u, "active")}
                          title="Tıkla: onayla"
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 hover:bg-amber-500/30 transition-colors"
                        >
                          Onay Bekliyor → Onayla
                        </button>
                      ) : (
                        <button
                          onClick={() => setStatus(u, "active")}
                          title="Tıkla: tekrar aktifleştir"
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/30 transition-colors"
                        >
                          Reddedilmiş → Aktifleştir
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs tabular-nums">{timeAgo(u.last_login_at)}</td>
                    <td className="px-4 py-3">
                      <UserActions user={u} />
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-600 text-sm">
                      <Users size={22} className="mx-auto mb-2 text-slate-700" />
                      Sonuç bulunamadı
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
