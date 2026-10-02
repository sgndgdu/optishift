/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AuthUser } from "@/lib/auth";

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
 * Yayınlanmış bir haftayı müdür ancak patron/supervisor onayıyla değiştirebilir
 * (schedule_edit_requests, status = 'approved', son 12 saatte onaylanmış; yayınlanınca 'completed' olur).
 * Patron ve supervisor onaysız değiştirir.
 * Hafta henüz yayınlanmadıysa serbest.
 */
export async function canEditPublishedWeek(db: any, auth: AuthUser, locationId: string, weekStart: string): Promise<boolean> {
  if (auth.role === "admin" || auth.role === "supervisor") return true;
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
