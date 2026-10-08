/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Şubeler arası ödünç: kim ister, kim verir. TEK KAYNAK (kullanıcı kararı 2026-10-08).
 * - İsteyen: başka şubelerdeki kişileri aday olarak görmek ve ilanı onlara duyurmak "Başka şubeden kişi"
 *   (cross_branch) yetkisi ister. Departman sorumlusu yapamaz. Ekip üyesinin bıraktığı vardiya sadece kendi şubesine duyurulur.
 * - Veren: başka şubeden biri ilanı alınca vardiya "loan_pending" olur, kişinin ana şubesinde onay yetkisi
 *   (approvals) olan sorumlu Onaylar'da onaylar ya da reddeder. İlanı açan kişi o şube için de onay verebiliyorsa
 *   ya da kişiyi doğrudan atayan iki şubeyi de yönetiyorsa ayrıca onay gerekmez.
 */
import type { AuthUser } from "@/lib/auth";
import { parseManagedLocations } from "@/lib/auth";
import { managerOutsideBranch } from "@/lib/access";
import { departmentScope, hasPerm, parseAccess } from "@/lib/userAccess";

type Viewer = Pick<AuthUser, "role" | "location_id" | "managed_location_ids" | "access">;

/** İlanı başka şubelere duyurabilir, oradaki adayları görebilir */
export function canBorrow(auth: Viewer | null | undefined): boolean {
  if (!auth || (auth.role !== "admin" && auth.role !== "supervisor" && auth.role !== "manager")) return false;
  return hasPerm(auth, "cross_branch") && !departmentScope(auth);
}

/** Başka şubenin çalışanını onaysız doğrudan atayabilir: ödünç yetkisi var ve kişinin ana şubesini de yönetiyor */
export function canAssignFrom(auth: Viewer | null | undefined, homeLocationId: string | null | undefined): boolean {
  if (!canBorrow(auth) || !homeLocationId) return false;
  return !managerOutsideBranch(auth as AuthUser, homeLocationId);
}

/** Kişinin ana şubesi adına ödünç kararı verebilir (Onaylar yetkisi, o şube kapsamında) */
export function canApproveLoan(auth: Viewer | null | undefined, homeLocationId: string | null | undefined): boolean {
  if (!auth || !homeLocationId) return false;
  if (auth.role !== "admin" && auth.role !== "supervisor" && auth.role !== "manager") return false;
  if (departmentScope(auth) || !hasPerm(auth, "approvals")) return false;
  return !managerOutsideBranch(auth as AuthUser, homeLocationId);
}

/** users satırından (ilanı açan hesap) aynı kontrol */
export async function userCanApproveLoan(db: any, userId: string | null | undefined, homeLocationId: string): Promise<boolean> {
  if (!userId) return false;
  const u = await db.prepare(`SELECT role, location_id, managed_location_ids, permissions FROM users WHERE id = ?`).get(userId) as any;
  if (!u) return false;
  return canApproveLoan({
    role: u.role, location_id: u.location_id ?? null,
    managed_location_ids: parseManagedLocations(u.managed_location_ids), access: parseAccess(u.permissions),
  }, homeLocationId);
}

/** Kişi bu şubede çalışıyor mu (ana şube ya da çalıştığı şubeler) */
export function worksAt(p: { primary_location_id?: string | null; assigned_location_ids?: unknown } | null | undefined, locationId: string): boolean {
  if (!p) return false;
  if (p.primary_location_id === locationId) return true;
  return String(p.assigned_location_ids ?? "").includes(`"${locationId}"`);
}

export function declinedIds(os: { loan_declined?: string | null }): string[] {
  try { const v = JSON.parse(os.loan_declined || "[]"); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}

/** Başka şubeden kişi bu ilana davet edildi mi (davet bildirimi ona gitti mi) */
export async function wasInvited(db: any, personnelId: string, openShiftId: number): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 FROM notifications WHERE personnel_id = ? AND link = ? LIMIT 1`
  ).get(personnelId, `/portal/open-shifts?invite=${openShiftId}`);
  return !!row;
}
