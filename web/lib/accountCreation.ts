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
