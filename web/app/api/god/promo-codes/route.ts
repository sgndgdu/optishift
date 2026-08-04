/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";

// Auth: proxy.ts /api/god/* için zaten God Mode oturumu şart koşuyor.

export async function GET() {
  try {
    const db = getDB();
    const rows = await db.prepare(
      `SELECT * FROM promo_codes ORDER BY created_at DESC`
    ).all() as any[];
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDB();
    const body = await req.json();
    const now = Math.floor(Date.now() / 1000);

    const code = body.code?.trim()?.toUpperCase();
    if (!code) {
      return NextResponse.json({ error: "code zorunlu" }, { status: 400 });
    }

    const existing = await db.prepare(`SELECT id FROM promo_codes WHERE code = ?`).get(code);
    if (existing) {
      return NextResponse.json({ error: "Bu kod zaten kullanımda" }, { status: 409 });
    }

    await db.prepare(`
      INSERT INTO promo_codes (code, campaign_name, plan, free_months, max_uses, used_count, active, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, 0, true, ?, ?)
    `).run(
      code,
      body.campaign_name?.trim() || null,
      body.plan || "pro",
      body.free_months ?? 3,
      body.max_uses ?? null,
      body.expires_at ?? null,
      now,
    );

    return NextResponse.json({ ok: true, code });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const db = getDB();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

    // Şu an tek eylem: pasife alma (silme yerine — kullanım geçmişi kalır)
    await db.prepare(`UPDATE promo_codes SET active = false WHERE id = ?`).run(parseInt(id, 10));
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
