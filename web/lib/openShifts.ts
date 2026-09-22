/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Açık vardiya üstlenme (claim) — TEK KAYNAK.
 *
 * app/api/open-shifts/route.ts PATCH (normal "Kabul Et" / müdür ataması) ve
 * app/api/shift-bids/route.ts PATCH (teklif kabulü) aynı fonksiyonu çağırır.
 */
import { rescoreWeek } from "@/lib/scoring";

export type ClaimOutcome = { ok: true } | { ok: false; status: number; error: string };

export async function claimOpenShift(
  db: any,
  orgId: string,
  openShiftId: number,
  claimedBy: string,
  claimedByName: string | null,
  opts: { overrideBonusPoints?: number; assignedByManager?: boolean } = {},
): Promise<ClaimOutcome> {
  const os = await db.prepare(`SELECT * FROM open_shifts WHERE id = ? AND org_id = ?`).get(openShiftId, orgId) as any;
  if (!os) return { ok: false, status: 404, error: "Vardiya bulunamadı" };

  // Teklif kabulünde vardiyanın kahraman bonusu, kabul edilen teklifin tutarına çekilir —
  // rescoreWeek bu kolonu okuyarak puanlar (lib/scoring.ts).
  if (typeof opts.overrideBonusPoints === "number") {
    await db.prepare(`UPDATE open_shifts SET hero_bonus_multiplier = ? WHERE id = ?`).run(opts.overrideBonusPoints, openShiftId);
  }

  const now = Math.floor(Date.now() / 1000);
  await db.prepare(`
    UPDATE open_shifts
    SET claimed_by = ?, claimed_by_name = ?, claimed_at = ?, status = 'claimed'
    WHERE id = ? AND status = 'open'
  `).run(claimedBy, claimedByName ?? null, now, openShiftId);

  // Kahraman bonusu: claimed_by = personnel_id
  await db.prepare(`UPDATE personnel SET hero_count = COALESCE(hero_count, 0) + 1 WHERE id = ?`).run(claimedBy);

  // Kapılan vardiyayı kahramanın takvimine işle (yoksa vardiya hiçbir takvimde görünmez)
  const dt = new Date(os.date + "T00:00:00Z");
  const dayIdx = (dt.getUTCDay() + 6) % 7; // 0 = Pazartesi
  const monday = new Date(dt);
  monday.setUTCDate(dt.getUTCDate() - dayIdx);
  const week_start = monday.toISOString().split("T")[0];
  const dup = await db.prepare(`
    SELECT id FROM shift_assignments
    WHERE personnel_id = ? AND week_start = ? AND day = ? AND start_time = ?
  `).get(claimedBy, week_start, dayIdx, os.start_time);
  if (!dup) {
    await db.prepare(`
      INSERT INTO shift_assignments (personnel_id, location_id, week_start, day, shift_id, start_time, end_time, points, status, publication_status, created_at)
      VALUES (?, ?, ?, ?, 'open-shift', ?, ?, 0, 'scheduled', 'published', ?)
    `).run(claimedBy, os.location_id, week_start, dayIdx, os.start_time, os.end_time, now);
  }

  // Kahraman bonusu (düz puan, hero_bonus_multiplier kolonunda tutulur) puan formülünde uygulanır —
  // prev_score'a doğrudan yazılmaz, hafta deterministik olarak yeniden puanlanır.
  await rescoreWeek(orgId, os.location_id, week_start);

  await db.prepare(`
    INSERT INTO notifications (personnel_id, type, title, message, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    claimedBy,
    "hero_bonus",
    opts.assignedByManager ? "📋 Açık Vardiyaya Atandın" : "🦸 Kahraman Bonusu Kazandın!",
    opts.assignedByManager
      ? `Müdürün seni ${os.date} tarihli ${os.start_time}–${os.end_time} vardiyasına atadı. Bu vardiya için ekstra kahraman puanı kazanacaksın.`
      : `${os.date} tarihli ${os.start_time}–${os.end_time} vardiyasını üstlendin. Bu vardiya için ekstra kahraman puanı kazandın.`,
    now,
  );

  return { ok: true };
}
