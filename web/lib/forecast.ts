/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Satış ve yoğunluk tahmini — salt istatistiksel, dış API çağrısı yok.
 *
 * computeForecast(): son HISTORY_WEEKS yayınlanmış haftanın aynı (shift_id, day)
 * hücresindeki gerçekleşen atama sayısının hareketli ortalaması. location_sales_data
 * doluysa son dönemin ciro/ayak trendine göre ±%'lik çarpan uygulanır (yetersiz
 * veri varsa çarpan 1'de kalır, tahmin salt hareketli ortalamadır).
 */
import { getDB } from "@/lib/db/client";

const HISTORY_WEEKS = 8;
const TREND_MIN = 0.5;
const TREND_MAX = 1.5;
const MIN_SALES_POINTS = 4; // trend hesaplamak için gereken asgari veri noktası

export type ForecastMatrix = Record<string, Record<number, number>>;

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function computeTrendMultiplier(db: any, locationId: string, weekStart: string): Promise<number> {
  const cutoff = addDaysISO(weekStart, -1); // hedef haftanın bir gün öncesi
  const rows = await db.prepare(
    `SELECT date, revenue, footfall FROM location_sales_data
     WHERE location_id = ? AND date <= ? ORDER BY date DESC LIMIT 14`
  ).all(locationId, cutoff) as { date: string; revenue: number | null; footfall: number | null }[];

  const metric = (r: { revenue: number | null; footfall: number | null }) => r.revenue ?? r.footfall ?? null;
  const withMetric = rows.filter(r => metric(r) != null).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (withMetric.length < MIN_SALES_POINTS) return 1;

  const half = Math.floor(withMetric.length / 2);
  const older = withMetric.slice(0, half);
  const recent = withMetric.slice(half);
  const avg = (arr: typeof withMetric) => arr.reduce((s, r) => s + (metric(r) as number), 0) / arr.length;
  const olderAvg = avg(older);
  const recentAvg = avg(recent);
  if (olderAvg <= 0) return 1;

  return Math.min(TREND_MAX, Math.max(TREND_MIN, recentAvg / olderAvg));
}

/** Verilen hafta için {shiftDefId → {day → tahmini kişi sayısı}} döner. */
export async function computeForecast(locationId: string, weekStart: string): Promise<ForecastMatrix> {
  const db = getDB();

  const pastWeeksRows = await db.prepare(
    `SELECT DISTINCT week_start FROM shift_assignments
     WHERE location_id = ? AND publication_status = 'published' AND week_start < ?
     ORDER BY week_start DESC LIMIT ?`
  ).all(locationId, weekStart, HISTORY_WEEKS) as { week_start: string }[];

  const pastWeeks = pastWeeksRows.map(r => r.week_start);
  if (pastWeeks.length === 0) return {};

  const placeholders = pastWeeks.map(() => "?").join(",");
  const rows = await db.prepare(
    `SELECT shift_id, day, COUNT(*) as cnt
     FROM shift_assignments
     WHERE location_id = ? AND publication_status = 'published' AND week_start IN (${placeholders})
     GROUP BY shift_id, day`
  ).all(locationId, ...pastWeeks) as { shift_id: string; day: number; cnt: number }[];

  const trendMultiplier = await computeTrendMultiplier(db, locationId, weekStart);

  const matrix: ForecastMatrix = {};
  for (const r of rows) {
    const avg = Number(r.cnt) / pastWeeks.length;
    matrix[r.shift_id] ??= {};
    matrix[r.shift_id][Number(r.day)] = Math.max(0, Math.round(avg * trendMultiplier));
  }
  return matrix;
}
