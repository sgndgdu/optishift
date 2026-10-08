/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Şubeler arası ödünç: TEK KAYNAK (kullanıcı kararı 2026-10-08, sadeleştirilmiş tek yol).
 * "Başka şubeden kişi" (cross_branch) yetkisi olan sorumlu, diğer şubelerdeki uygun kişileri aday listesinde görür ve
 * vardiyaya yazar. Kişinin kendi şubesinin sorumlusu (approvals) Onaylar'da onaylar ya da reddeder; yazan kişi o şube
 * için de onay verebiliyorsa (hesap sahibi, iki şubeye bakan bölge sorumlusu) onay gerekmez. Kişinin kendi kabulü
 * gerekmez. İlan diğer şubelere duyurulmaz, ekip üyesi başka şubenin ilanını göremez ve alamaz.
 */
import type { AuthUser } from "@/lib/auth";
import { managerOutsideBranch } from "@/lib/access";
import { departmentScope, hasPerm, parseAccess } from "@/lib/userAccess";

export type Viewer = Pick<AuthUser, "role" | "location_id" | "managed_location_ids" | "access">;

/** Diğer şubelerdeki kişileri aday olarak görür ve vardiyaya yazar */
export function canBorrow(auth: Viewer | null | undefined): boolean {
  if (!auth || (auth.role !== "admin" && auth.role !== "supervisor" && auth.role !== "manager")) return false;
  return hasPerm(auth, "cross_branch") && !departmentScope(auth);
}


/** Kişinin ana şubesi adına ödünç kararı verebilir (Onaylar yetkisi, o şube kapsamında) */
export function canApproveLoan(auth: Viewer | null | undefined, homeLocationId: string | null | undefined): boolean {
  if (!auth || !homeLocationId) return false;
  if (auth.role !== "admin" && auth.role !== "supervisor" && auth.role !== "manager") return false;
  if (departmentScope(auth) || !hasPerm(auth, "approvals")) return false;
  return !managerOutsideBranch(auth as AuthUser, homeLocationId);
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
