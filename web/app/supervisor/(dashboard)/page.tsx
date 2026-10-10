"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSupervisorAuth } from "@/hooks/useAuth";
import { Plus, CalendarX, Inbox, Users, UserMinus, Megaphone, ChevronRight, CalendarPlus, Clock, UserX, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListItem, ListEmpty } from "@/components/ui/List";
import { Sheet, sheetPrimaryClass, sheetDangerClass } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import NewBranchWizard from "@/components/NewBranchWizard";
import { getPlan } from "@/lib/plans";

import { openBranchPanel } from "@/lib/sessionRouting";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { CountBadge, StatusPill } from "@/components/ui/StatusPill";
import { cn } from "@/lib/utils";

type BranchStatus = {
  next_week: "published" | "draft" | "none"; today: number; pending: number;
  gaps_this_week?: number; gaps_next_week?: number; open_listings?: number;
  over_hours?: number; week_hours?: number; not_joined?: number; staff?: number; pending_by?: Record<string, number>;
};
type Filter = "" | "today" | "plan" | "pending" | "gaps" | "listings";
type Todo = { key: string; loc: string; kind: Filter | "other"; urgent: boolean; text: string; action: string; href: string; icon: typeof Plus };
const PENDING_LABEL: Record<string, string> = { leave: "izin", swap: "vardiya değiştirme", edit: "saat düzeltme", overtime: "fazla mesai" };
type Location = {
  id: string;
  name: string;
  personnel_count: number;
};

type EditRequest = {
  id: number;
  org_id: string;
  location_id: string;
  week_start: string;
  requested_by: string;
  requested_by_name: string;
  status: string;
  created_at: number;
  note?: string | null;
};

