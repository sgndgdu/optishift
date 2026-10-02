import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { businessNow } from "@/lib/date";
import { generatePlan } from "@/lib/generatePlan";
import { canManageLocation } from "@/lib/access";
import { getDB } from "@/lib/db/client";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const branchId: string | undefined = body.locationId ?? body.location_id;
  if (!branchId) {
    return NextResponse.json(
      { error: "locationId (veya location_id) zorunlu" },
      { status: 400 }
    );
  }

  const week_start: string = (() => {
    if (body.week_start && /^\d{4}-\d{2}-\d{2}$/.test(body.week_start))
      return body.week_start;
    return businessNow().weekStart;
  })();

  if (!(await canManageLocation(getDB(), auth, branchId))) {
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  }
  const r = await generatePlan(auth.org_id, branchId, week_start, body);
  return NextResponse.json(r.body, { status: r.status });
}
