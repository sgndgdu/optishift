import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { signToken, setCookie } from "@/lib/auth";
import { verifyPendingGoogleProfile } from "@/lib/googleAuth";

// POST /api/auth/google/complete-registration
// /api/auth/google/callback bu Google hesabına bağlı hiçbir kayıt bulamayınca
// üretilen kısa ömürlü "pending" token'ı + org_name/username ile yeni bir
// organizasyon + admin kullanıcı kurar (şifresiz, auth_provider='google').
export async function POST(req: NextRequest) {
  const db = getDB();

  try {
    const { pending_token, org_name, username } = await req.json();

    if (!pending_token || !org_name?.trim() || !username?.trim()) {
      return NextResponse.json({ error: "Tüm alanlar zorunlu" }, { status: 400 });
    }

    const profile = await verifyPendingGoogleProfile(pending_token);
    if (!profile) {
      return NextResponse.json(
        { error: "Google oturumunuzun süresi doldu, lütfen tekrar deneyin." },
        { status: 401 }
      );
    }

    // Bu arada aynı google_id/email ile başka bir akıştan hesap oluşmuş olabilir — tekrar kontrol et
    const existingByGoogle = await db.prepare("SELECT id FROM users WHERE google_id = ?").get(profile.googleId);
    if (existingByGoogle) {
      return NextResponse.json({ error: "Bu Google hesabıyla zaten bir hesap var. Lütfen giriş yapın." }, { status: 409 });
    }
    const existingByEmail = await db.prepare("SELECT id FROM users WHERE email = ?").get(profile.email);
    if (existingByEmail) {
      return NextResponse.json({ error: "Bu e-posta adresiyle zaten bir hesap var. Lütfen giriş yapın." }, { status: 409 });
    }

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (cleanUsername.length < 3) {
      return NextResponse.json({ error: "Kullanıcı adı en az 3 karakter olmalı" }, { status: 400 });
    }
    const existingUsername = await db.prepare("SELECT id FROM users WHERE username = ?").get(cleanUsername);
    if (existingUsername) {
      return NextResponse.json({ error: "Bu kullanıcı adı zaten alınmış" }, { status: 409 });
    }

    const now = Math.floor(Date.now() / 1000);
    const orgId = `ORG-${Date.now()}`;
    const userId = `U-${Date.now()}`;

    await db.prepare(`INSERT INTO organizations (id, name) VALUES (?, ?)`).run(orgId, org_name.trim());
    await db.prepare(`
      INSERT INTO users (id, username, email, role, org_id, name, auth_provider, google_id, created_at)
      VALUES (?, ?, ?, 'admin', ?, ?, 'google', ?, ?)
    `).run(userId, cleanUsername, profile.email, orgId, profile.name, profile.googleId, now);

    const token = await signToken({
      id: userId,
      org_id: orgId,
      role: "admin",
      location_id: null,
      personnel_id: null,
      name: profile.name,
    });

    const res = NextResponse.json({
      success: true,
      user: {
        id: userId,
        personnel_id: null,
        username: cleanUsername,
        email: profile.email,
        role: "admin",
        org_id: orgId,
        location_id: null,
        department_id: null,
        name: profile.name,
      },
    });
    setCookie(res, token);
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: "Kayıt hatası: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}
