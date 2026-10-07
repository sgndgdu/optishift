import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";

// Yönetim paneli bildirim zili (components/NotificationBell): hesaba (user_id) yazılan bildirimler.
// GET → { items, unread }; PATCH { id } tek bildirimi, { all: true } hepsini okundu yapar.
const LIMIT = 30;

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ items: [], unread: 0 });
  const db = getDB();
  const items = await db.prepare(`
    SELECT id, type, title, message, link, is_read, created_at FROM notifications
    WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
  `).all(auth.id, LIMIT);
  const row = await db.prepare(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = ? AND is_read = false`).get(auth.id) as { n?: number } | undefined;
  return NextResponse.json({ items, unread: Number(row?.n ?? 0) });
}

export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({})) as { id?: number; all?: boolean };
  const db = getDB();
  if (body.all) await db.prepare(`UPDATE notifications SET is_read = true WHERE user_id = ? AND is_read = false`).run(auth.id);
  else if (Number.isInteger(body.id)) await db.prepare(`UPDATE notifications SET is_read = true WHERE id = ? AND user_id = ?`).run(body.id, auth.id);
  else return NextResponse.json({ error: "id ya da all zorunlu" }, { status: 400 });
  return NextResponse.json({ success: true });
}
