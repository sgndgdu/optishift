/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { computeForecast } from "@/lib/forecast";

// GET ?location_id=&week_start= → { [shiftDefId]: { [day]: tahmini kişi sayısı } }
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
    const loc = await db.prepare(`SELECT id, rules FROM locations WHERE id = ? AND org_id = ?`).get(location_id, auth.org_id) as any;
    if (!loc) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

    let rules: any = {};
    try { rules = typeof loc.rules === "string" ? JSON.parse(loc.rules) : (loc.rules ?? {}); } catch { rules = {}; }
    if (rules.forecasting_enabled !== true) return NextResponse.json({ error: "Talep tahmini bu şubede kapalı" }, { status: 403 });

    const matrix = await computeForecast(location_id, week_start);
    return NextResponse.json(matrix);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
