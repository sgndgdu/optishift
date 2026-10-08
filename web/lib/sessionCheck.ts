/* eslint-disable @typescript-eslint/no-explicit-any */
// Oturum güncel mi (proxy): oturum 7 gün geçerli ama içindeki rol ve yetkiler giriş anındaki hâl.
// Ekipten çıkarılan kişi ya da yetkisi alınan sorumlu açık oturumla eski yetkisiyle devam edebiliyordu
// (lansman testi 2026-10-08). Hesap kapatıldıysa ya da rol, yetki, şube, bölge kapsamı değiştiyse oturum
// geçersiz sayılır; kişi yeniden girer ve güncel yetkisini alır. Sonuç kısa süre bellekte tutulur.
import { getDB } from "./db/client";
import { parseManagedLocations, type AuthUser } from "./auth";
import { parseAccess } from "./userAccess";

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; sig: string | null }>();

const norm = (v: unknown) => JSON.stringify(v ?? null);

/** Kullanıcının veritabanındaki hâlinden oturumla karşılaştırılacak imza (kapalı hesapta null). */
async function currentSignature(userId: string, withLocation: boolean): Promise<string | null> {
  const row = await getDB().prepare(
    `SELECT role, org_id, location_id, managed_location_ids, permissions, approval_status FROM users WHERE id = ?`
  ).get(userId) as any;
  if (!row || ["disabled", "rejected", "pending"].includes(String(row.approval_status ?? ""))) return null;
  return [row.role, row.org_id, withLocation ? (row.location_id ?? null) : "-",
    norm(parseManagedLocations(row.managed_location_ids)), norm(parseAccess(row.permissions))].join("|");
}

function tokenSignature(u: AuthUser, withLocation: boolean): string {
  return [u.role, u.org_id, withLocation ? (u.location_id ?? null) : "-", norm(u.managed_location_ids ?? null), norm(u.access ?? null)].join("|");
}

/** true: oturum artık geçerli değil (yeniden giriş gerekir). Veritabanı hatasında oturum geçerli sayılır. */
export async function sessionIsStale(user: AuthUser): Promise<boolean> {
  // Sahip ve bölge sorumlusunun oturumdaki şubesi sadece başlangıç bilgisi, karşılaştırılmaz
  const withLocation = user.role === "manager" || user.role === "employee";
  try {
    let c = cache.get(user.id);
    if (!c || Date.now() - c.at > TTL_MS) {
      c = { at: Date.now(), sig: await currentSignature(user.id, withLocation) };
      cache.set(user.id, c);
    }
    return c.sig === null || c.sig !== tokenSignature(user, withLocation);
  } catch (e) {
    console.error("sessionCheck:", e);
    return false;
  }
}
