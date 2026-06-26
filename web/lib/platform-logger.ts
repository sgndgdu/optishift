import { getDB } from "@/lib/db/client";

/**
 * Platform olayını platform_events tablosuna yazar.
 * Fire-and-forget — hata fırlatmaz.
 */
export async function logPlatformEvent(
  type: string,
  orgId: string | null,
  orgName: string | null,
  meta: Record<string, unknown>
): Promise<void> {
  try {
    const db = getDB();
    const now = Math.floor(Date.now() / 1000);
    await db
      .prepare(
        `INSERT INTO platform_events (type, org_id, org_name, meta, created_at)
         VALUES ($1, $2, $3, $4, $5)`
      )
      .run(type, orgId ?? null, orgName ?? null, JSON.stringify(meta), now);
  } catch {
    // Fire-and-forget: loglama hatası asıl isteği engellemez
  }
}
