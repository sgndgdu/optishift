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

// Ad soyaddan kullanıcı adı üretir: "ahmet kaya" → "ahmet.k.1234"
export async function generateUsername(db: any, name: string): Promise<string> {
  const parts = name.trim().toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .split(/\s+/).filter(Boolean);
  const first = (parts[0] ?? "user").replace(/[^a-z0-9]/g, "");
  const lastInitial = parts[1] ? parts[1][0].replace(/[^a-z]/g, "") : "";
  const base = lastInitial ? `${first}.${lastInitial}` : first;

  let attempt = 0;
  while (attempt < 20) {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const candidate = `${base}.${suffix}`;
    const existing = await db.prepare("SELECT id FROM users WHERE username = ?").get(candidate);
    if (!existing) return candidate;
    attempt++;
  }
  return `${base}.${Date.now()}`;
}
