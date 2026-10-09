import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { canManageLocations, scopedLocationIds } from "@/lib/access";
import { hasPerm } from "@/lib/userAccess";
import { businessToday } from "@/lib/date";
import { buildTeamReport } from "@/lib/reports/teamReport";

// GET /api/reports/team?location_id=X&month=YYYY-MM → Raporlar › Özet (lib/reports/teamReport)
// location_id=all: kullanıcının kapsamındaki bütün şubeler (hesap sahibi, bölge sorumlusu). Ay verilmezse bu ay.
// Maliyet sadece "Ücretler ve maliyet" yetkisiyle.
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const loc = sp.get("location_id") ?? "";
  const thisMonth = businessToday().slice(0, 7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.get("month") ?? "") ? sp.get("month")! : thisMonth;
  if (month > thisMonth) return NextResponse.json({ error: "Gelecek ay için rapor yok" }, { status: 400 });
  const db = getDB();
  let ids: string[];
  if (loc === "all") {
    if (auth.role !== "admin" && auth.role !== "supervisor") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
    const scoped = await scopedLocationIds(db, auth);
    const all = await db.prepare(`SELECT id FROM locations WHERE org_id = ? ORDER BY name`).all(auth.org_id) as { id: string }[];
    ids = all.map(l => l.id).filter(id => !scoped || scoped.includes(id));
  } else {
    ids = loc.split(",").filter(Boolean).slice(0, 50);
    if (!ids.length) return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });
    if (!(await canManageLocations(db, auth, ids))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  }
  try {
    return NextResponse.json(await buildTeamReport(db, auth.org_id, ids, month, hasPerm(auth, "budget")));
  } catch (e) {
    console.error("[reports/team]", e);
    return NextResponse.json({ error: "Rapor hazırlanamadı" }, { status: 500 });
  }
}
