"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList, ArrowLeftRight, FileEdit, CalendarOff,
  CheckCircle2, XCircle, Clock, History
} from "lucide-react";

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

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:          { label: "Bekliyor",         cls: "bg-amber-50 text-amber-700 border-amber-200" },
  peer_accepted:    { label: "Onay Bekliyor",     cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved:         { label: "Onaylandı",         cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  manager_approved: { label: "Onaylandı",         cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected:         { label: "Reddedildi",        cls: "bg-red-50 text-red-600 border-red-200" },
  manager_rejected: { label: "Reddedildi",        cls: "bg-red-50 text-red-600 border-red-200" },
  peer_rejected:    { label: "Pers. Reddetti",    cls: "bg-slate-100 text-slate-500 border-slate-200" },
  cancelled:        { label: "İptal Edildi",      cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, cls: "bg-slate-100 text-slate-500 border-slate-200" };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>;
}

type RejectModalState = { type: "swap" | "edit" | "leave"; id: number };

export default function ManagerRequestsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  const [swaps, setSwaps]     = useState<any[]>([]);
  const [edits, setEdits]     = useState<any[]>([]);
  const [leaves, setLeaves]   = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"swap" | "edit" | "leave">("swap");
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState("");
  const [rejectModal, setRejectModal] = useState<RejectModalState | null>(null);
  const [rejectNote, setRejectNote]   = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_manager_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed) setUser(parsed);
      setMounted(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!mounted) return;
    if (!user) { router.push("/login"); return; }
  }, [mounted, user, router]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const locId = user.location_id || localStorage.getItem("optishift_selected_location") || "";
    try {
      const [sw, ed, lv] = await Promise.all([
        fetch(`/api/swap-requests?org_id=${user.org_id}&location_id=${locId}&status=peer_accepted`).then(r => r.json()).catch(() => []),
        fetch(`/api/shift-edit-requests?org_id=${user.org_id}&location_id=${locId}`).then(r => r.json()).catch(() => []),
        fetch(`/api/leave-requests?location_id=${locId}`).then(r => r.json()).catch(() => []),
      ]);
      setSwaps(Array.isArray(sw) ? sw : []);
      setEdits(Array.isArray(ed) ? ed : []);
      setLeaves(Array.isArray(lv) ? lv : []);
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function approveSwap(id: number) {
    await fetch("/api/swap-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "manager_approved" }),
    });
    showToast("Takas onaylandı, vardiyalar güncellendi.");
    await load();
  }

  async function rejectSwap(id: number, note: string) {
    await fetch("/api/swap-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "manager_rejected" }),
    });
    showToast("Takas reddedildi.");
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

  async function reviewLeave(id: number, status: "approved" | "rejected", note?: string) {
    const r = await fetch(`/api/leave-requests/review?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewed_by: user?.personnel_id }),
    });
    if (r.ok) {
      showToast(status === "approved" ? "İzin onaylandı." : "İzin reddedildi.");
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
  const totalPending  = pendingSwaps.length + pendingEdits.length + pendingLeaves.length;

  // Filtered lists based on showHistory toggle
  const visibleSwaps  = showHistory ? swaps  : pendingSwaps;
  const visibleEdits  = showHistory ? edits  : pendingEdits;
  const visibleLeaves = showHistory ? leaves : pendingLeaves;

  if (!mounted) return <div className="space-y-6" />;

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <ClipboardList size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Onay Kutusu</h1>
            <p className="text-sm text-slate-500">
              {totalPending > 0 ? `${totalPending} bekleyen talep` : "Bekleyen talep yok"}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowHistory(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
            showHistory ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <History size={13} />
          {showHistory ? "Sadece Bekleyen" : "Geçmişi Göster"}
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex bg-slate-100 p-1 rounded-2xl gap-1 overflow-x-auto">
        {([
          { id: "swap",  label: "Takas",      count: pendingSwaps.length,  icon: ArrowLeftRight },
          { id: "edit",  label: "Düzenleme",  count: pendingEdits.length,  icon: FileEdit },
          { id: "leave", label: "İzin",       count: pendingLeaves.length, icon: CalendarOff },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === t.id ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <t.icon size={12} />
            {t.label}
            {t.count > 0 && (
              <span className={`w-4 h-4 rounded-full text-[10px] font-black flex items-center justify-center ${
                activeTab === t.id ? "bg-primary text-white" : "bg-slate-300 text-slate-600"
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-16 text-slate-400 text-sm">Yükleniyor…</div>}

      {/* ── SWAP TAB ── */}
      {!loading && activeTab === "swap" && (
        <div className="space-y-3">
          {visibleSwaps.length === 0 && <EmptyState text={showHistory ? "Takas talebi yok" : "Onay bekleyen takas talebi yok"} />}
          {visibleSwaps.map(s => {
            const pending = s.status === "peer_accepted";
            return (
              <div key={s.id} className={`bg-white rounded-2xl border p-5 space-y-4 ${pending ? "border-amber-200" : "border-slate-100"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <ArrowLeftRight size={13} className="text-primary shrink-0" />
                      <p className="text-sm font-black text-slate-900">
                        {s.requester_name} ↔ {s.target_name}
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
                  </div>
                  {s.created_at && (
                    <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(s.created_at)}</span>
                  )}
                </div>
                {pending && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRejectModal({ type: "swap", id: s.id })}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <XCircle size={15} /> Reddet
                    </button>
                    <button
                      onClick={() => approveSwap(s.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
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
      {!loading && activeTab === "edit" && (
        <div className="space-y-3">
          {visibleEdits.length === 0 && <EmptyState text={showHistory ? "Düzenleme talebi yok" : "Onay bekleyen düzenleme talebi yok"} />}
          {visibleEdits.map(e => {
            const pending = e.status === "pending";
            return (
              <div key={e.id} className={`bg-white rounded-2xl border p-5 space-y-4 ${pending ? "border-blue-200" : "border-slate-100"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <FileEdit size={13} className="text-blue-600 shrink-0" />
                      <p className="text-sm font-black text-slate-900">{e.personnel_name ?? "Personel"}</p>
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
                    <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(e.created_at)}</span>
                  )}
                </div>
                {pending && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRejectModal({ type: "edit", id: e.id })}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <XCircle size={15} /> Reddet
                    </button>
                    <button
                      onClick={() => approveEdit(e.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
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
      {!loading && activeTab === "leave" && (
        <div className="space-y-3">
          {visibleLeaves.length === 0 && <EmptyState text={showHistory ? "İzin talebi yok" : "Bekleyen izin talebi yok"} />}
          {(visibleLeaves as any[]).map((l: any) => {
            const pending = l.status === "pending";
            return (
              <div key={l.id} className={`bg-white rounded-2xl border p-5 space-y-4 ${pending ? "border-violet-200" : "border-slate-100"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <CalendarOff size={13} className="text-violet-600 shrink-0" />
                      <p className="text-sm font-black text-slate-900">
                        {l.personnel_name ?? l.personnel_id}
                      </p>
                      <StatusBadge status={l.status} />
                    </div>
                    <p className="text-xs text-slate-600 font-semibold">{l.type}</p>
                    <p className="text-xs text-slate-500">{l.start_date} → {l.end_date} ({l.days} gün)</p>
                    {l.note && <p className="text-xs text-slate-400 mt-1 italic">"{l.note}"</p>}
                  </div>
                  {l.created_at && (
                    <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(l.created_at)}</span>
                  )}
                </div>
                {pending && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRejectModal({ type: "leave", id: l.id })}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <XCircle size={15} /> Reddet
                    </button>
                    <button
                      onClick={() => reviewLeave(l.id, "approved")}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
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

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
          onClick={() => { setRejectModal(null); setRejectNote(""); }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-black text-slate-900">Reddetme Nedeni</h3>
            <textarea
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              rows={3}
              placeholder="Personele iletilecek neden (opsiyonel)..."
              className="w-full text-sm border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary transition-colors resize-none"
            />
            <div className="flex gap-2">
              <button onClick={() => { setRejectModal(null); setRejectNote(""); }}
                className="flex-1 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                Vazgeç
              </button>
              <button
                onClick={handleRejectConfirm}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-colors"
              >
                <XCircle size={14} className="inline mr-1" />
                Reddet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 md:bottom-8 md:right-8 bg-slate-900 text-white text-xs font-bold px-5 py-3 rounded-2xl shadow-xl z-50 max-w-[calc(100vw-2rem)]">
          {toast}
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-12 flex flex-col items-center gap-2 text-slate-300">
      <CheckCircle2 size={40} strokeWidth={1.5} />
      <p className="text-sm font-semibold">{text}</p>
    </div>
  );
}
