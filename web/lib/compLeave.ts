/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Denkleştirme izni (2026-10-10, kullanıcı isteği): izinli olduğu ya da "gelemem" dediği gün çalışmaya çağrılıp
 * gelen kişiye 1 günlük izin hakkı yazılır. Kişi bunu istediği gün izin talebiyle kullanır, sorumlu onaylar.
 * Kural: şube ayarı `rules.force_comp_leave_enabled` (varsayılan kapalı, Ayarlar › Adalet Puanı). Ek puandan
 * (force_bonus) bağımsızdır, ikisi birlikte de açılabilir.
 *
 * Bakiye TÜRETİLMİŞTİR (yıllık izin ve Adalet Puanı ile aynı felsefe), hiçbir yerde saklanmaz:
 *   kazanılan = kabul edilmiş çağrılmaların shift_assignments.comp_leave_days toplamı (kabul anında kural açıksa 1)
 *   kullanılan = onaylı "Denkleştirme İzni" talepleri (hafta tatili sayılmaz, lib/leave countLeaveDays)
 *   bekleyen  = bekleyen "Denkleştirme İzni" talepleri
 *   kalan     = kazanılan − kullanılan − bekleyen
 * Vardiya plandan silinirse kazanılan gün de düşer.
 */
import { countLeaveDays } from "@/lib/leave";

/** İzin talebinin türü (leave_requests.type Türkçe etiket tutar) */
export const COMP_LEAVE_TYPE = "Denkleştirme İzni";

export const isCompLeaveType = (t?: string | null) => t === COMP_LEAVE_TYPE || t === "comp_day";

/** Bir kabulde yazılan gün */
export const COMP_LEAVE_DAYS_PER_CALL = 1;

export interface CompLeaveEvent { date: string; start_time: string | null; end_time: string | null; days: number }
export interface CompLeaveBalance { earned: number; used: number; pending: number; available: number; events: CompLeaveEvent[] }

/** Saf hesap: kazanılan olaylar + talepler → bakiye. */
export function computeCompLeaveBalance(
  events: CompLeaveEvent[],
  requests: { start_date: string; end_date: string; status: string }[],
  weeklyOffDay?: number | null,
): CompLeaveBalance {
  const earned = events.reduce((t, e) => t + e.days, 0);
  const daysOf = (r: { start_date: string; end_date: string }) => countLeaveDays(r.start_date, r.end_date, weeklyOffDay);
  const used = requests.filter(r => r.status === "approved").reduce((t, r) => t + daysOf(r), 0);
  const pending = requests.filter(r => r.status === "pending").reduce((t, r) => t + daysOf(r), 0);
  return { earned, used, pending, available: Math.max(0, earned - used - pending), events };
}

const isoAdd = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Kişinin denkleştirme izni bakiyesi. `excludeRequestId`: onaylanmakta olan talebin kendisi bekleyenden düşülür. */
export async function loadCompLeaveBalance(db: any, personnelId: string, excludeRequestId?: number | string | null): Promise<CompLeaveBalance> {
  const p = await db.prepare(`SELECT weekly_off_day FROM personnel WHERE id = ?`).get(personnelId) as any;
  const rows = await db.prepare(`
    SELECT week_start, day, start_time, end_time, comp_leave_days FROM shift_assignments
    WHERE personnel_id = ? AND comp_leave_days > 0 AND force_acceptance_status = 'accepted'
    ORDER BY week_start, day
  `).all(personnelId) as any[];
  const reqs = await db.prepare(`
    SELECT id, start_date, end_date, status FROM leave_requests
    WHERE personnel_id = ? AND type IN (?, 'comp_day') AND status IN ('approved', 'pending')
  `).all(personnelId, COMP_LEAVE_TYPE) as any[];
  return computeCompLeaveBalance(
    rows.map(r => ({ date: isoAdd(r.week_start, Number(r.day)), start_time: r.start_time ?? null, end_time: r.end_time ?? null, days: Number(r.comp_leave_days) || 0 })),
    reqs.filter(r => excludeRequestId == null || String(r.id) !== String(excludeRequestId)),
    p?.weekly_off_day ?? null,
  );
}

/** Şube kuralı açık mı (kişinin vardiyasının şubesi). */
export async function compLeaveEnabled(db: any, locationId: string): Promise<boolean> {
  try {
    const loc = await db.prepare(`SELECT rules FROM locations WHERE id = ?`).get(locationId) as any;
    const r = typeof loc?.rules === "string" ? JSON.parse(loc.rules || "{}") : (loc?.rules ?? {});
    return r?.force_comp_leave_enabled === true;
  } catch { return false; }
}
