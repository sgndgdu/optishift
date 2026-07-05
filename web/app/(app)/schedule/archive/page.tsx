"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Archive, Calendar, Clock, User, ChevronDown, ChevronUp,
  CheckCircle2, RefreshCw, ArrowLeft, History, AlertCircle,
} from "lucide-react";
import { resolveShiftDef } from "@/lib/fairness";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Publication {
  id: number;
  week_start: string;
  revision: number;
  published_by_name: string;
  published_at: number;
}

interface SnapshotAssignment {
  personnelId: string;
  personnelName: string;
  departmentId: string | null;
  departmentName: string;
  day: number;
  startTime: string;
  endTime: string;
  shiftId: string;
  points: number;
}

interface Snapshot {
  locationName: string;
  shiftDefs: { id: string; name: string; start: string; end: string }[];
  departments: { id: string; name: string }[];
  assignments: SnapshotAssignment[];
}

// ─── Constants & Utilities ───────────────────────────────────────────────────

const DAY_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const WEEKEND_DAYS = [5, 6];

const SHIFT_PALETTE = [
  { chip: "bg-indigo-100 text-indigo-800 border-indigo-200", dot: "bg-indigo-400" },
  { chip: "bg-violet-100 text-violet-800 border-violet-200", dot: "bg-violet-400" },
  { chip: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "bg-emerald-400" },
  { chip: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-400" },
  { chip: "bg-rose-100 text-rose-800 border-rose-200", dot: "bg-rose-400" },
  { chip: "bg-cyan-100 text-cyan-800 border-cyan-200", dot: "bg-cyan-400" },
];

function getWeekInfo(weekStart: string) {
  const [y, m, d] = weekStart.split("-").map(Number);
  const mon = new Date(y, m - 1, d);
  const sun = new Date(y, m - 1, d + 6);
  const fmt = (dt: Date, opts: Intl.DateTimeFormatOptions) =>
    dt.toLocaleDateString("tr-TR", opts);
  return {
    label: `${fmt(mon, { day: "numeric", month: "long" })} – ${fmt(sun, { day: "numeric", month: "long", year: "numeric" })}`,
    short: `${fmt(mon, { day: "numeric", month: "short" })} – ${fmt(sun, { day: "numeric", month: "short" })}`,
    columnDates: Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(y, m - 1, d + i);
      return { abbr: DAY_LABELS[i], num: dt.getDate() };
    }),
  };
}

function revLabel(rev: number) {
  return rev === 0 ? "İlk Yayın" : `${rev}. Revizyon`;
}

