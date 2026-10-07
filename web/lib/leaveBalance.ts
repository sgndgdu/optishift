/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Kişinin yıllık izin bakiyesi (sunucu): TEK KAYNAK. Hesap lib/leave computeLeaveBalance (saf); burada kişi,
 * şube kuralı ve onaylı izinler okunur. Kullananlar: /api/leave-requests/balance, ekip üyesinin asistanı.
 */
import { computeLeaveBalance, isAnnualLeaveType, type LeaveBalance } from "@/lib/leave";

export async function loadLeaveBalance(db: any, personnelId: string, orgId: string): Promise<LeaveBalance | null> {
  const p = await db.prepare(`
    SELECT id, org_id, primary_location_id, hire_date, annual_leave_days_total,
           leave_adjustment_days, weekly_off_day, night_restriction
    FROM personnel WHERE id = ?
  `).get(personnelId) as any;
  if (!p || p.org_id !== orgId) return null;

  // Lokasyon kuralı: kıdeme göre otomatik hak ediş açık mı?
  let autoEntitlement = false;
  try {
    const loc = await db.prepare(`SELECT rules FROM locations WHERE id = ?`).get(p.primary_location_id) as any;
    autoEntitlement = JSON.parse(loc?.rules || "{}")?.auto_leave_entitlement_enabled === true;
  } catch { /* varsayılan kapalı */ }

  const leaves = await db.prepare(`
    SELECT type, start_date, end_date FROM leave_requests
    WHERE personnel_id = ? AND status = 'approved'
  `).all(personnelId) as any[];

  return computeLeaveBalance({
    hireDate: p.hire_date || null,
    autoEntitlement,
    fixedAnnualDays: p.annual_leave_days_total ?? 14,
    adjustmentDays: p.leave_adjustment_days ?? 0,
    weeklyOffDay: p.weekly_off_day ?? null,
    isMinor: p.night_restriction === "under18",
    approvedAnnualLeaves: leaves.filter(l => isAnnualLeaveType(l.type)),
  });
}
