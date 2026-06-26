"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type AuditEntry = {
  id: number;
  action: string;
  target_org_id: string | null;
  target_user_id: string | null;
  payload: string | null;
  ip_address: string | null;
  created_at: number;
};

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AuditPage() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const LIMIT = 50;

  const load = (off: number) => {
    setLoading(true);
    fetch(`/api/god/audit?limit=${LIMIT}&offset=${off}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(Array.isArray(d.rows) ? d.rows : []);
        setTotal(d.total ?? 0);
        setOffset(off);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(0); }, []);

  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Audit Logu</h1>
        <p className="text-sm text-slate-500 mt-0.5">{total} toplam kayit</p>
      </div>

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
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Zaman</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Aksiyon</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Hedef Org</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Hedef User</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">IP</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Detay</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-white/4 hover:bg-white/3 transition-colors">
                    <td className="px-5 py-3 text-xs text-slate-400 tabular-nums whitespace-nowrap">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-white">{row.action}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                      {row.target_org_id ? row.target_org_id.slice(0, 12) + "..." : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                      {row.target_user_id ? row.target_user_id.slice(0, 12) + "..." : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                      {row.ip_address ?? "—"}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      {row.payload ? (
                        <span className="text-[10px] text-slate-600 font-mono truncate block max-w-xs" title={row.payload}>
                          {row.payload.slice(0, 80)}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-slate-600 text-sm">
                      Kayit yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/5">
            <p className="text-xs text-slate-500">
              Sayfa {currentPage} / {totalPages} — {total} kayit
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => load(offset - LIMIT)}
                disabled={offset === 0 || loading}
                className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => load(offset + LIMIT)}
                disabled={offset + LIMIT >= total || loading}
                className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
