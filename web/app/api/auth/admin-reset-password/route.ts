// POST /api/auth/admin-reset-password
// Müdür/Admin bir kullanıcı için şifre sıfırlama linki üretir
// Body: { user_id }
// Döner: { resetUrl }

import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateResetToken, resetTokenExpiresAt, buildResetUrl } from "@/lib/resetToken";


export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return NextResponse.json({ error: "user_id zorunlu" }, { status: 400 });
    }

    // Hedef kullanıcının aynı org'a ait olduğunu doğrula
    const target = await db.prepare(
      `SELECT id, name, role, org_id, location_id FROM users WHERE id = ?`
    ).get(user_id) as any;

    if (!target || target.org_id !== auth.org_id) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
    }

    // Müdür sadece kendi konumundaki employee'leri sıfırlayabilir
    // Admin ve supervisor herkesi sıfırlayabilir
    if (auth.role === "manager") {
      if (target.role !== "employee" || target.location_id !== auth.location_id) {
        return NextResponse.json({ error: "Bu kullanıcı için yetkiniz yok" }, { status: 403 });
      }
    }

    // Önceki tokenleri temizle
    await db.prepare(
      `DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL`
    ).run(user_id);

    const token = generateResetToken();
    const expiresAt = resetTokenExpiresAt();
    await db.prepare(
      `INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)`
    ).run(token, user_id, expiresAt);

    const resetUrl = buildResetUrl(token);

    return NextResponse.json({ ok: true, resetUrl, name: target.name });
  } finally {
  }
}
