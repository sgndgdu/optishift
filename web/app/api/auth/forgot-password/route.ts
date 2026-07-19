import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { generateResetToken, resetTokenExpiresAt, buildResetUrl } from "@/lib/resetToken";
import { sendMail, resetPasswordEmailHtml } from "@/lib/mailer";


// POST /api/auth/forgot-password
// Body: { identifier } — e-posta adresi veya kullanıcı adı
export async function POST(req: NextRequest) {
  try {
    const { identifier } = await req.json();

    if (!identifier?.trim()) {
      return NextResponse.json({ error: "E-posta veya kullanıcı adı zorunlu" }, { status: 400 });
    }

    const db = getDB();
    let user: any;

    try {
      user = await db.prepare(
        `SELECT id, name, email, username FROM users WHERE email = ? OR username = ? LIMIT 1`
      ).get(identifier.trim(), identifier.trim());
    } finally {
    }

    // Güvenlik: kullanıcı bulunamasa bile aynı yanıtı ver (enumeration koruması)
    if (!user) {
      return NextResponse.json({ ok: true });
    }

    // Önceki kullanılmamış tokenleri temizle
    const db2 = getDB();
    try {
      await db2.prepare(
        `DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL`
      ).run(user.id);

      const token = generateResetToken();
      const expiresAt = resetTokenExpiresAt();
      await db2.prepare(
        `INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)`
      ).run(token, user.id, expiresAt);

      // GÜVENLİK: resetUrl bu oturumsuz yanıtta ASLA dönmez — dönerse herkes
      // herhangi bir hesabın sıfırlama linkini alabilir (hesap ele geçirme).
      // E-postasız kullanıcılar için yol: yönetici, personel kartından geçici
      // şifre üretir (/api/auth/admin-reset-password).
      const resetUrl = buildResetUrl(token);
      if (user.email && process.env.RESEND_API_KEY) {
        await sendMail({
          to: user.email,
          subject: "OptiShift — Şifre Sıfırlama",
          html: resetPasswordEmailHtml(user.name, resetUrl),
        });
      }

      // Enumeration koruması: e-posta gitse de gitmese de aynı yanıt
      return NextResponse.json({ ok: true });
    } finally {
    }
  } catch (err: any) {
    console.error("forgot-password error:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
