"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Check, Clock } from "lucide-react";
import { List, ListEmpty } from "@/components/ui/List";
import { Tabs } from "@/components/ui/Tabs";
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
        <PageHeader title="Devir-Teslim" />
        <List>
          <ListEmpty action={<Link href="/settings?tab=features" className="text-sm font-semibold text-primary hover:underline">Ayarlarda aç</Link>}>
            Devir-teslim defteri bu şubede kapalı.
          </ListEmpty>
        </List>
      </Page>
    );
  }

  const unreadCount = records.filter(r => !r.read_by_personnel_id).length;

  return (
    <Page width="narrow">
      <PageHeader title="Devir-Teslim"
        description={unreadCount > 0 ? `${unreadCount} not henüz teslim alınmadı` : "Tüm notlar teslim alındı"} />

      <Tabs value={status} onChange={setStatus} items={[
        { id: "all", label: "Tümü" },
        { id: "unread", label: "Bekleyen", count: status === "all" ? unreadCount : undefined },
        { id: "read", label: "Teslim alındı" },
      ] as const} />

      <List>
        {loading ? <ListEmpty>Yükleniyor…</ListEmpty> : records.length === 0 ? <ListEmpty>Kayıt yok.</ListEmpty> : records.map(r => (
          <li key={r.id} className="px-4 py-3 space-y-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold text-slate-900 truncate">{r.author_name}</span>
              <span className="text-xs text-slate-500 truncate">{[r.department_name, timeAgo(Number(r.created_at))].filter(Boolean).join(" · ")}</span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{r.note}</p>
            {r.read_by_personnel_id
              ? <StatusPill tone="positive"><Check size={11} /> {r.reader_name} teslim aldı</StatusPill>
              : <StatusPill tone="attention"><Clock size={11} /> Teslim alınmadı</StatusPill>}
          </li>
        ))}
      </List>
    </Page>
  );
}
