import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { requireAuth } from "@/lib/auth";

const DB_PATH = path.join(process.cwd(), "optishift.db");

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = OFF");
  try {
    const row = db.prepare(
      `SELECT COUNT(*) as count FROM messages WHERE org_id = ? AND to_user_id = ? AND is_read = 0`
    ).get(auth.org_id, auth.id) as { count: number };
    db.close();
    return NextResponse.json({ count: row?.count ?? 0 });
  } catch {
    db.close();
    return NextResponse.json({ count: 0 });
  }
}
