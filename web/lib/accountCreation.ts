/* eslint-disable @typescript-eslint/no-explicit-any */
// Hesap oluşturma akışlarında (tekil ve toplu) paylaşılan yardımcılar.

// Rastgele temp şifre üretir: 2 büyük + 2 küçük + 4 rakam
export function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const chars = [pick(upper), pick(upper), pick(lower), pick(lower), pick(digits), pick(digits), pick(digits), pick(digits)];
  // Karıştır
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// Ad soyaddan okunur kullanıcı adı: "Ayşe Kaya" → "ayse.kaya"; doluysa "ayse.kaya2", "ayse.kaya3"…
// Tüm hesap açma yolları (tekil, toplu, Hızlı Kurulum, kayıt linki) bunu kullanır.
export function usernameBase(name: string): string {
  return name.trim().toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 40);
}

export async function generateUsername(db: any, name: string): Promise<string> {
  const base = usernameBase(name) || "personel";
  for (let n = 1; n < 200; n++) {
    const candidate = n === 1 ? base : `${base}${n}`;
    const existing = await db.prepare("SELECT id FROM users WHERE username = ?").get(candidate);
    if (!existing) return candidate;
  }
  return `${base}.${Date.now()}`;
}

// Şubenin kayıt bağlantısıyla ekibe katılma (şifreyle ya da Google ile). Hesap her zaman onay bekler.
export async function createSelfSignupAccount(
  db: any,
  loc: { id: string; org_id: string },
  p: { name: string; phone?: string; passwordHash?: string | null; email?: string | null; googleId?: string | null }
): Promise<{ userId: string; username: string }> {
  const now = Math.floor(Date.now() / 1000);
  const personnelId = `P-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const userId = `U-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const employeeId = `EMP-${Math.floor(10000 + Math.random() * 90000)}`;
  const username = await generateUsername(db, p.name);
  const phone = p.phone?.trim() || "";

  await db.prepare(`
    INSERT INTO personnel (id, org_id, primary_location_id, assigned_location_ids, user_access_level, name, employee_id, phone, title, employment_type, status, max_weekly_hours, prev_score, hero_count, no_show_count, late_count, annual_leave_days_total, roles, role_levels, preferred_shift_ids, preferred_days, preferred_roles, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'employee', ?, ?, ?, 'Personel', 'full_time', 'active', 45, 0, 0, 0, 0, 14, '[]', '{}', '[]', '[]', '[]', ?, ?)
  `).run(personnelId, loc.org_id, loc.id, JSON.stringify([loc.id]), p.name.trim(), employeeId, phone, now, now);

  try {
    await db.prepare(`
      INSERT INTO users (id, personnel_id, username, password_hash, email, auth_provider, google_id, role, org_id, location_id, name, phone, is_temp_password, approval_status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'employee', ?, ?, ?, ?, false, 'pending', 'self-signup', ?)
    `).run(userId, personnelId, username, p.passwordHash ?? null, p.email ?? null, p.googleId ? "google" : "password",
      p.googleId ?? null, loc.org_id, loc.id, p.name.trim(), phone || null, now);
  } catch (err) {
    await db.prepare("DELETE FROM personnel WHERE id = ?").run(personnelId).catch(() => undefined);
    throw err;
  }
  return { userId, username };
}
