/* eslint-disable @typescript-eslint/no-explicit-any */
import { PREF_WEEKS, learnImplicitPrefs, type ImplicitAvoid } from "@/lib/implicitPrefs";
import { addDays } from "@/lib/date";

/**
 * Şube personelinin örtük tercihleri (lib/implicitPrefs): hedef haftadan önceki PREF_WEEKS
 * haftanın uygunluk girişleri ve kişinin başlattığı takas talepleri (iptal edilenler hariç).
 */
export async function loadImplicitPrefs(
  db: any, personnelIds: string[], weekStart: string, shiftNames: Record<string, string> = {},
): Promise<Record<string, ImplicitAvoid[]>> {
  if (!personnelIds.length) return {};
  const ph = personnelIds.map(() => "?").join(",");
  const from = addDays(weekStart, -7 * PREF_WEEKS);
  const avail = await db.prepare(
    `SELECT * FROM availability WHERE personnel_id IN (${ph}) AND week_start >= ? AND week_start < ?`
  ).all(...personnelIds, from, weekStart) as any[];
  const thisWeek = await db.prepare(
    `SELECT personnel_id FROM availability WHERE personnel_id IN (${ph}) AND week_start = ?`
  ).all(...personnelIds, weekStart) as any[];
  const sinceSec = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000);
  const swaps = await db.prepare(`
    SELECT sr.requester_id AS personnel_id, sa.day, sa.shift_id
    FROM shift_swap_requests sr JOIN shift_assignments sa ON sa.id = sr.requester_shift_id
    WHERE sr.requester_id IN (${ph}) AND sr.created_at >= ? AND sr.status <> 'cancelled'
  `).all(...personnelIds, sinceSec) as any[];
  return learnImplicitPrefs(avail, swaps.map(s => ({ ...s, day: Number(s.day) })), {
    enteredThisWeek: new Set(thisWeek.map(r => r.personnel_id)),
    shiftNames,
  });
}
