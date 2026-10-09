import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { chatGroupsFor, chatStates, convKey } from "@/lib/chat";

// Menüdeki okunmamış mesaj sayısı: birebir mesajlar + görebildiği grupların okumadığı mesajları (lib/chat)
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const states = await chatStates(db, auth.id);
    const dm = await db.prepare(
      `SELECT from_user_id, id FROM messages WHERE org_id = ? AND to_user_id = ? AND is_read = false`
    ).all(auth.org_id, auth.id) as { from_user_id: string; id: number }[];
    let count = dm.filter(m => m.id > (states.get(convKey(null, m.from_user_id))?.cleared_id ?? 0)).length;
    for (const g of await chatGroupsFor(db, auth)) {
      const st = states.get(convKey(g.id, null));
      const from = Math.max(st?.last_read_id ?? 0, st?.cleared_id ?? 0);
      const row = await db.prepare(
        `SELECT COUNT(*)::int AS n FROM messages WHERE org_id = ? AND group_id = ? AND from_user_id != ? AND id > ?`
      ).get(auth.org_id, g.id, auth.id, from) as { n?: number } | undefined;
      count += Number(row?.n ?? 0);
    }
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
