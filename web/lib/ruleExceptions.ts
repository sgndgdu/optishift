/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Kural istisnası: TEK KAYNAK (kullanıcı kararı 2026-10-08). Çalışma kuralları (dinlenme, haftalık sınır, günlük
 * 11 saat, gece sınırları, sürüş) sadece hesap sahibinin onayıyla esnetilir.
 * - Hesap sahibi kuralı aşan işlemi görüp onaylarsa doğrudan yapar (force).
 * - Başka biri (sorumlu, bölge sorumlusu) "yine de" derse işlem yapılmaz, hesap sahibinin onayına düşer
 *   (rule_exceptions, Onaylar › Kural istisnası). Onaylanınca işlem hesap sahibi adına uygulanır; plan yayını için
 *   onay bir izin olur, sorumlu planı yayınlar (24 saat geçerli).
 * - Ekip üyesi kuralı hiçbir zaman aşamaz (üstlenme ve vardiya değiştirme kabulü engellenir).
 * Kuralların değerleri (ör. en az dinlenme süresi) şube Ayarları'ndan değişir; bu dosya sadece istisnayı yönetir.
 */
import type { AuthUser } from "@/lib/auth";
import { sendPushToUser } from "@/lib/notifications";

export type ExceptionKind = "open_shift_assign" | "loan_approve" | "swap_approve" | "publish_week";

import { PUBLISH_PERMIT_SECONDS } from "@/lib/ruleBend";
export { canBendRules, RULE_CHECK_IDS, PUBLISH_PERMIT_SECONDS, EXCEPTION_SENT_MESSAGE } from "@/lib/ruleBend";

/**
 * İstisna isteği açar (aynı iş için bekleyen istek varsa günceller) ve hesap sahiplerine haber verir.
 */
export async function requestRuleException(db: any, auth: AuthUser, e: {
  kind: ExceptionKind; location_id: string | null; ref_key: string; payload: Record<string, unknown>; summary: string; violations: string[];
}): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const existing = await db.prepare(
    `SELECT id FROM rule_exceptions WHERE org_id = ? AND kind = ? AND ref_key = ? AND status = 'pending' LIMIT 1`
  ).get(auth.org_id, e.kind, e.ref_key) as any;
  let id: number;
  if (existing) {
    id = Number(existing.id);
    await db.prepare(`UPDATE rule_exceptions SET payload = ?, summary = ?, violations = ?, requested_by = ?, requested_by_name = ?, created_at = ? WHERE id = ?`)
      .run(JSON.stringify(e.payload), e.summary, JSON.stringify(e.violations), auth.id, auth.name ?? null, now, id);
  } else {
    const r = await db.prepare(`
      INSERT INTO rule_exceptions (org_id, location_id, kind, ref_key, payload, summary, violations, requested_by, requested_by_name, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?) RETURNING id
    `).all(auth.org_id, e.location_id, e.kind, e.ref_key, JSON.stringify(e.payload), e.summary, JSON.stringify(e.violations), auth.id, auth.name ?? null, now);
    id = Number((Array.isArray(r) ? r[0] : r)?.id);
  }
  const owners = await db.prepare(`SELECT id FROM users WHERE org_id = ? AND role = 'admin' AND COALESCE(approval_status, 'active') = 'active'`).all(auth.org_id) as any[];
  const title = "Kural istisnası onayınızı bekliyor";
  const message = `${auth.name ?? "Bir sorumlu"}: ${e.summary} Kurala uymuyor: ${e.violations.join(" ")}`;
  await Promise.allSettled(owners.map(async o => {
    await db.prepare(`INSERT INTO notifications (user_id, type, title, message, link, is_read, created_at) VALUES (?, 'rule_exception', ?, ?, '/requests', false, ?)`)
      .run(o.id, title, message, now);
    await sendPushToUser(o.id, auth.org_id, { title, body: message, url: "/requests" }).catch(() => {});
  }));
  return id;
}

/** İsteyen sorumluya sonuç bildirimi (hesaba bağlı) */
export async function notifyRequester(db: any, row: any, title: string, message: string, link: string) {
  if (!row?.requested_by) return;
  await db.prepare(`INSERT INTO notifications (user_id, type, title, message, link, is_read, created_at) VALUES (?, 'rule_exception', ?, ?, ?, false, ?)`)
    .run(row.requested_by, title, message, link, Math.floor(Date.now() / 1000));
  await sendPushToUser(row.requested_by, row.org_id, { title, body: message, url: link }).catch(() => {});
}

/** Bu hafta için onaylı, süresi geçmemiş yayın izni (hesap sahibi kurala uymayan planı onayladı) */
export async function publishPermit(db: any, orgId: string, locationId: string, weekStart: string): Promise<{ violations: string[] } | null> {
  const row = await db.prepare(`
    SELECT violations FROM rule_exceptions WHERE org_id = ? AND kind = 'publish_week' AND ref_key = ? AND status = 'approved' AND decided_at > ?
    ORDER BY decided_at DESC LIMIT 1
  `).get(orgId, `${locationId}|${weekStart}`, Math.floor(Date.now() / 1000) - PUBLISH_PERMIT_SECONDS) as any;
  if (!row) return null;
  try { return { violations: JSON.parse(row.violations || "[]") }; } catch { return { violations: [] }; }
}
