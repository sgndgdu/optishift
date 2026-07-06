import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { signToken, setCookie } from "@/lib/auth";
import { exchangeGoogleCode, verifyGoogleState, signPendingGoogleProfile } from "@/lib/googleAuth";
import { logPlatformEvent } from "@/lib/platform-logger";
import { getDB } from "@/lib/db/client";

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(appUrl(`/login?google_error=denied`));
  }
  if (!code || !state) {
    return NextResponse.redirect(appUrl(`/login?google_error=invalid_request`));
  }

  const stateResult = await verifyGoogleState(state);
  if (!stateResult) {
    return NextResponse.redirect(appUrl(`/login?google_error=invalid_state`));
  }

  let profile;
  try {
    profile = await exchangeGoogleCode(code);
  } catch (err) {
    console.error("Google OAuth exchange error:", err);
    return NextResponse.redirect(appUrl(`/login?google_error=exchange_failed`));
  }

  // Google hesabı zaten bağlıysa doğrudan kullan
  let [user] = await db.select().from(users).where(eq(users.google_id, profile.googleId)).limit(1);

  // Bağlı değilse ama aynı (doğrulanmış) e-posta ile mevcut bir hesap varsa eşleştir
  if (!user && profile.emailVerified) {
    const [byEmail] = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);
    if (byEmail) {
      await db.update(users).set({ google_id: profile.googleId }).where(eq(users.id, byEmail.id));
      user = { ...byEmail, google_id: profile.googleId };
    }
  }

  if (!user) {
    // Bu Google hesabına bağlı hiçbir kayıt yok — yeni organizasyon kurma adımına geç.
    // name/email gizli değil, sadece görüntüleme için ayrı query param olarak geçiliyor;
    // asıl doğrulanabilir/tek kullanımlık veri google_pending token'ının içinde.
    const pendingToken = await signPendingGoogleProfile({
      googleId: profile.googleId,
      email: profile.email,
      name: profile.name,
    });
    const params = new URLSearchParams({
      google_pending: pendingToken,
      google_name: profile.name,
      google_email: profile.email,
    });
    return NextResponse.redirect(appUrl(`/register?${params.toString()}`));
  }

  if (user.approval_status === "pending") {
    return NextResponse.redirect(appUrl(`/login?google_error=account_pending`));
  }
  if (user.approval_status === "rejected") {
    return NextResponse.redirect(appUrl(`/login?google_error=account_rejected`));
  }

  const token = await signToken({
    id: user.id,
    org_id: user.org_id,
    role: user.role,
    location_id: user.location_id ?? null,
    personnel_id: user.personnel_id ?? null,
    name: user.name,
  });

  const res = NextResponse.redirect(appUrl("/auth/google/complete"));
  setCookie(res, token);

  const rawDb = getDB();
  const now = Math.floor(Date.now() / 1000);
  rawDb.prepare(`UPDATE users SET last_login_at = $1 WHERE id = $2`).run(now, user.id).catch(() => {});
  rawDb.prepare(`SELECT name FROM organizations WHERE id = $1`).get(user.org_id)
    .then((org: unknown) => {
      logPlatformEvent("login", user.org_id, (org as { name?: string } | undefined)?.name ?? null, {
        user_id: user.id,
        user_name: user.name,
        role: user.role,
        method: "google",
      });
    })
    .catch(() => {});

  return res;
}
