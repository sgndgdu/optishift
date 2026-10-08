"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { leaveTypeLabel } from "@/lib/leave";
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useAvailabilityEnabled } from "@/hooks/useShiftWords";
import { useRouter } from "next/navigation";
import { usePortalAuth } from "@/hooks/useAuth";
import { getWeekStart as libGetWeekStart, formatDateTR, addDays, businessToday, businessWallTime } from "@/lib/date";
import { DAY_SHORT } from "@/lib/constants";
import {
  ArrowLeftRight, FileEdit, CalendarOff, CheckCircle2, XCircle, Clock, ChevronRight, ChevronLeft, Send, Undo2, AlertCircle, ShieldAlert, Star, Megaphone, Plus, UserX,
} from "lucide-react";
import { violationText } from "@/lib/ruleViolations";
import { Page, PageHeader, pageActionClass } from "@/components/ui/PageHeader";
import { RequestStatusPill } from "@/components/ui/RequestStatus";
import { CountBadge } from "@/components/ui/StatusPill";
import { Tabs } from "@/components/ui/Tabs";
import { Sheet, sheetSecondaryClass, sheetDangerClass } from "@/components/ui/Sheet";

// ─── helpers ───────────────────────────────────────────────────────────────
// En sık kullanılan dört tür önde; diğerleri "Diğer" ile açılır
const MAIN_LEAVE_TYPES = ["Yıllık İzin", "Hastalık / Rapor", "Mazeret İzni", "Ücretsiz İzin"];
const LEAVE_TYPES = [
  "Yıllık İzin", "Mazeret İzni", "Hastalık / Rapor",
  "Doğum İzni", "Süt İzni", "Evlilik İzni", "Ücretsiz İzin",
];

type NewType = "leave" | "giveaway" | "swap" | "edit";

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

// Takas/ilan sadece bugün ve sonrası için anlamlı (geçmiş vardiya takas edilmez)
// Bugünün başlamış vardiyası da geçmiş sayılır (gece 23'te sabahki vardiya takasa çıkıyordu)
function isUpcoming(row: { week_start: string; day: number; start_time?: string | null }): boolean {
  const date = addDays(row.week_start, Number(row.day ?? 0));
  if (date !== businessToday()) return date > businessToday();
  return !row.start_time || businessWallTime(date, row.start_time).getTime() > Date.now();
}

// Durum rozeti: components/ui/RequestStatus (renk anlamı tüm uygulamada aynı)
function StatusBadge({ status }: { status: string }) {
  return <RequestStatusPill status={status} audience="employee" />;
}

function otWeekLabel(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  const fmt = (dt: Date) => dt.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  return `${fmt(d)} – ${fmt(end)}`;
}

