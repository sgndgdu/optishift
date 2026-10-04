"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, UserX, ArrowLeftRight, FileEdit } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePortalAuth } from "@/hooks/useAuth";
import { addDays, businessToday, getWeekStart, weekRangeTR } from "@/lib/date";
import { DAY_NAMES as DAYS, DAY_SHORT } from "@/lib/constants";

import { useShiftWords } from "@/hooks/useShiftWords";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
export default function PortalCalendar() {
  const words = useShiftWords();
  const router = useRouter();
  const { user, mounted } = usePortalAuth();
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [weekOffset, setWeekOffset] = useState(0);
  const [shifts, setShifts] = useState<any[]>([]);
  const [onCalls, setOnCalls] = useState<any[]>([]);
  const [allShifts, setAllShifts] = useState<any[]>([]);
  const [personnelMap, setPersonnelMap] = useState<Record<string, string>>({});
  // Vardiya kimliği (s-sabah) yerine şubedeki adı (Sabah Postası) gösterilir
  const [shiftNames, setShiftNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  // Vardiyaya dokununca açılan seçenekler (rakiplerde ana yol bu): hangi talepler açık şubenin kuralından
  const [picked, setPicked] = useState<{ id: number; label: string; past: boolean } | null>(null);
  const [reqFlags, setReqFlags] = useState({ giveaway: true, swap: true, edit: true });
  useEffect(() => {
    if (!user?.location_id) return;
    fetch(`/api/locations?id=${user.location_id}`).then(r => r.json()).then(d => {
      const loc = Array.isArray(d) ? d[0] : d;
      const r = typeof loc?.rules === "string" ? JSON.parse(loc.rules) : (loc?.rules ?? {});
      setReqFlags({ giveaway: r.open_shifts_enabled !== false, swap: r.swap_requests_enabled !== false, edit: r.edit_requests_enabled !== false });
    }).catch(() => {});
  }, [user?.location_id]);

  const weekStart = getWeekStart(weekOffset);

  useEffect(() => {
    if (!user?.personnel_id) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/shifts?personnel_id=${user.personnel_id}&week_start=${weekStart}&include_on_call=1`).then(r => r.json()).catch(() => []),
      user.location_id
        ? fetch(`/api/shifts?location_id=${user.location_id}&week_start=${weekStart}`).then(r => r.json()).catch(() => [])
        : Promise.resolve([]),
      user.location_id
        ? fetch(`/api/personnel?location_id=${user.location_id}`).then(r => r.json()).catch(() => [])
        : Promise.resolve([]),
      user.location_id
        ? fetch(`/api/locations?id=${user.location_id}`).then(r => r.json()).catch(() => [])
        : Promise.resolve([]),
    ]).then(([mine, all, ppl, locs]) => {
      const defs = Array.isArray(locs) ? locs[0]?.shift_definitions : null;
      const parsed = typeof defs === "string" ? (() => { try { return JSON.parse(defs); } catch { return []; } })() : defs;
      if (Array.isArray(parsed)) setShiftNames(Object.fromEntries(parsed.map((d: any) => [d.id, d.name])));
      // İcap ayrı gösterilir; gün kartı ve değişim isteği normal vardiya üzerinden
      const mineRows = Array.isArray(mine) ? mine : [];
      setShifts(mineRows.filter((s: any) => s.kind !== "on_call"));
      setOnCalls(mineRows.filter((s: any) => s.kind === "on_call"));
      setAllShifts(Array.isArray(all) ? all : []);
      const map: Record<string, string> = {};
      if (Array.isArray(ppl)) ppl.forEach((p: any) => { map[p.id] = p.name; });
      setPersonnelMap(map);
    }).finally(() => setLoading(false));
  }, [user, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bu hafta vardiyası yok ama gelecek haftanın planı yayınlandıysa (bildirim de onu söyler)
  // ilk açılışta doğrudan gelecek hafta gösterilir.
  const autoJumped = useRef(false);
  useEffect(() => {
    if (autoJumped.current || loading || weekOffset !== 0 || !user?.personnel_id) return;
    autoJumped.current = true;
    if (shifts.length > 0 || onCalls.length > 0) return;
    fetch(`/api/shifts?personnel_id=${user.personnel_id}&week_start=${getWeekStart(1)}`)
      .then(r => r.json())
      .then(rows => { if (Array.isArray(rows) && rows.length > 0) setWeekOffset(1); })
      .catch(() => {});
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return <div className="space-y-4" />;

  const getWeekLabel = () => {
    if (weekOffset === -1) return "Geçen Hafta";
    if (weekOffset === 0) return "Bu Hafta";
    if (weekOffset === 1) return "Gelecek Hafta";
    return `${weekOffset > 0 ? '+' : ''}${weekOffset} Hafta`;
  };

  return (
    <Page>
      <PageHeader title={tab === "mine" ? words.MyShifts : "Şube Programı"} />

      {/* Hafta Navigasyonu */}
      <Card className="stripe-card rounded-2xl border-0">
        <CardContent className="p-1.5 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWeekOffset(prev => prev - 1)}
            className="text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl h-11 w-11"
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </Button>
          <span className="text-sm font-bold text-slate-800 bg-slate-50/80 px-4 py-2 rounded-xl border border-border/40 shadow-sm">
            {getWeekLabel()} · {weekRangeTR(weekStart)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWeekOffset(prev => prev + 1)}
            className="text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl h-11 w-11"
          >
            <ChevronRight size={20} strokeWidth={2.5} />
          </Button>
        </CardContent>
      </Card>

      <Tabs fill value={tab} onChange={setTab} items={[{ id: "mine", label: "Benim" }, { id: "all", label: "Tüm Şube" }] as const} />

      {loading ? (
        <div className="animate-pulse space-y-4 pt-4">
          <div className="h-28 bg-slate-100 rounded-2xl w-full"></div>
          <div className="h-28 bg-slate-100 rounded-2xl w-full"></div>
        </div>
      ) : tab === "mine" ? (
        // Sadece vardiyası olan günler; boş günler tek satırda. Geçmiş günler soluk, bugün vurgulu.
        (() => {
          const today = businessToday();
          // Saat düzeltme son 2 hafta için de istenebilir; geçmiş vardiyada sadece o seçenek çıkar
          const fixFrom = addDays(today, -14);
          const workDays = [0, 1, 2, 3, 4, 5, 6].filter(d => shifts.some((x: any) => x.day === d) || onCalls.some((x: any) => x.day === d));
          const offDays = [0, 1, 2, 3, 4, 5, 6].filter(d => !workDays.includes(d));
          if (workDays.length === 0) {
            return (
              <div className="text-center py-12 text-muted-foreground font-semibold text-sm space-y-3">
                <p>Bu hafta için atanmış bir {words.shift} yok.</p>
                {weekOffset === 0 && (
                  <button onClick={() => setWeekOffset(1)} className="text-forest-700 font-bold underline">Gelecek haftaya bak</button>
                )}
              </div>
            );
          }
          return (
            <div className="space-y-2.5">
              {workDays.map(d => {
                const shift = shifts.find((x: any) => x.day === d);
                const onCall = onCalls.find((x: any) => x.day === d);
                const date = addDays(weekStart, d);
                const isToday = date === today;
                const isPast = date < today;
                return (
                  <div key={d}
                    role={shift && date >= fixFrom ? "button" : undefined} tabIndex={shift && date >= fixFrom ? 0 : undefined}
                    onClick={shift && date >= fixFrom ? () => setPicked({ id: shift.id, past: isPast, label: `${DAYS[d]} ${shift.start_time}–${shift.end_time}` }) : undefined}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 ${isToday ? "border-primary/40 bg-primary/5" : "border-slate-100 bg-white"} ${isPast ? "opacity-50" : ""} ${shift && date >= fixFrom ? "cursor-pointer active:bg-slate-50" : ""}`}>
                    <div className={`w-12 shrink-0 text-center rounded-xl py-1.5 ${isToday ? "bg-primary text-white" : "bg-slate-100 text-slate-600"}`}>
                      <p className="text-xs font-bold uppercase">{DAY_SHORT[d]}</p>
                      <p className="text-sm font-bold leading-none mt-0.5">{Number(date.slice(8))}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      {shift && (
                        <>
                          <p className="text-base font-bold text-slate-900 tabular-nums">{shift.start_time}–{shift.end_time}</p>
                          <p className="text-xs font-semibold text-slate-500 truncate">
                            {shift.shift_id === "custom" ? "Özel" : shiftNames[shift.shift_id] ?? words.Shift}
                            {isToday && <span className="text-primary font-bold"> · Bugün</span>}
                          </p>
                        </>
                      )}
                      {onCall && (
                        <p className="mt-1 inline-flex items-center rounded-lg border border-dashed border-violet-300 bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-700"
                          title="Evden beklersin, çağrılırsan gelirsin. Çalıştığın saat müdürün tarafından kaydedilir.">
                          Nöbet · {onCall.start_time}–{onCall.end_time}
                        </p>
                      )}
                    </div>
                    {shift && !isPast && <ChevronRight size={18} className="shrink-0 text-slate-300" aria-hidden />}
                  </div>
                );
              })}
              {offDays.length > 0 && (
                <p className="text-xs font-semibold text-slate-400 px-1 pt-1">
                  Boş günler: {offDays.map(d => DAY_SHORT[d]).join(", ")}
                </p>
              )}
            </div>
          );
        })()
      ) : (
        /* ── Tüm Şube görünümü ── */
        <div className="space-y-4">
          {allShifts.length === 0 ? (
            <div className="text-center py-16 bg-slate-50/50 rounded-2xl border border-border/40">
              <p className="text-muted-foreground text-sm font-bold">Bu hafta yayınlanmış {words.shift} yok.</p>
            </div>
          ) : (
            DAYS.map((dayName, dayIndex) => {
              const dayShifts = allShifts
                .filter((s: any) => s.day === dayIndex)
                .sort((a: any, b: any) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
              if (dayShifts.length === 0) return null;

              const dateObj = new Date(`${weekStart}T00:00:00`);
              dateObj.setDate(dateObj.getDate() + dayIndex);
              const dateStr = dateObj.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });

              return (
                <div key={dayIndex} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-800">{dayName}</span>
                    <span className="text-xs text-slate-400 font-medium">{dateStr}</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {dayShifts.map((s: any) => {
                      const isMe = s.personnel_id === user?.personnel_id;
                      const name = personnelMap[s.personnel_id] ?? s.personnel_id;
                      return (
                        <div key={s.id} className={`flex items-center justify-between px-4 py-3 ${isMe ? "bg-primary/5" : ""}`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isMe ? "bg-primary text-white" : "bg-slate-100 text-slate-500"}`}>
                              {name.charAt(0)}
                            </div>
                            <span className={`text-sm font-bold truncate ${isMe ? "text-primary" : "text-slate-700"}`}>
                              {name}{isMe && <span className="text-xs font-normal text-primary/70 ml-1">(ben)</span>}
                            </span>
                          </div>
                          {s.start_time && s.end_time && (
                            <span className="text-xs font-bold text-slate-500 shrink-0 ml-2">
                              {s.start_time}–{s.end_time}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
      {picked && (
        <Sheet open onClose={() => setPicked(null)} title={picked.label} description="Bu vardiya için ne yapmak istiyorsun?">
          <div className="space-y-2">
            {[
              ...(!picked.past && reqFlags.giveaway ? [{ type: "giveaway", label: "Gelemeyeceğim", hint: "Ekibe duyurulur, biri üstlenene kadar sende kalır", Icon: UserX }] : []),
              ...(!picked.past && reqFlags.swap ? [{ type: "swap", label: "Biriyle değiştir", hint: "Bir arkadaşına takas teklif et", Icon: ArrowLeftRight }] : []),
              ...(reqFlags.edit ? [{ type: "edit", label: "Saatte hata var", hint: "Müdürden saat düzeltme iste", Icon: FileEdit }] : []),
            ].map(o => (
              <button key={o.type} onClick={() => router.push(`/portal/requests?new=${o.type}&shift=${picked.id}`)}
                className="w-full flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3.5 text-left hover:bg-slate-50 min-h-[56px]">
                <o.Icon size={18} className="text-forest-600 shrink-0" />
                <span>
                  <span className="block text-sm font-bold text-slate-800">{o.label}</span>
                  <span className="block text-xs text-slate-500">{o.hint}</span>
                </span>
              </button>
            ))}
            {!reqFlags.giveaway && !reqFlags.swap && !reqFlags.edit && <p className="text-sm text-slate-500">Bu şubede vardiya talepleri kapalı. Müdürünle konuş.</p>}
          </div>
        </Sheet>
      )}
    </Page>
  );
}