export default function SupervisorDashboard() {
  const router = useRouter();
  const { user, mounted } = useSupervisorAuth();
  const [org, setOrg]           = useState<any>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  // Şube başına tek bakış durumu (/api/branches/status): gelecek hafta planı, bugün, bekleyen onay
  const [status, setStatus] = useState<Record<string, BranchStatus>>({});
  // Özet kutusuna dokununca yapılacaklar ve şubeler o konuya süzülür
  const [filter, setFilter] = useState<Filter>("");
  // Ham şube kayıtları (Yeni Şube sihirbazı işletme türünü buradan önerir)
  const [rawLocations, setRawLocations] = useState<any[]>([]);
  // Şube eklemenin TEK yeri burası (Ayarlar'daki kopya kaldırıldı); ?new=1 ile açık gelir
  const [showAddBranch, setShowAddBranch] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") void Promise.resolve().then(() => setShowAddBranch(true));
  }, []);
  const [loading, setLoading]   = useState(true);
  const [editRequests, setEditRequests] = useState<EditRequest[]>([]);
  const [reviewingId, setReviewingId]   = useState<number | null>(null);
  const [reviewNote, setReviewNote]     = useState("");
  const [openReqId, setOpenReqId]       = useState<number | null>(null);

  // ── Onay talepleri ─────────────────────────────────────────────────────
  const loadEditRequests = async (orgId: string) => {
    try {
      const res = await fetch(`/api/schedule/edit-requests?org_id=${orgId}`);
      if (!res.ok) return;
      const data = await res.json();
      setEditRequests(Array.isArray(data) ? data : []);
    } catch {}
  };

  useEffect(() => {
    if (!mounted || !user) return;
    loadData();
    if (user.org_id) loadEditRequests(user.org_id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, user]);

  const handleReview = async (id: number, status: "approved" | "rejected") => {
    setReviewingId(id);
    try {
      await fetch("/api/schedule/edit-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, note: reviewNote || null }),
      });
      setReviewNote("");
      setEditRequests(prev => prev.filter(r => r.id !== id));
    } catch {}
    setReviewingId(null);
  };

  // ── Veri yükleme ────────────────────────────────────────────────────────
  const loadData = async () => {
    if (!user?.org_id) return;
    setLoading(true);
    try {
      // Organizasyon bilgisi
      const orgRes = await fetch(`/api/admin/organizations?id=${user.org_id}`);
      const orgData = await orgRes.json();
      if (Array.isArray(orgData) && orgData[0]) setOrg(orgData[0]);

      // Şubeler
      const locRes = await fetch(`/api/locations?org_id=${user.org_id}`);
      const locs: any[] = await locRes.json();
      if (!Array.isArray(locs)) { setLoading(false); return; }
      // Kurulumu yarıda bırakan sahip (hiç şube yok) ilk kuruluma döner
      if (locs.length === 0 && user.role === "admin") { router.replace("/onboarding"); return; }
      setRawLocations(locs);

      // Her şube için departman + personel sayısını paralel çek
      const enriched = await Promise.all(
        locs.map(async (loc) => {
          // Durum bilgisi /api/branches/status'tan (tek istek); burada sadece çalışan sayısı
          const pers = await fetch(`/api/personnel?location_id=${loc.id}`).then(r => r.json()).catch(() => []);
          return {
            id: loc.id,
            name: loc.name,
            personnel_count: Array.isArray(pers) ? pers.filter((p: any) => p.status === "active" && p.schedulable !== false).length : 0,
          };
        })
      );
      setLocations(enriched);
      const st = await fetch("/api/branches/status").then(r => r.json()).catch(() => ({}));
      if (st && typeof st === "object" && !st.error) setStatus(st);
    } catch {}
    setLoading(false);
  };

  if (!mounted) return <div className="space-y-8" />;

  // Sorunlu şubeler üstte: plan yok > taslak > eksik > onay bekleyen > hazır
  const problemScore = (id: string) => {
    const st = status[id];
    if (!st) return 0;
    return (st.next_week === "none" ? 8 : st.next_week === "draft" ? 4 : 0) + ((st.gaps_this_week ?? 0) > 0 ? 2 : 0) + (st.pending > 0 ? 1 : 0);
  };
  const all = Object.values(status);
  const sum = (f: (x: BranchStatus) => number) => all.reduce((a, x) => a + f(x), 0);
  const notReady = all.filter(x => x.next_week !== "published").length;
  const pendingTotal = sum(x => x.pending);
  const todayTotal = sum(x => x.today);
  const gapsTotal = sum(x => x.gaps_this_week ?? 0);
  const listingsTotal = sum(x => x.open_listings ?? 0);
  const staffTotal = sum(x => x.staff ?? 0);
  const locName = (id: string) => locations.find(l => l.id === id)?.name ?? id;
  const openReq = editRequests.find(r => r.id === openReqId) ?? null;
  const canEnter = user?.role === "admin" || user?.role === "supervisor";
  // Şubenin panelinde ilgili sayfayı aç (patron ve bölge sorumlusu şubeye sorumlu gibi girer)
  const enter = (locId: string, href: string) => {
    if (!canEnter) { router.push(`/supervisor/schedule?location_id=${locId}`); return; }
    openBranchPanel(user, locId);
    router.push(href);
  };
  const lateInWeek = (new Date().getDay() + 6) % 7 >= 3;

  // Bütün şubelerin yapılacakları tek listede, acil olanlar önce
  const todos: Todo[] = locations.flatMap(loc => {
    const st = status[loc.id];
    if (!st) return [];
    const out: Todo[] = [];
    if (st.next_week === "none") out.push({ key: `${loc.id}-plan`, loc: loc.id, kind: "plan", urgent: lateInWeek, icon: CalendarPlus,
      text: "Gelecek haftanın planı yok", action: "Planı oluştur", href: "/schedule?week=next" });
    else if (st.next_week === "draft") out.push({ key: `${loc.id}-draft`, loc: loc.id, kind: "plan", urgent: lateInWeek, icon: CalendarX,
      text: "Gelecek haftanın planı taslakta, ekip henüz görmüyor", action: "Plana bak", href: "/schedule?week=next" });
    if (st.pending > 0) {
      const parts = Object.entries(st.pending_by ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${PENDING_LABEL[k] ?? k}`);
      out.push({ key: `${loc.id}-pending`, loc: loc.id, kind: "pending", urgent: true, icon: Inbox,
        text: `${st.pending} talep kararınızı bekliyor${parts.length ? ` (${parts.join(", ")})` : ""}`, action: "Onaylar", href: "/requests" });
    }
    if ((st.gaps_this_week ?? 0) > 0) out.push({ key: `${loc.id}-gaps`, loc: loc.id, kind: "gaps", urgent: true, icon: UserMinus,
      text: `Bu hafta ${st.gaps_this_week} kişi eksik`, action: "Plana bak", href: "/schedule?week=this" });
    if (st.next_week !== "none" && (st.gaps_next_week ?? 0) > 0) out.push({ key: `${loc.id}-gaps2`, loc: loc.id, kind: "gaps", urgent: false, icon: UserMinus,
      text: `Gelecek hafta ${st.gaps_next_week} kişi eksik`, action: "Plana bak", href: "/schedule?week=next" });
    if ((st.open_listings ?? 0) > 0) out.push({ key: `${loc.id}-list`, loc: loc.id, kind: "listings", urgent: false, icon: Megaphone,
      text: `${st.open_listings} ilanı henüz kimse almadı`, action: "Plana bak", href: "/schedule?week=this" });
    if ((st.over_hours ?? 0) > 0) out.push({ key: `${loc.id}-over`, loc: loc.id, kind: "other", urgent: true, icon: Clock,
      text: `${st.over_hours} kişi bu hafta çalışma sınırını aşıyor`, action: "Plana bak", href: "/schedule?week=this" });
    if ((st.not_joined ?? 0) > 0) out.push({ key: `${loc.id}-join`, loc: loc.id, kind: "other", urgent: false, icon: UserX,
      text: `${st.not_joined} ekip üyesi uygulamaya henüz girmedi`, action: "Bağlantı gönder", href: "/personnel?notJoined=1" });
    return out;
  }).sort((a, b) => Number(b.urgent) - Number(a.urgent) || problemScore(b.loc) - problemScore(a.loc));
  const matches = (id: string) => {
    const st = status[id];
    if (!filter || !st) return true;
    if (filter === "today") return st.today > 0;
    if (filter === "plan") return st.next_week !== "published";
    if (filter === "pending") return st.pending > 0;
    if (filter === "gaps") return (st.gaps_this_week ?? 0) > 0 || (st.next_week !== "none" && (st.gaps_next_week ?? 0) > 0);
    return (st.open_listings ?? 0) > 0;
  };
  const shownTodos = todos.filter(t => !filter || t.kind === filter);
  const sortedLocations = [...locations].filter(l => matches(l.id))
    .sort((a, b) => filter === "today" ? (status[b.id]?.today ?? 0) - (status[a.id]?.today ?? 0) : problemScore(b.id) - problemScore(a.id));
  const pick = (f: Filter) => setFilter(cur => (cur === f ? "" : f));
  const num = (v: number) => (loading ? <span className="inline-block h-7 w-10 animate-pulse rounded-md bg-slate-100" /> : v);

  return (
    <Page className="animate-in fade-in duration-500">

      {/* Başlık */}
      <PageHeader title={org?.name ?? "Genel Bakış"}
        description={<>Hoş geldiniz, <strong>{user?.name}</strong>. {locations.length} şube{staffTotal ? `, ${staffTotal} ekip üyesi` : ""}.</>}
        actions={user?.role === "admin" && (
          <Button variant="outline" className="gap-2 w-full sm:w-auto shrink-0" onClick={() => setShowAddBranch(true)}>
            <Plus size={16} />
            Şube Ekle
          </Button>
        )} />

      {/* Özet: her kutu dokununca aşağıdaki listeleri o konuya süzer */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 sm:gap-4">
        <StatCard label="Bugün çalışan" icon={Users} value={num(todayTotal)} active={filter === "today"} onClick={() => pick("today")}
          hint="kişi vardiyada" />
        <StatCard label="Gelecek hafta" icon={CalendarX} tone={notReady ? "attention" : "positive"} value={num(notReady)} active={filter === "plan"} onClick={() => pick("plan")}
          hint={notReady ? "şubede hazır değil" : "bütün planlar hazır"} />
        <StatCard label="Onay bekleyen" icon={Inbox} tone={pendingTotal ? "attention" : "neutral"} value={num(pendingTotal)} active={filter === "pending"} onClick={() => pick("pending")}
          hint="talep" />
        <StatCard label="Bu hafta eksik" icon={UserMinus} tone={gapsTotal ? "danger" : "positive"} value={num(gapsTotal)} active={filter === "gaps"} onClick={() => pick("gaps")}
          hint="kişi" />
        <StatCard label="Alınmayan ilan" icon={Megaphone} tone={listingsTotal ? "attention" : "neutral"} value={num(listingsTotal)} active={filter === "listings"} onClick={() => pick("listings")}
          hint="açık vardiya" className="col-span-2 sm:col-span-1" />
      </div>

      {filter && (
        <button onClick={() => setFilter("")} className="-mt-2 inline-flex items-center gap-1 text-xs font-semibold text-forest-700 hover:underline">
          <X size={13} /> Süzgeci kaldır, hepsini göster
        </button>
      )}

      {/* Yapılacaklar: bütün şubeler tek listede, her madde ilgili şubenin ilgili sayfasını açar */}
      {!loading && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            Yapılacaklar {shownTodos.length > 0 && <CountBadge tone="attention" count={shownTodos.length} />}
          </h2>
          <List>
            {shownTodos.length === 0 ? <ListEmpty>{filter ? "Bu konuda yapılacak bir şey yok." : "Şu an yapılacak bir şey yok. Bütün şubeler yolunda."}</ListEmpty>
              : shownTodos.map(t => (
                <li key={t.key}>
                  <button type="button" onClick={() => enter(t.loc, t.href)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", t.urgent ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700")}>
                      <t.icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{t.text}</span>
                      <span className="block text-xs text-slate-500">{locName(t.loc)}</span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-0.5 text-xs font-semibold text-forest-700 sm:inline-flex">{t.action} <ChevronRight size={14} /></span>
                    <ChevronRight size={16} className="shrink-0 text-slate-300 sm:hidden" />
                  </button>
                </li>
              ))}
          </List>
        </section>
      )}

      {/* Bekleyen düzenleme onayları: yayınlanmış planı değiştirmek isteyen müdürler */}
      {editRequests.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            Bekleyen onaylar <CountBadge tone="attention" count={editRequests.length} />
          </h2>
          <List>
            {editRequests.map(req => (
              <ListItem key={req.id} onClick={() => { setOpenReqId(req.id); setReviewNote(""); }}
                leading={<Avatar name={req.requested_by_name ?? "?"} />}
                title={req.requested_by_name}
                subtitle={`${locName(req.location_id)} · ${req.week_start} haftasını düzenlemek istiyor`}
                trailing={<StatusPill tone="attention">Bekliyor</StatusPill>}
              />
            ))}
          </List>
        </section>
      )}

      <Sheet open={!!openReq} onClose={() => setOpenReqId(null)} title="Yayınlanmış planı düzenleme isteği"
        description={openReq ? `${openReq.requested_by_name} · ${locName(openReq.location_id)}` : undefined}
        footer={openReq && <>
          <button onClick={() => { handleReview(openReq.id, "rejected"); setOpenReqId(null); }} disabled={reviewingId === openReq.id} className={sheetDangerClass}>Reddet</button>
          <button onClick={() => { handleReview(openReq.id, "approved"); setOpenReqId(null); }} disabled={reviewingId === openReq.id} className={sheetPrimaryClass}>Onayla</button>
        </>}>
        {openReq && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">{openReq.week_start} haftasının yayınlanmış planını değiştirmek istiyor. Onaylarsan sorumlu değişiklik yapıp yeniden yayınlayabilir.</p>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Not (isteğe bağlı)</span>
              <input type="text" value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Sorumluya iletilir"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </label>
            <Link href={`/supervisor/schedule?location_id=${openReq.location_id}`} className="inline-block text-sm font-semibold text-primary hover:underline">Planı gör</Link>
          </div>
        )}
      </Sheet>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">Şubeler</h2>
        <List>
          {loading ? <ListEmpty>Yükleniyor…</ListEmpty> : locations.length === 0 ? (
            <ListEmpty action={user?.role === "admin" && (
              <button onClick={() => setShowAddBranch(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><Plus size={15} /> Şube ekle</button>
            )}>
              {user?.role === "admin" ? "Henüz şube yok." : "Size henüz şube atanmadı. Hesap sahibinden isteyin."}
            </ListEmpty>
          ) : sortedLocations.length === 0 ? <ListEmpty>Bu konuda şube yok.</ListEmpty> : sortedLocations.map(loc => {
            const st = status[loc.id];
            const plan = st?.next_week === "published" ? { label: "Gelecek hafta hazır", tone: "positive" as const }
              : st?.next_week === "draft" ? { label: "Gelecek hafta taslak", tone: "attention" as const }
              : st ? { label: "Gelecek hafta plan yok", tone: "danger" as const } : null;
            return (
              <ListItem key={loc.id}
                // Patron ve bölge müdürü şubeye girer: müdür gibi plan yapar, onaylar, ayarları yönetir
                onClick={() => enter(loc.id, "/dashboard")}
                leading={<Avatar name={loc.name} tone="brand" />}
                title={loc.name}
                subtitle={[
                  st ? `Bugün ${st.today} kişi` : null,
                  st && (st.gaps_this_week ?? 0) > 0 ? `bu hafta ${st.gaps_this_week} eksik` : null,
                  st && st.pending > 0 ? `${st.pending} onay` : null,
                  st?.week_hours ? `bu hafta ${st.week_hours.toLocaleString("tr-TR")} saat` : null,
                  `${loc.personnel_count} kişi`,
                ].filter(Boolean).join(" · ")}
                trailing={plan ? <StatusPill tone={plan.tone}>{plan.label}</StatusPill> : undefined}
              />
            );
          })}
        </List>
      </section>
      {showAddBranch && !loading && (
        <NewBranchWizard
          existing={rawLocations}
          planLimited={(() => { const max = getPlan(org?.plan).maxLocations; return max !== null && locations.length >= max; })()}
          // Liste sihirbaz kapanınca yenilenir: açıkken yenilenirse (loading) sihirbaz baştan başlar
          onClose={() => { setShowAddBranch(false); loadData(); }}
        />
      )}
    </Page>
  );
}
