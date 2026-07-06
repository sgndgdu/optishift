import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sendAvailabilityReminders } from "@/lib/availabilityReminders";

// POST /api/availability/remind
// Finds active personnel in the org/location who haven't submitted availability
// for the current week, and creates a notification for each one.
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role !== "manager" && auth.role !== "admin" && auth.role !== "supervisor") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const result = await sendAvailabilityReminders({
      orgId: auth.org_id,
      locationId: body.location_id ?? "",
      weekStart: body.week_start,
      auto: body.auto === true,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sunucu hatası" }, { status: 500 });
  }
}
