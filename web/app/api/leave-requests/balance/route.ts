/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { computeLeaveBalance, isAnnualLeaveType } from "@/lib/leave";

// GET /api/leave-requests/balance[?personnel_id=...]
// Personel parametresiz çağırır → kendi bakiyesi. Müdür personnel_id ile sorgular.
// Kalan izin TÜRETİLMİŞ değerdir (lib/leave.ts) — burada hesaplanır, hiçbir yerde saklanmaz.
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const requested = searchParams.get("personnel_id");
  const personnel_id = auth.role === "employee" ? auth.personnel_id : (requested ?? auth.personnel_id);
  if (!personnel_id) return NextResponse.json({ error: "personnel_id zorunlu" }, { status: 400 });
  if (auth.role === "employee" && requested && requested !== auth.personnel_id) {
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  }

  const db = getDB();
  try {
    const p = await db.prepare(`
      SELECT id, org_id, primary_location_id, hire_date, annual_leave_days_total,
             leave_adjustment_days, weekly_off_day, night_restriction
      FROM personnel WHERE id = ?
    `).get(personnel_id) as any;
    if (!p || p.org_id !== auth.org_id) {
      return NextResponse.json({ error: "Personel bulunamadı" }, { status: 404 });
    }

    // Lokasyon kuralı: kıdeme göre otomatik hak ediş açık mı?
    let autoEntitlement = false;
    try {
      const loc = await db.prepare(`SELECT rules FROM locations WHERE id = ?`).get(p.primary_location_id) as any;
      autoEntitlement = JSON.parse(loc?.rules || "{}")?.auto_leave_entitlement_enabled === true;
    } catch { /* varsayılan kapalı */ }

    const leaves = await db.prepare(`
      SELECT type, start_date, end_date FROM leave_requests
      WHERE personnel_id = ? AND status = 'approved'
    `).all(personnel_id) as any[];

    const balance = computeLeaveBalance({
      hireDate: p.hire_date || null,
      autoEntitlement,
      fixedAnnualDays: p.annual_leave_days_total ?? 14,
      adjustmentDays: p.leave_adjustment_days ?? 0,
      weeklyOffDay: p.weekly_off_day ?? null,
      isMinor: p.night_restriction === "under18",
      approvedAnnualLeaves: leaves.filter(l => isAnnualLeaveType(l.type)),
    });

    return NextResponse.json({ personnel_id, ...balance });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
