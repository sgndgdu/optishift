/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Mesajlaşma kuralları: TEK KAYNAK (2026-10-09).
 * - Gruplar: şube grubu "loc-<şube>" (şubede çalışan herkes, o şubenin sorumluları, hesap sahibi, şubeyi yöneten
 *   bölge sorumlusu) ve "mgr" Sorumlular grubu (işletmenin bütün sorumluları ve hesap sahibi; ekip üyesi giremez).
 * - Okundu ve "sohbeti temizle" kişi başı (chat_state): grupta biri okuyunca başkası için okundu sayılmaz,
 *   temizleyen sadece kendi ekranından siler.
 */
import type { AuthUser } from "@/lib/auth";
import { chatLocationIds } from "@/lib/access";

export const MANAGERS_GROUP = "mgr";

export const convKey = (groupId: string | null | undefined, partnerId: string | null | undefined) =>
  groupId ? `g:${groupId}` : `u:${partnerId}`;

export async function chatState(db: any, userId: string, key: string): Promise<{ last_read_id: number; cleared_id: number }> {
  const row = await db.prepare(`SELECT last_read_id, cleared_id FROM chat_state WHERE user_id = ? AND conv_key = ?`).get(userId, key) as any;
  return { last_read_id: Number(row?.last_read_id ?? 0), cleared_id: Number(row?.cleared_id ?? 0) };
}

export async function chatStates(db: any, userId: string): Promise<Map<string, { last_read_id: number; cleared_id: number }>> {
  const rows = await db.prepare(`SELECT conv_key, last_read_id, cleared_id FROM chat_state WHERE user_id = ?`).all(userId) as any[];
  return new Map(rows.map(r => [String(r.conv_key), { last_read_id: Number(r.last_read_id), cleared_id: Number(r.cleared_id) }]));
}

/** Okundu: son okunan mesaj kimliği yalnız ileri gider */
export async function markRead(db: any, userId: string, key: string, lastId: number) {
  if (!lastId) return;
  await db.prepare(`
    INSERT INTO chat_state (user_id, conv_key, last_read_id, cleared_id) VALUES (?, ?, ?, 0)
    ON CONFLICT (user_id, conv_key) DO UPDATE SET last_read_id = GREATEST(chat_state.last_read_id, EXCLUDED.last_read_id)
  `).run(userId, key, lastId);
}

/** Sohbeti temizle: o ana kadarki mesajlar bu kişiye gösterilmez (başkasınınkinden silinmez) */
export async function clearConversation(db: any, userId: string, key: string, lastId: number) {
  await db.prepare(`
    INSERT INTO chat_state (user_id, conv_key, last_read_id, cleared_id) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id, conv_key) DO UPDATE SET cleared_id = GREATEST(chat_state.cleared_id, EXCLUDED.cleared_id),
      last_read_id = GREATEST(chat_state.last_read_id, EXCLUDED.last_read_id)
  `).run(userId, key, lastId, lastId);
}

/** Kullanıcının görebildiği gruplar: Sorumlular (ekip üyesi hariç) + kapsamdaki şubelerin grupları */
export async function chatGroupsFor(db: any, auth: AuthUser): Promise<{ id: string; name: string }[]> {
  const scope = await chatLocationIds(db, auth);
  const locs = await db.prepare("SELECT id, name FROM locations WHERE org_id = ? ORDER BY name").all(auth.org_id) as { id: string; name: string }[];
  const visible = scope === null ? locs : locs.filter(l => scope.includes(l.id));
  return [
    ...(auth.role !== "employee" ? [{ id: MANAGERS_GROUP, name: "Sorumlular" }] : []),
    ...visible.map(l => ({ id: `loc-${l.id}`, name: l.name })),
  ];
}

/** Grubun üyeleri (telefon bildirimi için), gönderen hariç değil */
export async function chatGroupMembers(db: any, orgId: string, groupId: string): Promise<string[]> {
  if (groupId === MANAGERS_GROUP) {
    const rows = await db.prepare(`SELECT id FROM users WHERE org_id = ? AND role IN ('admin','supervisor','manager') AND COALESCE(approval_status, 'active') = 'active'`).all(orgId) as { id: string }[];
    return rows.map(r => r.id);
  }
  const loc = groupId.startsWith("loc-") ? groupId.slice(4) : null;
  if (!loc) return [];
  const rows = await db.prepare(`
    SELECT u.id, u.role, u.location_id, u.managed_location_ids, p.assigned_location_ids
    FROM users u LEFT JOIN personnel p ON p.id = u.personnel_id
    WHERE u.org_id = ? AND COALESCE(u.approval_status, 'active') = 'active'
  `).all(orgId) as any[];
  const arr = (v: unknown): string[] => { try { const a = Array.isArray(v) ? v : JSON.parse(String(v ?? "[]")); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };
  return rows.filter(u => u.role === "admin"
    || (u.role === "supervisor" && (arr(u.managed_location_ids).length === 0 || arr(u.managed_location_ids).includes(loc)))
    || u.location_id === loc || arr(u.assigned_location_ids).includes(loc)).map(u => String(u.id));
}
