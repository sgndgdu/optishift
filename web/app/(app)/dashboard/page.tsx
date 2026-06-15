"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useRef } from "react";
import { Users, CalendarCheck, AlertTriangle, TrendingUp, Clock, Check, X, ArrowRight, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [personnel, setPersonnel] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [todayShifts, setTodayShifts] = useState<any[]>([]);
  const [openShifts, setOpenShifts] = useState<any[]>([]);
  const [availMissing, setAvailMissing] = useState<any[]>([]);
  const [publishLead, setPublishLead] = useState<number | null>(null);
  const [remindState, setRemindState] = useState<"idle" | "sending" | "sent">("idle");
  const [nextWeekPublished, setNextWeekPublished] = useState(true);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const lateAutoCreated = useRef<Set<number>>(new Set());

  const getTodayWeekStart = () => {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  };
  const todayIdx = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();

  // Planlama hedefi: gelecek haftanın pazartesi tarihi
  const getNextWeekStart = () => {
    const [y, mo, d] = getTodayWeekStart().split("-").map(Number);
    const nextMonday = new Date(y, mo - 1, d + 7);
    return `${nextMonday.getFullYear()}-${String(nextMonday.getMonth() + 1).padStart(2, "0")}-${String(nextMonday.getDate()).padStart(2, "0")}`;
  };

  const loadData = async (u: typeof user) => {
    setLoading(true);
    try {
      const weekStart = getTodayWeekStart();
      const [personnelRes, leaveRes, shiftsRes, openShiftsRes, availRes, nextShiftsRes, publishStatsRes] = await Promise.all([
        fetch(`/api/personnel?location_id=${u.location_id}`),
        fetch(`/api/leave-requests?location_id=${u.location_id}`),
        fetch(`/api/shifts?location_id=${u.location_id}&week_start=${weekStart}`),
        fetch(`/api/open-shifts?location_id=${u.location_id}`),
        fetch(`/api/availability/team?location_id=${u.location_id}&week_start=${getNextWeekStart()}`),
        fetch(`/api/shifts?location_id=${u.location_id}&week_start=${getNextWeekStart()}`),
        fetch(`/api/schedule/publish-stats?location_id=${u.location_id}`),
      ]);
      const personnelData = await personnelRes.json();
      const leaveData = await leaveRes.json();
      const shiftsData = await shiftsRes.json();
      const openShiftsData = await openShiftsRes.json();
      const availData = await availRes.json();
      const nextShiftsData = await nextShiftsRes.json();
      const publishStatsData = await publishStatsRes.json();

      setPersonnel(Array.isArray(personnelData) ? personnelData : []);
      setLeaveRequests(Array.isArray(leaveData) ? leaveData.filter((l: any) => l.status === "pending") : []);
      setTodayShifts(Array.isArray(shiftsData) ? shiftsData.filter((s: any) => s.day === todayIdx) : []);
      setOpenShifts(Array.isArray(openShiftsData) ? openShiftsData : []);
      setAvailMissing(Array.isArray(availData?.personnel) ? availData.personnel.filter((p: any) => !p.submitted) : []);
      setNextWeekPublished(
        Array.isArray(nextShiftsData) &&
        nextShiftsData.some((s: any) => !s.publication_status || s.publication_status === "published")
      );
      setPublishLead(typeof publishStatsData?.avg_lead_days === "number" ? publishStatsData.avg_lead_days : null);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };


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
    if (!user.location_id) { router.push("/onboarding"); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData(user);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, user, router]);

  // Dakikada bir "now" güncelle (geç kalan tespiti için) + 60 sn'de bir canlı operasyon yenile
  useEffect(() => {
    const tickClock = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tickClock);
  }, []);

  useEffect(() => {
    if (!user?.location_id) return;
    const refreshShifts = setInterval(async () => {
      try {
        const weekStart = getTodayWeekStart();
        const res = await fetch(`/api/shifts?location_id=${user.location_id}&week_start=${weekStart}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setTodayShifts(data.filter((s: any) => s.day === todayIdx));
        }
      } catch {}
    }, 60_000);
    return () => clearInterval(refreshShifts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.location_id]);

  const handleLeaveAction = async (id: number, action: "approved" | "rejected") => {
    if (!user) return;
    await fetch(`/api/leave-requests/review?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: action, reviewed_by: user.personnel_id }),
    });
    setLeaveRequests(prev => prev.filter(l => l.id !== id));
  };

  // Gelecek hafta müsaitliğini girmeyenlere hatırlatma bildirimi gönder
  const handleRemindAvailability = async () => {
    if (!user?.location_id || remindState !== "idle") return;
    setRemindState("sending");
    try {
      await fetch("/api/availability/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: user.location_id, week_start: getNextWeekStart() }),
      });
      setRemindState("sent");
    } catch {
      setRemindState("idle");
    }
  };

  // Vardiya başlangıcından 30 dk geçmiş, henüz check-in yok → geç kalan
  const isLate = (s: any): boolean => {
    if (s.check_in_at || !s.start_time) return false;
    const [h, m] = s.start_time.split(":").map(Number);
    const shiftStartMin = h * 60 + m;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return nowMin >= shiftStartMin + 30;
  };

  // Geç kalan vardiyalar için otomatik açık vardiya oluştur (tek seferlik)
  const autoCreateOpenShift = async (s: any) => {
    if (lateAutoCreated.current.has(s.id) || !user?.location_id) return;
    lateAutoCreated.current.add(s.id);
    const _d = new Date(); const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,"0")}-${String(_d.getDate()).padStart(2,"0")}`;
    try {
      await fetch("/api/open-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: user.location_id,
          date: today,
          start_time: s.start_time,
          end_time: s.end_time,
          note: `Otomatik: ${s.personnel_id} check-in yapmadı`,
          hero_bonus_multiplier: 1.5,
        }),
      });
      // Açık vardiya sayısını güncelle
      setOpenShifts(prev => [...prev, { status: "open", id: Date.now() }]);
    } catch {}
  };

  if (!mounted || !user) return <div className="space-y-8" />;

  const activeCount = personnel.filter(p => p.status === "active").length;
  const scores = personnel.map(p => p.prev_score ?? 0);
  const maxScore = Math.max(...scores, 1);

  const openCount = openShifts.filter((s: any) => s.status === "open").length;
  const kpi = [
    { label: "Toplam Personel",      value: String(activeCount), sub: `${personnel.length} kayıtlı`,     icon: Users,         color: "text-indigo-600", bg: "bg-indigo-100",  href: "/personnel" },
    { label: "Bekleyen İzin",        value: String(leaveRequests.length), sub: "Onay bekliyor",           icon: Clock,         color: "text-orange-600", bg: "bg-orange-100", href: "/requests" },
    { label: "Açık Vardiya",         value: String(openCount), sub: openCount > 0 ? `${openCount} açık slot` : "Tüm slotlar dolu", icon: CalendarCheck, color: "text-emerald-600", bg: "bg-emerald-100", href: "/open-shifts" },
    { label: "Puan Ortalaması",      value: scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : "—", sub: "Adalet skoru", icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-100", href: "/fairness" },
    // Yayın öncülüğü: program ortalama kaç gün önceden yayınlanıyor (OPTI-023)
    {
      label: "Yayın Öncülüğü",
      value: publishLead === null ? "—" : `${publishLead.toLocaleString("tr-TR")} gün`,
      sub: publishLead === null ? "Henüz yayın verisi yok"
        : publishLead >= 7 ? "Harika — tam hafta önceden"
        : publishLead >= 3 ? "İyi — daha erken hedefleyin"
        : "Geç — personel plan yapamıyor",
      icon: CalendarCheck,
      color: publishLead === null ? "text-slate-500" : publishLead >= 7 ? "text-emerald-600" : publishLead >= 3 ? "text-amber-600" : "text-red-600",
      bg: publishLead === null ? "bg-slate-100" : publishLead >= 7 ? "bg-emerald-100" : publishLead >= 3 ? "bg-amber-100" : "bg-red-100",
      href: "/schedule",
    },
  ] as { label: string; value: string | number; sub: string; icon: any; color: string; bg: string; href?: string }[];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Hoş geldiniz, <strong>{user.name}</strong> 👋
          </p>
        </div>
        <Button onClick={() => router.push("/open-shifts?new=1")} className="shrink-0 font-bold">
          <CalendarCheck size={16} className="mr-2" /> Açık Vardiya Oluştur
        </Button>
      </div>

      {/* KPI Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 lg:gap-6">
        {kpi.map(({ label, value, sub, icon: Icon, color, bg, href }) => (
          <Card
            key={label}
            onClick={href ? () => router.push(href) : undefined}
            className={`stripe-card group border-0 shadow-none ${href ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2.5 rounded-xl ${bg} ${color}`}>
                  <Icon size={20} />
                </div>
                {href && <ArrowRight size={15} className="text-slate-300 group-hover:text-slate-500 transition-colors" />}
              </div>
              <div>
                <div className="text-3xl font-black text-slate-900 tracking-tight">{loading ? "—" : value}</div>
                <div className="text-sm font-semibold text-slate-600 mt-1">{label}</div>
                <div className="text-xs text-muted-foreground mt-1">{sub}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Cuma'dan itibaren: gelecek haftanın planı hâlâ yayınlanmadıysa uyar */}
      {!loading && !nextWeekPublished && [5, 6, 0].includes(now.getDay()) && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-red-200 bg-red-50">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <AlertTriangle size={18} className="text-red-600 shrink-0" />
            <div className="min-w-0">
              <span className="text-sm font-bold text-red-800">Gelecek haftanın planı henüz yayınlanmadı</span>
              <p className="text-xs text-red-700">Personel önümüzdeki haftanın vardiyalarını göremiyor.</p>
            </div>
          </div>
          <Button
            onClick={() => router.push("/schedule")}
            variant="outline"
            size="sm"
            className="shrink-0 border-red-300 text-red-800 hover:bg-red-100"
          >
            Plana Git <ArrowRight size={14} className="ml-1.5" />
          </Button>
        </div>
      )}

      {/* Gelecek hafta müsaitlik girmeyenler */}
      {!loading && availMissing.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
            <div className="min-w-0">
              <span className="text-sm font-bold text-amber-800">
                Gelecek hafta için müsaitlik girmeyen: {availMissing.length} kişi
              </span>
              <p className="text-xs text-amber-700 truncate">
                {availMissing.map((p: any, i: number) => (
                  <span key={p.id ?? i}>
                    {i > 0 && ", "}
                    <Link href="/personnel" className="font-semibold hover:underline">{p.name}</Link>
                  </span>
                ))}
              </p>
            </div>
          </div>
          <Button
            onClick={handleRemindAvailability}
            disabled={remindState !== "idle"}
            variant="outline"
            size="sm"
            className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
          >
            {remindState === "sent" ? <><Check size={14} className="mr-1.5" />Hatırlatma gönderildi</>
              : remindState === "sending" ? "Gönderiliyor…"
              : "Hatırlatma Gönder"}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* İzin Talepleri */}
        <Card className="flex flex-col stripe-card border-0 shadow-none">
          <CardHeader className="border-b border-border/40 bg-slate-50/50 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-orange-100 rounded-xl text-orange-600">
                  <Clock size={18} />
                </div>
                <CardTitle className="text-base font-bold">Bekleyen Talepler</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={leaveRequests.length > 0 ? "warning" : "secondary"}>
                  {leaveRequests.length} Talep
                </Badge>
                <Link href="/requests" className="text-xs text-primary font-bold hover:underline flex items-center gap-0.5">
                  Tümü <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-5 space-y-3">
            {loading ? (
              <div className="space-y-3">
                {[1,2].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
              </div>
            ) : leaveRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <Check size={32} className="text-slate-300 mb-3" />
                <p className="text-sm font-semibold">Tüm talepler yanıtlandı.</p>
              </div>
            ) : (
              leaveRequests.map(req => (
                <div key={req.id} className="group flex items-center justify-between p-4 rounded-xl border border-slate-200/60 bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all">
                  <div>
                    <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <Link href="/personnel" className="hover:underline hover:text-primary transition-colors">
                        {req.personnel_name ?? req.personnel_id}
                      </Link>
                    </div>
                    <div className="text-xs text-slate-500 font-medium mt-1 bg-slate-50 px-2.5 py-1 rounded-md inline-block border border-slate-100">
                      {req.start_date} → {req.end_date} <span className="font-bold text-slate-400 mx-1">|</span> {req.days} gün
                    </div>
                    {req.note && <div className="text-xs text-slate-400 mt-2 italic">&quot;{req.note}&quot;</div>}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleLeaveAction(req.id, "approved")} variant="outline" size="icon" className="h-9 w-9 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200">
                      <Check size={18} />
                    </Button>
                    <Button onClick={() => handleLeaveAction(req.id, "rejected")} variant="outline" size="icon" className="h-9 w-9 text-rose-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200">
                      <X size={18} />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Personel Puanları */}
        <Card className="flex flex-col stripe-card border-0 shadow-none">
          <CardHeader className="border-b border-border/40 bg-slate-50/50 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 flex-1">
                <div className="p-2 bg-indigo-100 rounded-xl text-primary">
                  <TrendingUp size={18} />
                </div>
                <CardTitle className="text-base font-bold">Adalet Skoru Dağılımı</CardTitle>
              </div>
              <Link href="/fairness" className="text-xs text-primary font-bold hover:underline flex items-center gap-0.5 shrink-0">
                Tümü <ArrowRight size={12} />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            {loading ? (
              <div className="space-y-4">
                {[1,2,3,4].map(i => <div key={i} className="h-4 bg-slate-100 rounded-md animate-pulse" />)}
              </div>
            ) : personnel.filter(p => p.status === "active").length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">
                Henüz personel yok.<br />
                <a href="/personnel" className="text-primary hover:underline font-bold mt-2 inline-block">Personel ekle →</a>
              </p>
            ) : (
              <div className="space-y-4">
                {personnel.filter(p => p.status === "active").slice(0, 6).map(p => {
                  const score = p.prev_score ?? 0;
                  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
                  return (
                    <div key={p.id} className="flex items-center gap-4 group">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                        {p.name.charAt(0)}
                      </div>
                      <Link href="/personnel" className="w-24 text-sm font-semibold text-slate-700 truncate hover:text-primary hover:underline transition-colors">{p.name.split(" ")[0]}</Link>
                      <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div className="bg-primary h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-sm font-bold text-slate-700 w-12 text-right">{score}p</div>
                    </div>
                );
              })}
            </div>
          )}
          </CardContent>
        </Card>
      </div>

      {/* Canlı Operasyon — Bugün */}
      {todayShifts.length > 0 && (() => {
        const checkedIn  = todayShifts.filter(s => s.check_in_at && !s.check_out_at);
        const checkedOut = todayShifts.filter(s => s.check_out_at);
        const lateShifts = todayShifts.filter(s => !s.check_in_at && isLate(s));
        const waiting    = todayShifts.filter(s => !s.check_in_at && !isLate(s));

        // Geç kalanlar için açık vardiya oluştur
        lateShifts.forEach(s => autoCreateOpenShift(s));

        return (
          <Card className="stripe-card border-0 shadow-none">
            <CardHeader className="border-b border-border/40 bg-slate-50/50 pb-4">
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="p-2 bg-emerald-100 rounded-xl text-emerald-600 shrink-0">
                  <Users size={18} />
                </div>
                <CardTitle className="text-base font-bold">Canlı Operasyon — Bugün</CardTitle>
                {lateShifts.length > 0 && (
                  <Badge className="bg-red-100 text-red-700 border-red-200 font-bold">
                    <AlertTriangle size={11} className="mr-1" />{lateShifts.length} Geç
                  </Badge>
                )}
                <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                  <RefreshCw size={11} />
                  {now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>

              {/* Özet satırı */}
              <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border/30">
                {[
                  { label: "Beklenen", value: todayShifts.length, color: "text-slate-600" },
                  { label: "Aktif",    value: checkedIn.length,   color: "text-emerald-600" },
                  { label: "Çıktı",   value: checkedOut.length,   color: "text-slate-400" },
                  { label: "Bekliyor",value: waiting.length,      color: "text-amber-600" },
                  { label: "Geç",     value: lateShifts.length,   color: "text-red-600" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className={`text-sm font-black ${color}`}>{value}</span>
                    <span className="text-xs text-slate-400 font-medium">{label}</span>
                  </div>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {todayShifts.map((s: any) => {
                  const p           = personnel.find(px => px.id === s.personnel_id);
                  const isCheckedIn  = !!s.check_in_at;
                  const isCheckedOut = !!s.check_out_at;
                  const late         = isLate(s);
                  return (
                    <Link key={s.id} href="/personnel" className={`flex items-center gap-3 p-3.5 rounded-xl border transition-colors hover:shadow-sm ${
                      isCheckedOut ? "bg-slate-50 border-slate-100" :
                      isCheckedIn  ? "bg-emerald-50 border-emerald-200" :
                      late         ? "bg-red-50 border-red-200" :
                                     "bg-white border-slate-200"
                    }`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        isCheckedOut ? "bg-slate-200 text-slate-500" :
                        isCheckedIn  ? "bg-emerald-500 text-white" :
                        late         ? "bg-red-500 text-white" :
                                       "bg-amber-100 text-amber-700"
                      }`}>
                        {isCheckedOut ? <X size={14} /> : isCheckedIn ? <Check size={14} /> : late ? <AlertTriangle size={14} /> : <Clock size={14} />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-800 truncate">{p?.name ?? s.personnel_id}</div>
                        <div className="text-xs text-slate-500">{s.start_time}–{s.end_time}
                          {isCheckedOut && <span className="ml-1 text-slate-400">• Çıktı</span>}
                          {isCheckedIn && !isCheckedOut && <span className="ml-1 text-emerald-600 font-semibold">• Aktif</span>}
                          {!isCheckedIn && late && <span className="ml-1 text-red-600 font-semibold">• Geç geldi</span>}
                          {!isCheckedIn && !late && <span className="ml-1 text-amber-600">• Bekleniyor</span>}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Hızlı Eylemler — Onboarding */}
      {!loading && personnel.filter(p => p.status === "active").length <= 1 && (
        <Card className="bg-gradient-to-r from-indigo-50/50 to-purple-50/50 border-indigo-100/50 shadow-none">
          <CardContent className="p-6">
            <h2 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
              <span>🚀</span> Başlangıç Rehberi
            </h2>
            <p className="text-muted-foreground text-sm mb-5">Sistemi kullanmaya başlamak için şu adımları tamamlayın:</p>
            <div className="space-y-3">
              {[
                { step: "1", label: "Personel ekleyin", href: "/personnel", done: personnel.length > 1 },
                { step: "2", label: "Personellerden müsaitlik toplayın", href: "/schedule", done: false },
                { step: "3", label: "Vardiya planı oluşturun", href: "/schedule", done: false },
              ].map(({ step, label, href, done }) => (
                <a key={step} href={href} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${done ? "bg-emerald-50/50 border-emerald-100" : "bg-white border-slate-200 hover:border-primary/30 hover:shadow-sm"}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${done ? "bg-emerald-500 text-white shadow-sm" : "bg-primary/10 text-primary"}`}>
                    {done ? <Check size={14} /> : step}
                  </div>
                  <span className={`text-sm font-semibold ${done ? "text-emerald-700 line-through opacity-80" : "text-slate-800"}`}>{label}</span>
                  {!done && (
                    <div className="ml-auto flex items-center gap-1 text-primary text-xs font-bold">
                      Git <ArrowRight size={14} />
                    </div>
                  )}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
