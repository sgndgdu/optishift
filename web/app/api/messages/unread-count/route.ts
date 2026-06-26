import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";


export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const row = await db.prepare(
      `SELECT COUNT(*) as count FROM messages WHERE org_id = ? AND to_user_id = ? AND is_read = 0`
    ).get(auth.org_id, auth.id) as { count: number };
    return NextResponse.json({ count: row?.count ?? 0 });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
