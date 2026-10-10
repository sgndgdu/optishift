/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { loadLeaveBalance } from "@/lib/leaveBalance";
import { loadCompLeaveBalance } from "@/lib/compLeave";

// GET /api/leave-requests/balance[?personnel_id=...]
// Personel parametresiz çağırır → kendi bakiyesi. Müdür personnel_id ile sorgular.
// Kalan izin TÜRETİLMİŞ değerdir (lib/leave.ts) — burada hesaplanır, hiçbir yerde saklanmaz.
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const requested = searchParams.get("personnel_id");
  const personnel_id = auth.role === "employee" ? auth.personnel_id : (requested ?? auth.personnel_id);
  if (!personnel_id) return NextResponse.json({ error: "personnel_id zorunlu" }, { status: 400 });
  if (auth.role === "employee" && requested && requested !== auth.personnel_id) {
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  }

  const db = getDB();
  try {
    const balance = await loadLeaveBalance(db, personnel_id, auth.org_id);
    if (!balance) {
      return NextResponse.json({ error: "Personel bulunamadı" }, { status: 404 });
    }
    // Denkleştirme izni (lib/compLeave): izin gününde çağrılıp gelince kazanılan günler
    const comp = await loadCompLeaveBalance(db, personnel_id);
    return NextResponse.json({ personnel_id, ...balance, comp_leave: { earned: comp.earned, used: comp.used, pending: comp.pending, available: comp.available } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
