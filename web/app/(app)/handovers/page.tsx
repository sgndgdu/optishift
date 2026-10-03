"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import { ClipboardCheck, Check, Clock } from "lucide-react";
import { useManagerAuth } from "@/hooks/useAuth";
import { timeAgo } from "@/lib/date";
import { isModuleOn } from "@/lib/moduleVisibility";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";

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
        try { logEnabled = isModuleOn(JSON.parse(locData.rules), "handover_log_enabled"); } catch { /* kapalı say */ }
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
      <Page width="narrow">
        <PageHeader title="Devir-Teslim Kayıtları" />
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
          <ClipboardCheck size={28} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-600">Devir-Teslim Defteri bu şubede kapalı</p>
          <p className="text-xs text-slate-400 mt-1">Ayarlar &gt; Ek Özellikler sekmesinden açabilirsiniz.</p>
        </div>
      </Page>
    );
  }

  const unreadCount = records.filter(r => !r.read_by_personnel_id).length;

  return (
    <Page width="narrow">
      <PageHeader title="Devir-Teslim Kayıtları"
        description={unreadCount > 0 ? `${unreadCount} not henüz teslim alınmadı` : "Tüm notlar teslim alındı"} />

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
                    <StatusPill tone="neutral" className="shrink-0">{r.department_name}</StatusPill>
                  )}
                </div>
                {r.read_by_personnel_id ? (
                  <StatusPill tone="positive" className="shrink-0">
                    <Check size={11} /> {r.reader_name} teslim aldı
                  </StatusPill>
                ) : (
                  <StatusPill tone="attention" className="shrink-0">
                    <Clock size={11} /> Bekliyor
                  </StatusPill>
                )}
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{r.note}</p>
              <p className="text-xs text-slate-400 font-medium mt-2">{timeAgo(Number(r.created_at))}</p>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
