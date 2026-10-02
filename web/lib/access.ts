/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AuthUser } from "@/lib/auth";
import { hasManagerPermission, isOwnerRole, type ManagerPermission } from "@/lib/ruleLocks";

/** Şubenin kuralları (locations.rules, JSON). Bulunamazsa {}. */
export async function locationRules(db: any, locationId: string | null | undefined): Promise<Record<string, unknown>> {
  if (!locationId) return {};
  try {
    const row = await db.prepare("SELECT rules FROM locations WHERE id = ?").get(locationId) as { rules?: string } | undefined;
    return row?.rules ? JSON.parse(row.rules) : {};
  } catch { return {}; }
}

/** Bu kullanıcı bu şubede bu müdür iznine sahip mi (lib/ruleLocks; patron/bölge müdürü her zaman). */
export async function hasLocationPermission(db: any, auth: AuthUser, locationId: string | null | undefined, perm: ManagerPermission): Promise<boolean> {
  if (isOwnerRole(auth.role)) return true;
  return hasManagerPermission(auth.role, await locationRules(db, locationId), perm);
}

/**
 * Şube yönetim yetkisi: TEK KAYNAK.
 * - admin (patron) ve supervisor: işletmesinin tüm şubeleri
 * - manager (müdür): sadece kendi şubesi
 * - employee: hiçbiri
 * Şube her durumda isteği yapanın işletmesine ait olmalı (çapraz işletme yazımı yok).
 */
export async function canManageLocation(db: any, auth: AuthUser, locationId: string | null | undefined): Promise<boolean> {
  if (!locationId) return false;
  if (auth.role !== "admin" && auth.role !== "supervisor" && auth.role !== "manager") return false;
  if (auth.role === "manager" && auth.location_id !== locationId) return false;
  const loc = await db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(locationId, auth.org_id);
  return !!loc;
}

/** Birden çok şube için: hepsi yönetilebiliyorsa true. */
export async function canManageLocations(db: any, auth: AuthUser, locationIds: Iterable<string>): Promise<boolean> {
  for (const id of new Set(locationIds)) {
    if (!(await canManageLocation(db, auth, id))) return false;
  }
  return true;
}

/**
 * Yayınlanmış bir haftayı müdür, "publish_edit" izni yoksa ancak patron/supervisor onayıyla değiştirebilir
 * (schedule_edit_requests, status = 'approved', son 12 saatte onaylanmış; yayınlanınca 'completed' olur).
 * Patron ve supervisor onaysız değiştirir.
 * Hafta henüz yayınlanmadıysa serbest.
 */
export async function canEditPublishedWeek(db: any, auth: AuthUser, locationId: string, weekStart: string): Promise<boolean> {
  if (await hasLocationPermission(db, auth, locationId, "publish_edit")) return true;
  const published = await db.prepare(
    `SELECT 1 FROM shift_assignments WHERE location_id = ? AND week_start = ? AND publication_status = 'published' LIMIT 1`
  ).get(locationId, weekStart);
  if (!published) return true;
  const approved = await db.prepare(
    `SELECT 1 FROM schedule_edit_requests WHERE org_id = ? AND location_id = ? AND week_start = ? AND status = 'approved'
       AND COALESCE(reviewed_at, created_at) > ? LIMIT 1`
  ).get(auth.org_id, locationId, weekStart, Math.floor(Date.now() / 1000) - 12 * 3600);
  return !!approved;
}

/** Müdür kendi şubesi dışındaki bir şubeye mi erişiyor? (patron/bölge müdürü işletme içinde serbest) */
export function managerOutsideBranch(auth: AuthUser, locationId: string | null | undefined): boolean {
  return auth.role === "manager" && !!locationId && auth.location_id !== locationId;
}

/**
 * Bir personelin kaydına dokunma yetkisi: personel sadece kendisi; yönetici kişi kendi işletmesindeyse,
 * müdür ayrıca kişi kendi şubesinde (ana ya da atandığı şube) ise.
 */
export async function canActOnPersonnel(db: any, auth: AuthUser, personnelId: string | null | undefined): Promise<boolean> {
  if (!personnelId) return false;
  if (auth.role === "employee") return auth.personnel_id === personnelId;
  const p = await db.prepare("SELECT primary_location_id, assigned_location_ids FROM personnel WHERE id = ? AND org_id = ?")
    .get(personnelId, auth.org_id) as { primary_location_id: string; assigned_location_ids: string | null } | undefined;
  if (!p) return false;
  if (auth.role !== "manager") return true;
  // Birden çok şubeye atanmış personel: müdürün şubesi atandığı şubelerden biriyse yeter
  return p.primary_location_id === auth.location_id || (p.assigned_location_ids ?? "").includes(`"${auth.location_id}"`);
}

/**
 * Kullanıcının görebildiği şubeler: null = işletmenin tüm şubeleri (patron).
 * Müdür ve personel: kendi şubesi. Bölge müdürü: atandığı şubeler (users.managed_location_ids; boşsa tümü).
 */
export async function scopedLocationIds(db: any, auth: AuthUser): Promise<string[] | null> {
  if (auth.role === "admin") return null;
  if (auth.role === "supervisor") {
    const row = await db.prepare("SELECT managed_location_ids FROM users WHERE id = ?").get(auth.id).catch(() => null) as { managed_location_ids?: string | null } | null;
    try {
      const ids = row?.managed_location_ids ? JSON.parse(row.managed_location_ids) : null;
      return Array.isArray(ids) && ids.length > 0 ? ids : null;
    } catch { return null; }
  }
  return auth.location_id ? [auth.location_id] : [];
}

/** Sohbet grubu ("loc-<şube>") bu kullanıcıya açık mı? */
export async function canAccessChatGroup(db: any, auth: AuthUser, groupId: string | null | undefined): Promise<boolean> {
  if (!groupId) return false;
  const loc = groupId.startsWith("loc-") ? groupId.slice(4) : null;
  if (!loc) return false;
  const exists = await db.prepare("SELECT 1 FROM locations WHERE id = ? AND org_id = ?").get(loc, auth.org_id);
  if (!exists) return false;
  const scope = await scopedLocationIds(db, auth);
  return scope === null || scope.includes(loc);
}