// ─── main page ─────────────────────────────────────────────────────────────
// Vardiyaları tarih ve saate göre sıralar
const byShiftTime = (a: any, b: any) =>
  `${addDays(a.week_start, Number(a.day ?? 0))} ${a.start_time}`.localeCompare(`${addDays(b.week_start, Number(b.day ?? 0))} ${b.start_time}`);

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
  const [overtimeMe, setOvertimeMe]   = useState<any>(null);
  const [swapError, setSwapError]     = useState("");
  const [myListings, setMyListings]   = useState<any[]>([]); // "Herkese Aç" ile açtığım devir ilanları

  // new-form state
  // null = tür seçim listesi görünür
  const [newType, setNewType]         = useState<NewType | null>(null);

  // swap wizard
  const [swapStep, setSwapStep]       = useState(0);
  const [myShifts, setMyShifts]       = useState<any[]>([]);
  const [shiftNames, setShiftNames]   = useState<Record<string, string>>({}); // vardiya tanımı id → ad
  const [teammates, setTeammates]     = useState<any[]>([]);
  const [theirShifts, setTheirShifts] = useState<any[]>([]);
  const [selMyShift, setSelMyShift]   = useState<any>(null);
  const [selMate, setSelMate]         = useState<any>(null);
  const [selTheirShift, setSelTheirShift] = useState<any>(null);
  const [swapNote, setSwapNote]       = useState("");
  const [matesLoading, setMatesLoading] = useState(false);

  // edit form
  const [editShift, setEditShift]     = useState<any>(null);
  const availabilityOn = useAvailabilityEnabled();
  useEffect(() => {
    if (!deepShift.current || myShifts.length === 0) return;
    const s = myShifts.find((x: any) => String(x.id) === deepShift.current);
    if (!s) return;
    deepShift.current = null;
    const id = setTimeout(() => (newType === "edit" ? setEditShift(s) : setSelMyShift(s)), 0);
    return () => clearTimeout(id);
  }, [myShifts, newType]);
  // Vardiyalarım'da vardiyaya dokununca: /portal/requests?new=giveaway|swap|edit&shift=<id>
  // talep türü ve vardiya seçili açılır (eskiden genel sayfaya gidip vardiyayı tekrar seçmek gerekiyordu)
  const deepShift = useRef<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get("new") as NewType | null;
    if (!t || !["leave", "giveaway", "swap", "edit"].includes(t)) return;
    deepShift.current = q.get("shift");
    const id = setTimeout(() => { setActiveTab("new"); setNewType(t); }, 0);
    return () => clearTimeout(id);
  }, []);
  const [editReason, setEditReason]   = useState("");

  // leave form
  // Tür önceden seçili gelmez (bakiyesi 0 olana ilk açılışta kırmızı "0 gün" gösteriyordu)
  const [leaveType, setLeaveType]     = useState("");
  const [leaveOther, setLeaveOther]   = useState(false);
  const [leaveStart, setLeaveStart]   = useState("");
  const [leaveEnd, setLeaveEnd]       = useState("");
  const [leaveNote, setLeaveNote]     = useState("");
  // leave policy (lokasyondan çekilir)
  // İzin kuralları kaldırıldı (2026-10-04): çok günlü izin serbest, açıklama isteğe bağlı
  const leavePolicy = null as { require_reason: boolean; allow_multi_day: boolean; max_days_per_request: number } | null;
  const [weeklyOffDay, setWeeklyOffDay] = useState<number | null>(null);
  const [leaveBalance, setLeaveBalance] = useState<any>(null); // /api/leave-requests/balance — kalan yıllık izin

  const [loading, setLoading]         = useState(false);
  const [toast, setToast]             = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<{ kind: "swap" | "edit" | "leave" | "listing"; id: number } | null>(null);
  const [leaveRequestsEnabled, setLeaveRequestsEnabled] = useState(true); // rules.leave_requests_enabled
  const [openShiftsEnabled, setOpenShiftsEnabled] = useState(true); // rules.open_shifts_enabled
  const [swapRequestsEnabled, setSwapRequestsEnabled] = useState(true); // rules.swap_requests_enabled
  const [editRequestsEnabled, setEditRequestsEnabled] = useState(true); // rules.edit_requests_enabled


  // Lokasyonun izin politikasını ve personelin sabit izin gününü yükle
  useEffect(() => {
    if (!user?.location_id) return;
    fetch(`/api/locations?id=${user.location_id}`)
      .then(r => r.json())
      .then((data: any[]) => {
        const loc = Array.isArray(data) ? data[0] : data;
        if (!loc) return;
        try {
        } catch { /* geçersiz JSON → atla */ }
        try {
          const rules = typeof loc.rules === "string" ? JSON.parse(loc.rules) : loc.rules;
          const swapOn = rules?.swap_requests_enabled !== false;
          const editOn = rules?.edit_requests_enabled !== false;
          const leaveOn = rules?.leave_requests_enabled !== false;
          setLeaveRequestsEnabled(leaveOn);
          setOpenShiftsEnabled(rules?.open_shifts_enabled !== false);
          setSwapRequestsEnabled(swapOn);
          setEditRequestsEnabled(editOn);
          // Seçili tür sonradan kapandıysa listeye dön
          setNewType(prev => {
            if (prev === "swap" && !swapOn) return null;
            if (prev === "edit" && !editOn) return null;
            if (prev === "leave" && !leaveOn) return null;
            if (prev === "giveaway" && rules?.open_shifts_enabled === false) return null;
            return prev;
          });
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

  // Kalan yıllık izin bakiyesi (türetilmiş — lib/leave.ts)
  useEffect(() => {
    if (!user?.personnel_id) return;
    fetch("/api/leave-requests/balance")
      .then(r => r.ok ? r.json() : null)
      .then(d => setLeaveBalance(d && !d.error ? d : null))
      .catch(() => {});
  }, [user]);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    if (!user) return;
    const [ss, si, er, lr, fa, ot, os] = await Promise.all([
      fetch(`/api/swap-requests?requester_id=${user.personnel_id}`).then(r => r.json()).catch(() => []),
      fetch(`/api/swap-requests?target_id=${user.personnel_id}`).then(r => r.json()).catch(() => []),
      fetch(`/api/shift-edit-requests?personnel_id=${user.personnel_id}`).then(r => r.json()).catch(() => []),
      user.personnel_id
        ? fetch(`/api/leave-requests?personnel_id=${user.personnel_id}`).then(r => r.json()).catch(() => [])
        : Promise.resolve([]),
      user.personnel_id
        ? fetch(`/api/schedule/force-assignments?personnel_id=${user.personnel_id}`).then(r => r.json()).catch(() => [])
        : Promise.resolve([]),
      user.personnel_id
        ? fetch(`/api/overtime/me`).then(r => r.ok ? r.json() : null).catch(() => null)
        : Promise.resolve(null),
      user.location_id
        ? fetch(`/api/open-shifts?location_id=${user.location_id}`).then(r => r.json()).catch(() => [])
        : Promise.resolve([]),
    ]);
    setMyListings(Array.isArray(os)
      ? os.filter((o: any) => o.released_by === user.personnel_id && o.source_assignment_id && o.status !== "cancelled")
      : []);
    setSwapsSent(Array.isArray(ss) ? ss : []);
    setSwapsIn(Array.isArray(si) ? si : []);
    setEditReqs(Array.isArray(er) ? er : []);
    setLeaveReqs(Array.isArray(lr) ? lr : []);
    setForceAssigns(Array.isArray(fa) ? fa : []);
    setOvertimeMe(ot && !ot.error ? ot : null);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── load my shifts for wizard ──────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "new" || (newType !== "swap" && newType !== "giveaway") || !user) return;
    (async () => {
      const weeks = await Promise.all(
        [0, 1, 2].map(w =>
          fetch(`/api/shifts?personnel_id=${user.personnel_id || ""}&week_start=${libGetWeekStart(w)}`)
            .then(r => r.json()).catch(() => [])
        )
      );
      const all = weeks.flat().filter((s: any) => Array.isArray(s) ? false : s?.id && s.kind !== "on_call" && isUpcoming(s));
      setMyShifts(all.sort(byShiftTime)); // sonradan alınan vardiya listenin sonuna düşmesin
    })();
  }, [activeTab, newType, user]);

  useEffect(() => {
    if (activeTab !== "new" || newType !== "edit" || !user) return;
    (async () => {
      const weeks = await Promise.all(
        // Saat hatası çoğu zaman geçmiş vardiyada olur (çıkışı unutmak gibi): son 2 hafta da listelenir
        [-2, -1, 0, 1].map(w =>
          fetch(`/api/shifts?personnel_id=${user.personnel_id || ""}&week_start=${libGetWeekStart(w)}`)
            .then(r => r.json()).catch(() => [])
        )
      );
      const from = addDays(businessToday(), -14);
      setMyShifts(weeks.flat().filter((s: any) => s?.id && s.kind !== "on_call" && addDays(s.week_start, Number(s.day ?? 0)) >= from).sort(byShiftTime));
    })();
  }, [activeTab, newType, user]);

  // Şubenin vardiya adları (seçim listelerinde saatin yanında)
  useEffect(() => {
    if (!user?.location_id) return;
    fetch(`/api/locations?id=${user.location_id}`).then(r => (r.ok ? r.json() : [])).then(rows => {
      const raw = Array.isArray(rows) ? rows[0]?.shift_definitions : null;
      let defs: { id: string; name: string }[] = [];
      try { defs = typeof raw === "string" ? JSON.parse(raw) : (raw ?? []); } catch { defs = []; }
      if (Array.isArray(defs)) setShiftNames(Object.fromEntries(defs.map(d => [String(d.id), d.name])));
    }).catch(() => {});
  }, [user?.location_id]);

  // ── load teammates + their shifts (takas olursa kural bozulacak vardiyalar işaretli: /api/swap-requests/options) ──
  useEffect(() => {
    if (swapStep !== 1 || !user || !selMyShift) return;
    setTeammates([]); setMatesLoading(true);
    fetch(`/api/swap-requests/options?shift_id=${selMyShift.id}`)
      .then(r => r.json())
      .then(d => setTeammates(Array.isArray(d?.mates) ? d.mates : []))
      .catch(() => {})
      .finally(() => setMatesLoading(false));
  }, [swapStep, user, selMyShift]);

  // Seçilen arkadaşın vardiyaları options yanıtında hazır
  useEffect(() => {
    if (swapStep !== 2 || !selMate) return;
    setTheirShifts(Array.isArray(selMate.shifts) ? selMate.shifts : []);
  }, [swapStep, selMate]);

  // ── submit handlers ────────────────────────────────────────────────────
  async function submitMarketplace() {
    if (!selMyShift || !user) return;
    setLoading(true);
    try {
      const r = await fetch("/api/open-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ convert_assignment_id: selMyShift.id }),
      });
      if (r.ok) {
        showToast("Vardiya ekibe duyuruldu. Biri alana kadar vardiya sizde kalır.");
        await loadData(); // liste dolmadan sekme değişmesin ("talebiniz yok" görünmesin)
        resetSwapWizard(); setActiveTab("sent"); setNewType(null);
      } else {
        const err = await r.json().catch(() => ({}));
        showToast(err.error || "Vardiya bırakılamadı.", "error");
      }
    } finally { setLoading(false); }
  }

  // İlanda ya da takası süren vardiya ikinci bir akışa konmaz (sunucu da reddeder)
  const shiftBusy = (s: { id: unknown }): string | null =>
    myListings.some((o: any) => o.status === "open" && Number(o.source_assignment_id) === Number(s.id))
      ? "Zaten ilanda"
      : [...swapsSent, ...swapsIn].some((w: any) => ["pending", "peer_accepted"].includes(w.status)
          && (Number(w.requester_shift_id) === Number(s.id) || Number(w.target_shift_id) === Number(s.id)))
        ? "Vardiya değiştirme bekliyor" : null;

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
        showToast("Vardiya değiştirme teklifi gönderildi.");
        await loadData();
        resetSwapWizard();
        setActiveTab("sent"); setNewType(null);
      } else {
        const err = await r.json().catch(() => ({}));
        // Kural hatası ekranda kalır: kişi hangi vardiyayı değiştirmesi gerektiğini okuyabilsin
        setSwapError(violationText(err, "Vardiya değiştirme teklifi gönderilemedi."));
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
        showToast("Saat düzeltme isteği gönderildi.");
        await loadData();
        setEditShift(null); setEditReason("");
        setActiveTab("sent"); setNewType(null);
      } else {
        const err = await r.json().catch(() => ({}));
        showToast(err.error || "Talep gönderilemedi.", "error");
      }
    } finally { setLoading(false); }
  }

  async function submitLeave() {
    if (!leaveType || !leaveStart || !leaveEnd || !user?.personnel_id) return;
    // Client-side policy kontrolü
    if (leavePolicy?.require_reason && !leaveNote.trim()) {
      showToast("İzin talebi için açıklama yazmanız gerekiyor.", "error"); return;
    }
    if (leavePolicy && !leavePolicy.allow_multi_day && leaveStart !== leaveEnd) {
      showToast("Sadece tek günlük izin isteyebilirsiniz.", "error"); return;
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
        await loadData();
        setLeaveStart(""); setLeaveEnd(""); setLeaveNote("");
        setActiveTab("sent"); setNewType(null);
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
      showToast(status === "peer_accepted" ? "Vardiya değiştirme teklifi kabul edildi." : "Vardiya değiştirme teklifi reddedildi.");
    } else {
      const err = await r.json().catch(() => ({}));
      showToast(violationText(err, "İşlem sırasında hata oluştu."), "error");
      await loadData(); // hata varsa geri al
    }
  }

  async function cancelRequest(kind: "swap" | "edit" | "leave" | "listing", id: number) {
    setCancelConfirm(null);
    if (kind === "listing") {
      const r = await fetch("/api/open-shifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, withdraw: true }),
      }).catch(() => null);
      if (r?.ok) showToast("İlan geri çekildi. Vardiya sizde kalıyor.");
      else showToast("İlan geri çekilemedi.", "error");
      await loadData();
      return;
    }
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
    setSwapStep(0); setSelMyShift(null); setSelMate(null); setSelTheirShift(null); setSwapNote(""); setSwapError("");
  }

  if (!mounted) return <div className="space-y-4" />;

  // Personel onayı bekleyen fazla mesai kayıtları (İş K. m.41)
  const overtimePending: any[] = (overtimeMe?.records ?? []).filter(
    (r: any) => r.status === "pending" && r.employee_status === "pending"
  );

  async function respondOvertime(id: number, employee_status: "accepted" | "declined", compensation_type?: "paid" | "time_off") {
    const res = await fetch("/api/overtime/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, employee_status, compensation_type }),
    });
    if (res.ok) {
      showToast(
        employee_status === "declined"
          ? "Mesai reddedildi. Sorumlun bilgilendirildi."
          : compensation_type === "time_off"
            ? "Kabul edildi, serbest zaman (1,5 kat izin) olarak işlenecek."
            : "Kabul edildi, zamlı ücret olarak işlenecek."
      );
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "İşlem başarısız.", "error");
    }
    await loadData();
  }

  // Gelen takas + zorunlu atama + mesai onayı sayısı
  const incomingPendingCount = swapsIn.filter(s => s.status === "pending").length + forceAssigns.length + overtimePending.length;

  return (
    <Page width="narrow">
      {/* Header */}
      <PageHeader title="Talepler" description="İzin, vardiya değiştirme ve vardiya bırakma" actions={activeTab !== "new" && (
          <button
            onClick={() => { setActiveTab("new"); setNewType(null); resetSwapWizard(); }}
            className={pageActionClass}
          >
            <Plus size={16} /> Yeni talep
          </button>
        )} />

      {activeTab === "new" ? (
        <button
          onClick={() => { if (newType) { setNewType(null); resetSwapWizard(); } else setActiveTab("sent"); }}
          className="inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-800"
        >
          <ChevronLeft size={16} /> {newType ? "Talep türleri" : "Taleplerim"}
        </button>
      ) : (
        <Tabs fill value={activeTab === "incoming" ? "incoming" : "sent"} onChange={id => { setActiveTab(id); resetSwapWizard(); }} items={[
          { id: "sent",     label: "Taleplerim" },
          { id: "incoming", label: "Size Gelen", count: incomingPendingCount },
        ] as const} />
      )}

      {/* ── SENT TAB ── */}
      {activeTab === "sent" && (
        <div className="space-y-4">
          {incomingPendingCount > 0 && (
            <button onClick={() => setActiveTab("incoming")}
              className="w-full flex items-center gap-3 bg-ember-50 border border-ember-200 rounded-2xl px-4 py-3.5 text-left hover:bg-ember-100 transition-colors">
              <AlertCircle size={18} className="text-ember-600 shrink-0" />
              <span className="flex-1 text-sm font-bold text-ember-800">Size gelen {incomingPendingCount} talep cevabını bekliyor</span>
              <ChevronRight size={16} className="text-ember-600" />
            </button>
          )}
          {myListings.length === 0 && swapsSent.length === 0 && editReqs.length === 0 && leaveReqs.length === 0 && (
            <Empty text="Henüz bir talebiniz yok. İzin istemek ya da gelemeyeceğiniz bir günü bildirmek için “Yeni talep”e dokunun." />
          )}
          {myListings.length > 0 && (
            <Section title="Bıraktığım vardiyalar" icon={<Megaphone size={14} />}>
              {myListings.map((o: any) => (
                <RequestCard key={o.id}
                  title={o.status === "claimed" ? `${o.claimed_by_name ?? "Bir ekip arkadaşınız"} aldı`
                    : o.status === "loan_pending" ? `${o.claimed_by_name ?? "Başka şubeden biri"} yazıldı, onay bekleniyor` : "Ekip görüyor, henüz alan yok"}
                  sub={`${formatDateTR(o.date)} · ${o.start_time}–${o.end_time}${o.status === "open" ? " · biri alana kadar vardiya sizde" : o.status === "loan_pending" ? " · onaylanana kadar vardiya sizde" : ""}`}
                  status={o.status}
                  canCancel={o.status === "open"}
                  onCancel={() => setCancelConfirm({ kind: "listing", id: o.id })}
                />
              ))}
            </Section>
          )}
          {swapsSent.length > 0 && (
          <Section title="Vardiya Değiştirme Talepleri" icon={<ArrowLeftRight size={14} />}>
            {swapsSent.map(s => (
                <RequestCard key={s.id}
                  title={`${s.target_name ?? "—"} ile vardiya değiştirme`}
                  sub={`Benim: ${shiftLabel({ week_start: s.req_week_start, day: s.req_day, start_time: s.req_start, end_time: s.req_end })} → Onun: ${shiftLabel({ week_start: s.tgt_week_start, day: s.tgt_day, start_time: s.tgt_start, end_time: s.tgt_end })}`}
                  status={s.status}
                  note={s.note}
                  canCancel={s.status === "pending"}
                  onCancel={() => setCancelConfirm({ kind: "swap", id: s.id })}
                  showSwapSteps
                />
              ))}
          </Section>
          )}

          {editReqs.length > 0 && (
          <Section title="Saat düzeltme" icon={<FileEdit size={14} />}>
            {editReqs.map(e => (
                <RequestCard key={e.id}
                  title="Saat düzeltme"
                  sub={shiftLabel({ week_start: e.week_start, day: e.day, start_time: e.start_time, end_time: e.end_time })}
                  status={e.status}
                  note={e.reason}
                  managerNote={e.manager_note}
                  canCancel={e.status === "pending"}
                  onCancel={() => setCancelConfirm({ kind: "edit", id: e.id })}
                />
              ))}
          </Section>
          )}

          {leaveReqs.length > 0 && (
          <Section title="İzin Talepleri" icon={<CalendarOff size={14} />}>
            {leaveReqs.map((l: any) => (
                <RequestCard key={l.id}
                  title={leaveTypeLabel(l.type)}
                  sub={l.start_date === l.end_date ? `${formatDateTR(l.start_date)} (1 gün)` : `${formatDateTR(l.start_date, { weekday: false })} → ${formatDateTR(l.end_date, { weekday: false })} (${l.days} gün)`}
                  status={l.status}
                  note={l.note}
                  canCancel={l.status === "pending"}
                  onCancel={() => setCancelConfirm({ kind: "leave", id: l.id })}
                />
              ))}
          </Section>
          )}
        </div>
      )}

      {/* ── INCOMING TAB ── */}
      {activeTab === "incoming" && (
        <div className="space-y-4">

          {/* ── Fazla Mesai Onayları (İş K. m.41 — işçi onayı) ── */}
          {overtimePending.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <Clock size={14} className="text-forest-600" />
                <h2 className="text-xs font-semibold text-slate-500">Fazla Mesai Onayları</h2>
                <CountBadge tone="brand" className="ml-1" count={overtimePending.length} />
              </div>
              {overtimePending.map((r: any) => (
                <div key={r.id} className="bg-white rounded-2xl border border-forest-200 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {r.overtime_hours} saat fazla mesai
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {otWeekLabel(r.week_start)} haftası · toplam {r.scheduled_hours} planlı
                      </p>
                      {r.note && <p className="text-xs text-slate-400 mt-1 italic">{r.note}</p>}
                    </div>
                    <Clock size={18} className="text-forest-500 shrink-0 mt-0.5" />
                  </div>
                  <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                    Kabul edersen telafi türünü sen seçersin: <b>zamlı ücret</b> (%50 artırımlı) veya <b>serbest zaman</b> (1 saat mesaiye 1,5 saat izin).
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => respondOvertime(r.id, "accepted", "paid")}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
                    >
                      <CheckCircle2 size={14} /> Kabul · Zamlı Ücret
                    </button>
                    <button
                      onClick={() => respondOvertime(r.id, "accepted", "time_off")}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-primary/30 text-primary text-xs font-semibold hover:bg-primary/5 transition-colors"
                    >
                      <CalendarOff size={14} /> Kabul · Serbest Zaman
                    </button>
                    <button
                      onClick={() => respondOvertime(r.id, "declined")}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-slate-200 text-xs font-semibold text-slate-600 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <XCircle size={14} /> Reddet
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}


          {/* ── Zorunlu Atama Talepleri ── */}
          {forceAssigns.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <ShieldAlert size={14} className="text-amber-600" />
                <h2 className="text-xs font-semibold text-slate-500">Zorunlu Atama Talepleri</h2>
                <CountBadge tone="attention" className="ml-1" count={forceAssigns.length} />
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
                      showToast(action === "accept" ? `Kabul edildi! +${fa.force_bonus_multiplier} ek puan kazandınız.` : "Reddedildi. Sorumlunuz bilgilendirildi.");
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

          {/* ── Gelen vardiya değiştirme teklifleri ── */}
          <div className="space-y-3">
            {(forceAssigns.length > 0 || overtimePending.length > 0) && (
              <div className="flex items-center gap-1.5">
                <ArrowLeftRight size={14} className="text-slate-400" />
                <h2 className="text-xs font-semibold text-slate-500">Gelen Vardiya Değiştirme Teklifleri</h2>
              </div>
            )}
          {swapsIn.length === 0 ? (
            forceAssigns.length === 0 && overtimePending.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-10 flex flex-col items-center gap-3 text-slate-400">
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
                        <p className="text-sm font-bold text-slate-900">{s.requester_name ?? "Bir arkadaşınız"} size vardiya değiştirmeyi teklif etti</p>
                        <StatusBadge status={s.status} />
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Onda: {shiftLabel({ week_start: s.req_week_start, day: s.req_day, start_time: s.req_start, end_time: s.req_end })}
                      </p>
                      <p className="text-xs text-slate-500">
                        Sizde: {shiftLabel({ week_start: s.tgt_week_start, day: s.tgt_day, start_time: s.tgt_start, end_time: s.tgt_end })}
                      </p>
                      {s.note && <p className="text-xs text-slate-400 mt-1 italic">"{s.note}"</p>}
                    </div>
                    <ArrowLeftRight size={18} className="text-primary shrink-0 mt-0.5" />
                  </div>
                  <SwapSteps status={s.status} />
                  {isPending && (s.violations?.length ?? 0) > 0 && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 space-y-0.5">
                      <p className="font-bold">Bu vardiya değiştirmeyi kabul edemezsiniz:</p>
                      {s.violations.map((v: string, i: number) => <p key={i}>{v}</p>)}
                    </div>
                  )}
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
                        disabled={(s.violations?.length ?? 0) > 0}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
          {/* Tür seçimi: ne istediğini kendi cümlesiyle seçer */}
          {newType === null && (() => {
            const typeOptions: { id: NewType; label: string; hint: string; icon: typeof CalendarOff }[] = [
              ...(leaveRequestsEnabled ? [{ id: "leave" as const, label: "İzin istiyorum", hint: "Yıllık izin, rapor, mazeret", icon: CalendarOff }] : []),
              ...(openShiftsEnabled ? [{ id: "giveaway" as const, label: "Vardiyama gelemeyeceğim", hint: "Vardiya ekibe duyurulur. Biri alana kadar vardiya sizde kalır.", icon: UserX }] : []),
              ...(swapRequestsEnabled ? [{ id: "swap" as const, label: "Biriyle vardiya değiştirmek istiyorum", hint: "Bir arkadaşınıza vardiya değiştirmeyi teklif edin", icon: ArrowLeftRight }] : []),
              ...(editRequestsEnabled ? [{ id: "edit" as const, label: "Vardiyamda hata var", hint: "Sorumludan düzeltme isteyin (son 2 haftadaki vardiyalar için de olur)", icon: FileEdit }] : []),
            ];
            if (typeOptions.length === 0) {
              return <p className="text-sm text-slate-400 text-center py-6">Bu işletmede yeni talep oluşturma kapalı.</p>;
            }
            return (
              <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                {typeOptions.map(t => (
                  <li key={t.id}>
                    <button
                      onClick={() => { setNewType(t.id); resetSwapWizard(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 min-h-[60px] text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
                    >
                      <t.icon size={18} className="text-primary shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">{t.label}</span>
                        <span className="block text-xs text-slate-500 mt-0.5">{t.hint}</span>
                      </span>
                      <ChevronRight size={16} className="text-slate-300 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            );
          })()}

          {/* ── GELEMİYORUM: vardiyayı ekibe duyur (açık vardiya ilanı) ── */}
          {openShiftsEnabled && newType === "giveaway" && (
            <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-500 mb-3">Hangi vardiyanıza gelemeyeceksiniz?</p>
              {myShifts.length === 0 && (
                <div className="text-sm text-slate-500 text-center py-6 space-y-2">
                  <p>Yaklaşan yayınlanmış vardiyanız yok.</p>
                  {availabilityOn && <p className="text-xs">Plan henüz yayınlanmadıysa gelemeyeceğiniz günü <Link href="/portal/availability" className="font-semibold text-forest-700 underline">Uygunluk</Link>&apos;tan işaretleyin.</p>}
                </div>
              )}
              {myShifts.map(s => {
                // İlanda ya da takası süren vardiya tekrar seçilemez
                const busy = shiftBusy(s);
                return busy
                  ? <div key={s.id} className="opacity-50 pointer-events-none relative">
                      <ShiftOption shift={s} names={shiftNames} selected={false} onSelect={() => {}} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 bg-slate-100 rounded-md px-1.5 py-0.5">{busy}</span>
                    </div>
                  : <ShiftOption key={s.id} shift={s} names={shiftNames} selected={selMyShift?.id === s.id} onSelect={() => setSelMyShift(s)} />;
              })}
              <p className="text-xs text-slate-400 leading-relaxed pt-1">
                Vardiyanız ekibe duyurulur. Biri alana kadar vardiya sizde kalır. Biri aldığında size bildirim gelir.
              </p>
              {myShifts.length > 0 && <button
                disabled={!selMyShift || loading}
                onClick={submitMarketplace}
                className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                <Megaphone size={15} /> {loading ? "Gönderiliyor…" : "Ekibe duyur"}
              </button>}
            </div>
          )}

          {/* ── SWAP WIZARD ── */}
          {swapRequestsEnabled && newType === "swap" && (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              {/* Progress */}
              <div className="flex border-b border-slate-100">
                {["Vardiyanız", "Kiminle", "Onun vardiyası", "Onay"].map((s, i) => (
                  <div key={i} className={`flex-1 py-2.5 text-center text-xs sm:text-xs font-semibold transition-colors px-1 ${
                    swapStep === i ? "bg-primary text-white" : swapStep > i ? "bg-primary/10 text-primary" : "text-slate-400"
                  }`}>{s}</div>
                ))}
              </div>

              <div className="p-4">
                {swapStep === 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 mb-3">Değiştirmek istediğiniz vardiyayı seçin:</p>
                    {myShifts.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Yayınlanmış vardiyanız yok. Sorumlunuz planı yayınlayınca vardiyalarınız burada görünür.</p>}
                    {myShifts.map(s => {
                      const busy = shiftBusy(s);
                      return busy
                        ? <div key={s.id} className="opacity-50 pointer-events-none relative">
                            <ShiftOption shift={s} names={shiftNames} selected={false} onSelect={() => {}} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 bg-slate-100 rounded-md px-1.5 py-0.5">{busy}</span>
                          </div>
                        : <ShiftOption key={s.id} shift={s} names={shiftNames} selected={selMyShift?.id === s.id} onSelect={() => setSelMyShift(s)} />;
                    })}
                    <NextBtn disabled={!selMyShift} onClick={() => setSwapStep(1)} />
                  </div>
                )}

                {swapStep === 1 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 mb-3">Kiminle değiştirmek istiyorsunuz?</p>
                    {matesLoading && <p className="text-sm text-slate-400 text-center py-6">Yükleniyor…</p>}
                    {!matesLoading && teammates.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Bu vardiyayı alabilecek ekip arkadaşı yok.</p>}
                    {teammates.map(p => {
                      // Takas olursa kural bozulmayan en az bir vardiyası yoksa seçilemez (çakışan kişiye teklif gitmez)
                      const none = (p.ok_count ?? 0) === 0;
                      return (
                      <button
                        key={p.id}
                        disabled={none}
                        onClick={() => setSelMate(p)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                          none ? "border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed"
                          : selMate?.id === p.id ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-forest-100 flex items-center justify-center text-xs font-semibold text-forest-600 shrink-0">
                          {p.name.charAt(0)}
                        </div>
                        <div>
                          <p className={`text-sm font-bold ${selMate?.id === p.id ? "text-primary" : "text-slate-800"}`}>{p.name}</p>
                          <p className="text-xs text-slate-400">
                            {none
                              ? (p.shifts?.length ?? 0) === 0 ? "Yaklaşan vardiyası yok" : "Sizinle değiştirebileceği vardiyası yok"
                              : `${p.ok_count} vardiyası sizinkiyle değiştirilebilir`}
                          </p>
                        </div>
                      </button>
                      );
                    })}
                    <div className="flex gap-2 mt-2">
                      <BackBtn onClick={() => setSwapStep(0)} />
                      <NextBtn disabled={!selMate} onClick={() => setSwapStep(2)} />
                    </div>
                  </div>
                )}

                {swapStep === 2 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 mb-3">{selMate?.name} hangi vardiyasını size versin?</p>
                    {theirShifts.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Yaklaşan vardiyaları yok.</p>}
                    {theirShifts.map(s => (s.problems?.length ?? 0) > 0
                      ? <div key={s.id} className="opacity-60 pointer-events-none">
                          <ShiftOption shift={s} names={shiftNames} selected={false} onSelect={() => {}} />
                          <p className="text-xs text-red-600 px-2 pt-1">{s.problems[0]}</p>
                        </div>
                      : <ShiftOption key={s.id} shift={s} names={shiftNames} selected={selTheirShift?.id === s.id} onSelect={() => setSelTheirShift(s)} />
                    )}
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
                      <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Not (isteğe bağlı)</label>
                      <textarea
                        value={swapNote}
                        onChange={e => setSwapNote(e.target.value)}
                        rows={2}
                        placeholder="Arkadaşınıza bir not..."
                        className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-primary transition-colors resize-none"
                      />
                    </div>
                    {swapError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                        {swapError} <button type="button" onClick={() => { setSwapError(""); setSwapStep(2); }} className="font-bold underline">Başka vardiya seç</button>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <BackBtn onClick={() => { setSwapError(""); setSwapStep(2); }} />
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
          {editRequestsEnabled && newType === "edit" && (
            <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">Düzenlemek istediğiniz vardiyayı seçin:</p>
                {myShifts.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Yayınlanmış vardiyanız yok. Sorumlunuz planı yayınlayınca vardiyalarınız burada görünür.</p>}
                <div className="space-y-2">
                  {myShifts.map(s => (
                    <ShiftOption key={s.id} shift={s} names={shiftNames} selected={editShift?.id === s.id} onSelect={() => setEditShift(s)} />
                  ))}
                </div>
              </div>
              {editShift && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Neden değiştirmek istiyorsunuz?</label>
                    <textarea
                      value={editReason}
                      onChange={e => setEditReason(e.target.value)}
                      rows={3}
                      placeholder="Sorumlunuza kısa bir açıklama yazın..."
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
          {leaveRequestsEnabled && newType === "leave" && (
            <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-4">
              {/* Sabit izin günü bilgisi */}
              {weeklyOffDay !== null && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
                  <CalendarOff size={15} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    Sabit izin günün: <strong>{["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi","Pazar"][weeklyOffDay]}</strong>.
                    Bu gün her hafta sizin izin gününüzdür. Ayrıca izin talebi oluşturmanız gerekmez.
                  </p>
                </div>
              )}

              {/* Kalan yıllık izin */}
              {leaveBalance && leaveType === "Yıllık İzin" && (
                <div className={`rounded-xl p-3 flex items-start gap-2.5 border ${leaveBalance.remaining <= 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
                  <CalendarOff size={15} className={`shrink-0 mt-0.5 ${leaveBalance.remaining <= 0 ? "text-amber-600" : "text-emerald-600"}`} />
                  <div className="text-xs">
                    <p className={`font-bold ${leaveBalance.remaining <= 0 ? "text-amber-800" : "text-emerald-800"}`}>
                      Kalan yıllık izniniz: {leaveBalance.remaining} gün
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      {leaveBalance.firstEligibleDate
                        ? `Yıllık izin hakkı 1 yıllık çalışmadan sonra doğar: ${formatDateTR(leaveBalance.firstEligibleDate, { weekday: false })}`
                        : leaveBalance.mode === "seniority"
                        ? `${leaveBalance.seniorityYears} yıl kıdem · toplam hak ${leaveBalance.entitledTotal} gün · kullanılan ${leaveBalance.usedDays} gün`
                        : `Yıllık hak ${leaveBalance.entitledTotal} gün · bu yıl kullanılan ${leaveBalance.usedDays} gün`}
                    </p>
                  </div>
                </div>
              )}

              {/* Şube kuralları ayrı kutuda gösterilmez: mazeret zorunluysa not alanı söyler, tek gün ise tek tarih alanı çıkar */}
              <div>
                <label className="text-xs font-semibold text-slate-400 mb-1.5 block">İzin Türü</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {LEAVE_TYPES.filter(t => leaveOther || MAIN_LEAVE_TYPES.includes(t) || leaveType === t).map(t => (
                    <button
                      key={t}
                      onClick={() => setLeaveType(t)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-xs sm:text-sm font-semibold text-left transition-all ${
                        leaveType === t ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${leaveType === t ? "border-primary" : "border-slate-300"}`}>
                        {leaveType === t && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                      </div>
                      {t}
                    </button>
                  ))}
                </div>
                {!leaveOther && <button type="button" onClick={() => setLeaveOther(true)} className="mt-2 text-xs font-semibold text-forest-700 hover:underline">Diğer izin türleri (doğum, süt, evlilik)</button>}
              </div>
              {(overtimeMe?.comp_time_balance_hours ?? 0) > 0 && (
                <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  Ayrıca <b>{overtimeMe.comp_time_balance_hours} saat</b> fazla mesai karşılığı serbest zamanınız var. Bunu sorumlunuzla planlayabilirsiniz.
                </p>
              )}

              {/* Tarih alanları — çoklu gün kapalıysa bitiş = başlangıç */}
              <div className={leavePolicy?.allow_multi_day === false ? "" : "grid grid-cols-2 gap-3"}>
                <div>
                  <label className="text-xs font-semibold text-slate-400 mb-1.5 block">
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
                    <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Bitiş</label>
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
                <label className="text-xs font-semibold text-slate-400 mb-1.5 block">
                  Mazeret / Açıklama {leavePolicy?.require_reason && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  value={leaveNote}
                  onChange={e => setLeaveNote(e.target.value)}
                  rows={2}
                  placeholder={leavePolicy?.require_reason ? "Zorunlu: nedenini yazın..." : "Sorumlunuza not..."}
                  className={`w-full text-sm bg-slate-50 border rounded-xl p-3 outline-none focus:border-primary transition-colors resize-none ${
                    leavePolicy?.require_reason && !leaveNote.trim() ? "border-red-200" : "border-slate-200"
                  }`}
                />
              </div>

              <button
                disabled={!leaveType || !leaveStart || !leaveEnd || loading || (leavePolicy?.require_reason && !leaveNote.trim())}
                onClick={submitLeave}
                className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Send size={15} /> İzin Talebi Gönder
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── İptal onayı ── */}
      <Sheet open={!!cancelConfirm} onClose={() => setCancelConfirm(null)} title="Talep iptal edilsin mi?" description="Bu işlem geri alınamaz."
        footer={cancelConfirm && <>
          <button onClick={() => setCancelConfirm(null)} className={sheetSecondaryClass}>Vazgeç</button>
          <button onClick={() => cancelRequest(cancelConfirm.kind, cancelConfirm.id)} className={sheetDangerClass}>İptal et</button>
        </>} />

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-28 left-1/2 -translate-x-1/2 text-white text-xs font-semibold px-5 py-3 rounded-2xl shadow-xl z-50 whitespace-nowrap ${
          toast.type === "error" ? "bg-red-600" : "bg-slate-900"
        }`}>
          {toast.msg}
        </div>
      )}
    </Page>
  );
}

// ─── sub-components ─────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-slate-400">{icon}</span>
        <h2 className="text-xs font-semibold text-slate-500">{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 text-center text-xs text-slate-400 font-medium">
      {text}
    </div>
  );
}

// Swap akışı 3 aşamalıdır: teklif → karşı taraf kabulü → müdür onayı.
// Statüden her adımın durumunu türetir; iptal edilen taleplerde gösterilmez.
function SwapSteps({ status }: { status: string }) {
  if (status === "cancelled") return null;
  const STEPS = ["Teklif", "Kabul", "Sorumlu Onayı"];
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
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${dotCls[states[i]]}`}>
              {states[i] === "done" ? "✓" : states[i] === "failed" ? "✕" : i + 1}
            </span>
            <span className={`text-xs font-semibold ${labelCls[states[i]]}`}>{label}</span>
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
  const isFinal = ["cancelled", "manager_approved", "manager_rejected", "approved", "rejected", "peer_rejected", "claimed"].includes(status);
  return (
    <div className={`bg-white rounded-2xl border p-4 space-y-2 ${isFinal ? "opacity-70 border-slate-100" : "border-slate-200"}`}>
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
      {managerNote && <p className="text-xs text-slate-500 border-t border-slate-50 pt-2"><span className="font-bold">Sorumlu notu:</span> {managerNote}</p>}
    </div>
  );
}

function ShiftOption({ shift, selected, onSelect, names = {} }: { shift: any; selected: boolean; onSelect: () => void; names?: Record<string, string> }) {
  const d = new Date(shift.week_start || "");
  d.setDate(d.getDate() + (shift.day ?? 0));
  const label = `${DAY_SHORT[shift.day ?? 0]} ${d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })}`;
  // Vardiyanın adı (şube vardiya tanımlarından): "Açılış · 07:00–15:00"
  const shiftName = names[String(shift.shift_id)] ?? null;
  const hours = shift.start_time && shift.end_time ? `${shift.start_time}–${shift.end_time}` : "";
  const time = [shiftName, hours].filter(Boolean).join(" · ");
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
          <p className="text-sm font-bold text-slate-900">Zorunlu Atama Talebi</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {item.date_label}{item.start_time && item.end_time ? ` · ${item.start_time}–${item.end_time}` : ""}
          </p>
          {item.location_name && (
            <p className="text-xs text-slate-400 mt-0.5">{item.location_name}</p>
          )}
        </div>
      </div>

      {/* Bonus bilgisi */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex items-center gap-2">
        <Star size={13} className="text-amber-500 shrink-0" />
        <p className="text-xs text-amber-800">
          Kabul edersen <strong>+{item.force_bonus_multiplier ?? 5} bonus puan</strong> kazanırsınız.
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
      className="w-full flex-1 flex items-center justify-center gap-1.5 min-h-[48px] bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-40"
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
