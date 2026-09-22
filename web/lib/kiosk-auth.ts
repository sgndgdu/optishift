/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Kiosk modu (ortak tablet / punch clock) kimlik doğrulaması — oturumsuz.
 *
 * Cihaz `location_id`'yi URL'den alır (locations.id kriptografik olarak
 * tahmin edilemez, ekstra token gerekmez), personel 4 haneli PIN girer.
 * `verifyKioskPin` o lokasyona atanmış personel içinde bcrypt.compare ile
 * eşleşen kaydı döner.
 */
import bcrypt from "bcryptjs";

export interface KioskPersonnel {
  id: string;
  name: string;
}

export async function verifyKioskPin(db: any, locationId: string, pin: string): Promise<KioskPersonnel | null> {
  const loc = await db.prepare(`SELECT org_id FROM locations WHERE id = ?`).get(locationId) as any;
  if (!loc) return null;

  const candidates = await db.prepare(
    `SELECT id, name, kiosk_pin FROM personnel
     WHERE org_id = ? AND status = 'active' AND kiosk_pin IS NOT NULL
       AND (primary_location_id = ? OR assigned_location_ids LIKE ?)`
  ).all(loc.org_id, locationId, `%"${locationId}"%`) as any[];

  for (const c of candidates) {
    if (await bcrypt.compare(pin, c.kiosk_pin)) return { id: c.id, name: c.name };
  }
  return null;
}

// ─── Rate limit ───────────────────────────────────────────────────────────
// Basit in-memory sayaç: IP+location başına dakikada en fazla N deneme.
// Serverless instance'lar arası paylaşılmaz (best-effort, brute-force'u yavaşlatır).
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS_PER_WINDOW = 8;
const WINDOW_MS = 60_000;

export function isKioskRateLimited(ip: string, locationId: string): boolean {
  const key = `${ip}:${locationId}`;
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS_PER_WINDOW;
}
