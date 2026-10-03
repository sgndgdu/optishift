"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Tüm Şubeler › Tüm Personel: işletmenin rehberi + yöneticiler + hesap onayları.
 * Kişi ekleme ve düzenlemenin TEK yeri şubenin Ekip sayfasıdır; buradan oraya geçilir
 * (eskiden burada eksik alanlı ikinci bir ekleme/düzenleme formu vardı).
 */
import { Suspense, useEffect, useState } from "react";
import ManagersCard from "@/components/personnel/ManagersCard";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListItem, ListEmpty, ListSection } from "@/components/ui/List";
import { Sheet, DetailRow, sheetPrimaryClass, sheetDangerClass } from "@/components/ui/Sheet";
import { Page, PageHeader, pageActionClass } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { openBranchPanel } from "@/lib/sessionRouting";

const ACCESS_LEVELS = [
  { value: "employee",  label: "Çalışan" },
  { value: "manager",   label: "Yönetici" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "İşletme Sahibi", supervisor: "Yönetici", manager: "Yönetici", employee: "Çalışan",
};

export default function SupervisorPersonnelPage() {
  return <Suspense><SupervisorPersonnelInner /></Suspense>;
}

function SupervisorPersonnelInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocId, setSelectedLocId] = useState<string>("");
  const [personnel, setPersonnel] = useState<any[]>([]);
  const [crewMap, setCrewMap] = useState<Record<string, { name: string; color: string }>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Onay bekleyen hesaplar (manager'ın oluşturduğu, henüz aktif olmayan)
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);
  // Şube müdürleri: personel kaydı olmadığı için personel listesinde görünmezler (Test 3 Ö1)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  // Ekleme: şube seçilir, o şubenin Ekip sayfasına geçilir
  const [pickBranch, setPickBranch] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_supervisor_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed) setUser(parsed);
      setMounted(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPendingUsers = async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      const list: any[] = Array.isArray(data) ? data : [];
      setPendingUsers(list.filter(u => u.approval_status === "pending"));
    } catch {}
  };

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
          const init = qLoc && data.find((l: any) => l.id === qLoc) ? qLoc : "";
          setSelectedLocId(init);
          fetchPersonnel(init);
        }
      }).catch(() => {});
    fetchPendingUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, user]);

  const handlePendingReview = async (id: string, approval_status: "active" | "rejected") => {
    setPendingActionId(id);
    try {
      await fetch(`/api/users?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approval_status }),
      });
      setPendingUsers(prev => prev.filter(u => u.id !== id));
    } finally {
      setPendingActionId(null);
    }
  };

  const fetchPersonnel = async (locId: string) => {
    setLoading(true);
    try {
      const url = locId ? `/api/personnel?location_id=${locId}` : `/api/personnel?org_id=${user?.org_id}`;
      const [pRes, cRes] = await Promise.all([
        fetch(url),
        locId ? fetch(`/api/crews?location_id=${locId}`) : Promise.resolve(null),
      ]);
      const pData = await pRes.json();
      setPersonnel(Array.isArray(pData) ? pData : []);
      if (cRes) {
        const cData = await cRes.json();
        if (Array.isArray(cData)) {
          const map: Record<string, { name: string; color: string }> = {};
          cData.forEach((c: any) => { map[c.id] = { name: c.name, color: c.color ?? "#6366f1" }; });
          setCrewMap(map);
        }
      } else {
        setCrewMap({});
      }
    } finally { setLoading(false); }
  };

  // Ekip sayfası (şube paneli) bu kişiyi/ekleme penceresini açarak başlar
  const goToBranch = (locId: string, query: string) => {
    if (!user || !locId) return;
    openBranchPanel(user, locId);
    window.location.href = `/personnel?${query}`;
  };

  const filtered = personnel.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase()) ||
    p.title?.toLowerCase().includes(search.toLowerCase())
  );

  if (!mounted) return <Page />;

  const detail = personnel.find(p => p.id === detailId) ?? null;
  const pendingOpen = pendingUsers.find(u => u.id === pendingOpenId) ?? null;

  return (
    <Page className="animate-in fade-in duration-500">
      <PageHeader title="Tüm Personel" description="Tüm şubelerin ekibi" actions={
        <button onClick={() => (selectedLocId ? goToBranch(selectedLocId, "add=1") : locations.length === 1 ? goToBranch(locations[0].id, "add=1") : setPickBranch(true))} className={pageActionClass}>
          <Plus size={16} /> Çalışan Ekle
        </button>
      } />

      {/* Yöneticiler: patron her şubeye, bölge yöneticisi kendi şubelerine ekler */}
      {(user?.role === "admin" || user?.role === "supervisor") && locations.length > 0 && (
        <ManagersCard viewerRole={user.role} locations={locations.map((l: { id: string; name: string }) => ({ id: l.id, name: l.name }))} />
      )}

      {/* Arama + şube */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ad, e-posta ya da unvan ara"
            className="w-full pl-9 pr-3 min-h-[40px] bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <div className="relative">
          <select value={selectedLocId} onChange={e => { setSelectedLocId(e.target.value); fetchPersonnel(e.target.value); }}
            className="pl-3 pr-8 min-h-[40px] bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer">
            <option value="">Tüm şubeler</option>
            {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Onay bekleyen hesaplar (kendi kendine kayıt bağlantısından gelenler) */}
      {pendingUsers.length > 0 && (
        <List>
          <ListSection title="Onay bekleyen hesaplar" count={pendingUsers.length} />
          {pendingUsers.map(u => (
            <ListItem key={u.id} onClick={() => setPendingOpenId(u.id)}
              leading={<Avatar name={u.name} />}
              title={u.name}
              subtitle={`${ROLE_LABELS[u.role] ?? u.role}${u.display_title ? ` · ${u.display_title}` : ""}`}
              trailing={<StatusPill tone="attention">Bekliyor</StatusPill>}
            />
          ))}
        </List>
      )}

      <List>
        <ListSection title="Personel" count={filtered.length} />
        {loading ? <ListEmpty>Yükleniyor…</ListEmpty> : filtered.length === 0 ? (
          <ListEmpty>{search ? "Aramaya uyan kimse yok." : "Henüz personel yok."}</ListEmpty>
        ) : filtered.map(p => {
          const loc = locations.find(l => l.id === p.primary_location_id);
          return (
            <ListItem key={p.id} onClick={() => setDetailId(p.id)}
              leading={<Avatar name={p.name} />}
              title={p.name}
              subtitle={[p.title, loc?.name].filter(Boolean).join(" · ") || "—"}
              trailing={p.status !== "active" ? <StatusPill tone="neutral">Pasif</StatusPill>
                : p.user_access_level !== "employee" ? <StatusPill tone="brand">{ACCESS_LEVELS.find(a => a.value === p.user_access_level)?.label ?? "Yönetici"}</StatusPill>
                : undefined}
            />
          );
        })}
      </List>

      {/* Kişi ayrıntısı */}
      <Sheet open={!!detail} onClose={() => setDetailId(null)} title={detail?.name ?? ""}
        description={detail ? [detail.title, locations.find(l => l.id === detail.primary_location_id)?.name].filter(Boolean).join(" · ") : undefined}
        footer={detail?.primary_location_id && (
          <button onClick={() => goToBranch(detail.primary_location_id, `edit=${encodeURIComponent(detail.id)}`)} className={sheetPrimaryClass}>Şubesinde düzenle</button>
        )}>
        {detail && <div>
          <DetailRow label="Durum">{detail.status === "active" ? "Aktif" : "Pasif"}</DetailRow>
          <DetailRow label="E-posta">{detail.email || "—"}</DetailRow>
          <DetailRow label="Telefon">{detail.phone || "—"}</DetailRow>
          {detail.crew_id && crewMap[detail.crew_id] && <DetailRow label="Vardiya grubu">{crewMap[detail.crew_id].name}</DetailRow>}
          <DetailRow label="Adalet puanı">{detail.prev_score ?? 0}</DetailRow>
        </div>}
      </Sheet>

      {/* Onay bekleyen hesap ayrıntısı */}
      <Sheet open={!!pendingOpen} onClose={() => setPendingOpenId(null)} title={pendingOpen?.name ?? ""}
        description="Kayıt bağlantısıyla hesap açtı, onayınızı bekliyor"
        footer={pendingOpen && <>
          <button disabled={pendingActionId === pendingOpen.id} onClick={() => { handlePendingReview(pendingOpen.id, "rejected"); setPendingOpenId(null); }} className={sheetDangerClass}>Reddet</button>
          <button disabled={pendingActionId === pendingOpen.id} onClick={() => { handlePendingReview(pendingOpen.id, "active"); setPendingOpenId(null); }} className={sheetPrimaryClass}>Onayla</button>
        </>}>
        {pendingOpen && <div>
          <DetailRow label="Rol">{ROLE_LABELS[pendingOpen.role] ?? pendingOpen.role}</DetailRow>
          {pendingOpen.display_title && <DetailRow label="Unvan">{pendingOpen.display_title}</DetailRow>}
          <DetailRow label="Kullanıcı adı">{pendingOpen.username}</DetailRow>
        </div>}
      </Sheet>

      {/* Çalışan ekle: hangi şubenin Ekip sayfasına? */}
      <Sheet open={pickBranch} onClose={() => setPickBranch(false)} title="Hangi şubeye?" description="Çalışan, şubenin Ekip sayfasından eklenir">
        <List>
          {locations.map(l => (
            <ListItem key={l.id} onClick={() => goToBranch(l.id, "add=1")} leading={<Avatar name={l.name} tone="brand" />} title={l.name} />
          ))}
        </List>
      </Sheet>
    </Page>
  );
}
