"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { usePortalAuth } from "@/hooks/useAuth";
import { getWeekStart as libGetWeekStart } from "@/lib/date";
import { DAY_SHORT } from "@/lib/constants";
import {
  Inbox, ArrowLeftRight, FileEdit, CalendarOff,
  CheckCircle2, XCircle, Clock, ChevronRight, ChevronLeft, Send, Undo2,
  AlertCircle, ShieldAlert, Star
} from "lucide-react";

// ─── helpers ───────────────────────────────────────────────────────────────
const LEAVE_TYPES = ["Yıllık İzin", "Mazeret İzni", "Hastalık / Rapor"];

function shiftLabel(row: any) {
  if (!row) return "—";
  const weekDate = new Date(row.req_week_start || row.week_start || "");
  weekDate.setDate(weekDate.getDate() + (row.req_day ?? row.day ?? 0));
  const dateStr = weekDate.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  const dayName = DAY_SHORT[row.req_day ?? row.day ?? 0] ?? "";
  const time = row.req_start || row.start_time
    ? `${row.req_start || row.start_time}–${row.req_end || row.end_time}`
    : "";
  return `${dayName} ${dateStr}${time ? ` · ${time}` : ""}`;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:           { label: "Bekliyor",              cls: "bg-amber-50 text-amber-700 border-amber-200" },
  peer_accepted:     { label: "Müdür Onayı Bekliyor",  cls: "bg-blue-50 text-blue-700 border-blue-200" },
  peer_rejected:     { label: "Karşı Taraf Reddetti",  cls: "bg-red-50 text-red-600 border-red-200" },
  cancelled:         { label: "İptal Edildi",           cls: "bg-slate-100 text-slate-500 border-slate-200" },
  manager_approved:  { label: "Onaylandı ✓",           cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  manager_rejected:  { label: "Reddedildi",             cls: "bg-red-50 text-red-600 border-red-200" },
  approved:          { label: "Onaylandı ✓",           cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected:          { label: "Reddedildi",             cls: "bg-red-50 text-red-600 border-red-200" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, cls: "bg-slate-50 text-slate-600 border-slate-200" };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
  );
}

// ─── main page ─────────────────────────────────────────────────────────────
export default function PortalRequests() {
  const router = useRouter();
  const { user, mounted } = usePortalAuth();

  const [activeTab, setActiveTab] = useState<"sent" | "incoming" | "new">("sent");

  // data
  const [swapsSent, setSwapsSent]     = useState<any[]>([]);
  const [swapsIn, setSwapsIn]         = useState<any[]>([]);
  const [editReqs, setEditReqs]       = useState<any[]>([]);
  const [leaveReqs, setLeaveReqs]     = useState<any[]>([]);
  const [forceAssigns, setForceAssigns] = useState<any[]>([]);

  // new-form state
  const [newType, setNewType]         = useState<"swap" | "edit" | "leave">("swap");

  // swap wizard
  const [swapStep, setSwapStep]       = useState(0);
  const [myShifts, setMyShifts]       = useState<any[]>([]);
  const [teammates, setTeammates]     = useState<any[]>([]);
  const [theirShifts, setTheirShifts] = useState<any[]>([]);
  const [selMyShift, setSelMyShift]   = useState<any>(null);
  const [selMate, setSelMate]         = useState<any>(null);
  const [selTheirShift, setSelTheirShift] = useState<any>(null);
  const [swapNote, setSwapNote]       = useState("");

  // edit form
  const [editShift, setEditShift]     = useState<any>(null);
  const [editReason, setEditReason]   = useState("");

  // leave form
  const [leaveType, setLeaveType]     = useState(LEAVE_TYPES[0]);
  const [leaveStart, setLeaveStart]   = useState("");
  const [leaveEnd, setLeaveEnd]       = useState("");
  const [leaveNote, setLeaveNote]     = useState("");
  // leave policy (lokasyondan çekilir)
  const [leavePolicy, setLeavePolicy] = useState<{ require_reason: boolean; allow_multi_day: boolean; max_days_per_request: number } | null>(null);
  const [weeklyOffDay, setWeeklyOffDay] = useState<number | null>(null);

  const [loading, setLoading]         = useState(false);
  const [toast, setToast]             = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<{ kind: "swap" | "edit" | "leave"; id: number } | null>(null);


  // Lokasyonun izin politikasını ve personelin sabit izin gününü yükle
  useEffect(() => {
    if (!user?.location_id) return;
    fetch(`/api/locations?id=${user.location_id}`)
      .then(r => r.json())
      .then((data: any[]) => {
        const loc = Array.isArray(data) ? data[0] : data;
        if (!loc) return;
        try {
          const lp = typeof loc.leave_policy === "string" ? JSON.parse(loc.leave_policy) : loc.leave_policy;
          if (lp) setLeavePolicy(lp);
        } catch { /* geçersiz JSON → atla */ }
      }).catch(() => {});
    if (user.personnel_id) {
      fetch(`/api/personnel?location_id=${user.location_id}`)
        .then(r => r.json())
        .then((data: any[]) => {
          const me = Array.isArray(data) ? data.find((p: any) => p.id === user.personnel_id) : null;
          if (me && me.weekly_off_day !== null && me.weekly_off_day !== undefined) {
            setWeeklyOffDay(Number(me.weekly_off_day));
          }
        }).catch(() => {});
    }
  }, [user]);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    if (!user) return;
    const [ss, si, er, lr, fa] = await Promise.all([
      fetch(`/api/swap-requests?requester_id=${user.personnel_id}`).then(r => r.json()).catch(() => []),
      fetch(`/api/swap-requests?target_id=${user.personnel_id}`).then(r => r.json()).catch(() => []),
      fetch(`/api/shift-edit-requests?personnel_id=${user.personnel_id}`).then(r => r.json()).catch(() => []),
      user.personnel_id
        ? fetch(`/api/leave-requests?personnel_id=${user.personnel_id}`).then(r => r.json()).catch(() => [])
        : Promise.resolve([]),
      user.personnel_id
        ? fetch(`/api/schedule/force-assignments?personnel_id=${user.personnel_id}`).then(r => r.json()).catch(() => [])
        : Promise.resolve([]),
    ]);
    setSwapsSent(Array.isArray(ss) ? ss : []);
    setSwapsIn(Array.isArray(si) ? si : []);
    setEditReqs(Array.isArray(er) ? er : []);
    setLeaveReqs(Array.isArray(lr) ? lr : []);
    setForceAssigns(Array.isArray(fa) ? fa : []);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── load my shifts for wizard ──────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "new" || newType !== "swap" || !user) return;
    (async () => {
      const weeks = await Promise.all(
        [0, 1, 2].map(w =>
          fetch(`/api/shifts?personnel_id=${user.personnel_id || ""}&week_start=${libGetWeekStart(w)}`)
            .then(r => r.json()).catch(() => [])
        )
      );
      const all = weeks.flat().filter((s: any) => Array.isArray(s) ? false : s?.id);
      setMyShifts(all);
    })();
  }, [activeTab, newType, user]);

  useEffect(() => {
    if (activeTab !== "new" || newType !== "edit" || !user) return;
    (async () => {
      const weeks = await Promise.all(
        [0, 1].map(w =>
          fetch(`/api/shifts?personnel_id=${user.personnel_id || ""}&week_start=${libGetWeekStart(w)}`)
            .then(r => r.json()).catch(() => [])
        )
      );
      setMyShifts(weeks.flat().filter((s: any) => s?.id));
    })();
  }, [activeTab, newType, user]);

  // ── load teammates ─────────────────────────────────────────────────────
  useEffect(() => {
    if (swapStep !== 1 || !user) return;
    fetch(`/api/personnel?location_id=${user.location_id}`)
      .then(r => r.json())
      .then(ppl => {
        if (Array.isArray(ppl)) {
          setTeammates(ppl.filter((p: any) => p.id !== user.personnel_id));
        }
      }).catch(() => {});
  }, [swapStep, user]);

  // ── load their shifts ──────────────────────────────────────────────────
  useEffect(() => {
    if (swapStep !== 2 || !selMate || !user) return;
    (async () => {
      const weeks = await Promise.all(
        [0, 1, 2].map(w =>
          fetch(`/api/shifts?personnel_id=${selMate.id}&week_start=${libGetWeekStart(w)}`)
            .then(r => r.json()).catch(() => [])
        )
      );
      setTheirShifts(weeks.flat().filter((s: any) => s?.id));
    })();
  }, [swapStep, selMate, user]);

  // ── submit handlers ────────────────────────────────────────────────────
  async function submitSwap() {
    if (!selMyShift || !selMate || !selTheirShift || !user) return;
    setLoading(true);
    try {
      const r = await fetch("/api/swap-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requester_id: user.personnel_id,
          requester_name: user.name,
          target_id: selMate.id,
          target_name: selMate.name,
          requester_shift_id: selMyShift.id,
          target_shift_id: selTheirShift.id,
          note: swapNote,
        }),
      });
      if (r.ok) {
        showToast("Takas teklifi gönderildi!");
        resetSwapWizard();
        setActiveTab("sent");
        await loadData();
      } else {
        const err = await r.json().catch(() => ({}));
        showToast(err.error || "Takas teklifi gönderilemedi.", "error");
      }
    } finally { setLoading(false); }
  }

  async function submitEdit() {
    if (!editShift || !editReason.trim() || !user) return;
    setLoading(true);
    try {
      const r = await fetch("/api/shift-edit-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personnel_id: user.personnel_id,
          personnel_name: user.name,
          shift_id: editShift.id,
          reason: editReason,
        }),
      });
      if (r.ok) {
        showToast("Düzenleme talebi gönderildi!");
        setEditShift(null); setEditReason("");
        setActiveTab("sent");
        await loadData();
      } else {
        const err = await r.json().catch(() => ({}));
        showToast(err.error || "Talep gönderilemedi.", "error");
      }
    } finally { setLoading(false); }
  }

  async function submitLeave() {
    if (!leaveStart || !leaveEnd || !user?.personnel_id) return;
    // Client-side policy kontrolü
    if (leavePolicy?.require_reason && !leaveNote.trim()) {
      showToast("Bu lokasyonda izin talebi için mazeret zorunludur.", "error"); return;
    }
    if (leavePolicy && !leavePolicy.allow_multi_day && leaveStart !== leaveEnd) {
      showToast("Bu lokasyonda yalnızca tek günlük izin talep edebilirsiniz.", "error"); return;
    }
    setLoading(true);
    try {
      const start = new Date(leaveStart), end = new Date(leaveEnd);
      const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
      const r = await fetch("/api/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personnel_id: user.personnel_id,
          type: leaveType, start_date: leaveStart,
          end_date: leaveEnd, days, note: leaveNote,
        }),
      });
      if (r.ok) {
        showToast("İzin talebi gönderildi!");
        setLeaveStart(""); setLeaveEnd(""); setLeaveNote("");
        setActiveTab("sent");
        await loadData();
      } else {
        const err = await r.json().catch(() => ({}));
        showToast(err.error || "Talep gönderilemedi.", "error");
      }
    } finally { setLoading(false); }
  }

  async function respondSwap(id: number, status: string) {
    // Optimistik: anında UI'da güncelle
    setSwapsIn(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    const r = await fetch("/api/swap-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (r.ok) {
      showToast(status === "peer_accepted" ? "Takas teklifi kabul edildi!" : "Takas teklifi reddedildi.");
    } else {
      showToast("İşlem sırasında hata oluştu.", "error");
      await loadData(); // hata varsa geri al
    }
  }

  async function cancelRequest(kind: "swap" | "edit" | "leave", id: number) {
    setCancelConfirm(null);
    // Optimistik: anında listeden kaldır
    if (kind === "swap") setSwapsSent(prev => prev.map(s => s.id === id ? { ...s, status: "cancelled" } : s));
    else if (kind === "edit") setEditReqs(prev => prev.map(e => e.id === id ? { ...e, status: "cancelled" } : e));
    else setLeaveReqs(prev => prev.map(l => l.id === id ? { ...l, status: "cancelled" } : l));

    try {
      let ok = false;
      if (kind === "swap") {
        const r = await fetch("/api/swap-requests", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, status: "cancelled" }),
        });
        ok = r.ok;
      } else if (kind === "edit") {
        const r = await fetch("/api/shift-edit-requests", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, status: "cancelled" }),
        });
        ok = r.ok;
      } else {
        const r = await fetch("/api/leave-requests", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action: "cancel" }),
        });
        ok = r.ok;
      }
      if (ok) showToast("Talep iptal edildi.");
      else { showToast("İptal sırasında hata oluştu.", "error"); await loadData(); }
    } catch { showToast("İptal sırasında hata oluştu.", "error"); await loadData(); }
  }

  function resetSwapWizard() {
    setSwapStep(0); setSelMyShift(null); setSelMate(null); setSelTheirShift(null); setSwapNote("");
  }

  if (!mounted) return <div className="space-y-4" />;

  // Gelen takas + zorunlu atama sayısı
  const incomingPendingCount = swapsIn.filter(s => s.status === "pending").length + forceAssigns.length;

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Talepler</h1>
        <p className="text-sm text-slate-500 mt-1">İzin, takas ve düzenleme talepleri</p>
      </div>

      {/* Tab bar */}
      <div className="flex bg-slate-100 p-1 rounded-2xl gap-1">
        {([
          { id: "sent",     label: "Gönderdiğim" },
          { id: "incoming", label: `Gelen${incomingPendingCount > 0 ? ` (${incomingPendingCount})` : ""}` },
          { id: "new",      label: "Yeni Talep" },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => { setActiveTab(t.id); resetSwapWizard(); }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === t.id ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── SENT TAB ── */}
      {activeTab === "sent" && (
        <div className="space-y-4">
          <Section title="Takas Talepleri" icon={<ArrowLeftRight size={14} />}>
            {swapsSent.length === 0
              ? <Empty text="Takas talebi yok" />
              : swapsSent.map(s => (
                <RequestCard key={s.id}
                  title={`${s.target_name ?? "—"} ile takas`}
                  sub={`Benim: ${shiftLabel({ week_start: s.req_week_start, day: s.req_day, start_time: s.req_start, end_time: s.req_end })} → Onların: ${shiftLabel({ week_start: s.tgt_week_start, day: s.tgt_day, start_time: s.tgt_start, end_time: s.tgt_end })}`}
                  status={s.status}
                  note={s.note}
                  canCancel={s.status === "pending"}
                  onCancel={() => setCancelConfirm({ kind: "swap", id: s.id })}
                  showSwapSteps
                />
              ))}
          </Section>

          <Section title="Düzenleme Talepleri" icon={<FileEdit size={14} />}>
            {editReqs.length === 0
              ? <Empty text="Düzenleme talebi yok" />
              : editReqs.map(e => (
                <RequestCard key={e.id}
                  title="Vardiya düzenleme"
                  sub={shiftLabel({ week_start: e.week_start, day: e.day, start_time: e.start_time, end_time: e.end_time })}
                  status={e.status}
                  note={e.reason}
                  managerNote={e.manager_note}
                  canCancel={e.status === "pending"}
                  onCancel={() => setCancelConfirm({ kind: "edit", id: e.id })}
                />
              ))}
          </Section>

          <Section title="İzin Talepleri" icon={<CalendarOff size={14} />}>
            {leaveReqs.length === 0
              ? <Empty text="İzin talebi yok" />
              : leaveReqs.map((l: any) => (
                <RequestCard key={l.id}
                  title={l.type}
                  sub={`${l.start_date} → ${l.end_date} (${l.days} gün)`}
                  status={l.status}
                  note={l.note}
                  canCancel={l.status === "pending"}
                  onCancel={() => setCancelConfirm({ kind: "leave", id: l.id })}
                />
              ))}
          </Section>
        </div>
      )}

      {/* ── INCOMING TAB ── */}
      {activeTab === "incoming" && (
        <div className="space-y-4">

          {/* ── Zorunlu Atama Talepleri ── */}
          {forceAssigns.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <ShieldAlert size={14} className="text-amber-600" />
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Zorunlu Atama Talepleri</h2>
                <span className="ml-1 bg-amber-100 text-amber-700 text-[10px] font-black px-1.5 py-0.5 rounded-full">{forceAssigns.length}</span>
              </div>
              {forceAssigns.map((fa: any) => (
                <ForceAssignCard
                  key={fa.id}
                  item={fa}
                  onRespond={async (action: "accept" | "reject") => {
                    const r = await fetch("/api/schedule/force-assignments", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ shift_id: fa.id, action }),
                    });
                    if (r.ok) {
                      showToast(action === "accept" ? `Kabul edildi! ×${fa.force_bonus_multiplier} bonus puan kazandın.` : "Reddedildi. Müdürün bilgilendirildi.");
                    } else {
                      const err = await r.json().catch(() => ({}));
                      showToast(err.error || "İşlem başarısız.", "error");
                    }
                    await loadData();
                  }}
                />
              ))}
            </div>
          )}

          {/* ── Gelen Takas Teklifleri ── */}
          <div className="space-y-3">
            {forceAssigns.length > 0 && (
              <div className="flex items-center gap-1.5">
                <ArrowLeftRight size={14} className="text-slate-400" />
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gelen Takas Teklifleri</h2>
              </div>
            )}
          {swapsIn.length === 0 ? (
            forceAssigns.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-10 flex flex-col items-center gap-3 text-slate-400">
              <Inbox size={36} strokeWidth={1.5} />
              <p className="text-sm font-semibold">Bekleyen gelen talep yok</p>
            </div>
            ) : null
          ) : (
            swapsIn.map(s => {
              const isPending = s.status === "pending";
              return (
                <div key={s.id} className={`bg-white rounded-2xl border p-4 space-y-3 ${isPending ? "border-amber-200" : "border-slate-100"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-black text-slate-900">{s.requester_name ?? "Personel"} sana takas teklif etti</p>
                        <StatusBadge status={s.status} />
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Onlarda: {shiftLabel({ week_start: s.req_week_start, day: s.req_day, start_time: s.req_start, end_time: s.req_end })}
                      </p>
                      <p className="text-xs text-slate-500">
                        Sende: {shiftLabel({ week_start: s.tgt_week_start, day: s.tgt_day, start_time: s.tgt_start, end_time: s.tgt_end })}
                      </p>
                      {s.note && <p className="text-xs text-slate-400 mt-1 italic">"{s.note}"</p>}
                    </div>
                    <ArrowLeftRight size={18} className="text-primary shrink-0 mt-0.5" />
                  </div>
                  <SwapSteps status={s.status} />
                  {isPending && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => respondSwap(s.id, "peer_rejected")}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <XCircle size={15} /> Reddet
                      </button>
                      <button
                        onClick={() => respondSwap(s.id, "peer_accepted")}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
                      >
                        <CheckCircle2 size={15} /> Kabul Et
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
          </div>
        </div>
      )}

      {/* ── NEW REQUEST TAB ── */}
      {activeTab === "new" && (
        <div className="space-y-4">
          {/* Type picker */}
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: "swap", label: "Vardiya Takası", icon: ArrowLeftRight },
              { id: "edit", label: "Düzenleme",      icon: FileEdit },
              { id: "leave", label: "İzin",          icon: CalendarOff },
            ] as const).map(t => (
              <button
                key={t.id}
                onClick={() => { setNewType(t.id); resetSwapWizard(); }}
                className={`flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all ${
                  newType === t.id
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                <t.icon size={20} />
                <span className="text-[11px] font-bold">{t.label}</span>
              </button>
            ))}
          </div>

          {/* ── SWAP WIZARD ── */}
          {newType === "swap" && (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              {/* Progress */}
              <div className="flex border-b border-slate-100">
                {["Vardiyam", "Arkadaşım", "Vardiyası", "Gönder"].map((s, i) => (
                  <div key={i} className={`flex-1 py-2.5 text-center text-[9px] sm:text-[10px] font-bold transition-colors px-1 ${
                    swapStep === i ? "bg-primary text-white" : swapStep > i ? "bg-primary/10 text-primary" : "text-slate-400"
                  }`}>{s}</div>
                ))}
              </div>

              <div className="p-4">
                {swapStep === 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-500 mb-3">Takas etmek istediğin vardiyayı seç:</p>
                    {myShifts.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Yayınlanmış vardiyan bulunmuyor. Müdürünüzün vardiya planını yayınlamasını bekleyin.</p>}
                    {myShifts.map(s => (
                      <ShiftOption key={s.id} shift={s} selected={selMyShift?.id === s.id} onSelect={() => setSelMyShift(s)} />
                    ))}
                    <NextBtn disabled={!selMyShift} onClick={() => setSwapStep(1)} />
                  </div>
                )}

                {swapStep === 1 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-500 mb-3">Takas teklifini kime göndermek istiyorsun?</p>
                    {teammates.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Ekip arkadaşı bulunamadı.</p>}
                    {teammates.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setSelMate(p)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                          selMate?.id === p.id ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 shrink-0">
                          {p.name.charAt(0)}
                        </div>
                        <div>
                          <p className={`text-sm font-bold ${selMate?.id === p.id ? "text-primary" : "text-slate-800"}`}>{p.name}</p>
                          <p className="text-[10px] text-slate-400">{p.title || "Personel"}</p>
                        </div>
                      </button>
                    ))}
                    <div className="flex gap-2 mt-2">
                      <BackBtn onClick={() => setSwapStep(0)} />
                      <NextBtn disabled={!selMate} onClick={() => setSwapStep(2)} />
                    </div>
                  </div>
                )}

                {swapStep === 2 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-500 mb-3">{selMate?.name} hangi vardiyasını sana versin?</p>
                    {theirShifts.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Yaklaşan vardiyaları yok.</p>}
                    {theirShifts.map(s => (
                      <ShiftOption key={s.id} shift={s} selected={selTheirShift?.id === s.id} onSelect={() => setSelTheirShift(s)} />
                    ))}
                    <div className="flex gap-2 mt-2">
                      <BackBtn onClick={() => setSwapStep(1)} />
                      <NextBtn disabled={!selTheirShift} onClick={() => setSwapStep(3)} />
                    </div>
                  </div>
                )}

                {swapStep === 3 && (
                  <div className="space-y-4">
                    <div className="bg-slate-50 rounded-xl p-3 space-y-1 text-xs text-slate-600">
                      <p><span className="font-bold">Benim verdiğim:</span> {shiftLabel({ week_start: selMyShift?.week_start, day: selMyShift?.day, start_time: selMyShift?.start_time, end_time: selMyShift?.end_time })}</p>
                      <p><span className="font-bold">Aldığım:</span> {shiftLabel({ week_start: selTheirShift?.week_start, day: selTheirShift?.day, start_time: selTheirShift?.start_time, end_time: selTheirShift?.end_time })}</p>
                      <p><span className="font-bold">Teklif alıcı:</span> {selMate?.name}</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Not (opsiyonel)</label>
                      <textarea
                        value={swapNote}
                        onChange={e => setSwapNote(e.target.value)}
                        rows={2}
                        placeholder="Arkadaşınıza bir not..."
                        className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-primary transition-colors resize-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <BackBtn onClick={() => setSwapStep(2)} />
                      <button
                        disabled={loading}
                        onClick={submitSwap}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        <Send size={15} /> Teklifi Gönder
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── EDIT FORM ── */}
          {newType === "edit" && (
            <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-4">
              <div>
                <p className="text-xs font-bold text-slate-500 mb-2">Düzenlemek istediğin vardiyayı seç:</p>
                {myShifts.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Yayınlanmış vardiyan bulunmuyor. Müdürünüzün vardiya planını yayınlamasını bekleyin.</p>}
                <div className="space-y-2">
                  {myShifts.map(s => (
                    <ShiftOption key={s.id} shift={s} selected={editShift?.id === s.id} onSelect={() => setEditShift(s)} />
                  ))}
                </div>
              </div>
              {editShift && (
                <>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Neden değiştirmek istiyorsun?</label>
                    <textarea
                      value={editReason}
                      onChange={e => setEditReason(e.target.value)}
                      rows={3}
                      placeholder="Yöneticinize açıklama yazın..."
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-primary transition-colors resize-none"
                    />
                  </div>
                  <button
                    disabled={!editReason.trim() || loading}
                    onClick={submitEdit}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    <Send size={15} /> Talebi Gönder
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── LEAVE FORM ── */}
          {newType === "leave" && (
            <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-4">
              {/* Sabit izin günü bilgisi */}
              {weeklyOffDay !== null && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
                  <CalendarOff size={15} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    Sabit izin günün: <strong>{["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi","Pazar"][weeklyOffDay]}</strong>.
                    Bu gün OR-Tools tarafından her hafta otomatik olarak bloke edilir — ayrıca izin talebi oluşturmana gerek yok.
                  </p>
                </div>
              )}

              {/* Politika özeti */}
              {leavePolicy && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Lokasyon İzin Kuralları</p>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${leavePolicy.require_reason ? "bg-red-50 text-red-600 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                      {leavePolicy.require_reason ? "Mazeret zorunlu" : "Mazeret opsiyonel"}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${leavePolicy.allow_multi_day ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                      {leavePolicy.allow_multi_day ? `Çoklu gün (max ${leavePolicy.max_days_per_request})` : "Yalnızca tek gün"}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">İzin Türü</label>
                <div className="flex flex-col gap-1.5">
                  {LEAVE_TYPES.map(t => (
                    <button
                      key={t}
                      onClick={() => setLeaveType(t)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm font-semibold text-left transition-all ${
                        leaveType === t ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${leaveType === t ? "border-primary" : "border-slate-300"}`}>
                        {leaveType === t && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tarih alanları — çoklu gün kapalıysa bitiş = başlangıç */}
              <div className={leavePolicy?.allow_multi_day === false ? "" : "grid grid-cols-2 gap-3"}>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">
                    {leavePolicy?.allow_multi_day === false ? "İzin Tarihi" : "Başlangıç"}
                  </label>
                  <input
                    type="date"
                    value={leaveStart}
                    onChange={e => {
                      setLeaveStart(e.target.value);
                      if (leavePolicy?.allow_multi_day === false) setLeaveEnd(e.target.value);
                    }}
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-primary transition-colors"
                  />
                </div>
                {leavePolicy?.allow_multi_day !== false && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Bitiş</label>
                    <input type="date" value={leaveEnd} min={leaveStart}
                      onChange={e => setLeaveEnd(e.target.value)}
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-primary transition-colors" />
                  </div>
                )}
              </div>
              {leaveStart && leaveEnd && leavePolicy?.allow_multi_day !== false && (
                <p className="text-xs text-slate-500 -mt-2">
                  {Math.round((new Date(leaveEnd).getTime() - new Date(leaveStart).getTime()) / 86400000) + 1} gün
                </p>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">
                  Mazeret / Açıklama {leavePolicy?.require_reason && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  value={leaveNote}
                  onChange={e => setLeaveNote(e.target.value)}
                  rows={2}
                  placeholder={leavePolicy?.require_reason ? "Zorunlu: mazeret giriniz..." : "Yöneticinize not..."}
                  className={`w-full text-sm bg-slate-50 border rounded-xl p-3 outline-none focus:border-primary transition-colors resize-none ${
                    leavePolicy?.require_reason && !leaveNote.trim() ? "border-red-200" : "border-slate-200"
                  }`}
                />
              </div>

              <button
                disabled={!leaveStart || !leaveEnd || loading || (leavePolicy?.require_reason && !leaveNote.trim())}
                onClick={submitLeave}
                className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Send size={15} /> İzin Talebi Gönder
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── İptal Onay Modalı ── */}
      {cancelConfirm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
          onClick={() => setCancelConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-2xl space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600 shrink-0">
                <AlertCircle size={20} />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">Talebi İptal Et</p>
                <p className="text-xs text-slate-500 mt-0.5">Bu işlem geri alınamaz.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCancelConfirm(null)}
                className="flex-1 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Vazgeç
              </button>
              <button
                onClick={() => cancelRequest(cancelConfirm.kind, cancelConfirm.id)}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-colors"
              >
                <Undo2 size={14} className="inline mr-1" />
                İptal Et
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-28 left-1/2 -translate-x-1/2 text-white text-xs font-bold px-5 py-3 rounded-2xl shadow-xl z-50 whitespace-nowrap ${
          toast.type === "error" ? "bg-red-600" : "bg-slate-900"
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── sub-components ─────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-slate-400">{icon}</span>
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-5 text-center text-xs text-slate-400 font-medium">
      {text}
    </div>
  );
}

// Swap akışı 3 aşamalıdır: teklif → karşı taraf kabulü → müdür onayı.
// Statüden her adımın durumunu türetir; iptal edilen taleplerde gösterilmez.
function SwapSteps({ status }: { status: string }) {
  if (status === "cancelled") return null;
  const STEPS = ["Teklif", "Kabul", "Müdür Onayı"];
  // Her adım: done | current | failed | upcoming
  const states: ("done" | "current" | "failed" | "upcoming")[] =
    status === "pending"          ? ["done", "current", "upcoming"] :
    status === "peer_rejected"    ? ["done", "failed", "upcoming"] :
    status === "peer_accepted"    ? ["done", "done", "current"] :
    status === "manager_approved" ? ["done", "done", "done"] :
    status === "manager_rejected" ? ["done", "done", "failed"] :
    ["upcoming", "upcoming", "upcoming"];

  const dotCls = {
    done:     "bg-emerald-500 text-white",
    current:  "bg-amber-400 text-white animate-pulse",
    failed:   "bg-red-500 text-white",
    upcoming: "bg-slate-200 text-slate-400",
  };
  const labelCls = {
    done:     "text-emerald-600",
    current:  "text-amber-600",
    failed:   "text-red-600",
    upcoming: "text-slate-400",
  };

  return (
    <div className="flex items-center gap-1 border-t border-slate-50 pt-2.5">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-1 flex-1 last:flex-none">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black ${dotCls[states[i]]}`}>
              {states[i] === "done" ? "✓" : states[i] === "failed" ? "✕" : i + 1}
            </span>
            <span className={`text-[10px] font-bold ${labelCls[states[i]]}`}>{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-1 ${states[i] === "done" ? "bg-emerald-200" : "bg-slate-100"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function RequestCard({ title, sub, status, note, managerNote, canCancel, onCancel, showSwapSteps }: {
  title: string;
  sub: string;
  status: string;
  note?: string;
  managerNote?: string;
  canCancel?: boolean;
  onCancel?: () => void;
  showSwapSteps?: boolean;
}) {
  const isFinal = ["cancelled", "manager_approved", "manager_rejected", "approved", "rejected", "peer_rejected"].includes(status);
  return (
    <div className={`bg-white rounded-xl border p-4 space-y-2 ${isFinal ? "opacity-70 border-slate-100" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-800 truncate">{title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={status} />
          {canCancel && onCancel && (
            <button
              onClick={onCancel}
              title="Talebi geri al"
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <Undo2 size={14} />
            </button>
          )}
        </div>
      </div>
      {showSwapSteps && <SwapSteps status={status} />}
      {note && <p className="text-xs text-slate-400 italic border-t border-slate-50 pt-2">"{note}"</p>}
      {managerNote && <p className="text-xs text-slate-500 border-t border-slate-50 pt-2"><span className="font-bold">Müdür notu:</span> {managerNote}</p>}
    </div>
  );
}

function ShiftOption({ shift, selected, onSelect }: { shift: any; selected: boolean; onSelect: () => void }) {
  const d = new Date(shift.week_start || "");
  d.setDate(d.getDate() + (shift.day ?? 0));
  const label = `${DAY_SHORT[shift.day ?? 0]} ${d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })}`;
  const time = shift.start_time && shift.end_time ? ` · ${shift.start_time}–${shift.end_time}` : "";
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-left transition-all ${
        selected ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div>
        <p className={`text-sm font-bold ${selected ? "text-primary" : "text-slate-800"}`}>{label}</p>
        {time && <p className="text-xs text-slate-500">{time}</p>}
      </div>
      {selected && <CheckCircle2 size={16} className="text-primary shrink-0" />}
    </button>
  );
}

function ForceAssignCard({ item, onRespond }: { item: any; onRespond: (action: "accept" | "reject") => void }) {
  const [responding, setResponding] = useState(false);

  const handle = async (action: "accept" | "reject") => {
    setResponding(true);
    await onRespond(action);
    setResponding(false);
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-amber-200 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
          <ShieldAlert size={18} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-slate-900">Zorunlu Atama Talebi</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {item.date_label}{item.start_time && item.end_time ? ` · ${item.start_time}–${item.end_time}` : ""}
          </p>
          {item.location_name && (
            <p className="text-[10px] text-slate-400 mt-0.5">{item.location_name}</p>
          )}
        </div>
      </div>

      {/* Bonus bilgisi */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex items-center gap-2">
        <Star size={13} className="text-amber-500 shrink-0" />
        <p className="text-xs text-amber-800">
          Kabul edersen <strong>×{item.force_bonus_multiplier ?? 1.5} bonus puan</strong> kazanırsın.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          disabled={responding}
          onClick={() => handle("reject")}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
        >
          <XCircle size={15} /> Reddet
        </button>
        <button
          disabled={responding}
          onClick={() => handle("accept")}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors disabled:opacity-40"
        >
          <CheckCircle2 size={15} /> Kabul Et
        </button>
      </div>
    </div>
  );
}

function NextBtn({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-40"
    >
      Devam <ChevronRight size={15} />
    </button>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1"
    >
      <ChevronLeft size={15} />
    </button>
  );
}
