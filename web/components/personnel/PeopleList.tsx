"use client";
/**
 * Ekip listesi: Ekip ve Tüm Personel aynı listeyi kullanır. Yöneticiler ayrı bir kartta değil,
 * aynı listenin "Yönetim" bölümündedir; ekipten çıkanlar en altta kapalı durur (dokununca geri alınabilir).
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListEmpty, ListItem, ListSection } from "@/components/ui/List";
import { StatusPill } from "@/components/ui/StatusPill";
import { personKey, roleBadge, rowStatus, type MergedPerson } from "@/components/personnel/people";

export default function PeopleList({ people, onOpen, deptName, branchName, hasDepts, managerSummary, managementAction, empty, emptyAction }: {
  people: MergedPerson[];
  onOpen: (p: MergedPerson) => void;
  deptName: (p: MergedPerson) => string | null;
  /** Çok şubeli görünümde satırda şube adı. */
  branchName?: (p: MergedPerson) => string | null;
  hasDepts: (p: MergedPerson) => boolean;
  /** Yöneticinin kapsamı/yetkisi tek satır ("Sadece Bar · Planı hazırlar"). */
  managerSummary?: (p: MergedPerson) => string | null;
  /** "Yönetim" başlığının sağındaki bağlantı (Müdür yetkileri). */
  managementAction?: React.ReactNode;
  empty: React.ReactNode;
  emptyAction?: React.ReactNode;
}) {
  const [showInactive, setShowInactive] = useState(false);
  const active = people.filter(p => !p.inactive);
  const inactive = people.filter(p => p.inactive);
  const managers = active.filter(p => p.role !== "employee");
  const staff = active.filter(p => p.role === "employee");

  const row = (p: MergedPerson) => {
    const pill = rowStatus(p, hasDepts(p));
    const sub = [
      p.role === "employee" ? (p.title || null) : roleBadge(p).label,
      p.role !== "employee" && p.role !== "admin" ? managerSummary?.(p) ?? null : null,
      deptName(p),
      branchName?.(p) ?? null,
      p.role !== "employee" && p.schedulable ? "Vardiyaya da girer" : null,
      !p.userId && !p.inactive ? "Giriş hesabı yok" : null,
    ].filter(Boolean).join(" · ");
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
      {managers.length > 0 && <ListSection title="Yönetim" count={managers.length} action={managementAction} />}
      {managers.map(row)}
      {staff.length > 0 && <ListSection title="Çalışanlar" count={staff.length} />}
      {staff.map(row)}
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
