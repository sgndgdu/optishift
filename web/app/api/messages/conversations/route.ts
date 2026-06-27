/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";


// GET /api/messages/conversations
// Returns last message + unread count per DM partner and per group for the authenticated user
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const userId = auth.id;
    const orgId  = auth.org_id;

    // ── DM: latest message per partner ───────────────────────────────────
    const allDMs = await db.prepare(`
      SELECT
        CASE WHEN from_user_id = ? THEN to_user_id ELSE from_user_id END as partner_id,
        content, created_at, from_user_id
      FROM messages
      WHERE org_id = ? AND group_id IS NULL
        AND (from_user_id = ? OR to_user_id = ?)
      ORDER BY created_at DESC
      LIMIT 500
    `).all(userId, orgId, userId, userId) as any[];

    const seenPartners = new Set<string>();
    const latestDMs = allDMs.filter((m: any) => {
      if (!m.partner_id || seenPartners.has(m.partner_id)) return false;
      seenPartners.add(m.partner_id);
      return true;
    });

    // ── DM: unread count per partner ──────────────────────────────────────
    const dmUnreadRows = await db.prepare(`
      SELECT from_user_id as partner_id, COUNT(*) as unread
      FROM messages
      WHERE org_id = ? AND to_user_id = ? AND is_read = false AND group_id IS NULL
      GROUP BY from_user_id
    `).all(orgId, userId) as any[];
    const dmUnread: Record<string, number> = {};
    for (const r of dmUnreadRows) dmUnread[r.partner_id] = r.unread;

    // ── Groups: latest message per group_id ───────────────────────────────
    const allGroups = await db.prepare(`
      SELECT group_id, content, created_at, from_user_id
      FROM messages
      WHERE org_id = ? AND group_id IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 200
    `).all(orgId) as any[];

    const seenGroups = new Set<string>();
    const latestGroups = allGroups.filter((m: any) => {
      if (!m.group_id || seenGroups.has(m.group_id)) return false;
      seenGroups.add(m.group_id);
      return true;
    });

    // ── Groups: unread count per group (messages not from me) ─────────────
    const grpUnreadRows = await db.prepare(`
      SELECT group_id, COUNT(*) as unread
      FROM messages
      WHERE org_id = ? AND from_user_id != ? AND is_read = false AND group_id IS NOT NULL
      GROUP BY group_id
    `).all(orgId, userId) as any[];
    const grpUnread: Record<string, number> = {};
    for (const r of grpUnreadRows) grpUnread[r.group_id] = r.unread;
    return NextResponse.json({
      dm: latestDMs.map((m: any) => ({
        partner_id:   m.partner_id,
        last_message: m.content,
        last_at:      m.created_at,
        unread:       dmUnread[m.partner_id] ?? 0,
        is_mine:      m.from_user_id === userId,
      })),
      groups: latestGroups.map((m: any) => ({
        group_id:     m.group_id,
        last_message: m.content,
        last_at:      m.created_at,
        unread:       grpUnread[m.group_id] ?? 0,
        is_mine:      m.from_user_id === userId,
      })),
    });
  } catch {
    return NextResponse.json({ dm: [], groups: [] });
  }
}
