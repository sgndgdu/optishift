"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, RefreshCcw, Users, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function getWeekStart(offset: number): string {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7) + offset * 7);
  return monday.toISOString().split("T")[0];
}

export default function PortalCalendar() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [weekOffset, setWeekOffset] = useState(0);
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchShifts = async (personnelId: string, offset: number) => {
    setLoading(true);
    try {
      const weekStart = getWeekStart(offset);
      const res = await fetch(`/api/shifts?personnel_id=${personnelId}&week_start=${weekStart}`);
      if (res.ok) {
        const data = await res.json();
        setShifts(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_portal_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed) setUser(parsed);
      setMounted(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!mounted) return;
    if (!user) router.push("/login");
  }, [mounted, user, router]);

  useEffect(() => {
    if (user && user.personnel_id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchShifts(user.personnel_id, weekOffset);
    }
  }, [user, weekOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return <div className="space-y-4" />;

  const getWeekLabel = () => {
    if (weekOffset === -1) return "Geçen Hafta";
    if (weekOffset === 0) return "Bu Hafta";
    if (weekOffset === 1) return "Gelecek Hafta";
    return `${weekOffset > 0 ? '+' : ''}${weekOffset} Hafta`;
  };

  const getDayName = (dayIndex: number) => {
    const days = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
    return days[dayIndex];
  };

  return (
    <div className="p-5 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Vardiyalarım</h1>
          <p className="text-sm text-slate-500 mt-1">{getWeekLabel()}</p>
        </div>
      </div>

      {/* Hafta Navigasyonu */}
      <Card className="stripe-card rounded-[1.25rem] border-0">
        <CardContent className="p-1.5 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWeekOffset(prev => prev - 1)}
            className="text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl h-10 w-10"
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </Button>
          <span className="text-sm font-bold text-slate-800 bg-slate-50/80 px-4 py-2 rounded-xl border border-border/40 shadow-sm">
            {getWeekLabel()} — {getWeekStart(weekOffset)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWeekOffset(prev => prev + 1)}
            className="text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl h-10 w-10"
          >
            <ChevronRight size={20} strokeWidth={2.5} />
          </Button>
        </CardContent>
      </Card>

      <div className="flex bg-slate-100/80 p-1.5 rounded-[1.25rem] border border-border/40 shadow-inner">
        <button
          onClick={() => setTab("mine")}
          className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 ${tab === "mine" ? "bg-white text-primary shadow-sm border border-border/40" : "text-muted-foreground hover:text-foreground"}`}
        >
          Benim Vardiyalarım
        </button>
        <button
          onClick={() => setTab("all")}
          className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 ${tab === "all" ? "bg-white text-primary shadow-sm border border-border/40" : "text-muted-foreground hover:text-foreground"}`}
        >
          Tüm Şube
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4 pt-4">
          <div className="h-28 bg-slate-100 rounded-2xl w-full"></div>
          <div className="h-28 bg-slate-100 rounded-2xl w-full"></div>
        </div>
      ) : tab === "mine" ? (
        <div className="relative pl-6 border-l-2 border-primary/20 space-y-8 py-4 ml-2">
          {shifts.length === 0 ? (
             <div className="text-center py-12 text-muted-foreground font-semibold text-sm">
               Bu hafta için atanmış bir vardiyanız yok.
             </div>
          ) : (
            [0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
              const shift = shifts.find((s: any) => s.day === dayIndex);
              const isOff = !shift;

              return (
                <div key={dayIndex} className="relative group">
                  {/* Timeline Noktası */}
                  <div className={`absolute -left-[35px] top-5 w-4 h-4 rounded-full border-[3px] border-slate-50 shadow-sm transition-transform duration-300 group-hover:scale-125 ${isOff ? "bg-slate-300" : "bg-primary"}`}></div>

                  <Card className={`rounded-[1.5rem] border-0 transition-all duration-300 ${isOff ? "bg-slate-50/50" : "stripe-card"}`}>
                    <CardContent className="p-5">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <div className={`font-black text-sm mb-3 tracking-tight ${isOff ? "text-slate-400" : "text-slate-800"}`}>
                            {getDayName(dayIndex)}
                          </div>

                          {!isOff ? (
                            <>
                              <div className="flex flex-wrap items-center gap-2 mb-3">
                                <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/15 font-bold px-3 py-1 flex items-center gap-1.5 border-primary/20">
                                  <Clock size={12} strokeWidth={3} /> {shift.start_time || "09:00"} - {shift.end_time || "17:00"}
                                </Badge>
                                <Badge className="font-bold px-3 py-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200">
                                  {shift.shift_id === "custom" ? "Özel" : shift.shift_id}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-50 px-3.5 py-2 rounded-xl border border-border/40 inline-flex">
                                <MapPin size={14} className="text-primary"/>
                                {shift.location_name || "Bilinmeyen Şube"}
                              </div>
                            </>
                          ) : (
                            <div className="text-muted-foreground text-sm font-semibold italic flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                              Haftalık İzin / Atanmadı
                            </div>
                          )}
                        </div>

                        {!isOff && (
                          <Button
                            variant="outline"
                            size="icon"
                            className="text-slate-400 hover:text-primary hover:bg-primary/5 hover:border-primary/20 transition-colors shrink-0 bg-white border-border/40 shadow-sm rounded-xl h-10 w-10"
                            title="Vardiya Değişimi İste"
                            onClick={() => router.push('/portal/requests')}
                          >
                            <RefreshCcw size={16} strokeWidth={2.5} />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="text-center py-16 bg-slate-50/50 rounded-[2rem] border border-border/40">
           <Users size={40} className="mx-auto text-slate-300 mb-4" />
           <p className="text-muted-foreground text-sm font-bold">Tüm şube vardiyaları yakında eklenecek.</p>
        </div>
      )}
    </div>
  );
}
