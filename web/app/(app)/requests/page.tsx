"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useManagerAuth } from "@/hooks/useAuth";
import {
  ClipboardList, ArrowLeftRight, FileEdit, CalendarOff,
  CheckCircle2, XCircle, History, Timer
} from "lucide-react";
import { isModuleOn } from "@/lib/moduleVisibility";
import { confirmDespiteViolations, violationText, type ViolationResponse } from "@/lib/ruleViolations";
import { formatDateTR } from "@/lib/date";
import { isAnnualLeaveType, leaveTypeLabel } from "@/lib/leave";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { RequestStatusPill } from "@/components/ui/RequestStatus";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { Tabs } from "@/components/ui/Tabs";
import { Sheet, sheetSecondaryClass, sheetDangerClass } from "@/components/ui/Sheet";

const DAY_NAMES = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function shiftLabel(row: any) {
  if (!row?.week_start) return "—";
  const d = new Date(row.week_start);
  d.setDate(d.getDate() + (row.day ?? 0));
  const dateStr = d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  const dayName = DAY_NAMES[row.day ?? 0] ?? "";
  const time = row.start_time && row.end_time ? ` ${row.start_time}–${row.end_time}` : "";
  return `${dayName} ${dateStr}${time}`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts * 1000;
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (h < 1) return "Az önce";
  if (h < 24) return `${h} saat önce`;
  if (d < 7) return `${d} gün önce`;
  return new Date(ts * 1000).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

// Durum rozeti: components/ui/RequestStatus (renk anlamı tüm uygulamada aynı)
function StatusBadge({ status }: { status: string }) {
  return <RequestStatusPill status={status} audience="manager" />;
}

type RejectModalState = { type: "swap" | "edit" | "leave"; id: number };

export default function ManagerRequestsPage() {
  const router = useRouter();
  const { user, mounted } = useManagerAuth();

  const [swaps, setSwaps]     = useState<any[]>([]);
  const [edits, setEdits]     = useState<any[]>([]);
  const [leaves, setLeaves]   = useState<any[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<Record<string, any>>({}); // personnel_id → kalan yıllık izin
  const [leaveConflicts, setLeaveConflicts] = useState<Record<number, any[]>>({}); // izin id → o günlere düşen vardiyalar
  const [leaveTeam, setLeaveTeam] = useState<Record<number, any>>({}); // izin id → departmanın o günlerdeki durumu
  const [leaveSubs, setLeaveSubs] = useState<Record<number, Record<number, string>>>({}); // izin id → vardiya id → yerine gelecek kişi
  const [leaveOpen, setLeaveOpen] = useState<Record<number, boolean>>({}); // izin kartında ayrıntılar açık mı (sadeleştirme 2026-10-07)
  const [overtimes, setOvertimes] = useState<any[]>([]);
  // "all": bekleyen her şey tek akışta (varsayılan); diğerleri tür filtresi
  const [activeTab, setActiveTab] = useState<"all" | "swap" | "edit" | "leave" | "overtime">("all");
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState("");
  const [rejectModal, setRejectModal] = useState<RejectModalState | null>(null);
  const [rejectNote, setRejectNote]   = useState("");
  const [leaveRequestsEnabled, setLeaveRequestsEnabled] = useState(true); // rules.leave_requests_enabled
  const [overtimeTrackingEnabled, setOvertimeTrackingEnabled] = useState(true); // rules.overtime_tracking_enabled
  const [swapRequestsEnabled, setSwapRequestsEnabled] = useState(true); // rules.swap_requests_enabled
  const [editRequestsEnabled, setEditRequestsEnabled] = useState(true); // rules.edit_requests_enabled

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const locId = user.location_id || localStorage.getItem("optishift_selected_location") || "";
    try {
      const [sw, ed, lv, ot, locs] = await Promise.all([
        fetch(`/api/swap-requests?org_id=${user.org_id}&location_id=${locId}&status=peer_accepted`).then(r => r.json()).catch(() => []),
        fetch(`/api/shift-edit-requests?org_id=${user.org_id}&location_id=${locId}`).then(r => r.json()).catch(() => []),
        fetch(`/api/leave-requests?location_id=${locId}`).then(r => r.json()).catch(() => []),
        fetch(`/api/overtime?location_id=${locId}`).then(r => r.json()).catch(() => []),
        fetch(`/api/locations?id=${locId}`).then(r => r.json()).catch(() => []),
      ]);
      setSwaps(Array.isArray(sw) ? sw : []);
      setEdits(Array.isArray(ed) ? ed : []);
      setLeaves(Array.isArray(lv) ? lv : []);
      setOvertimes(Array.isArray(ot) ? ot : []);
      try {
        const loc = Array.isArray(locs) ? locs[0] : locs;
        const rules = typeof loc?.rules === "string" ? JSON.parse(loc.rules) : loc?.rules;
        setLeaveRequestsEnabled(isModuleOn(rules, "leave_requests_enabled"));
        setOvertimeTrackingEnabled(isModuleOn(rules, "overtime_tracking_enabled"));
        setSwapRequestsEnabled(isModuleOn(rules, "swap_requests_enabled"));
        setEditRequestsEnabled(isModuleOn(rules, "edit_requests_enabled"));
      } catch { /* geçersiz JSON → atla */ }
    } finally {
      setLoading(false);
      // Menüdeki Onaylar rozeti (Sidebar usePendingApprovals) karardan sonra hemen yenilensin
      window.dispatchEvent(new Event("optishift_approvals_changed"));
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  // Asistanda onaylanan işlem (lib/copilot/applyAction) talepleri değiştirmiş olabilir
  useEffect(() => {
    window.addEventListener("optishift_data_changed", load);
    return () => window.removeEventListener("optishift_data_changed", load);
  }, [load]);

  async function approveSwap(id: number, known: string[] = []) {
    // Kartta görünen kural sorunları varsa önce açık onay al
    if (known.length > 0 && !confirmDespiteViolations(known, "Vardiya değiştirme yine de onaylansın mı?")) return;
    const send = (force: boolean) => fetch("/api/swap-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "manager_approved", force }),
    });
    let r = await send(known.length > 0);
    let d: ViolationResponse = await r.json().catch(() => ({}));
    // Plan kart yüklendikten sonra değişmiş olabilir: yeni sorunları göster ve tekrar sor
    if (r.status === 409 && d.can_force && d.violations?.length) {
      if (!confirmDespiteViolations(d.violations, "Vardiya değiştirme yine de onaylansın mı?")) return;
      r = await send(true);
      d = await r.json().catch(() => ({}));
    }
    if (!r.ok) { showToast(violationText(d, "Vardiya değiştirme onaylanamadı.")); await load(); return; }
    showToast("Vardiya değiştirme onaylandı, vardiyalar güncellendi.");
    await load();
  }

  async function rejectSwap(id: number, note: string) {
    await fetch("/api/swap-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "manager_rejected" }),
    });
    showToast("Vardiya değiştirme reddedildi.");
    setRejectModal(null); setRejectNote("");
    await load();
  }

  async function approveEdit(id: number) {
    await fetch("/api/shift-edit-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "approved" }),
    });
    showToast("Düzenleme talebi onaylandı.");
    await load();
  }

  async function rejectEdit(id: number, note: string) {
    await fetch("/api/shift-edit-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "rejected", manager_note: note }),
    });
    showToast("Düzenleme talebi reddedildi.");
    setRejectModal(null); setRejectNote("");
    await load();
  }

  // Bekleyen yıllık izin taleplerinin sahiplerinin bakiyelerini yükle (onay kararı için)
  useEffect(() => {
    const ids = [...new Set(
      leaves.filter((l: any) => l.status === "pending" && isAnnualLeaveType(l.type))
        .map((l: any) => l.personnel_id)
    )].filter(Boolean);
    if (ids.length === 0) return;
    Promise.all(ids.map(id =>
      fetch(`/api/leave-requests/balance?personnel_id=${id}`).then(r => r.ok ? r.json() : null).catch(() => null)
    )).then(results => {
      const map: Record<string, any> = {};
      results.forEach((b, i) => { if (b && !b.error) map[ids[i] as string] = b; });
      setLeaveBalances(map);
    });
  }, [leaves]);

  // Bekleyen izinlerin günlerine düşen vardiyalar: onaydan önce müdür görsün
  useEffect(() => {
    const pendingIds = leaves.filter((l: any) => l.status === "pending").map((l: any) => l.id as number);
    if (pendingIds.length === 0) return;
    Promise.all(pendingIds.map(id =>
      fetch(`/api/leave-requests/review?id=${id}`).then(r => r.ok ? r.json() : null).catch(() => null)
    )).then(results => {
      const map: Record<number, any[]> = {};
      const team: Record<number, any> = {};
      results.forEach((r, i) => { map[pendingIds[i]] = Array.isArray(r?.conflicts) ? r.conflicts : []; team[pendingIds[i]] = r?.team ?? null; });
      setLeaveConflicts(map);
      setLeaveTeam(team);
    });
  }, [leaves]);

  async function reviewLeave(id: number, status: "approved" | "rejected", note?: string, conflictAction?: "open" | "remove") {
    const r = await fetch(`/api/leave-requests/review?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewed_by: user?.personnel_id, conflict_action: conflictAction, replacements: status === "approved" ? (leaveSubs[id] ?? {}) : undefined }),
    });
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      const subNote = (d.replaced > 0 ? ` ${d.replaced} vardiya seçtiğiniz kişiye verildi.` : "") + (d.skipped?.length ? ` ${d.skipped.join("; ")}.` : "");
      showToast(status === "rejected" ? "İzin reddedildi."
        : subNote && !(d.opened > 0) && !(d.removed > 0) ? `İzin onaylandı.${subNote}`
        : subNote ? `İzin onaylandı.${subNote} Kalan ${d.opened > 0 ? `${d.opened} vardiya ilana çevrildi` : `${d.removed} vardiya plandan çıktı`}.`
        : d.opened > 0 ? `İzin onaylandı, ${d.opened} vardiya ilana çevrildi.`
        : d.removed > 0 ? `İzin onaylandı, ${d.removed} vardiya plandan çıkarıldı.`
        : "İzin onaylandı.");
    } else {
      showToast("İşlem sırasında hata oluştu.");
    }
    setRejectModal(null); setRejectNote("");
    await load();
  }

  function handleRejectConfirm() {
    if (!rejectModal) return;
    if (rejectModal.type === "swap")  rejectSwap(rejectModal.id, rejectNote);
    else if (rejectModal.type === "edit") rejectEdit(rejectModal.id, rejectNote);
    else reviewLeave(rejectModal.id, "rejected", rejectNote);
  }

  const isPending = (s: any) =>
    s.status === "pending" || s.status === "peer_accepted";

  const pendingSwaps  = swaps.filter(s => s.status === "peer_accepted");
  const pendingEdits  = edits.filter(e => e.status === "pending");
  const pendingLeaves = leaves.filter((l: any) => l.status === "pending");
  const pendingOvertimes = overtimes.filter((o: any) => o.status === "pending");
  const totalPending  = pendingSwaps.length + pendingEdits.length + pendingLeaves.length + pendingOvertimes.length;

  // Filtered lists based on showHistory toggle
  const visibleSwaps  = showHistory ? swaps  : pendingSwaps;
  const visibleEdits  = showHistory ? edits  : pendingEdits;
  const visibleLeaves = showHistory ? leaves : pendingLeaves;
  const visibleOvertimes = showHistory ? overtimes : pendingOvertimes;
  // Açık sekmenin listesi boşaldıysa (sekmeler gizlendi) "Tümü"ne dön
  const kindCount: Record<string, number> = { swap: visibleSwaps.length, edit: visibleEdits.length, leave: visibleLeaves.length, overtime: visibleOvertimes.length };
  const activeEmpty = activeTab !== "all" && !loading && (kindCount[activeTab] ?? 0) === 0;
  const tab = activeEmpty ? "all" : activeTab;

  async function decideOvertime(id: number, status: "approved" | "rejected") {
    const res = await fetch("/api/overtime", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) { showToast(status === "approved" ? "Mesai onaylandı ✓" : "Mesai reddedildi"); load(); }
    else showToast("Bir hata oluştu");
  }

  function otWeekLabel(iso: string) {
    const d = new Date(iso + "T00:00:00");
    const end = new Date(d);
    end.setDate(d.getDate() + 6);
    const fmt = (dt: Date) => dt.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
    return `${fmt(d)} – ${fmt(end)}`;
  }

  if (!mounted) return <div className="space-y-6" />;

  return (
    <Page width="narrow">
      {/* Header */}
      <PageHeader title="Onaylar" description={totalPending > 0 ? `${totalPending} bekleyen talep` : "Bekleyen talep yok"} actions={
        <button
          onClick={() => setShowHistory(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
            showHistory ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <History size={13} />
          {showHistory ? "Sadece Bekleyen" : "Geçmişi Göster"}
        </button>
      } />

      {/* Sadece içinde talep olan türlerin sekmesi; tek tür varsa sekme hiç yok */}
      {(() => {
        const kinds = [
          swapRequestsEnabled && visibleSwaps.length > 0 ? { id: "swap", label: "Vardiya değiştirme", count: pendingSwaps.length, icon: ArrowLeftRight } : null,
          editRequestsEnabled && visibleEdits.length > 0 ? { id: "edit", label: "Düzenleme", count: pendingEdits.length, icon: FileEdit } : null,
          leaveRequestsEnabled && visibleLeaves.length > 0 ? { id: "leave", label: "İzin", count: pendingLeaves.length, icon: CalendarOff } : null,
          overtimeTrackingEnabled && visibleOvertimes.length > 0 ? { id: "overtime", label: "Mesai", count: pendingOvertimes.length, icon: Timer } : null,
        ].filter((k): k is NonNullable<typeof k> => k !== null);
        if (kinds.length < 2) return null;
        return <Tabs value={tab} onChange={id => setActiveTab(id)} items={[{ id: "all", label: "Tümü", count: totalPending, icon: ClipboardList }, ...kinds] as never} />;
      })()}

      {loading && <div className="text-center py-16 text-slate-400 text-sm">Yükleniyor…</div>}
      {!loading && tab === "all" && visibleSwaps.length + visibleEdits.length + visibleLeaves.length + visibleOvertimes.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl"><EmptyState text={showHistory ? "Talep yok" : "Onay bekleyen bir şey yok"} /></div>
      )}

      {/* ── SWAP TAB ── */}
      {!loading && (tab === "swap" || (tab === "all" && visibleSwaps.length > 0)) && (
        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
          {tab === "all" && <p className="px-4 py-2 bg-slate-50 text-xs font-semibold text-slate-500">Vardiya değiştirme</p>}
          {tab !== "all" && visibleSwaps.length === 0 && <EmptyState text={showHistory ? "Vardiya değiştirme talebi yok" : "Onay bekleyen vardiya değiştirme talebi yok"} />}
          {visibleSwaps.map(s => {
            const pending = s.status === "peer_accepted";
            return (
              <div key={s.id} className="px-4 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <ArrowLeftRight size={13} className="text-primary shrink-0" />
                      <p className="text-sm font-bold text-slate-900">
                        <Link href="/personnel" className="hover:underline hover:text-primary">{s.requester_name}</Link>
                        {" ↔ "}
                        <Link href="/personnel" className="hover:underline hover:text-primary">{s.target_name}</Link>
                      </p>
                      <StatusBadge status={s.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {s.requester_name}: {shiftLabel({ week_start: s.req_week_start, day: s.req_day, start_time: s.req_start, end_time: s.req_end })}
                    </p>
                    <p className="text-xs text-slate-500">
                      {s.target_name}: {shiftLabel({ week_start: s.tgt_week_start, day: s.tgt_day, start_time: s.tgt_start, end_time: s.tgt_end })}
                    </p>
                    {s.note && <p className="text-xs text-slate-400 mt-1 italic">"{s.note}"</p>}
                    {pending && Array.isArray(s.violations) && s.violations.length > 0 && (
                      <div className="mt-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2">
                        <p className="text-xs font-bold text-red-700 mb-1">Onaylanırsa kurallara aykırı olur</p>
                        <ul className="text-xs text-red-700 space-y-0.5 list-disc pl-4">
                          {s.violations.map((v: string) => <li key={v}>{v}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                  {s.created_at && (
                    <span className="text-xs text-slate-400 shrink-0">{timeAgo(s.created_at)}</span>
                  )}
                </div>
                {pending && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRejectModal({ type: "swap", id: s.id })}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:border-red-200 hover:text-red-700 hover:bg-red-50 transition-colors"
                    >
                      <XCircle size={15} /> Reddet
                    </button>
                    <button
                      onClick={() => approveSwap(s.id, Array.isArray(s.violations) ? s.violations : [])}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
                    >
                      <CheckCircle2 size={15} /> Onayla
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── EDIT TAB ── */}
      {!loading && (tab === "edit" || (tab === "all" && visibleEdits.length > 0)) && (
        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
          {tab === "all" && <p className="px-4 py-2 bg-slate-50 text-xs font-semibold text-slate-500">Saat düzeltme</p>}
          {tab !== "all" && visibleEdits.length === 0 && <EmptyState text={showHistory ? "Düzenleme talebi yok" : "Onay bekleyen düzenleme talebi yok"} />}
          {visibleEdits.map(e => {
            const pending = e.status === "pending";
            return (
              <div key={e.id} className="px-4 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <FileEdit size={13} className="text-blue-600 shrink-0" />
                      <Link href="/personnel" className="text-sm font-bold text-slate-900 hover:underline hover:text-primary">{e.personnel_name ?? "Ekip üyesi"}</Link>
                      <StatusBadge status={e.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {shiftLabel({ week_start: e.week_start, day: e.day, start_time: e.start_time, end_time: e.end_time })}
                    </p>
                    <p className="text-xs text-slate-600 mt-1.5 bg-slate-50 rounded-lg px-3 py-1.5 italic">"{e.reason}"</p>
                    {e.manager_note && (
                      <p className="text-xs text-slate-500 mt-1"><span className="font-bold">Notun:</span> {e.manager_note}</p>
                    )}
                  </div>
                  {e.created_at && (
                    <span className="text-xs text-slate-400 shrink-0">{timeAgo(e.created_at)}</span>
                  )}
                </div>
                {pending && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRejectModal({ type: "edit", id: e.id })}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:border-red-200 hover:text-red-700 hover:bg-red-50 transition-colors"
                    >
                      <XCircle size={15} /> Reddet
                    </button>
                    <button
                      onClick={() => approveEdit(e.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
                    >
                      <CheckCircle2 size={15} /> Onayla
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── LEAVE TAB ── */}
      {!loading && (tab === "leave" || (tab === "all" && visibleLeaves.length > 0)) && (
        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
          {tab === "all" && <p className="px-4 py-2 bg-slate-50 text-xs font-semibold text-slate-500">İzin</p>}
          {tab !== "all" && visibleLeaves.length === 0 && <EmptyState text={showHistory ? "İzin talebi yok" : "Bekleyen izin talebi yok"} />}
          {(visibleLeaves as any[]).map((l: any) => {
            const pending = l.status === "pending";
            return (
              <div key={l.id} className="px-4 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <CalendarOff size={13} className="text-ember-600 shrink-0" />
                      <Link href="/personnel" className="text-sm font-bold text-slate-900 hover:underline hover:text-primary">
                        {l.personnel_name ?? l.personnel_id}
                      </Link>
                      <StatusBadge status={l.status} />
                    </div>
                    <p className="text-xs text-slate-600 font-semibold">{leaveTypeLabel(l.type)}</p>
                    <p className="text-xs text-slate-500">
                      {l.start_date === l.end_date
                        ? `${formatDateTR(l.start_date)} (1 gün)`
                        : `${formatDateTR(l.start_date, { weekday: false })} → ${formatDateTR(l.end_date, { weekday: false })} (${l.days} gün)`}
                    </p>
                    {pending && leaveBalances[l.personnel_id] && isAnnualLeaveType(l.type) && (
                      <p className={`text-xs font-bold mt-1 ${leaveBalances[l.personnel_id].remaining < (l.days ?? 0) ? "text-red-600" : "text-emerald-700"}`}>
                        Kalan yıllık izni: {leaveBalances[l.personnel_id].remaining} gün
                        {leaveBalances[l.personnel_id].remaining < (l.days ?? 0) && " (talep bakiyeyi aşıyor!)"}
                      </p>
                    )}
                    {pending && leaveBalances[l.personnel_id]?.hireDateMissing && isAnnualLeaveType(l.type) && (
                      <p className="text-xs text-amber-700 mt-0.5">
                        İşe giriş tarihi girilmemiş, bakiye tahmini. <Link href="/personnel" className="underline font-semibold">Ekip&apos;ten ekleyin</Link>
                      </p>
                    )}
                    {pending && leaveBalances[l.personnel_id]?.firstEligibleDate && isAnnualLeaveType(l.type) && (
                      <p className="text-xs text-amber-700 mt-0.5">
                        1 yıllık kıdemi dolmadı; yıllık izin hakkı {formatDateTR(leaveBalances[l.personnel_id].firstEligibleDate, { weekday: false })} tarihinde doğar.
                      </p>
                    )}
                    {l.note && <p className="text-xs text-slate-400 mt-1 italic">"{l.note}"</p>}
                  </div>
                  {l.created_at && (
                    <span className="text-xs text-slate-400 shrink-0">{timeAgo(l.created_at)}</span>
                  )}
                </div>
                {pending && (leaveTeam[l.id] || (leaveConflicts[l.id]?.length ?? 0) > 0) && (() => {
                  // Sadeleştirme (2026-10-07): tek satırlık özet; ekip durumu ve yedek seçimi "Ayrıntılar"da
                  const t = leaveTeam[l.id];
                  const n = leaveConflicts[l.id]?.length ?? 0;
                  const left = t ? Math.max(0, t.size - 1 - t.others.length) : null;
                  const open = leaveOpen[l.id] ?? false;
                  return (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className={left !== null && left <= 1 ? "font-semibold text-red-700" : "text-slate-600"}>
                        {n > 0 ? `Bu tarihlerde ${n} vardiyası var.` : "Bu tarihlerde vardiyası yok."}
                        {left !== null && ` Onaylanırsa ${t.scope ? "departmanda" : "şubede"} en az ${left} kişi kalır.`}
                      </span>
                      <button type="button" onClick={() => setLeaveOpen(p => ({ ...p, [l.id]: !open }))} aria-expanded={open}
                        className="font-bold text-primary underline underline-offset-2">
                        {open ? "Ayrıntıları gizle" : n > 0 ? "Ayrıntılar ve yedek seçimi" : "Ayrıntılar"}
                      </button>
                    </div>
                  );
                })()}
                {pending && leaveOpen[l.id] && leaveTeam[l.id] && (() => {
                  // Plan yokken de öngörü: departmanda kaç kişi var, aynı günlerde kim izinli
                  const t = leaveTeam[l.id];
                  const away = t.others.length;
                  const left = Math.max(0, t.size - 1 - away);
                  return (
                    <div className={`rounded-xl px-3 py-2.5 text-xs space-y-0.5 border ${left <= 1 ? "bg-red-50 border-red-200 text-red-800" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                      <p className="font-semibold">
                        {t.scope ? `${t.scope} departmanında` : "Şubede"} {t.size} kişi var.
                        {away === 0 ? " Bu günlerde başka izinli yok." : ` Bu günlerde ${away} kişi daha izinli.`}
                        {` İzin onaylanırsa en az ${left} kişi kalır.`}
                      </p>
                      {t.others.map((o: any, i: number) => (
                        <p key={i}>{o.name}: {formatDateTR(o.start_date, { weekday: false })}{o.end_date !== o.start_date ? ` – ${formatDateTR(o.end_date, { weekday: false })}` : ""}{o.pending ? " (onay bekliyor)" : ""}</p>
                      ))}
                      {(leaveConflicts[l.id]?.length ?? 0) === 0 && <p className="text-slate-500">Bu günlerde planlanmış vardiyası yok. Plan sonra hazırlanırsa bu kişiye bu günlerde vardiya yazılmaz.</p>}
                    </div>
                  );
                })()}
                {pending && leaveOpen[l.id] && (leaveConflicts[l.id]?.length ?? 0) > 0 && (
                  // Sorumlu onaylamadan önce görsün: o vardiyada kim kalıyor, yerine kim gelebilir (seçerse vardiya ona geçer)
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 space-y-2.5">
                    <p className="text-xs font-bold text-amber-800">Onaylarsanız bu vardiyalar plandan çıkar. İsterseniz yerine birini seçin:</p>
                    {leaveConflicts[l.id].map((c: any) => {
                      const picked = leaveSubs[l.id]?.[c.id] ?? "";
                      return (
                        <div key={c.id} className="bg-white/70 rounded-lg px-2.5 py-2 space-y-1.5">
                          <p className="text-xs font-semibold text-slate-800">
                            {formatDateTR(c.date)} · {c.shift_name ?? "Vardiya"} {c.start_time}–{c.end_time}{c.published ? "" : " (taslak)"}
                          </p>
                          <p className={`text-xs ${c.others === 0 ? "text-red-700 font-semibold" : "text-slate-500"}`}>
                            {c.others === 0 ? "Bu vardiyada başka kimse yok." : `Bu vardiyada ${c.others} kişi daha var.`}
                            {(c.candidates?.length ?? 0) === 0 && " O gün boş ve uygun kimse yok."}
                          </p>
                          {(c.candidates?.length ?? 0) > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {c.candidates.map((x: any) => (
                                <button key={x.personnel_id} type="button" disabled={!x.ok}
                                  onClick={() => setLeaveSubs(prev => ({ ...prev, [l.id]: { ...(prev[l.id] ?? {}), [c.id]: picked === x.personnel_id ? "" : x.personnel_id } }))}
                                  title={x.note}
                                  className={`text-left px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                                    picked === x.personnel_id ? "border-primary bg-primary/10 text-primary font-bold"
                                    : x.ok ? "border-slate-200 bg-white text-slate-700 hover:border-primary/40" : "border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed"}`}>
                                  <span className="block font-semibold">{picked === x.personnel_id ? "✓ " : ""}{x.name}</span>
                                  {x.note && <span className="block text-[11px] opacity-80">{x.note}</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {pending && (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setRejectModal({ type: "leave", id: l.id })}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:border-red-200 hover:text-red-700 hover:bg-red-50 transition-colors"
                    >
                      <XCircle size={15} /> Reddet
                    </button>
                    {/* Yerine kimse seçilmeyen yayınlanmış vardiya varsa: ilana mı çevrilsin, sadece mi çıksın */}
                    {(leaveConflicts[l.id] ?? []).some((c: any) => c.published && !leaveSubs[l.id]?.[c.id]) ? (
                      <>
                        <button
                          onClick={() => reviewLeave(l.id, "approved", undefined, "remove")}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-primary/30 text-primary text-sm font-bold hover:bg-primary/5 transition-colors"
                        >
                          Onayla, vardiyaları plandan çıkar
                        </button>
                        <button
                          onClick={() => reviewLeave(l.id, "approved", undefined, "open")}
                          className="flex-[1.3] flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
                        >
                          <CheckCircle2 size={15} /> Onayla, vardiyaları ilana çıkar
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => reviewLeave(l.id, "approved", undefined, "remove")}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
                      >
                        <CheckCircle2 size={15} /> Onayla
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── OVERTIME TAB ── */}
      {!loading && (tab === "overtime" || (tab === "all" && visibleOvertimes.length > 0)) && (
        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
          {tab === "all" && <p className="px-4 py-2 bg-slate-50 text-xs font-semibold text-slate-500">Fazla mesai</p>}
          {tab !== "all" && visibleOvertimes.length === 0 && <EmptyState text={showHistory ? "Mesai kaydı yok" : "Onay bekleyen mesai kaydı yok"} />}
          {(visibleOvertimes as any[]).map((o: any) => {
            const pending = o.status === "pending";
            const empChip = o.employee_status === "accepted"
              ? { label: `Kişi kabul etti ✓ · ${o.compensation_type === "time_off" ? "Serbest Zaman" : "Zamlı Ücret"}`, tone: "positive" as PillTone }
              : o.employee_status === "declined"
                ? { label: "Kişi reddetti ✗", tone: "danger" as PillTone }
                : { label: "Kişinin onayı bekleniyor", tone: "neutral" as PillTone };
            return (
              <div key={o.id} className="px-4 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <Timer size={13} className="text-amber-600 shrink-0" />
                      <span className="text-sm font-bold text-slate-900">{o.personnel_name ?? "—"}</span>
                      <StatusBadge status={o.status} />
                      <StatusPill tone={empChip.tone}>{empChip.label}</StatusPill>
                    </div>
                    <p className="text-xs text-slate-600 font-semibold">{o.overtime_hours} saat fazla mesai</p>
                    <p className="text-xs text-slate-500">{o.week_start ? otWeekLabel(o.week_start) : "—"} haftası · {o.scheduled_hours} saat planlı</p>
                    {o.note && <p className="text-xs text-slate-400 mt-1 italic">{o.note}</p>}
                  </div>
                  {o.created_at && (
                    <span className="text-xs text-slate-400 shrink-0">{timeAgo(o.created_at)}</span>
                  )}
                </div>
                {pending && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => decideOvertime(o.id, "rejected")}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:border-red-200 hover:text-red-700 hover:bg-red-50 transition-colors"
                    >
                      <XCircle size={15} /> Reddet
                    </button>
                    <button
                      onClick={() => decideOvertime(o.id, "approved")}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
                    >
                      <CheckCircle2 size={15} /> Onayla
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-xs text-slate-400 text-center pt-1">
            Yıllık sınırlar, maliyet ve serbest zaman takibi için <Link href="/reports?tab=mesai" className="underline hover:text-slate-600">Raporlar › Fazla Mesai</Link>&apos;ya bakın.
          </p>
        </div>
      )}

      {/* Reject modal */}
      <Sheet open={!!rejectModal} onClose={() => { setRejectModal(null); setRejectNote(""); }} title="Reddetme nedeni"
        description="İsteğe bağlı, kişiye iletilir"
        footer={<>
          <button onClick={() => { setRejectModal(null); setRejectNote(""); }} className={sheetSecondaryClass}>Vazgeç</button>
          <button onClick={handleRejectConfirm} className={sheetDangerClass}>Reddet</button>
        </>}>
        <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={3} placeholder="Neden (isteğe bağlı)…"
          className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
      </Sheet>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 right-4 lg:bottom-8 md:right-8 bg-slate-900 text-white text-xs font-bold px-5 py-3 rounded-2xl shadow-xl z-50 max-w-[calc(100vw-2rem)]">
          {toast}
        </div>
      )}
    </Page>
  );
}

/** Boş durum (DESIGN.md §7): tek cümle, büyük ikon yok. Liste çerçevesinin içinde de dışında da kullanılır. */
function EmptyState({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-sm text-slate-500">{text}</p>;
}
