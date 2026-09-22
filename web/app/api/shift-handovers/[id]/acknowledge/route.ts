/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { acknowledgeHandover } from "@/lib/handover";

// PATCH — "Okudum, Teslim Aldım". Kiosk kendi PIN akışı içinde check-in gate'i
// üzerinden zaten acknowledge ediyor (bkz. lib/handover.ts checkHandoverGate);
// bu route portal'daki bağımsız "notu şimdi onayla" ekranı içindir.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.personnel_id) return NextResponse.json({ error: "Bu işlem personel hesabı gerektirir" }, { status: 403 });

  const { id } = await params;
  const handoverId = Number(id);
  if (!Number.isInteger(handoverId)) return NextResponse.json({ error: "Geçersiz id" }, { status: 400 });

  const db = getDB();
  try {
    const outcome = await acknowledgeHandover(db, { id: handoverId, personnelId: auth.personnel_id });
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
