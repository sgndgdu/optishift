import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { signToken, parseManagedLocations } from "@/lib/auth";
import { parseAccess } from "@/lib/userAccess";
import { signPendingGoogleProfile, type GoogleProfile, type GoogleAuthIntent, type GoogleStateExtra } from "@/lib/googleAuth";
import { logPlatformEvent } from "@/lib/platform-logger";
import { getDB } from "@/lib/db/client";
import { createSelfSignupAccount } from "@/lib/accountCreation";

/**
 * Google'dan doğrulanmış profil geldikten sonraki ortak karar: hesabı bul/bağla/oluştur ve
 * gidilecek sayfayı seç. Yönlendirmeli giriş (callback) ve tek dokunuşla giriş (onetap) aynı kuralı kullanır.
 * token doluysa oturum açılır, path "/auth/google/complete" olur.
 */
export async function finishGoogleSignIn(
  profile: GoogleProfile,
  stateResult: { intent: GoogleAuthIntent } & GoogleStateExtra
): Promise<{ path: string; token?: string }> {
  // Davet bağlantısından gelen kişi: Gmail'i kendi hesabına bağlanır, şifre belirlemesi gerekmez
  if (stateResult.intent === "link" && stateResult.userId) {
    const [owner] = await db.select().from(users).where(eq(users.google_id, profile.googleId)).limit(1);
    if (owner && owner.id !== stateResult.userId) {
      return { path: `/login?google_error=already_linked` };
    }
    const [target] = await db.select().from(users).where(eq(users.id, stateResult.userId)).limit(1);
    if (!target) {
      return { path: `/login?google_error=invalid_request` };
    }
    // Yöneticinin verdiği geçici şifre artık geçmesin; kendi belirlediği şifre varsa kalır
    await db.update(users).set(
      target.is_temp_password
        ? { google_id: profile.googleId, is_temp_password: false, password_hash: null, auth_provider: "google" }
        : { google_id: profile.googleId }
    ).where(eq(users.id, target.id));
    await getDB().prepare("UPDATE invite_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL")
      .run(Math.floor(Date.now() / 1000), target.id);
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

  if (!user && stateResult.intent === "join" && stateResult.signupToken) {
    // Şubenin kayıt bağlantısından gelen kişi: Google'daki adıyla ekibe katılır, sorumlunun onayını bekler
    const loc = await getDB().prepare("SELECT id, org_id FROM locations WHERE self_signup_token = ?")
      .get(stateResult.signupToken) as { id: string; org_id: string } | undefined;
    if (!loc) return { path: `/login?google_error=signup_closed` };
    await createSelfSignupAccount(getDB(), loc, {
      name: profile.name,
      email: profile.emailVerified ? profile.email : null,
      googleId: profile.googleId,
    });
    return { path: `/self-signup/${encodeURIComponent(stateResult.signupToken)}?google=pending` };
  }

  if (!user && stateResult.intent !== "register") {
    // Girişte bu Gmail'e bağlı hesap yok: çalışan yanlışlıkla işletme açmasın, giriş sayfası iki yolu anlatır
    const params = new URLSearchParams({ google_error: "not_found", google_email: profile.email });
    return { path: `/login?${params.toString()}` };
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
    return { path: `/register?${params.toString()}` };
  }

  if (user.approval_status === "pending") {
    return { path: `/login?google_error=account_pending` };
  }
  if (user.approval_status === "rejected" || user.approval_status === "disabled") {
    return { path: `/login?google_error=account_rejected` };
  }

  const token = await signToken({
    id: user.id,
    org_id: user.org_id,
    role: user.role,
    location_id: user.location_id ?? null,
    personnel_id: user.personnel_id ?? null,
    name: user.name,
    managed_location_ids: parseManagedLocations(user.managed_location_ids),
    access: parseAccess(user.permissions),
  });


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

  return { path: "/auth/google/complete", token };
}
