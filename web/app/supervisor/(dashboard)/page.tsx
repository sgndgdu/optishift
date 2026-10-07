"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSupervisorAuth } from "@/hooks/useAuth";
import { Building2, Plus, CalendarX, Inbox } from "lucide-react";
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
  const [status, setStatus] = useState<Record<string, { next_week: "published" | "draft" | "none"; today: number; pending: number }>>({});
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

  // Sorunlu şubeler üstte: plan yok > taslak > onay bekleyen > hazır
  const problemScore = (id: string) => {
    const st = status[id];
    if (!st) return 0;
    return (st.next_week === "none" ? 4 : st.next_week === "draft" ? 2 : 0) + (st.pending > 0 ? 1 : 0);
  };
  const sortedLocations = [...locations].sort((a, b) => problemScore(b.id) - problemScore(a.id));
  const notReady = Object.values(status).filter(x => x.next_week !== "published").length;
  const pendingTotal = Object.values(status).reduce((a, x) => a + x.pending, 0);
  const locName = (id: string) => locations.find(l => l.id === id)?.name ?? id;
  const openReq = editRequests.find(r => r.id === openReqId) ?? null;

  return (
    <Page className="animate-in fade-in duration-500">

      {/* Başlık */}
      <PageHeader title={org?.name ?? "Genel Bakış"}
        description={<>Hoş geldiniz, <strong>{user?.name}</strong>. Tüm şubelerinizin özeti aşağıda.</>}
        actions={user?.role === "admin" && (
          <Button variant="outline" className="gap-2 w-full sm:w-auto shrink-0" onClick={() => setShowAddBranch(true)}>
            <Plus size={16} />
            Şube Ekle
          </Button>
        )} />

      {/* Özet sayılar */}
      {/* Özet: "neresi yanıyor?" sorusunun cevabı (eskiden şube/departman/personel sayısıydı) */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: "Şube", value: locations.length, icon: Building2, tone: "neutral" as const },
          { label: "Yayınlanmamış", value: notReady, icon: CalendarX, tone: notReady > 0 ? "attention" as const : "positive" as const },
          { label: "Onay", value: pendingTotal, icon: Inbox, tone: pendingTotal > 0 ? "attention" as const : "neutral" as const },
        ].map(({ label, value, icon, tone }) => (
          <StatCard key={label} label={label} icon={icon} tone={tone}
            value={loading ? <span className="inline-block h-7 w-10 bg-slate-100 rounded-md animate-pulse" /> : value} />
        ))}
      </div>

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
          ) : sortedLocations.map(loc => {
            const st = status[loc.id];
            const plan = st?.next_week === "published" ? { label: "Hazır", tone: "positive" as const }
              : st?.next_week === "draft" ? { label: "Taslak", tone: "attention" as const }
              : st ? { label: "Plan yok", tone: "danger" as const } : null;
            const canEnter = user?.role === "admin" || user?.role === "supervisor";
            return (
              <ListItem key={loc.id}
                // Patron ve bölge müdürü şubeye girer: müdür gibi plan yapar, onaylar, ayarları yönetir
                onClick={() => { if (canEnter) { openBranchPanel(user, loc.id); router.push("/dashboard"); } else router.push(`/supervisor/schedule?location_id=${loc.id}`); }}
                leading={<Avatar name={loc.name} tone="brand" />}
                title={loc.name}
                subtitle={[
                  st ? `Bugün ${st.today} kişi vardiyada` : null,
                  st && st.pending > 0 ? `${st.pending} onay bekliyor` : null,
                  `${loc.personnel_count} kişi`,
                ].filter(Boolean).join(" · ")}
                trailing={plan ? <StatusPill tone={plan.tone}>{plan.label}</StatusPill> : undefined}
              />
            );
          })}
        </List>
        {locations.length > 0 && <p className="text-xs text-slate-500">Rozet gelecek haftanın planını gösterir (Hazır / Taslak / Plan yok). Şubeye dokununca o şubenin paneline girersiniz.</p>}
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
