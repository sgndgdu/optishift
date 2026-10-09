"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Tüm Şubeler › Ekip: şubenin Ekip sayfasıyla AYNI liste (PeopleList) ve AYNI kişi kartı (PersonSheet).
 * 2026-10-09 (kullanıcı: "şube şube, departman departman"): üstte hesap sahibi ve birden çok şubeyi yöneten
 * sorumlular; altında her şube açılır kapanır bir bölüm (şubenin sorumluları, sonra ekip departman departman).
 * Kapalı bölümde departmanların kişi sayıları görünür. Şube seçilince ya da arama yapılınca bölümler açık gelir.
 * Kişi ekleme formu tek yerde (şubenin Ekip sayfası): "Ekibe kişi ekle" oraya geçer. Sorumlu, kişi kartındaki
 * "Sorumlu yap" ile atanır (Ekle menüsünde ayrıca "Sorumlu ekle" yok, kullanıcı kararı).
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, ChevronDown, ChevronRight, Building2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListItem } from "@/components/ui/List";
import { Sheet, sheetPrimaryClass } from "@/components/ui/Sheet";
import { Page, PageHeader, pageActionClass } from "@/components/ui/PageHeader";
import { openBranchPanel } from "@/lib/sessionRouting";
import InviteLinkList, { type InviteResult } from "@/components/personnel/InviteLinkList";
import { accessSummary, type Mgr } from "@/components/personnel/ManagersCard";
import { departmentLabel, sortDepartments, type DeptLite } from "@/lib/departments";
import { departmentInBranch, departmentsInBranch } from "@/lib/branchRotation";
import { cn } from "@/lib/utils";
import PeopleList from "@/components/personnel/PeopleList";
import PersonSheet from "@/components/personnel/PersonSheet";
import { mergePeople, personKey, roleBadge, type MergedPerson } from "@/components/personnel/people";

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
  const [deptsByLoc, setDeptsByLoc] = useState<Record<string, DeptLite[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [pickBranch, setPickBranch] = useState(false);
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
          const by: Record<string, DeptLite[]> = {};
          lists.forEach((list, i) => {
            if (!Array.isArray(list) || !list.length) return;
            by[locs[i].id] = sortDepartments(list.map((d: DeptLite) => ({ id: d.id, name: d.name, parent_id: d.parent_id ?? null })));
          });
          setDeptsByLoc(by);
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

  const allDepts = Object.values(deptsByLoc).flat();
  const deptNames: Record<string, string> = Object.fromEntries(allDepts.map(d => [d.id, departmentLabel(allDepts, d)]));
  const branchesWithDepts = new Set(Object.keys(deptsByLoc));
  const userOf = (p: MergedPerson) => (p.userId ? users.find(u => u.id === p.userId) ?? null : null);
  const q = search.toLocaleLowerCase("tr");
  const filtered = persons.filter(p =>
    (!selectedLocId || p.location_id === selectedLocId) &&
    (!q || p.name.toLocaleLowerCase("tr").includes(q) || (p.email ?? "").toLowerCase().includes(q) || [p.department_id, ...p.assigned_department_ids].some(id => (id ? deptNames[id] ?? "" : "").toLocaleLowerCase("tr").includes(q))));
  const openPerson = openKey ? persons.find(p => personKey(p) === openKey) ?? null : null;
  const managerLocations = locations.map(l => ({ id: l.id, name: l.name }));
  // Üst bölüm: hesap sahibi ve tek şubeye bağlı olmayan sorumlular (bölge sorumlusu gibi)
  const topLevel = filtered.filter(p => p.role === "admin" || ((p.role === "supervisor" || p.role === "manager") && !p.location_id));
  const branchPeople = (locId: string) => filtered.filter(p => p.location_id === locId && !topLevel.includes(p));
  const shownBranches = locations.filter(l => (!selectedLocId || l.id === selectedLocId) && (!q || branchPeople(l.id).length > 0));
  // Şube seçiliyse, aramada ya da tek şubede bölümler açık
  const isOpen = (id: string) => !!selectedLocId || !!q || shownBranches.length === 1 || expanded.has(id);
  const toggle = (id: string) => setExpanded(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const deptGroupOf = (locId: string) => {
    const depts = deptsByLoc[locId] ?? [];
    if (!depts.length) return undefined;
    const ids = new Set(depts.map(d => d.id));
    return (p: MergedPerson) => {
      const id = departmentInBranch(p, ids);
      const i = depts.findIndex(d => d.id === id);
      return i < 0 ? null : { key: depts[i].id, label: departmentLabel(depts, depts[i]), order: i };
    };
  };
  const countFor = (locId: string) => {
    const act = persons.filter(p => p.location_id === locId && !p.inactive);
    return { staff: act.filter(p => p.role === "employee").length, mgrs: act.filter(p => p.role === "manager" || p.role === "supervisor").length };
  };
  const listProps = (locId: string | null) => ({
    onOpen: (p: MergedPerson) => setOpenKey(personKey(p)),
    deptName: (p: MergedPerson) => (p.department_id
      ? [p.department_id, ...p.assigned_department_ids.filter(id => id !== p.department_id)].map(id => deptNames[id]).filter(Boolean).join(" + ") || null
      : null),
    branchName: locId ? undefined : (p: MergedPerson) => (p.role === "admin" ? null : "Birden çok şube"),
    hasDepts: (p: MergedPerson) => !!p.location_id && branchesWithDepts.has(p.location_id),
    managerSummary: (p: MergedPerson) => { const u = userOf(p); return u ? accessSummary(u, id => deptNames[id], roleBadge(p).label) : null; },
    empty: "Aramaya uyan kimse yok.",
  });

  return (
    <Page className="animate-in fade-in duration-500">
      <PageHeader title="Ekip" description={(() => {
        // Genel Bakış "Personel" sayısıyla aynı taban: çalışanlar ayrı, yöneticiler ayrı
        const act = persons.filter(p => !p.inactive);
        const staff = act.filter(p => p.role === "employee").length;
        const mgrs = act.filter(p => p.role === "manager" || p.role === "supervisor").length;
        return `Tüm şubeler · ${staff} ekip üyesi${mgrs ? ` · ${mgrs} sorumlu` : ""}`;
      })()} actions={
        <button onClick={addEmployee} className={pageActionClass}><Plus size={16} /> Ekibe kişi ekle</button>
      } />

      {/* Arama + şube */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ad, e-posta ya da departman ara"
            className="w-full pl-9 pr-3 min-h-[40px] bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
      </div>
      {locations.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Şube">
          {[{ id: "", name: "Tüm şubeler" }, ...locations].map(l => {
            const on = selectedLocId === l.id;
            const n = l.id ? countFor(l.id).staff : persons.filter(p => !p.inactive && p.role === "employee").length;
            return (
              <button key={l.id || "all"} role="tab" aria-selected={on} onClick={() => setSelectedLocId(l.id)}
                className={cn("inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition",
                  on ? "border-forest-700 bg-forest-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}>
                {l.name}<span className={cn("text-xs", on ? "text-white/70" : "text-slate-400")}>{n}</span>
              </button>
            );
          })}
        </div>
      )}

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
        <div className="space-y-4">
          {topLevel.length > 0 && !selectedLocId && <PeopleList people={topLevel} {...listProps(null)} />}
          {shownBranches.length === 0 && (
            <List><li className="px-4 py-6 text-center text-sm text-slate-500">{search ? "Aramaya uyan kimse yok." : "Henüz ekip yok."}</li></List>
          )}
          {shownBranches.map(l => {
            const people = branchPeople(l.id);
            const open = isOpen(l.id);
            const c = countFor(l.id);
            const depts = deptsByLoc[l.id] ?? [];
            const ids = new Set(depts.map(d => d.id));
            const groupOf = deptGroupOf(l.id);
            // Kapalı bölümde departmanların kişi sayısı
            const perDept = depts.map(d => ({ d, n: people.filter(p => p.role === "employee" && !p.inactive && departmentInBranch(p, ids) === d.id).length })).filter(x => x.n > 0);
            return (
              <section key={l.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <button type="button" onClick={() => toggle(l.id)} aria-expanded={open}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-700"><Building2 size={17} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-900">{l.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {c.staff} ekip üyesi{c.mgrs ? ` · ${c.mgrs} sorumlu` : ""}
                      {!open && perDept.length > 0 && ` · ${perDept.map(x => `${departmentLabel(depts, x.d)} ${x.n}`).join(", ")}`}
                    </span>
                  </span>
                  <ChevronDown size={16} className={cn("shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
                </button>
                {open && (
                  <div className="border-t border-slate-100">
                    <PeopleList flush people={people} {...listProps(l.id)} groupOf={groupOf}
                      extraDepts={p => departmentsInBranch(p, ids).slice(1).map(id => deptNames[id]).filter(Boolean).join(", ") || null}
                      empty="Bu şubede henüz kimse yok."
                      emptyAction={<button onClick={() => goToBranch(l.id, "add=1")} className="text-sm font-semibold text-forest-700 hover:underline">Ekibe kişi ekle</button>} />
                    <button type="button" onClick={() => goToBranch(l.id, "")}
                      className="flex w-full items-center justify-center gap-1 border-t border-slate-100 px-4 py-2.5 text-xs font-semibold text-forest-700 hover:bg-slate-50">
                      {l.name} ekip sayfasına git <ChevronRight size={13} />
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {openPerson && (
        <PersonSheet key={personKey(openPerson)} person={openPerson} account={userOf(openPerson)}
          viewer={{ id: user?.id, role: user?.role ?? "", location_id: null, access: user?.access }}
          branch={locations.find(l => l.id === openPerson.location_id) ?? null}
          managerLocations={managerLocations}
          teamAvgScore={(() => {
            const team = persons.filter(x => x.personnelId && x.role === "employee" && !x.inactive && x.location_id === openPerson.location_id);
            return team.length ? team.reduce((a, x) => a + x.prev_score, 0) / team.length : 0;
          })()}
          onClose={() => setOpenKey(null)}
          onChanged={msg => { setOpenKey(null); fetchPeople(); showToast(msg); }}
          onInvite={setInviteLinks} />
      )}

      <Sheet open={!!inviteLinks} onClose={() => setInviteLinks(null)} title="Giriş bağlantıları"
        footer={<button onClick={() => setInviteLinks(null)} className={sheetPrimaryClass}>Tamam</button>}>
        {inviteLinks && <InviteLinkList results={inviteLinks} />}
      </Sheet>

      {/* Çalışan ekle: hangi şubenin Ekip sayfasına? */}
      <Sheet open={pickBranch} onClose={() => setPickBranch(false)} title="Hangi şubeye?" description="Kişi, şubenin Ekip sayfasından eklenir">
        <List>
          {locations.map(l => (
            <ListItem key={l.id} onClick={() => goToBranch(l.id, "add=1")} leading={<Avatar name={l.name} tone="brand" />} title={l.name} />
          ))}
        </List>
      </Sheet>

      {toast && (
        <div className="fixed bottom-24 right-4 lg:bottom-8 md:right-8 bg-slate-900 text-white text-xs font-semibold px-5 py-3 rounded-2xl shadow-xl z-50 max-w-xs">{toast}</div>
      )}
    </Page>
  );
}
