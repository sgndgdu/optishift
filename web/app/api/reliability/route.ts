/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { loadReliability } from "@/lib/reliabilityData";

// GET ?location_id= → { [personnel_id]: {shifts, missed, late, score} } (son 8 hafta, lib/reliability)
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  const location_id = new URL(req.url).searchParams.get("location_id");
  if (!location_id) return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });
  if (auth.role === "manager" && auth.location_id && auth.location_id !== location_id) {
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  }
  const db = getDB();
  const loc = await db.prepare(`SELECT id FROM locations WHERE id = ? AND org_id = ?`).get(location_id, auth.org_id);
  if (!loc) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  try {
    return NextResponse.json(await loadReliability(db, location_id));
  } catch (err: any) {
    console.error("[reliability]", err);
    return NextResponse.json({});
  }
}
