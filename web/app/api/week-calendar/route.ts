import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { canManageLocation } from "@/lib/access";
import { buildWeekCalendar } from "@/lib/weekCalendar";

// GET ?location_id=&week_start= → plan haftasının takvimi (lib/weekCalendar): özel günler, geçmişle karşılaştırma, hava
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("location_id") ?? "";
  const weekStart = searchParams.get("week_start") ?? "";
  if (!locationId || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return NextResponse.json({ error: "location_id ve week_start zorunlu" }, { status: 400 });
  const db = getDB();
  if (!(await canManageLocation(db, auth, locationId))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  try {
    return NextResponse.json({ items: await buildWeekCalendar(db, locationId, weekStart) });
  } catch (e) {
    console.error("[week-calendar]", e);
    return NextResponse.json({ items: [] });
  }
}
