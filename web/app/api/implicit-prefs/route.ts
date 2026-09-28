/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { loadImplicitPrefs } from "@/lib/implicitPrefsData";

// GET ?location_id=&week_start= → { [personnel_id]: ImplicitAvoid[] } (öğrenilen tercihler, müdür görünümü)
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const week_start = searchParams.get("week_start");
  if (!location_id || !week_start || !/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
    return NextResponse.json({ error: "location_id ve week_start zorunlu" }, { status: 400 });
  }
  if (auth.role === "manager" && auth.location_id && auth.location_id !== location_id) {
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  }
  const db = getDB();
  const loc = await db.prepare(`SELECT shift_definitions FROM locations WHERE id = ? AND org_id = ?`).get(location_id, auth.org_id) as any;
  if (!loc) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  try {
    let defs: any[] = [];
    try { defs = typeof loc.shift_definitions === "string" ? JSON.parse(loc.shift_definitions) : (loc.shift_definitions ?? []); } catch { defs = []; }
    const people = await db.prepare(`SELECT id FROM personnel WHERE assigned_location_ids LIKE ? AND status = 'active'`)
      .all(`%"${location_id}"%`) as any[];
    return NextResponse.json(await loadImplicitPrefs(db, people.map(p => p.id), week_start,
      Object.fromEntries(defs.map(d => [String(d.id), String(d.name ?? "")]))));
  } catch (err: any) {
    console.error("[implicit-prefs]", err);
    return NextResponse.json({});
  }
}
