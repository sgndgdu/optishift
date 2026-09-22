"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import { ClipboardCheck, Check, Clock } from "lucide-react";
import { useManagerAuth } from "@/hooks/useAuth";
import { timeAgo } from "@/lib/date";

type StatusFilter = "all" | "unread" | "read";

export default function HandoversPage() {
  const { user, mounted } = useManagerAuth();
  const [locationId, setLocationId] = useState("");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusFilter>("all");

  const load = useCallback(async () => {
    if (!user) return;
    const locId = user.location_id || localStorage.getItem("optishift_selected_location") || "";
    setLocationId(locId);
    if (!locId) { setLoading(false); return; }
    setLoading(true);
    try {
      const locRes = await fetch(`/api/locations?id=${locId}`).then(r => r.json()).catch(() => []);
      const locData = Array.isArray(locRes) ? locRes[0] : null;
      let logEnabled = false;
      if (locData?.rules) {
        try { logEnabled = JSON.parse(locData.rules).handover_log_enabled === true; } catch { /* kapalı say */ }
      }
      setEnabled(logEnabled);
      if (!logEnabled) { setLoading(false); return; }

      const q = status === "all" ? "" : `&status=${status}`;
      const rows = await fetch(`/api/shift-handovers?location_id=${locId}${q}`).then(r => r.json()).catch(() => []);
      setRecords(Array.isArray(rows) ? rows : []);
    } finally {
      setLoading(false);
    }
  }, [user, status]);

  useEffect(() => { load(); }, [load]);

  if (!mounted) return <div className="space-y-6" />;

  if (enabled === false) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
          <ClipboardCheck size={28} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-600">Devir-Teslim Defteri bu şubede kapalı</p>
          <p className="text-xs text-slate-400 mt-1">Ayarlar &gt; Kurallar &gt; İleri Seviye Modüller bölümünden açabilirsiniz.</p>
        </div>
      </div>
    );
  }

  const unreadCount = records.filter(r => !r.read_by_personnel_id).length;

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6 md:space-y-8">
      <div className="flex items-center gap-3 md:gap-4">
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
          <ClipboardCheck size={20} className="text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900">Devir-Teslim Kayıtları</h1>
          <p className="text-sm text-slate-500">
            {unreadCount > 0 ? `${unreadCount} not henüz teslim alınmadı` : "Tüm notlar teslim alındı"}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {([
          { key: "all", label: "Tümü" },
          { key: "unread", label: "Bekleyen" },
          { key: "read", label: "Teslim Alındı" },
        ] as { key: StatusFilter; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              status === t.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
          <ClipboardCheck size={24} className="text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Kayıt yok</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-100 p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-bold text-slate-800 truncate">{r.author_name}</span>
                  {r.department_name && (
                    <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full shrink-0">{r.department_name}</span>
                  )}
                </div>
                {r.read_by_personnel_id ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full shrink-0">
                    <Check size={11} /> {r.reader_name} teslim aldı
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full shrink-0">
                    <Clock size={11} /> Bekliyor
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{r.note}</p>
              <p className="text-[10px] text-slate-400 font-medium mt-2">{timeAgo(Number(r.created_at))}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
