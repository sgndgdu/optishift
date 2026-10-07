import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { canManageLocation } from "@/lib/access";
import { hasPerm } from "@/lib/userAccess";
import { businessToday } from "@/lib/date";
import { buildMonthlyGain, prevMonth } from "@/lib/monthlyGain";

// GET /api/reports/monthly-gain?location_id=&month=YYYY-MM → aylık kazanç raporu (lib/monthlyGain).
// Ay verilmezse geçen ay. Mesai maliyeti sadece "Ücretler ve maliyet" yetkisiyle.
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const locationId = sp.get("location_id");
  if (!locationId) return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });
  const thisMonth = businessToday().slice(0, 7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.get("month") ?? "") ? sp.get("month")! : prevMonth(thisMonth);
  if (month > thisMonth) return NextResponse.json({ error: "Gelecek ay için rapor yok" }, { status: 400 });
  const db = getDB();
  if (!(await canManageLocation(db, auth, locationId))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  try {
    return NextResponse.json(await buildMonthlyGain(db, auth.org_id, locationId, month, hasPerm(auth, "budget")));
  } catch (e) {
    console.error("[monthly-gain]", e);
    return NextResponse.json({ error: "Rapor hazırlanamadı" }, { status: 500 });
  }
}
