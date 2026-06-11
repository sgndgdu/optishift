"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarClock, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function addWeeks(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().split("T")[0];
}

function weekDates(weekStart: string): string[] {
  const d = new Date(weekStart + "T00:00:00");
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(d);
    dd.setDate(d.getDate() + i);
    return dd.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  });
}

export default function SupervisorSchedulePage() {
  return <Suspense><SupervisorScheduleInner /></Suspense>;
}

function SupervisorScheduleInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocId, setSelectedLocId] = useState<string>("");
  const [weekStart, setWeekStart] = useState<string>(getWeekStart(new Date()));
  const [personnel, setPersonnel] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);


  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_supervisor_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed) setUser(parsed);
      setMounted(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!mounted) return;
    if (!user) { router.push("/login"); return; }
    if (user.role !== "supervisor" && user.role !== "admin") { router.push("/login"); return; }

    fetch(`/api/locations?org_id=${user.org_id}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setLocations(data);
          const qLoc = searchParams.get("location_id");
          setSelectedLocId(qLoc && data.find((l: any) => l.id === qLoc) ? qLoc : (data[0]?.id ?? ""));
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, user]);

  useEffect(() => {
    if (!selectedLocId) return;
    (async () => {
      setLoading(true);
      try {
        const [pRes, sRes] = await Promise.all([
          fetch(`/api/personnel?location_id=${selectedLocId}`),
          fetch(`/api/shifts?location_id=${selectedLocId}&week_start=${weekStart}`),
        ]);
        const pData = await pRes.json();
        const sData = await sRes.json();
        setPersonnel(Array.isArray(pData) ? pData : []);
        setShifts(Array.isArray(sData) ? sData : []);
      } catch {}
      setLoading(false);
    })();
  }, [selectedLocId, weekStart]);

  const shiftMap: Record<string, Record<number, any>> = {};
  shifts.forEach(s => {
    if (!shiftMap[s.personnel_id]) shiftMap[s.personnel_id] = {};
    shiftMap[s.personnel_id][s.day] = s;
  });

  const dates = weekDates(weekStart);
  const activePersonnel = personnel.filter(p => p.status === "active");

  if (!mounted) return <div className="space-y-6" />;

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Vardiya Planı</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Şube bazlı vardiya görüntüleyici</p>
        </div>
        <Badge className="shrink-0 sm:mt-1.5 bg-slate-100 text-slate-500 border border-slate-200 font-semibold px-3 py-1 text-xs rounded-lg w-fit">
          Salt Okunur Görünüm
        </Badge>
      </div>

      {/* Kontroller */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Şube seçici */}
        <div className="relative flex-1 sm:flex-none min-w-[140px]">
          <select
            value={selectedLocId}
            onChange={e => setSelectedLocId(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-violet-500 appearance-none cursor-pointer"
          >
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>

        {/* Hafta navigasyon */}
        <div className="flex items-center gap-1 bg-white border-2 border-slate-200 rounded-xl overflow-hidden flex-1 sm:flex-none">
          <button
            onClick={() => setWeekStart(prev => addWeeks(prev, -1))}
            className="p-2.5 hover:bg-slate-50 text-slate-600 transition-colors shrink-0"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="px-2 sm:px-4 text-xs sm:text-sm font-bold text-slate-800 whitespace-nowrap flex-1 text-center">
            {weekStart}
          </span>
          <button
            onClick={() => setWeekStart(prev => addWeeks(prev, 1))}
            className="p-2.5 hover:bg-slate-50 text-slate-600 transition-colors shrink-0"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <button
          onClick={() => setWeekStart(getWeekStart(new Date()))}
          className="px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-bold text-violet-600 bg-violet-50 border border-violet-100 rounded-xl hover:bg-violet-100 transition-colors"
        >
          Bu Hafta
        </button>

        <a
          href={selectedLocId ? `/api/export/schedule?location_id=${selectedLocId}&week_start=${weekStart}` : "#"}
          download
          className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors sm:ml-auto"
        >
          <Download size={13} />
          Excel
        </a>
      </div>

      {/* Tablo */}
      <Card className="stripe-card border-0 shadow-none overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-slate-50/50 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-violet-100 rounded-xl text-violet-600">
              <CalendarClock size={18} />
            </div>
            <CardTitle className="text-base font-bold">
              {locations.find(l => l.id === selectedLocId)?.name ?? "Şube"}
            </CardTitle>
            <Badge variant="secondary">{activePersonnel.length} personel</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : activePersonnel.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <CalendarClock size={32} className="mx-auto mb-3 text-slate-300" />
              <p className="font-semibold">Bu şubede henüz personel yok.</p>
            </div>
          ) : (
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider w-40">
                    Personel
                  </th>
                  {DAYS.map((d, i) => (
                    <th key={d} className="text-center py-3 px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <span>{d}</span>
                      <span className="block text-[10px] font-normal text-slate-400 mt-0.5">{dates[i]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {activePersonnel.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-600 font-bold text-xs flex items-center justify-center shrink-0">
                          {p.name.charAt(0)}
                        </div>
                        <span className="text-sm font-semibold text-slate-800 truncate max-w-[100px]">{p.name}</span>
                      </div>
                    </td>
                    {Array.from({ length: 7 }, (_, day) => {
                      const shift = shiftMap[p.id]?.[day];
                      return (
                        <td key={day} className="py-3 px-2 text-center cursor-default select-none">
                          {shift ? (
                            <div className={cn(
                              "inline-flex flex-col items-center px-2.5 py-1.5 rounded-lg text-xs font-bold leading-tight",
                              shift.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                              shift.status === "absent"    ? "bg-red-100 text-red-700" :
                              "bg-violet-100 text-violet-700"
                            )}>
                              <span>{shift.start_time ?? "—"}</span>
                              <span className="text-[10px] font-normal opacity-70">{shift.end_time ?? ""}</span>
                            </div>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
