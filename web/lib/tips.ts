/**
 * Dijital bahşiş/prim dağıtımı — salt matematik, motora dokunmaz.
 *
 * Bir tip_pools kaydı dönem (period_start..period_end) + toplam tutar taşır.
 * distributeTipPool() o dönemde şubede gerçekleşen shift_assignments'tan kişi
 * başı gerçek çalışılan dakikayı türetir (check_in_at/check_out_at farkı, yoksa
 * planlanan vardiya süresi fallback — lib/overtime.ts'teki shiftMinutes ile aynı
 * yaklaşım) ve tutarı bu orana göre tip_allocations'a böler.
 */
import { getDB } from "@/lib/db/client";
import { shiftMinutes } from "@/lib/overtime";

interface TipPoolRow {
  id: number;
  org_id: string;
  location_id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  status: string;
}

interface ShiftAssignmentRow {
  personnel_id: string;
  week_start: string;
  day: number;
  start_time: string | null;
  end_time: string | null;
  check_in_at: number | null;
  check_out_at: number | null;
}

function dateOfWeekDay(weekStart: string, day: number): string {
  const d = new Date(weekStart + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().slice(0, 10);
}

export type DistributeResult =
  | { ok: true; allocations: { personnel_id: string; worked_minutes: number; amount: number }[] }
  | { ok: false; error: string };

export async function distributeTipPool(poolId: number, orgId: string): Promise<DistributeResult> {
  const db = getDB();

  const pool = await db.prepare(
    `SELECT * FROM tip_pools WHERE id = ? AND org_id = ?`
  ).get(poolId, orgId) as TipPoolRow | undefined;
  if (!pool) return { ok: false, error: "Havuz bulunamadı" };
  if (pool.status === "distributed") return { ok: false, error: "Bu havuz zaten dağıtıldı" };

  // period_start'tan en fazla 7 gün önce başlayan haftalar, dönemi kapsayan tüm satırları içerir
  const weekFloor = new Date(pool.period_start + "T00:00:00Z");
  weekFloor.setUTCDate(weekFloor.getUTCDate() - 7);

  const rows = await db.prepare(
    `SELECT personnel_id, week_start, day, start_time, end_time, check_in_at, check_out_at
     FROM shift_assignments
     WHERE location_id = ? AND publication_status = 'published'
       AND week_start >= ? AND week_start <= ?`
  ).all(pool.location_id, weekFloor.toISOString().slice(0, 10), pool.period_end) as ShiftAssignmentRow[];

  const totals: Record<string, number> = {};
  for (const r of rows) {
    const date = dateOfWeekDay(r.week_start, r.day);
    if (date < pool.period_start || date > pool.period_end) continue;

    let minutes = 0;
    if (r.check_in_at != null && r.check_out_at != null) {
      minutes = Math.max(0, Math.round((r.check_out_at - r.check_in_at) / 60));
    } else if (r.start_time && r.end_time) {
      minutes = shiftMinutes(r.start_time, r.end_time);
    }
    if (minutes <= 0) continue;
    totals[r.personnel_id] = (totals[r.personnel_id] ?? 0) + minutes;
  }

  const totalMinutes = Object.values(totals).reduce((a, b) => a + b, 0);
  if (totalMinutes <= 0) {
    return { ok: false, error: "Bu dönemde dağıtıma esas çalışılmış vardiya bulunamadı" };
  }

  const allocations = Object.entries(totals).map(([personnel_id, worked_minutes]) => ({
    personnel_id,
    worked_minutes,
    amount: Math.round((pool.total_amount * (worked_minutes / totalMinutes)) * 100) / 100,
  }));

  for (const a of allocations) {
    await db.prepare(
      `INSERT INTO tip_allocations (tip_pool_id, personnel_id, worked_minutes, amount, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(poolId, a.personnel_id, a.worked_minutes, a.amount, Math.floor(Date.now() / 1000));
  }

  const distributedAmount = allocations.reduce((sum, a) => sum + a.amount, 0);
  await db.prepare(
    `UPDATE tip_pools SET status = 'distributed', distributed_amount = ? WHERE id = ?`
  ).run(distributedAmount, poolId);

  return { ok: true, allocations };
}
