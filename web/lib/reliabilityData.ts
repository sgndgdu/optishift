/* eslint-disable @typescript-eslint/no-explicit-any */
import { RELIABILITY_WEEKS, computeReliability, type Reliability } from "@/lib/reliability";
import { businessToday, weekStartOf, addDays } from "@/lib/date";

/** Şubenin son RELIABILITY_WEEKS haftalık yayınlanmış normal vardiyalarından güvenilirlik. */
export async function loadReliability(db: any, locationId: string): Promise<Record<string, Reliability>> {
  const from = addDays(weekStartOf(businessToday()), -7 * RELIABILITY_WEEKS);
  const rows = await db.prepare(`
    SELECT personnel_id, week_start, day, start_time, end_time, check_in_at, status
    FROM shift_assignments
    WHERE location_id = ? AND week_start >= ? AND publication_status = 'published'
      AND COALESCE(kind, 'regular') = 'regular'
  `).all(locationId, from) as any[];
  return computeReliability(rows.map(r => ({ ...r, day: Number(r.day), check_in_at: r.check_in_at ? Number(r.check_in_at) : null })), Date.now());
}
