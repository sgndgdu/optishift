/**
 * Müsaitlik hatırlatması — paylaşılan iş mantığı.
 *
 * Hem müdürün manuel "Müsaitlik İste" butonundan (POST /api/availability/remind,
 * oturum bağlamıyla) hem de cron'dan (POST /api/cron/availability-remind,
 * CRON_SECRET ile, tüm lokasyonlar üzerinde döngüyle) çağrılır. Davranış aynıdır;
 * tek fark cron'un org_id/location_id'yi bir oturumdan değil, DB'deki aktif
 * lokasyon listesinden almasıdır.
 */
import { getDB } from "@/lib/db/client";

/* eslint-disable @typescript-eslint/no-explicit-any */

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

export interface ReminderResult {
  sent: number;
  disabled?: boolean;
  skipped?: string;
}

export async function sendAvailabilityReminders(params: {
  orgId: string;
  locationId: string;
  weekStart?: string;
  auto?: boolean;
}): Promise<ReminderResult> {
  const db = getDB();
  const org_id = params.orgId;
  const location_id = params.locationId;
  let week_start = params.weekStart ?? getWeekStart();

  // Müsaitlik toplama kapalıysa (locations.rules.availability_collection_enabled === false) hatırlatma gönderme
  let rules: any = null;
  if (location_id) {
    const locRow = await db
      .prepare(`SELECT rules FROM locations WHERE id = ? AND org_id = ?`)
      .get(location_id, org_id) as any;
    if (locRow?.rules) {
      try {
        rules = typeof locRow.rules === "string" ? JSON.parse(locRow.rules) : locRow.rules;
        if (rules?.availability_collection_enabled === false) {
          return { sent: 0, disabled: true };
        }
      } catch { /* rules parse edilemedi — varsayılan: açık */ }
    }
  }

  // ── Otomatik mod: rules.availability_reminder planına göre haftada bir kez ──
  if (params.auto === true) {
    if (!location_id) return { sent: 0, skipped: "no_location" };
    const ar = rules?.availability_reminder;
    if (!ar?.enabled) return { sent: 0, skipped: "disabled" };

    const thisMonday = getWeekStart();
    const scheduled = new Date(`${thisMonday}T${ar.time ?? "18:00"}:00`);
    scheduled.setDate(scheduled.getDate() + (typeof ar.day === "number" ? ar.day : 0));
    if (new Date() < scheduled) return { sent: 0, skipped: "not_due" };
    if (ar.last_sent_week === thisMonday) return { sent: 0, skipped: "already_sent" };

    // Hatırlatma gelecek haftanın müsaitliği içindir
    const nextMonday = new Date(thisMonday + "T00:00:00");
    nextMonday.setDate(nextMonday.getDate() + 7);
    week_start = nextMonday.toISOString().split("T")[0];

    // Aynı hafta içinde tekrar tetiklenmemesi için işaretle (gönderim sayısından bağımsız)
    const nextRules = { ...rules, availability_reminder: { ...ar, last_sent_week: thisMonday } };
    await db.prepare(`UPDATE locations SET rules = ? WHERE id = ? AND org_id = ?`)
      .run(JSON.stringify(nextRules), location_id, org_id);
  }

  // Fetch active personnel — availability tablosunda org_id yok, personnel üzerinden filtrele
  let personnel: any[];
  if (location_id) {
    personnel = await db
      .prepare(`SELECT id FROM personnel WHERE org_id = ? AND primary_location_id = ? AND status = 'active'`)
      .all(org_id, location_id) as any[];
  } else {
    personnel = await db
      .prepare(`SELECT id FROM personnel WHERE org_id = ? AND status = 'active'`)
      .all(org_id) as any[];
  }

  if (personnel.length === 0) {
    return { sent: 0 };
  }

  const personnelIds = personnel.map((p: any) => p.id);

  // Find who already has availability for this week — org_id yoktur, personnel_id ile filtrele
  const placeholders = personnelIds.map(() => "?").join(",");
  const submitted = new Set<string>(
    (await db
      .prepare(`SELECT personnel_id FROM availability WHERE personnel_id IN (${placeholders}) AND week_start = ?`)
      .all(...personnelIds, week_start) as any[])
      .map((r: any) => r.personnel_id)
  );

  const missing = personnelIds.filter((id: string) => !submitted.has(id));

  if (missing.length === 0) {
    return { sent: 0 };
  }

  const weekLabel = new Date(week_start + "T00:00:00").toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
  });

  const now = Math.floor(Date.now() / 1000);
  for (const id of missing) {
    await db.prepare(
      `INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
       VALUES (?, 'alert', ?, ?, '/portal/availability', false, ?)`
    ).run(
      id,
      "Müsaitlik Bildiriminizi Girin",
      `${weekLabel} haftası için müsaitlik bilginizi girmeniz bekleniyor.`,
      now,
    );
  }

  return { sent: missing.length };
}
