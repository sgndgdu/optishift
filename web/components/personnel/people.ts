/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Ekip listesinin ortak modeli: bir kişi = giriş hesabı (users) + ekipteki çalışan kaydı (personnel).
 * Şubenin Ekip sayfası ve Tüm Şubeler › Tüm Personel aynı birleştirmeyi, aynı satırı (PeopleList)
 * ve aynı kartı (PersonSheet) kullanır.
 */
import type { PillTone } from "@/components/ui/StatusPill";
import type { InviteResult } from "@/components/personnel/InviteLinkList";

export type MergedPerson = {
  /** Giriş hesabı; hızlı eklenen personelde yoktur (portala giremez). */
  userId: string | null;
  personnelId: string | null;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: string;
  display_title: string | null;
  approval_status: string;
  is_temp_password: boolean;
  title: string | null;
  employment_type: string | null;
  prev_score: number;
  hero_count: number;
  roles: string[];
  weekly_off_day: number | null;
  max_weekly_hours: number | null;
  min_weekly_hours: number | null;
  /** Kişinin şubesi (çalışan kaydında ana şube, yoksa hesabın şubesi). */
  location_id: string | null;
  department_id: string | null;
  ytd_overtime_hours: number | null;
  hourly_wage: number | null;
  night_restriction: string | null;
  hire_date: string | null;
  annual_leave_days_total: number | null;
  leave_adjustment_days: number | null;
  kiosk_pin_set: boolean;
  /** Vardiya planına girer mi (personnel.schedulable). Çalışan kaydı olmayan yöneticide false. */
  schedulable: boolean;
  /** Ekipten çıkarılmış (personnel.status = inactive). */
  inactive: boolean;
  /** Çalıştığı şubeler (ana şube dahil) */
  assigned_location_ids: string[];
  /** Planlı şube rotasyonu (lib/branchRotation), ham */
  branch_rotation: unknown;
  /** Ana departman + diğer şubelerdeki departmanlar */
  assigned_department_ids: string[];
};

const toMerged = (acc: any | undefined, p: any | undefined): MergedPerson => ({
  userId: acc?.id ?? null, personnelId: p?.id ?? acc?.personnel_id ?? null,
  name: p?.name ?? acc?.name ?? "", username: acc?.username ?? "",
  email: acc?.email ?? p?.email ?? null, phone: acc?.phone ?? p?.phone ?? null,
  role: acc?.role ?? "employee", display_title: acc?.display_title ?? null,
  approval_status: acc?.approval_status ?? "active", is_temp_password: !!acc?.is_temp_password,
  // Görev = ilk rol (ayrı unvan alanı yok; /api/personnel de aynı kuralla döner)
  title: Array.isArray(p?.roles) && p.roles.length ? p.roles[0] : null, employment_type: p?.employment_type ?? null,
  prev_score: p?.prev_score ?? 0, hero_count: p?.hero_count ?? 0,
  roles: Array.isArray(p?.roles) ? p.roles : [],
  weekly_off_day: p?.weekly_off_day ?? null, max_weekly_hours: p?.max_weekly_hours ?? null,
  min_weekly_hours: p?.min_weekly_hours ?? null, location_id: p?.primary_location_id ?? acc?.location_id ?? null,
  department_id: p?.department_id ?? null,
  ytd_overtime_hours: p?.ytd_overtime_hours ?? null,
  hourly_wage: p?.hourly_wage ?? null,
  night_restriction: p?.night_restriction ?? null,
  hire_date: p?.hire_date ?? null,
  annual_leave_days_total: p?.annual_leave_days_total ?? null,
  leave_adjustment_days: p?.leave_adjustment_days ?? null,
  kiosk_pin_set: !!p?.kiosk_pin_set,
  schedulable: !!p && p.schedulable !== false,
  inactive: !!p && p.status === "inactive",
  assigned_location_ids: Array.isArray(p?.assigned_location_ids) ? p.assigned_location_ids : (p?.primary_location_id ? [p.primary_location_id] : []),
  branch_rotation: p?.branch_rotation ?? null,
  assigned_department_ids: Array.isArray(p?.assigned_department_ids) ? p.assigned_department_ids : [],
});

/**
 * Liste çalışan kayıtlarından kurulur (hızlı eklenen, hesabı olmayanlar dahil), hesap bilgisi eklenir;
 * çalışan kaydı olmayan hesaplar (yöneticiler, patron) sona eklenir. `includeAccount` hangi hesapsız
 * kayıtların listeye gireceğini seçer (şube sayfası sadece kendi şubesininkileri ister).
 */
export function mergePeople(users: any[], personnel: any[], includeAccount: (acc: any) => boolean = () => true): MergedPerson[] {
  const byPersonnel = new Map<string, any>(users.filter(u => u.personnel_id).map(u => [u.personnel_id, u]));
  // Ekipten çıkarılan kişinin hesabı ayrıca eklenmez (kişi "Ekipten çıkanlar"da görünür)
  const knownIds = new Set(personnel.map(p => p.id));
  return [
    ...personnel.map(p => toMerged(byPersonnel.get(p.id), p)),
    ...users.filter(u => (!u.personnel_id || !knownIds.has(u.personnel_id)) && includeAccount(u)).map(u => toMerged(u, undefined)),
  ];
}

export const personKey = (p: MergedPerson) => p.personnelId ?? p.userId ?? "";

/** Kayıtlı unvan → ekrandaki ad. Eski kayıtlardaki Müdür / Şef / Yönetici adları yeni adlarla gösterilir. */
export function titleLabel(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  const legacy: Record<string, string> = {
    "": "Sorumlu", "Müdür": "Sorumlu", "Yönetici": "Sorumlu", "Şef": "Departman sorumlusu", "Departman Müdürü": "Departman sorumlusu",
    "Şube Müdürü": "Şube sorumlusu", "Bölge Müdürü": "Bölge sorumlusu",
  };
  return legacy[t] ?? t;
}

export function roleBadge(p: Pick<MergedPerson, "role" | "display_title">): { label: string; tone: PillTone } {
  if (p.role === "admin") return { label: "Hesap sahibi", tone: "accent" };
  // Yöneticinin unvanı kapsamından gelir (ManagersCard managerTitle)
  if (p.role === "supervisor") return { label: "Bölge sorumlusu", tone: "brand" };
  if (p.role === "manager") return { label: titleLabel(p.display_title), tone: "brand" };
  return { label: "Ekip üyesi", tone: "neutral" };
}

/** Satırdaki tek durum (DESIGN.md §4): en önemlisi. `hasDepts`: kişinin şubesinde departman var mı. */
export function rowStatus(p: MergedPerson, hasDepts: boolean): { label: string; tone: PillTone } | null {
  if (p.inactive) return { label: "Ekipten çıktı", tone: "neutral" };
  if (p.approval_status === "pending") return { label: "Onay bekliyor", tone: "attention" };
  // Departmansız kişi plana alınmaz: "henüz girmedi"den önemli
  if (p.personnelId && p.schedulable && !p.department_id && hasDepts) return { label: "Departman seçin", tone: "danger" };
  if (p.userId && p.is_temp_password) return { label: "Henüz girmedi", tone: "attention" };
  return null;
}

/** Hesabı olan kişi için yeni giriş bağlantısı üretir. */
export async function createInvite(person: MergedPerson): Promise<InviteResult | null> {
  const res = await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: person.userId }) });
  const data = await res.json().catch(() => null);
  return res.ok && data?.token ? { name: person.name, username: person.username, invite_token: data.token } : null;
}
