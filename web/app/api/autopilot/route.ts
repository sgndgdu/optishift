import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { autopilotStatus } from "@/lib/autopilot";

// GET /api/autopilot?location_id=X: otomatik pilot durumu (Ana Sayfa maddesi, Vardiya Planı şeridi)
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  const locationId = req.nextUrl.searchParams.get("location_id") || auth.location_id;
  if (!locationId) return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });
  // autopilotStatus şubeyi org_id ile süzer: başka işletmenin şubesi null döner
  const status = await autopilotStatus({ id: locationId, org_id: auth.org_id });
  if (!status) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  return NextResponse.json(status);
}
