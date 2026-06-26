import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";


// POST /api/auth/reset-password
// Body: { token, new_password }
export async function POST(req: NextRequest) {
  try {
    const { token, new_password } = await req.json();

    if (!token || !new_password?.trim()) {
      return NextResponse.json({ error: "Token ve yeni şifre zorunlu" }, { status: 400 });
    }

    if (new_password.length < 6) {
      return NextResponse.json({ error: "Şifre en az 6 karakter olmalı" }, { status: 400 });
    }

    const db = getDB();
    try {
      const now = Math.floor(Date.now() / 1000);

      const row = await db.prepare(
        `SELECT * FROM password_reset_tokens WHERE token = ? AND used_at IS NULL AND expires_at > ?`
      ).get(token, now) as any;

      if (!row) {
        return NextResponse.json(
          { error: "Geçersiz veya süresi dolmuş link. Lütfen yeni bir sıfırlama talebi oluşturun." },
          { status: 400 }
        );
      }

      const hash = await bcrypt.hash(new_password, 10);
      await db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hash, row.user_id);
      await db.prepare(`UPDATE password_reset_tokens SET used_at = ? WHERE token = ?`).run(now, token);

      return NextResponse.json({ ok: true });
    } finally {
    }
  } catch (err: any) {
    console.error("reset-password error:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// GET /api/auth/reset-password?token=... — token geçerliliğini kontrol et
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ valid: false });

  const db = getDB();
  try {
    const now = Math.floor(Date.now() / 1000);
    const row = await db.prepare(
      `SELECT prt.token, u.name FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token = ? AND prt.used_at IS NULL AND prt.expires_at > ?`
    ).get(token, now) as any;

    return NextResponse.json({ valid: !!row, name: row?.name ?? null });
  } finally {
  }
}
