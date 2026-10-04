/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Paylaşılan personel: bu şubenin çalışanlarının AYNI haftada BAŞKA şubelerdeki vardiyaları.
 * Vardiya Planı bunları gri (değiştirilemez) gösterir, Plan Kontrolü çakışma ve toplam saat için kullanır.
 */
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";
import { requireAuth } from "@/lib/auth";
import { canManageLocation } from "@/lib/access";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("location_id") ?? "";
  const weekStart = searchParams.get("week_start") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return NextResponse.json({ error: "week_start zorunlu" }, { status: 400 });
  const db = getDB();
  if (!(await canManageLocation(db, auth, locationId))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  try {
    const rows = await db.prepare(`
      SELECT sa.personnel_id, sa.day, sa.start_time, sa.end_time, sa.publication_status, l.name AS location_name
      FROM shift_assignments sa
      JOIN personnel p ON p.id = sa.personnel_id
      JOIN locations l ON l.id = sa.location_id
      WHERE sa.week_start = ? AND sa.location_id <> ? AND p.org_id = ? AND p.assigned_location_ids LIKE ?
        AND COALESCE(sa.kind, 'regular') = 'regular'
      ORDER BY sa.day`).all(weekStart, locationId, auth.org_id, `%"${locationId}"%`) as any[];
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
