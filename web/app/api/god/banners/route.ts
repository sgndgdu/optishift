/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";
import { verifyGodToken } from "@/lib/god-auth";

// GET — herkese açık (tüm layout'lar okur); ?all=1 sadece God Mode (pasifler dahil yönetim listesi)
export async function GET(req: NextRequest) {
  try {
    const db = getDB();
    const now = Math.floor(Date.now() / 1000);
    const { searchParams } = new URL(req.url);

    if (searchParams.get("all") === "1") {
      const isGod = await verifyGodToken(req);
      if (!isGod) return NextResponse.json({ error: "God Mode yetkisi gerekli" }, { status: 403 });
      const rows = (await db.prepare(
        `SELECT * FROM system_banners ORDER BY created_at DESC LIMIT 100`
      ).all()) as any[];
      return NextResponse.json(rows);
    }

    const rows = (await db.prepare(
      `SELECT * FROM system_banners
       WHERE active = 1
         AND (starts_at IS NULL OR starts_at <= $1)
         AND (ends_at IS NULL OR ends_at >= $1)
       ORDER BY created_at DESC`
    ).all(now)) as any[];

    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — god auth proxy'de zaten kontrol eder
export async function POST(req: NextRequest) {
  try {
    const db = getDB();
    const body = await req.json();
    const now = Math.floor(Date.now() / 1000);

    if (!body.message) {
      return NextResponse.json({ error: "message zorunlu" }, { status: 400 });
    }

    await db.prepare(
      `INSERT INTO system_banners (message, type, active, starts_at, ends_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`
    ).run(
      body.message,
      body.type ?? "info",
      body.active ?? 1,
      body.starts_at ?? null,
      body.ends_at ?? null,
      now
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const db = getDB();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

    await db.prepare(`UPDATE system_banners SET active = 0 WHERE id = $1`).run(parseInt(id, 10));
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
