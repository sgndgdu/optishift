/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Yönetim paneline (sorumlu, bölge sorumlusu, hesap sahibi) bildirim: TEK KAYNAK. Bildirim hesaba (notifications.user_id)
 * yazılır, bildirim zilinde (components/NotificationBell) görünür ve telefon bildirimi (push_subscriptions.user_id) gider.
 * Çalışan kaydı gerekmez. Ekip üyesine giden bildirimler eskisi gibi personnel_id ile yazılır.
 */
import { departmentScope, hasPerm, parseAccess, type Perm } from "@/lib/userAccess";
import { sendPushToUser } from "@/lib/notifications";

/**
 * Şubenin sorumlularına (şube sorumlusu, bölge sorumlusu, hesap sahibi) yönetim paneli bildirimi + telefon bildirimi.
 * perm verilirse sadece o işi yapma yetkisi olan ve departman sorumlusu olmayanlar alır; null ise şubenin bütün
 * sorumluları (departman sorumlusu dahil, ör. acil durum). Bildirim hesaba (user_id) yazılır:
 * çalışan kaydı olmayan sahip de alır, bildirim zilinde görür (components/NotificationBell).
 */
export async function notifyBranchManagers(db: any, orgId: string, locationId: string, perm: Perm | null, n: { type: string; title: string; message: string; link: string }): Promise<number> {
  const rows = await db.prepare(`
    SELECT id, role, permissions FROM users
    WHERE org_id = ? AND COALESCE(approval_status, 'active') = 'active'
      AND (role = 'admin' OR (role = 'manager' AND location_id = ?)
        OR (role = 'supervisor' AND (managed_location_ids IS NULL OR managed_location_ids = '' OR managed_location_ids = '[]' OR managed_location_ids LIKE ?)))
  `).all(orgId, locationId, `%"${locationId}"%`) as { id: string; role: string; permissions: string | null }[];
  const managers = rows.filter(r => {
    const u = { role: r.role, access: parseAccess(r.permissions) };
    return perm === null || (!departmentScope(u) && hasPerm(u, perm));
  });
  const now = Math.floor(Date.now() / 1000);
  await Promise.allSettled(managers.map(async m => {
    await db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, link, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, false, ?)
    `).run(m.id, n.type, n.title, n.message, n.link, now);
    await sendPushToUser(m.id, orgId, { title: n.title, body: n.message, url: n.link }).catch(() => {});
  }));
  return managers.length;
}
