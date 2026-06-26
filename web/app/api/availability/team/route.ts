/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";


// GET /api/availability/team?location_id=L-001&week_start=2026-06-02
// Müdür için tüm personelin o haftaki müsaitliğini döndürür
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const week_start = searchParams.get("week_start");

  if (!location_id || !week_start) {
    return NextResponse.json({ error: "location_id ve week_start zorunlu" }, { status: 400 });
  }

  const db = getDB();

  try {
    // Verify location belongs to auth org
    const loc = await db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
    if (!loc) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    // Get all personnel for this location
    const personnel = await db.prepare(
      `SELECT id, name, title, department_id FROM personnel WHERE primary_location_id = ? AND status = 'active'`
    ).all(location_id) as any[];

    // Get their availability for this week
    const results = await Promise.all(personnel.map(async (p) => {
      const avail = await db.prepare(
        `SELECT * FROM availability WHERE personnel_id = ? AND week_start = ?`
      ).get(p.id, week_start) as any;

      const days = avail ? [0,1,2,3,4,5,6].map((i) => ({
        status: avail[`day_${i}`] ?? "available",
        start: avail[`day_${i}_start`] ?? null,
        end: avail[`day_${i}_end`] ?? null,
      })) : null;

      return {
        personnel_id: p.id,
        name: p.name,
        title: p.title,
        submitted: !!avail,
        submitted_at: avail?.submitted_at ?? null,
        days,
      };
    }));
    return NextResponse.json({ week_start, location_id, personnel: results });
  } catch (err) {
    console.error("Team availability error:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
