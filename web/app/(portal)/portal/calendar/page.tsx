"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, UserX, ArrowLeftRight, FileEdit } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePortalAuth } from "@/hooks/useAuth";
import { addDays, businessToday, formatDateTR, getWeekStart, weekRangeTR } from "@/lib/date";
import { DAY_NAMES as DAYS, DAY_SHORT } from "@/lib/constants";

import { useShiftWords } from "@/hooks/useShiftWords";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { coworkersOf } from "@/lib/coworkers";
export default function PortalCalendar() {
  const words = useShiftWords();
  const router = useRouter();
  const { user, mounted } = usePortalAuth();
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [weekOffset, setWeekOffset] = useState(0);
  const [shifts, setShifts] = useState<any[]>([]);
  const [onCalls, setOnCalls] = useState<any[]>([]);
  // Çalıştığı tüm şubelerin yayınlanmış haftası (/api/shifts/team): kimle, nerede çalışıyorum
  const [team, setTeam] = useState<{ locations: { id: string; name: string }[]; shifts: any[] }>({ locations: [], shifts: [] });
  const [teamLoc, setTeamLoc] = useState<string | null>(null);
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
      fetch(`/api/shifts/team?week_start=${weekStart}`).then(r => r.json()).catch(() => null),
      user.location_id
        ? fetch(`/api/locations?id=${user.location_id}`).then(r => r.json()).catch(() => [])
        : Promise.resolve([]),
    ]).then(([mine, teamData, locs]) => {
      const defs = Array.isArray(locs) ? locs[0]?.shift_definitions : null;
      const parsed = typeof defs === "string" ? (() => { try { return JSON.parse(defs); } catch { return []; } })() : defs;
      if (Array.isArray(parsed)) setShiftNames(Object.fromEntries(parsed.map((d: any) => [d.id, d.name])));
      // İcap ayrı gösterilir; gün kartı ve değişim isteği normal vardiya üzerinden
      const mineRows = Array.isArray(mine) ? mine : [];
      setShifts(mineRows.filter((s: any) => s.kind !== "on_call"));
      setOnCalls(mineRows.filter((s: any) => s.kind === "on_call"));
      setTeam({ locations: Array.isArray(teamData?.locations) ? teamData.locations : [], shifts: Array.isArray(teamData?.shifts) ? teamData.shifts : [] });
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

  const multiBranch = team.locations.length > 1;
  const locName = (id: string) => team.locations.find(l => l.id === id)?.name ?? "";
  // Seninle çalışanlar (lib/coworkers): departman adı ekip verisinde (ana departman dahil)
  const coworkers = (shift: any) => coworkersOf(team.shifts.find(t => t.id === shift.id) ?? shift, team.shifts, user?.personnel_id);
  const activeLoc = teamLoc && team.locations.some(l => l.id === teamLoc) ? teamLoc : (team.locations[0]?.id ?? null);

  const getWeekLabel = () => {
    if (weekOffset === -1) return "Geçen Hafta";
    if (weekOffset === 0) return "Bu Hafta";
    if (weekOffset === 1) return "Gelecek Hafta";
    return `${weekOffset > 0 ? '+' : ''}${weekOffset} Hafta`;
  };

  return (
    <Page>
      <PageHeader title={tab === "mine" ? words.MyShifts : "Ekibin Haftası"} />

      {/* Hafta Navigasyonu */}
      <Card className="stripe-card rounded-2xl border-0">
        <CardContent className="p-1.5 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWeekOffset(prev => prev - 1)}
            aria-label="Önceki hafta"
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
            aria-label="Sonraki hafta"
            className="text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl h-11 w-11"
          >
            <ChevronRight size={20} strokeWidth={2.5} />
          </Button>
        </CardContent>
      </Card>

      <Tabs fill value={tab} onChange={setTab} items={[{ id: "mine", label: "Benim" }, { id: "all", label: "Ekip" }] as const} />

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
            <div className="grid gap-2.5 lg:grid-cols-2">
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
                            {/* Birden çok departmanda çalışan kişi o gün hangi departmanda */}
                            {shift.department_name && <span className="text-sky-700"> · {shift.department_name}</span>}
                            {isToday && <span className="text-primary font-bold"> · Bugün</span>}
                          </p>
                          {/* Birden çok şubede çalışan: hangi şubede */}
                          {multiBranch && shift.location_id && (
                            <p className="text-xs font-semibold text-violet-700 truncate">{locName(shift.location_id) || shift.location_name}</p>
                          )}
                          {(() => {
                            const mates = coworkers(shift);
                            if (mates.length === 0) return null;
                            return <p className="text-xs text-slate-500 truncate" title={mates.join(", ")}>Seninle: {mates.slice(0, 4).join(", ")}{mates.length > 4 ? ` +${mates.length - 4}` : ""}</p>;
                          })()}
                        </>
                      )}
                      {onCall && (
                        <p className="mt-1 inline-flex items-center rounded-lg border border-dashed border-violet-300 bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-700"
                          title="Evde beklersiniz, çağrılırsanız gelirsiniz. Çalıştığınız saati sorumlunuz kaydeder.">
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
        /* ── Ekibin haftası: çalıştığı her şube için gün gün kim, hangi saatte ── */
        <div className="space-y-4">
          {multiBranch && (
            <div className="flex flex-wrap gap-2">
              {team.locations.map(l => (
                <button key={l.id} onClick={() => setTeamLoc(l.id)}
                  className={`px-3.5 min-h-[40px] rounded-full border text-sm font-semibold transition-colors ${activeLoc === l.id ? "border-primary bg-primary/10 text-primary" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                  {l.name}
                </button>
              ))}
            </div>
          )}
          {(() => {
            const rows = team.shifts.filter(t => t.location_id === activeLoc);
            if (rows.length === 0) {
              return (
                <div className="text-center py-16 bg-slate-50/50 rounded-2xl border border-border/40">
                  <p className="text-muted-foreground text-sm font-bold">Bu hafta yayınlanmış {words.shift} yok.</p>
                </div>
              );
            }
            const today = businessToday();
            return (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {DAYS.map((dayName, dayIndex) => {
                  const dayRows = rows.filter(t => t.day === dayIndex);
                  if (dayRows.length === 0) return null;
                  const date = addDays(weekStart, dayIndex);
                  // Aynı saatteki kişiler tek grupta: "Sabah 08:00–16:00 · Ali, Ayşe"
                  const groups = new Map<string, any[]>();
                  for (const t of dayRows) {
                    const key = `${t.start_time}|${t.end_time}|${t.shift_name ?? ""}`;
                    groups.set(key, [...(groups.get(key) ?? []), t]);
                  }
                  const iWork = dayRows.some(t => t.personnel_id === user?.personnel_id);
                  return (
                    <div key={dayIndex} className={`bg-white rounded-2xl border overflow-hidden ${date === today ? "border-primary/40" : "border-slate-100"} ${date < today ? "opacity-60" : ""}`}>
                      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-800">{dayName}{date === today && <span className="text-primary"> · Bugün</span>}</span>
                        <span className="text-xs text-slate-400 font-medium">{iWork ? "Çalışıyorsunuz · " : ""}{formatDateTR(date, { weekday: false })}</span>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {[...groups.values()].map(g => (
                          <div key={g[0].id} className="px-4 py-2.5">
                            <p className="text-xs font-bold text-slate-500 tabular-nums">
                              {g[0].shift_name ? `${g[0].shift_name} · ` : ""}{g[0].start_time}–{g[0].end_time}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {g.map(t => {
                                const isMe = t.personnel_id === user?.personnel_id;
                                return (
                                  <span key={t.id} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${isMe ? "bg-primary text-white" : "bg-slate-100 text-slate-700"}`}>
                                    {isMe ? "Sen" : t.personnel_name}
                                    {t.department_name && <span className={isMe ? "text-white/70" : "text-slate-400"}>· {t.department_name}</span>}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
      {picked && (
        <Sheet open onClose={() => setPicked(null)} title={picked.label} description="Bu vardiya için ne yapmak istiyorsunuz?">
          <div className="space-y-2">
            {[
              ...(!picked.past && reqFlags.giveaway ? [{ type: "giveaway", label: "Gelemeyeceğim", hint: "Vardiya ekibe duyurulur. Biri alana kadar vardiya sizde kalır", Icon: UserX }] : []),
              ...(!picked.past && reqFlags.swap ? [{ type: "swap", label: "Biriyle değiştir", hint: "Bir arkadaşınıza vardiya değiştirmeyi teklif edin", Icon: ArrowLeftRight }] : []),
              ...(reqFlags.edit ? [{ type: "edit", label: "Saatte hata var", hint: "Sorumludan saat düzeltmesi isteyin", Icon: FileEdit }] : []),
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
            {!reqFlags.giveaway && !reqFlags.swap && !reqFlags.edit && <p className="text-sm text-slate-500">Bu işletmede vardiya talepleri kapalı. Sorumlunuzla konuşun.</p>}
          </div>
        </Sheet>
      )}
    </Page>
  );
}
