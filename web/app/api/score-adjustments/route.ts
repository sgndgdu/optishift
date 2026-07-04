import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { locations, scoreAdjustments } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";

/**
 * GET /api/score-adjustments?location_id=... — lokasyonun puan olayları (müdür görünümü).
 * Fairness sayfasındaki kişi bazlı kırılımda "neden bu puan?" sorusunun olay ayağı.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  if (!location_id) {
    return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });
  }

  try {
    const loc = (await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, location_id), eq(locations.org_id, auth.org_id))))[0];
    if (!loc) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    const rows = await db
      .select()
      .from(scoreAdjustments)
      .where(eq(scoreAdjustments.location_id, location_id))
      .orderBy(desc(scoreAdjustments.created_at))
      .limit(200);

    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
