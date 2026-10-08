/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { businessToday, formatDateTR } from "@/lib/date";
import { canApproveLoan } from "@/lib/loans";
import { claimOpenShift, declineLoan } from "@/lib/openShifts";
import { notifyBranchManagers } from "@/lib/managerNotifications";

/**
 * Ödünç onayı (lib/loans): başka şubenin ilanını alan kişinin ana şubesinin sorumlusu karar verir.
 * GET ?location_id=<ana şube>: bekleyenler (Onaylar sayfası, menü rozeti, Ana Sayfa sayacı).
 * PATCH { id, decision: "approve" | "reject" }.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const locationId = new URL(req.url).searchParams.get("location_id");
  if (!locationId || !canApproveLoan(auth, locationId)) return NextResponse.json([]);
  const db = getDB();
  try {
    const rows = await db.prepare(`
      SELECT os.id, os.date, os.start_time, os.end_time, os.note, os.claimed_by, os.claimed_by_name, os.claimed_at,
             os.location_id, l.name AS location_name
      FROM open_shifts os JOIN locations l ON l.id = os.location_id
      WHERE os.org_id = ? AND os.status = 'loan_pending' AND os.loan_home_location_id = ? AND os.date >= ?
      ORDER BY os.date ASC, os.start_time ASC
    `).all(auth.org_id, locationId, businessToday());
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const db = getDB();
  try {
    const { id, decision } = await req.json();
    if (!id || (decision !== "approve" && decision !== "reject")) {
      return NextResponse.json({ error: "id ve karar zorunlu" }, { status: 400 });
    }
    const os = await db.prepare(`SELECT * FROM open_shifts WHERE id = ? AND org_id = ?`).get(id, auth.org_id) as any;
    if (!os || os.status !== "loan_pending") return NextResponse.json({ error: "Bu istek artık onay beklemiyor" }, { status: 409 });
    if (!canApproveLoan(auth, os.loan_home_location_id)) return NextResponse.json({ error: "Bu kişinin şubesi için onay yetkiniz yok" }, { status: 403 });

    if (decision === "reject") {
      const r = await declineLoan(db, auth.org_id, Number(id), "home");
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json({ success: true });
    }

    // Onay: kurallar yeniden denetlenir (bekleme sırasında plan değişmiş olabilir), vardiya plana yazılır
    const r = await claimOpenShift(db, auth.org_id, Number(id), os.claimed_by, os.claimed_by_name ?? null, { loanApproval: true });
    if (!r.ok) {
      const why = r.violations?.length ? `Kişinin planı çalışma kurallarına uymuyor: ${r.violations.join(" ")}` : r.error;
      return NextResponse.json({ error: `Onaylanamadı. ${why} İsteği reddedebilirsiniz.` }, { status: r.status });
    }
    await notifyBranchManagers(db, auth.org_id, os.location_id, "plan_settings", {
      type: "open_shift", title: "Ödünç onaylandı",
      message: `${os.claimed_by_name ?? "Kişinin"} ${formatDateTR(os.date)} ${os.start_time}–${os.end_time} vardiyasına gelmesi onaylandı. Vardiya planınıza yazıldı.`,
      link: "/schedule",
    }).catch(() => 0);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