function fmtTimestamp(ts: number) {
  return new Date(ts * 1000).toLocaleString("tr-TR", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function calcShiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  let [eh, em] = end.split(":").map(Number);
  let s = sh * 60 + sm;
  let e = eh * 60 + em;
  if (e <= s) e += 1440;
  return (e - s) / 60;
}

// ─── Snapshot Grid ───────────────────────────────────────────────────────────

function SnapshotGrid({ snapshot, weekStart }: { snapshot: Snapshot; weekStart: string }) {
  const { columnDates } = getWeekInfo(weekStart);

  // Shift → color mapping (sabit sıra)
  const shiftColor: Record<string, (typeof SHIFT_PALETTE)[number]> = {};
  snapshot.shiftDefs.forEach((sd, i) => {
    shiftColor[sd.id] = SHIFT_PALETTE[i % SHIFT_PALETTE.length];
  });

  // Hızlı arama için atama haritası
  const cellMap: Record<string, SnapshotAssignment> = {};
  for (const a of snapshot.assignments) {
    cellMap[`${a.personnelId}-${a.day}`] = a;
  }

  // Departmana göre sıralı personel listesi
  const seen = new Set<string>();
  const deptGroups: Record<string, { id: string; name: string }[]> = {};
  const deptOrder: string[] = [];

  for (const a of snapshot.assignments) {
    const key = a.departmentId ?? "__none__";
    if (!deptGroups[key]) { deptGroups[key] = []; deptOrder.push(key); }
    if (!seen.has(a.personnelId)) {
      seen.add(a.personnelId);
      deptGroups[key].push({ id: a.personnelId, name: a.personnelName });
    }
  }

  const orderedDepts = [
    ...snapshot.departments.map(d => d.id).filter(id => deptGroups[id]),
    ...(deptGroups["__none__"] ? ["__none__"] : []),
  ];

  if (seen.size === 0) {
    return (
      <div className="py-12 text-center">
        <AlertCircle size={28} className="mx-auto text-slate-300 mb-2" />
        <p className="text-sm text-slate-400">Bu yayında atama verisi yok.</p>
      </div>
    );
  }

  // Toplam istatistikler
  const totalPersonnel = seen.size;
  const totalPersonHours = snapshot.assignments.reduce((sum, a) => sum + calcShiftHours(a.startTime, a.endTime), 0);

  return (
    <div>
      {/* Mini istatistikler */}
      <div className="flex items-center gap-6 px-5 py-3 bg-slate-50 border-b border-slate-100 text-xs text-slate-500">
        <span><strong className="text-slate-700">{totalPersonnel}</strong> çalışan</span>
        <span><strong className="text-slate-700">{Math.round(totalPersonHours)}</strong> toplam saat</span>
        <span><strong className="text-slate-700">{snapshot.assignments.length}</strong> vardiya ataması</span>
        {/* Shift tanım lejandı */}
        <span className="flex items-center gap-2 ml-auto flex-wrap">
          {snapshot.shiftDefs.map((sd, i) => (
            <span key={sd.id} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${SHIFT_PALETTE[i % SHIFT_PALETTE.length].dot}`} />
              <span className="text-slate-600">{sd.name} ({sd.start}–{sd.end})</span>
            </span>
          ))}
        </span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[680px]">
          <thead>
            <tr className="border-b-2 border-slate-200">
              <th className="py-3 px-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider w-40 sticky left-0 bg-white z-10">
                Personel
              </th>
              {columnDates.map((col, i) => (
                <th
                  key={i}
                  className={`py-3 px-1 text-center min-w-[88px] ${WEEKEND_DAYS.includes(i) ? "bg-indigo-50/60" : ""}`}
                >
                  <div className={`text-[10px] font-semibold ${WEEKEND_DAYS.includes(i) ? "text-indigo-500" : "text-slate-400"}`}>
                    {col.abbr}
                  </div>
                  <div className={`text-lg font-black leading-none ${WEEKEND_DAYS.includes(i) ? "text-indigo-600" : "text-slate-700"}`}>
                    {col.num}
                  </div>
                </th>
              ))}
              <th className="py-3 px-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider w-16">
                Saat
              </th>
            </tr>
          </thead>
          <tbody>
            {orderedDepts.map(deptId => {
              const dept = snapshot.departments.find(d => d.id === deptId);
              const people = deptGroups[deptId] ?? [];
              if (!people.length) return null;

              return [
                /* Departman başlık satırı */
                <tr key={`d-${deptId}`}>
                  <td colSpan={9} className="py-2 px-5 bg-slate-100/80 border-t border-b border-slate-200">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      {dept?.name ?? "Diğer"}
                    </span>
                  </td>
                </tr>,

                /* Personel satırları */
                ...people.map(p => {
                  const weekHours = Array.from({ length: 7 }, (_, d) => {
                    const c = cellMap[`${p.id}-${d}`];
                    return c ? calcShiftHours(c.startTime, c.endTime) : 0;
                  }).reduce((a, b) => a + b, 0);

                  return (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      {/* İsim */}
                      <td className="py-2.5 px-5 sticky left-0 bg-white z-10">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-black text-slate-500 uppercase">{p.name.charAt(0)}</span>
                          </div>
                          <span className="font-semibold text-slate-800 text-[11px] truncate max-w-[90px]">{p.name}</span>
                        </div>
                      </td>

                      {/* Günler */}
                      {Array.from({ length: 7 }, (_, d) => {
                        const cell = cellMap[`${p.id}-${d}`];
                        // shiftId eşleşmezse (eski kayıtlardaki "custom" sentineli) saate göre çöz;
                        // gerçekten özel saatliyse nötr "Özel" chip'i — atama asla görünmez kalmaz
                        const sd = cell
                          ? resolveShiftDef(cell.shiftId, cell.startTime, cell.endTime, snapshot.shiftDefs)
                          : null;
                        const color = sd ? shiftColor[sd.id] : null;
                        return (
                          <td key={d} className={`py-1.5 px-1 text-center align-middle ${WEEKEND_DAYS.includes(d) ? "bg-indigo-50/30" : ""}`}>
                            {cell ? (
                              <div className={`rounded-lg py-1 px-1.5 border ${color ? color.chip : "bg-slate-100 text-slate-700 border-slate-200"}`}>
                                <div className="font-bold text-[10px] leading-snug">{sd?.name ?? "Özel"}</div>
                                <div className="text-[9px] opacity-70 leading-snug">{cell.startTime}–{cell.endTime}</div>
                              </div>
                            ) : (
                              <span className="text-slate-200 text-base">·</span>
                            )}
                          </td>
                        );
                      })}

                      {/* Toplam saat */}
                      <td className="py-1 px-3 text-center">
                        <span className={`text-[11px] font-bold ${weekHours >= 40 ? "text-emerald-600" : weekHours > 0 ? "text-slate-600" : "text-slate-300"}`}>
                          {weekHours > 0 ? `${Number.isInteger(weekHours) ? weekHours : weekHours.toFixed(1)}s` : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>

          {/* Günlük özet */}
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50">
              <td className="py-2.5 px-5 text-[10px] font-black text-slate-400 uppercase tracking-wider sticky left-0 bg-slate-50 z-10">
                Günlük
              </td>
              {Array.from({ length: 7 }, (_, d) => {
                const dayAssignments = snapshot.assignments.filter(a => a.day === d);
                const dayHours = dayAssignments.reduce((s, a) => s + calcShiftHours(a.startTime, a.endTime), 0);
                return (
                  <td key={d} className={`py-2.5 px-1 text-center ${WEEKEND_DAYS.includes(d) ? "bg-indigo-50/50" : ""}`}>
                    {dayAssignments.length > 0 ? (
                      <div>
                        <div className="text-[10px] font-black text-slate-700">{dayAssignments.length} kişi</div>
                        <div className="text-[9px] text-slate-400">{Math.round(dayHours)}s</div>
                      </div>
                    ) : (
                      <span className="text-slate-300 text-[10px]">—</span>
                    )}
                  </td>
                );
              })}
              <td className="py-2.5 px-3 text-center">
                <div className="text-[11px] font-black text-slate-700">{Math.round(totalPersonHours)}s</div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function ScheduleArchivePage() {
  const router = useRouter();
  const [locationId, setLocationId] = useState("");
  const [locationName, setLocationName] = useState("");

  // Hafta listesi (son revizyon her hafta için)
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);

  // Genişletilmiş hafta
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);

  // Hafta → tüm revizyonlar cache
  const [revCache, setRevCache] = useState<Record<string, Publication[]>>({});
  const [loadingRevs, setLoadingRevs] = useState<string | null>(null);

  // Seçili revizyon id (hafta bazında)
  const [selectedRevId, setSelectedRevId] = useState<Record<string, number>>({});

  // Snapshot cache (id → snapshot)
  const [snapshotCache, setSnapshotCache] = useState<Record<number, Snapshot | null>>({});
  const [loadingSnap, setLoadingSnap] = useState<number | null>(null);

  // Auth + init
  useEffect(() => {
    const stored = localStorage.getItem("optishift_manager_user");
    if (!stored) { router.replace("/login"); return; }
    try {
      const u = JSON.parse(stored);
      setLocationId(u.location_id ?? "");
      setLocationName(u.location_name ?? "");
    } catch { router.replace("/login"); }
  }, [router]);

  // Hafta listesini yükle
  useEffect(() => {
    if (!locationId) return;
    setLoading(true);
    fetch(`/api/schedule/publications?location_id=${locationId}`)
      .then(r => r.json())
      .then(data => setPublications(Array.isArray(data) ? data : []))
      .catch(() => setPublications([]))
      .finally(() => setLoading(false));
  }, [locationId]);

  // Snapshot yükle ve cache'le
  const loadSnapshot = useCallback(async (pubId: number) => {
    if (snapshotCache[pubId] !== undefined) return;
    setLoadingSnap(pubId);
    try {
      const res = await fetch("/api/schedule/publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pubId }),
      });
      const data = await res.json();
      setSnapshotCache(prev => ({ ...prev, [pubId]: data.snapshot ?? null }));
    } catch {
      setSnapshotCache(prev => ({ ...prev, [pubId]: null }));
    } finally {
      setLoadingSnap(null);
    }
  }, [snapshotCache]);

  // Haftayı genişlet / daralt
  const toggleWeek = useCallback(async (weekStart: string) => {
    if (expandedWeek === weekStart) {
      setExpandedWeek(null);
      return;
    }
    setExpandedWeek(weekStart);

    // Revizyonları yükle (cache yoksa)
    if (!revCache[weekStart]) {
      setLoadingRevs(weekStart);
      try {
        const res = await fetch(`/api/schedule/publications?location_id=${locationId}&week_start=${weekStart}`);
        const data: Publication[] = await res.json();
        setRevCache(prev => ({ ...prev, [weekStart]: Array.isArray(data) ? data : [] }));

        // En son revizyonu otomatik seç ve snapshot'ını yükle
        if (Array.isArray(data) && data.length > 0) {
          const latest = data[data.length - 1];
          setSelectedRevId(prev => ({ ...prev, [weekStart]: latest.id }));
          await loadSnapshot(latest.id);
        }
      } finally {
        setLoadingRevs(null);
      }
    }
  }, [expandedWeek, revCache, locationId, loadSnapshot]);

  // Revizyon seç
  const selectRevision = useCallback(async (weekStart: string, pubId: number) => {
    setSelectedRevId(prev => ({ ...prev, [weekStart]: pubId }));
    await loadSnapshot(pubId);
  }, [loadSnapshot]);

  // Seçili snapshot'ı al
  const getSelectedSnapshot = (weekStart: string): Snapshot | null | undefined => {
    const revId = selectedRevId[weekStart];
    if (!revId) return undefined;
    return snapshotCache[revId];
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-6 lg:px-8">

        {/* ── Header ── */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/schedule")}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors group"
          >
            <ArrowLeft size={15} className="group-hover:-translate-x-0.5 transition-transform" />
            Vardiya Planına Dön
          </button>

          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center shadow-sm">
                <Archive size={22} className="text-slate-600" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-900">Yayın Arşivi</h1>
                <p className="text-slate-500 text-sm mt-0.5">
                  {locationName && <span className="font-medium text-slate-600">{locationName} · </span>}
                  Onaylanmış tüm programlar — revizyonlarıyla birlikte
                </p>
              </div>
            </div>
            {!loading && (
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm">
                <Calendar size={14} className="text-slate-400" />
                <span className="text-sm font-bold text-slate-700">{publications.length} hafta</span>
              </div>
            )}
          </div>
        </div>

        {/* ── İçerik ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Arşiv yükleniyor…</p>
          </div>
        ) : publications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white border border-slate-200 rounded-2xl">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
              <Archive size={28} className="text-slate-400" />
            </div>
            <p className="text-base font-bold text-slate-600 mb-1">Henüz yayınlanmış vardiya yok</p>
            <p className="text-sm text-slate-400">Vardiya planını yayınladığında burada görünür.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {publications.map(pub => {
              const isOpen = expandedWeek === pub.week_start;
              const info = getWeekInfo(pub.week_start);
              const hasRevisions = pub.revision > 0;
              const revisions = revCache[pub.week_start] ?? [];
              const currentRevId = selectedRevId[pub.week_start];
              const currentSnap = getSelectedSnapshot(pub.week_start);
              const isLoadingRevs = loadingRevs === pub.week_start;

              return (
                <div
                  key={pub.week_start}
                  className={`bg-white rounded-2xl border transition-all overflow-hidden ${isOpen ? "border-slate-300 shadow-md" : "border-slate-200 hover:border-slate-300 shadow-sm"}`}
                >
                  {/* ── Kart Başlığı ── */}
                  <button
                    onClick={() => toggleWeek(pub.week_start)}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left"
                  >
                    {/* İkon */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${hasRevisions ? "bg-violet-50 border border-violet-200" : "bg-emerald-50 border border-emerald-200"}`}>
                      {hasRevisions
                        ? <RefreshCw size={16} className="text-violet-600" />
                        : <CheckCircle2 size={16} className="text-emerald-600" />
                      }
                    </div>

                    {/* Hafta bilgisi */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-bold text-slate-900 text-sm">{info.label}</span>
                        {hasRevisions && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-violet-100 text-violet-700 text-[10px] font-black border border-violet-200">
                            <History size={9} />
                            {pub.revision + 1} versiyon
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <User size={10} />
                          {pub.published_by_name ?? "Yönetici"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {fmtTimestamp(pub.published_at)}
                        </span>
                        <span className="font-medium text-slate-500">
                          {revLabel(pub.revision)}
                        </span>
                      </div>
                    </div>

                    {/* Expand ikon */}
                    <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${isOpen ? "bg-slate-100" : "bg-slate-50 hover:bg-slate-100"}`}>
                      {isOpen
                        ? <ChevronUp size={15} className="text-slate-500" />
                        : <ChevronDown size={15} className="text-slate-500" />
                      }
                    </div>
                  </button>

                  {/* ── Genişletilmiş Alan ── */}
                  {isOpen && (
                    <div className="border-t border-slate-100">
                      {isLoadingRevs ? (
                        <div className="flex items-center justify-center py-12 gap-3">
                          <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
                          <span className="text-sm text-slate-400">Yükleniyor…</span>
                        </div>
                      ) : (
                        <>
                          {/* Revizyon sekmeleri (birden fazla varsa) */}
                          {revisions.length > 1 && (
                            <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100 overflow-x-auto">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider shrink-0">Versiyon:</span>
                              {revisions.map(rev => {
                                const isSelected = currentRevId === rev.id;
                                const isSnapping = loadingSnap === rev.id;
                                return (
                                  <button
                                    key={rev.id}
                                    onClick={() => selectRevision(pub.week_start, rev.id)}
                                    disabled={isSnapping}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
                                      isSelected
                                        ? "bg-slate-900 text-white border-slate-900"
                                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                                    }`}
                                  >
                                    {rev.revision === 0
                                      ? <CheckCircle2 size={11} />
                                      : <RefreshCw size={11} className={isSnapping ? "animate-spin" : ""} />
                                    }
                                    {revLabel(rev.revision)}
                                    <span className={`text-[9px] font-normal ${isSelected ? "text-slate-300" : "text-slate-400"}`}>
                                      {new Date(rev.published_at * 1000).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Snapshot içeriği */}
                          {loadingSnap === currentRevId ? (
                            <div className="flex items-center justify-center py-12 gap-3">
                              <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                              <span className="text-sm text-slate-400">Program yükleniyor…</span>
                            </div>
                          ) : currentSnap === null ? (
                            <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
                              <AlertCircle size={16} />
                              <span className="text-sm">Anlık görüntü bulunamadı.</span>
                            </div>
                          ) : currentSnap ? (
                            <SnapshotGrid snapshot={currentSnap} weekStart={pub.week_start} />
                          ) : (
                            <div className="flex items-center justify-center py-12 gap-3">
                              <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                              <span className="text-sm text-slate-400">Program yükleniyor…</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
