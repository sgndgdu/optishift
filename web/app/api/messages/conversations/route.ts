/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { chatGroupsFor, chatStates, convKey } from "@/lib/chat";

// GET /api/messages/conversations: her birebir sohbet ve kullanıcının görebildiği her grup için son mesaj + okunmamış.
// Okundu ve temizleme kişi başı (lib/chat). Eskiden işletmedeki bütün grupların son mesajı herkese dönüyordu.
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const userId = auth.id;
    const orgId  = auth.org_id;
    const states = await chatStates(db, userId);
    const cleared = (key: string) => states.get(key)?.cleared_id ?? 0;

    // Birebir: karşı kişi başına son mesaj
    const allDMs = await db.prepare(`
      SELECT id, CASE WHEN from_user_id = ? THEN to_user_id ELSE from_user_id END as partner_id,
        content, created_at, from_user_id, is_read
      FROM messages
      WHERE org_id = ? AND group_id IS NULL AND (from_user_id = ? OR to_user_id = ?)
      ORDER BY id DESC
      LIMIT 1000
    `).all(userId, orgId, userId, userId) as any[];
    const dm = new Map<string, { last_message: string; last_at: number; unread: number; is_mine: boolean }>();
    for (const m of allDMs) {
      if (!m.partner_id || m.id <= cleared(convKey(null, m.partner_id))) continue;
      const cur = dm.get(m.partner_id);
      const unreadHere = m.from_user_id !== userId && (m.is_read === false || m.is_read === 0) ? 1 : 0;
      if (!cur) dm.set(m.partner_id, { last_message: m.content, last_at: m.created_at, unread: unreadHere, is_mine: m.from_user_id === userId });
      else cur.unread += unreadHere;
    }

    // Gruplar: sadece görebildikleri
    const groups = [];
    for (const g of await chatGroupsFor(db, auth)) {
      const key = convKey(g.id, null);
      const st = states.get(key);
      const last = await db.prepare(`
        SELECT id, content, created_at, from_user_id FROM messages WHERE org_id = ? AND group_id = ? AND id > ? ORDER BY id DESC LIMIT 1
      `).get(orgId, g.id, cleared(key)) as any;
      if (!last) continue;
      const unread = await db.prepare(`
        SELECT COUNT(*)::int AS n FROM messages WHERE org_id = ? AND group_id = ? AND from_user_id != ? AND id > ?
      `).get(orgId, g.id, userId, Math.max(st?.last_read_id ?? 0, cleared(key))) as any;
      groups.push({ group_id: g.id, last_message: last.content, last_at: last.created_at, unread: Number(unread?.n ?? 0), is_mine: last.from_user_id === userId });
    }

    return NextResponse.json({
      dm: [...dm].map(([partner_id, v]) => ({ partner_id, ...v })),
      groups,
    });
  } catch {
    return NextResponse.json({ dm: [], groups: [] });
  }
}
