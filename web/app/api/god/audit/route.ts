/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  try {
    const db = getDB();
    const { searchParams } = new URL(req.url);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);

    const rows = (await db.prepare(
      `SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT $1 OFFSET $2`
    ).all(limit, offset)) as any[];

    const total = (await db.prepare(`SELECT COUNT(*) as c FROM admin_audit_log`).get()) as any;

    return NextResponse.json({ rows, total: Number(total?.c ?? 0) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
