"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSupervisorAuth } from "@/hooks/useAuth";
import { Building2, Users, Plus, Layers } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListItem, ListEmpty } from "@/components/ui/List";
import { Sheet, sheetPrimaryClass, sheetDangerClass } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/button";
import Link from "next/link";

import { formatPublishLead } from "@/lib/publishLead";
import { getWeekStart } from "@/lib/date";
import { openBranchPanel } from "@/lib/sessionRouting";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { CountBadge, StatusPill } from "@/components/ui/StatusPill";
type Location = {
  id: string;
  name: string;
  dept_count: number;
  personnel_count: number;
  publish_lead: number | null;
  /** Gelecek haftanın planı yayınlandı mı (ortalama 3 hafta birikmeden de durum gösterilir) */
  next_published: boolean;
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

      // Her şube için departman + personel sayısını paralel çek
      const enriched = await Promise.all(
        locs.map(async (loc) => {
          const [depts, pers, pubStats] = await Promise.all([
            fetch(`/api/departments?location_id=${loc.id}`).then(r => r.json()).catch(() => []),
            fetch(`/api/personnel?location_id=${loc.id}`).then(r => r.json()).catch(() => []),
            fetch(`/api/schedule/publish-stats?location_id=${loc.id}`).then(r => r.json()).catch(() => null),
          ]);
          return {
            id: loc.id,
            name: loc.name,
            dept_count: Array.isArray(depts) ? depts.length : 0,
            personnel_count: Array.isArray(pers) ? pers.filter((p: any) => p.status === "active").length : 0,
            publish_lead: typeof pubStats?.avg_lead_days === "number" ? pubStats.avg_lead_days : null,
            next_published: Array.isArray(pubStats?.weeks) && pubStats.weeks.some((w: { week_start: string }) => w.week_start === getWeekStart(1)),
          };
        })
      );
      setLocations(enriched);
    } catch {}
    setLoading(false);
  };

  if (!mounted) return <div className="space-y-8" />;

  const totalDepts      = locations.reduce((s, l) => s + l.dept_count, 0);
  const locName = (id: string) => locations.find(l => l.id === id)?.name ?? id;
  const openReq = editRequests.find(r => r.id === openReqId) ?? null;
  const totalPersonnel  = locations.reduce((s, l) => s + l.personnel_count, 0);

  return (
    <Page className="animate-in fade-in duration-500">

      {/* Başlık */}
      <PageHeader title={org?.name ?? "Genel Bakış"}
        description={<>Hoş geldiniz, <strong>{user?.name}</strong>. Tüm şubelerinizin özeti aşağıda.</>}
        actions={user?.role === "admin" && (
          <Link href="/supervisor/settings?new=1" className="shrink-0">
            <Button variant="outline" className="gap-2 w-full sm:w-auto">
              <Plus size={16} />
              Şube Ekle
            </Button>
          </Link>
        )} />

      {/* Özet sayılar */}
      <div className={`grid gap-3 sm:gap-4 ${totalDepts > 0 ? "grid-cols-3" : "grid-cols-2"}`}>
        {[
          { label: "Şube",       value: locations.length, icon: Building2, href: "/supervisor" },
          // Departman bilinçli olarak isteğe bağlı: hiç yoksa "0" kutusu gösterilmez
          ...(totalDepts > 0 ? [{ label: "Departman", value: totalDepts, icon: Layers }] : []),
          { label: "Personel",   value: totalPersonnel,    icon: Users,     href: "/supervisor/personnel" },
        ].map(({ label, value, icon, href }: { label: string; value: number; icon: typeof Users; href?: string }) => (
          <StatCard key={label} label={label} icon={icon} tone="neutral"
            value={loading ? <span className="inline-block h-7 w-10 bg-slate-100 rounded-md animate-pulse" /> : value}
            onClick={href ? () => router.push(href) : undefined} />
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
            <p className="text-sm text-slate-600">{openReq.week_start} haftasının yayınlanmış planını değiştirmek istiyor. Onaylarsan müdür değişiklik yapıp yeniden yayınlayabilir.</p>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Not (isteğe bağlı)</span>
              <input type="text" value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Müdüre iletilir"
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
              <Link href="/supervisor/settings?new=1" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><Plus size={15} /> Şube ekle</Link>
            )}>
              {user?.role === "admin" ? "Henüz şube yok." : "Size henüz şube atanmadı. İşletme sahibinden isteyin."}
            </ListEmpty>
          ) : locations.map(loc => {
            const lead = loc.publish_lead === null && loc.next_published
              ? { short: "Hazır", tone: "good" as const, sentence: "Gelecek haftanın planı yayınlandı" }
              : formatPublishLead(loc.publish_lead);
            const tone = lead.tone === "good" ? "positive" : lead.tone === "ok" ? "attention" : lead.tone === "late" ? "danger" : "neutral";
            const canEnter = user?.role === "admin" || user?.role === "supervisor";
            return (
              <ListItem key={loc.id}
                // Patron ve bölge müdürü şubeye girer: müdür gibi plan yapar, onaylar, ayarları yönetir
                onClick={() => { if (canEnter) { openBranchPanel(user, loc.id); router.push("/dashboard"); } else router.push(`/supervisor/schedule?location_id=${loc.id}`); }}
                leading={<Avatar name={loc.name} tone="brand" />}
                title={loc.name}
                subtitle={[`${loc.personnel_count} kişi`, lead.tone !== "none" ? `plan yayını ${lead.short.toLocaleLowerCase("tr")}` : null].filter(Boolean).join(" · ")}
                trailing={lead.tone === "late" ? <span title={lead.sentence ?? undefined}><StatusPill tone={tone}>Geç yayın</StatusPill></span> : undefined}
              />
            );
          })}
        </List>
        {locations.length > 0 && <p className="text-xs text-slate-500">Şubeye dokununca o şubenin paneline girersiniz.</p>}
      </section>
    </Page>
  );
}
