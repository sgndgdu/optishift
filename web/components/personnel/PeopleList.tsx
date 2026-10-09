"use client";
/**
 * Ekip listesi: Ekip ve Tüm Personel aynı listeyi kullanır. Yöneticiler ayrı bir kartta değil,
 * aynı listenin "Yönetim" bölümündedir; ekipten çıkanlar en altta kapalı durur (dokununca geri alınabilir).
 * groupOf verilirse ekip departman departman ayrı başlıklar altında gösterilir (2026-10-09, kullanıcı isteği);
 * departmanı seçilmemiş kişiler en sonda.
 */
import { Fragment, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListEmpty, ListItem, ListSection } from "@/components/ui/List";
import { StatusPill } from "@/components/ui/StatusPill";
import { personKey, roleBadge, rowStatus, type MergedPerson } from "@/components/personnel/people";

export type PersonGroup = { key: string; label: string; order: number };

export default function PeopleList({ people, onOpen, deptName, branchName, hasDepts, managerSummary, managementAction, empty, emptyAction, groupOf, extraDepts }: {
  people: MergedPerson[];
  onOpen: (p: MergedPerson) => void;
  deptName: (p: MergedPerson) => string | null;
  /** Çok şubeli görünümde satırda şube adı. */
  branchName?: (p: MergedPerson) => string | null;
  hasDepts: (p: MergedPerson) => boolean;
  /** Yöneticinin unvanı, kapsamı ve yetkisi tek satır ("Bar şefi · Plan, Ekip" / "Müdür · Tam yetki"). */
  managerSummary?: (p: MergedPerson) => string | null;
  /** "Yöneticiler" başlığının sağındaki bağlantı (isteğe bağlı). */
  managementAction?: React.ReactNode;
  empty: React.ReactNode;
  emptyAction?: React.ReactNode;
  /** Ekip üyesinin bölümü (ana departman); null = departmanı seçilmemiş */
  groupOf?: (p: MergedPerson) => PersonGroup | null;
  /** Gruplu listede satırda ana departman tekrar yazılmaz, sadece yardım ettiği diğer departmanlar ("Ayrıca: Kasa") */
  extraDepts?: (p: MergedPerson) => string | null;
}) {
  const [showInactive, setShowInactive] = useState(false);
  const active = people.filter(p => !p.inactive);
  const inactive = people.filter(p => p.inactive);
  // Hesap sahibi ayrı satırda: sorumlu sayılmaz
  const owners = active.filter(p => p.role === "admin");
  const managers = active.filter(p => p.role === "manager" || p.role === "supervisor");
  const staff = active.filter(p => p.role === "employee");

  const row = (p: MergedPerson) => {
    const pill = rowStatus(p, hasDepts(p));
    // Yöneticide tek satır: kapsam + yetki ("Salon şefi · Plan, Ekip"); departman ve plana girip girmediği kartta
    const grouped = !!groupOf && p.role === "employee" && !p.inactive;
    const extra = grouped ? extraDepts?.(p) : null;
    const sub = (p.role === "employee"
      ? [p.title || null, grouped ? (extra ? `Ayrıca: ${extra}` : null) : deptName(p), branchName?.(p) ?? null, !p.userId && !p.inactive ? "Giriş hesabı yok" : null]
      : p.role === "admin" ? [] // bölüm başlığı zaten "Hesap sahibi"
      : [managerSummary?.(p) ?? roleBadge(p).label, branchName?.(p) ?? null]
    ).filter(Boolean).join(" · ");
    return (
      <ListItem key={personKey(p)}
        leading={<Avatar name={p.name} tone={p.role === "employee" ? "neutral" : "brand"} />}
        title={p.name}
        subtitle={sub || undefined}
        trailing={pill && <StatusPill tone={pill.tone}>{pill.label}</StatusPill>}
        onClick={() => onOpen(p)}
      />
    );
  };

  if (people.length === 0) return <List><ListEmpty action={emptyAction}>{empty}</ListEmpty></List>;

  return (
    <List>
      {owners.length > 0 && <ListSection title="Hesap sahibi" />}
      {owners.map(row)}
      {(managers.length > 0 || managementAction) && <ListSection title="Sorumlular" count={managers.length || undefined} action={managementAction} />}
      {managers.map(row)}
      {groupOf ? (() => {
        const groups = new Map<string, { g: PersonGroup; list: MergedPerson[] }>();
        const none: MergedPerson[] = [];
        for (const p of staff) {
          const g = groupOf(p);
          if (!g) { none.push(p); continue; }
          if (!groups.has(g.key)) groups.set(g.key, { g, list: [] });
          groups.get(g.key)!.list.push(p);
        }
        const sorted = [...groups.values()].sort((a, b) => a.g.order - b.g.order || a.g.label.localeCompare(b.g.label, "tr"));
        return <>
          {sorted.map(({ g, list }) => (
            <Fragment key={g.key}>
              <ListSection title={g.label} count={list.length} />
              {list.map(row)}
            </Fragment>
          ))}
          {none.length > 0 && <ListSection title={sorted.length ? "Departmanı seçilmemiş" : "Ekip"} count={none.length} />}
          {none.map(row)}
        </>;
      })() : <>
        {staff.length > 0 && <ListSection title="Ekip" count={staff.length} />}
        {staff.map(row)}
      </>}
      {inactive.length > 0 && (
        <>
          <ListSection title="Ekipten çıkanlar" count={inactive.length} action={
            <button onClick={() => setShowInactive(v => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-forest-700 hover:underline">
              {showInactive ? "Gizle" : "Göster"} <ChevronDown size={13} className={showInactive ? "rotate-180" : ""} />
            </button>
          } />
          {showInactive && inactive.map(row)}
        </>
      )}
    </List>
  );
}
