import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { canManageLocation } from "@/lib/access";
import { buildSuggestions } from "@/lib/suggestions";

// GET /api/suggestions?location_id= → Ana Sayfa hazır çözümleri (lib/suggestions). Kayıt yazmaz;
// "Uygula" tarayıcıda mevcut uçlarla yapılır (lib/copilot/applyAction).
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  const locationId = new URL(req.url).searchParams.get("location_id");
  if (!locationId) return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });
  const db = getDB();
  if (!(await canManageLocation(db, auth, locationId))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  try {
    return NextResponse.json({ suggestions: await buildSuggestions(db, auth, locationId) });
  } catch (e) {
    console.error("[suggestions]", e);
    return NextResponse.json({ suggestions: [] });
  }
}
