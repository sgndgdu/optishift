"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Tüm Şubeler › Tüm Personel: şubenin Ekip sayfasıyla AYNI liste (PeopleList) ve AYNI kişi kartı
 * (PersonSheet), sadece bütün şubeler bir arada ve şube süzgeçli. Yöneticiler ayrı kartta değil,
 * listenin "Yönetim" bölümünde; onay bekleyenler satırdaki durumla görünür.
 * Kişi ekleme formu tek yerde (şubenin Ekip sayfası): "Çalışan ekle" oraya geçer.
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, ChevronDown, UserCog } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListItem } from "@/components/ui/List";
import { Sheet, sheetPrimaryClass } from "@/components/ui/Sheet";
import { Page, PageHeader, pageActionClass } from "@/components/ui/PageHeader";
import { openBranchPanel } from "@/lib/sessionRouting";
import { isOwnerRole } from "@/lib/ruleLocks";
import InviteLinkList, { type InviteResult } from "@/components/personnel/InviteLinkList";
import { BranchPermissionsSheet, ManagerAddSheet, accessSummary, type Mgr } from "@/components/personnel/ManagersCard";
import PeopleList from "@/components/personnel/PeopleList";
import PersonSheet from "@/components/personnel/PersonSheet";
import { mergePeople, personKey, type MergedPerson } from "@/components/personnel/people";

type Loc = { id: string; name: string; rules?: Record<string, unknown> | null };

export default function SupervisorPersonnelPage() {
  return <Suspense><SupervisorPersonnelInner /></Suspense>;
}

function SupervisorPersonnelInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  const [locations, setLocations] = useState<Loc[]>([]);
  const [selectedLocId, setSelectedLocId] = useState<string>("");
  const [users, setUsers] = useState<Mgr[]>([]);
  const [persons, setPersons] = useState<MergedPerson[]>([]);
  const [deptNames, setDeptNames] = useState<Record<string, string>>({});
  const [branchesWithDepts, setBranchesWithDepts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [pickBranch, setPickBranch] = useState(false);
  const [managerAdd, setManagerAdd] = useState(false);
  const [permsOpen, setPermsOpen] = useState(false);
  const [inviteLinks, setInviteLinks] = useState<InviteResult[] | null>(null);
  const [toast, setToast] = useState("");
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_supervisor_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed) setUser(parsed);
      setMounted(true);
    } catch {}
  }, []);

  const fetchPeople = async () => {
    setLoading(true);
    try {
      const [uRes, pRes] = await Promise.all([fetch("/api/users"), fetch("/api/personnel")]);
      const u = await uRes.json().catch(() => []);
      const p = await pRes.json().catch(() => []);
      const userList = Array.isArray(u) ? u : [];
      setUsers(userList);
      setPersons(mergePeople(userList, Array.isArray(p) ? p : []));
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!mounted) return;
    if (!user) { router.push("/login"); return; }
    if (user.role !== "supervisor" && user.role !== "admin") { router.push("/login"); return; }
    fetch("/api/locations").then(r => r.json()).then((data: any[]) => {
      if (!Array.isArray(data)) return;
      const locs: Loc[] = data.map(l => {
        let rules: Record<string, unknown> | null = null;
        try { rules = typeof l.rules === "string" ? JSON.parse(l.rules) : (l.rules ?? null); } catch { rules = null; }
        return { id: l.id, name: l.name, rules };
      });
      setLocations(locs);
      const qLoc = searchParams.get("location_id");
      if (qLoc && locs.some(l => l.id === qLoc)) setSelectedLocId(qLoc);
      // Satırlardaki departman adları ve "Departman seçin" durumu için
      Promise.all(locs.map(l => fetch(`/api/departments?location_id=${l.id}`).then(r => r.json()).catch(() => [])))
        .then(lists => {
          const names: Record<string, string> = {};
          const withDepts = new Set<string>();
          lists.forEach((list, i) => {
            if (!Array.isArray(list) || !list.length) return;
            withDepts.add(locs[i].id);
            list.forEach((d: { id: string; name: string }) => { names[d.id] = d.name; });
          });
          setDeptNames(names); setBranchesWithDepts(withDepts);
        });
    }).catch(() => {});
    fetchPeople();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, user]);

  // Kişi ekleme formu şubenin Ekip sayfasında: o şubenin paneline geçilir
  const goToBranch = (locId: string, query: string) => {
    if (!user || !locId) return;
    openBranchPanel(user, locId);
    window.location.href = `/personnel?${query}`;
  };
  const addEmployee = () => (selectedLocId ? goToBranch(selectedLocId, "add=1") : locations.length === 1 ? goToBranch(locations[0].id, "add=1") : setPickBranch(true));

  if (!mounted) return <Page />;

  const locName = (id: string | null) => (id ? locations.find(l => l.id === id)?.name ?? null : null);
  const userOf = (p: MergedPerson) => (p.userId ? users.find(u => u.id === p.userId) ?? null : null);
  const q = search.toLocaleLowerCase("tr");
  const filtered = persons.filter(p =>
    (!selectedLocId || p.location_id === selectedLocId) &&
    (!q || p.name.toLocaleLowerCase("tr").includes(q) || (p.email ?? "").toLowerCase().includes(q) || (p.title ?? "").toLocaleLowerCase("tr").includes(q)));
  const openPerson = openKey ? persons.find(p => personKey(p) === openKey) ?? null : null;
  const managerLocations = locations.map(l => ({ id: l.id, name: l.name }));

  return (
    <Page className="animate-in fade-in duration-500">
      <PageHeader title="Tüm Personel" description={`Tüm şubelerin ekibi · ${persons.filter(p => !p.inactive).length} kişi`} actions={
        <div className="relative">
          <button onClick={() => setAddMenuOpen(o => !o)} className={pageActionClass}>
            <Plus size={16} /> Ekle <ChevronDown size={14} className={addMenuOpen ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
          {addMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setAddMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1.5 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-40 p-1.5">
                {[
                  { icon: Plus, title: "Çalışan ekle", sub: "Şubenin Ekip sayfasında açılır", on: addEmployee },
                  { icon: UserCog, title: "Yönetici ekle", sub: "Planı ve ekibi sizin yerinize yönetecek kişi", on: () => setManagerAdd(true) },
                ].map(o => (
                  <button key={o.title} onClick={() => { setAddMenuOpen(false); o.on(); }}
                    className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-slate-50">
                    <o.icon size={16} className="text-forest-600 mt-0.5 shrink-0" />
                    <span>
                      <span className="block text-sm font-bold text-slate-800">{o.title}</span>
                      <span className="block text-xs text-slate-500">{o.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      } />

      {/* Arama + şube */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ad, e-posta ya da görev ara"
            className="w-full pl-9 pr-3 min-h-[40px] bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        {locations.length > 1 && (
          <div className="relative">
            <select value={selectedLocId} onChange={e => setSelectedLocId(e.target.value)}
              className="pl-3 pr-8 min-h-[40px] bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer">
              <option value="">Tüm şubeler</option>
              {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        )}
      </div>

      {loading ? (
        <List>
          {[1, 2, 3, 4].map(i => (
            <li key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
              <span className="w-8 h-8 rounded-full bg-slate-100" />
              <span className="flex-1 space-y-1.5"><span className="block h-3 bg-slate-100 rounded w-1/3" /><span className="block h-2.5 bg-slate-100 rounded w-1/4" /></span>
            </li>
          ))}
        </List>
      ) : (
        <PeopleList people={filtered} onOpen={p => setOpenKey(personKey(p))}
          deptName={p => (p.department_id ? deptNames[p.department_id] ?? null : null)}
          branchName={!selectedLocId && locations.length > 1 ? p => locName(p.location_id) : undefined}
          hasDepts={p => !!p.location_id && branchesWithDepts.has(p.location_id)}
          managerSummary={p => { const u = userOf(p); return u ? accessSummary(u, id => deptNames[id]) : null; }}
          managementAction={isOwnerRole(user?.role) ? (
            <button onClick={() => setPermsOpen(true)} className="text-xs font-semibold text-forest-700 hover:underline">Müdür yetkileri</button>
          ) : undefined}
          empty={search ? "Aramaya uyan kimse yok." : "Henüz personel yok."}
          emptyAction={!search && <button onClick={addEmployee} className="text-sm font-semibold text-forest-700 hover:underline">Çalışan ekle</button>} />
      )}

      {openPerson && (
        <PersonSheet key={personKey(openPerson)} person={openPerson} account={userOf(openPerson)}
          viewer={{ id: user?.id, role: user?.role ?? "", location_id: null, access: user?.access }}
          branch={locations.find(l => l.id === openPerson.location_id) ?? null}
          managerLocations={managerLocations}
          onClose={() => setOpenKey(null)}
          onChanged={msg => { setOpenKey(null); fetchPeople(); showToast(msg); }}
          onInvite={setInviteLinks} />
      )}

      <ManagerAddSheet open={managerAdd} onClose={() => setManagerAdd(false)} locations={managerLocations}
        viewerRole={user?.role ?? ""} onDone={fetchPeople} />
      {isOwnerRole(user?.role) && <BranchPermissionsSheet open={permsOpen} onClose={() => setPermsOpen(false)} locations={managerLocations} />}

      <Sheet open={!!inviteLinks} onClose={() => setInviteLinks(null)} title="Giriş bağlantıları"
        footer={<button onClick={() => setInviteLinks(null)} className={sheetPrimaryClass}>Tamam</button>}>
        {inviteLinks && <InviteLinkList results={inviteLinks} />}
      </Sheet>

      {/* Çalışan ekle: hangi şubenin Ekip sayfasına? */}
      <Sheet open={pickBranch} onClose={() => setPickBranch(false)} title="Hangi şubeye?" description="Çalışan, şubenin Ekip sayfasından eklenir">
        <List>
          {locations.map(l => (
            <ListItem key={l.id} onClick={() => goToBranch(l.id, "add=1")} leading={<Avatar name={l.name} tone="brand" />} title={l.name} />
          ))}
        </List>
      </Sheet>

      {toast && (
        <div className="fixed bottom-24 right-4 lg:bottom-8 md:right-8 bg-slate-900 text-white text-xs font-bold px-5 py-3 rounded-2xl shadow-xl z-50 max-w-xs">{toast}</div>
      )}
    </Page>
  );
}
