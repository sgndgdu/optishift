/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { claimOpenShift } from "@/lib/openShifts";

async function shiftBiddingEnabledForLocation(db: ReturnType<typeof getDB>, locationId: string): Promise<boolean> {
  const loc = await db.prepare(`SELECT rules FROM locations WHERE id = ?`).get(locationId) as any;
  if (!loc?.rules) return false;
  try { return JSON.parse(loc.rules).shift_bidding_enabled === true; } catch { return false; }
}

// GET ?open_shift_id= — müdür: tüm teklifler; personel: sadece kendi teklifi
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const open_shift_id = searchParams.get("open_shift_id");
  if (!open_shift_id) return NextResponse.json({ error: "open_shift_id zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    const os = await db.prepare(`SELECT id FROM open_shifts WHERE id = ? AND org_id = ?`).get(open_shift_id, auth.org_id);
    if (!os) return NextResponse.json({ error: "Vardiya bulunamadı" }, { status: 404 });

    if (auth.role === "employee") {
      const rows = await db.prepare(
        `SELECT * FROM shift_bids WHERE open_shift_id = ? AND personnel_id = ?`
      ).all(open_shift_id, auth.personnel_id);
      return NextResponse.json(rows);
    }

    const rows = await db.prepare(
      `SELECT sb.*, p.name as personnel_name
       FROM shift_bids sb
       LEFT JOIN personnel p ON p.id = sb.personnel_id
       WHERE sb.open_shift_id = ?
       ORDER BY sb.requested_bonus_points ASC, sb.created_at ASC`
    ).all(open_shift_id);
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: personel teklif verir (varsa bekleyen teklifini günceller)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "employee") return NextResponse.json({ error: "Sadece personel teklif verebilir" }, { status: 403 });
  if (!auth.personnel_id) return NextResponse.json({ error: "Personel kaydı bulunamadı" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { open_shift_id, requested_bonus_points, note } = body;
  if (!open_shift_id || typeof requested_bonus_points !== "number" || requested_bonus_points <= 0) {
    return NextResponse.json({ error: "open_shift_id ve 0'dan büyük requested_bonus_points zorunlu" }, { status: 400 });
  }

  const db = getDB();
  try {
    const os = await db.prepare(`SELECT * FROM open_shifts WHERE id = ? AND org_id = ?`).get(open_shift_id, auth.org_id) as any;
    if (!os) return NextResponse.json({ error: "Vardiya bulunamadı" }, { status: 404 });
    if (os.status !== "open") return NextResponse.json({ error: "Bu vardiya artık açık değil" }, { status: 409 });
    if (!(await shiftBiddingEnabledForLocation(db, os.location_id))) {
      return NextResponse.json({ error: "Bu şubede teklif sistemi kapalı" }, { status: 422 });
    }

    const existing = await db.prepare(
      `SELECT id FROM shift_bids WHERE open_shift_id = ? AND personnel_id = ? AND status = 'pending'`
    ).get(open_shift_id, auth.personnel_id) as any;

    if (existing) {
      await db.prepare(`UPDATE shift_bids SET requested_bonus_points = ?, note = ? WHERE id = ?`)
        .run(requested_bonus_points, note ?? null, existing.id);
      return NextResponse.json({ success: true, id: existing.id, updated: true });
    }

    const result = await db.prepare(
      `INSERT INTO shift_bids (open_shift_id, personnel_id, requested_bonus_points, note, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?) RETURNING id`
    ).get(open_shift_id, auth.personnel_id, requested_bonus_points, note ?? null, Math.floor(Date.now() / 1000)) as any;

    return NextResponse.json({ success: true, id: result.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH {id, action: "accept"|"reject"} — sadece müdür/admin/supervisor
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { id, action } = body;
  if (!id || (action !== "accept" && action !== "reject")) {
    return NextResponse.json({ error: "id ve action:'accept'|'reject' zorunlu" }, { status: 400 });
  }

  const db = getDB();
  try {
    const bid = await db.prepare(
      `SELECT sb.*, os.org_id, os.status as open_shift_status, p.name as personnel_name
       FROM shift_bids sb
       JOIN open_shifts os ON os.id = sb.open_shift_id
       LEFT JOIN personnel p ON p.id = sb.personnel_id
       WHERE sb.id = ?`
    ).get(id) as any;
    if (!bid || bid.org_id !== auth.org_id) return NextResponse.json({ error: "Teklif bulunamadı" }, { status: 404 });
    if (bid.status !== "pending") return NextResponse.json({ error: "Bu teklif zaten karara bağlanmış" }, { status: 409 });

    const now = Math.floor(Date.now() / 1000);

    if (action === "reject") {
      await db.prepare(`UPDATE shift_bids SET status = 'rejected' WHERE id = ?`).run(id);
      await db.prepare(
        `INSERT INTO notifications (personnel_id, type, title, message, created_at)
         VALUES (?, 'shift_bid', 'Teklifin reddedildi', 'Açık vardiya için verdiğin teklif müdürün tarafından reddedildi.', ?)`
      ).run(bid.personnel_id, now);
      return NextResponse.json({ success: true });
    }

    if (bid.open_shift_status !== "open") {
      return NextResponse.json({ error: "Bu vardiya artık açık değil" }, { status: 409 });
    }

    const outcome = await claimOpenShift(db, auth.org_id, bid.open_shift_id, bid.personnel_id, bid.personnel_name ?? null, {
      overrideBonusPoints: bid.requested_bonus_points,
    });
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });

    await db.prepare(`UPDATE shift_bids SET status = 'accepted' WHERE id = ?`).run(id);

    const otherPending = await db.prepare(
      `SELECT id, personnel_id FROM shift_bids WHERE open_shift_id = ? AND id != ? AND status = 'pending'`
    ).all(bid.open_shift_id, id) as any[];
    for (const other of otherPending) {
      await db.prepare(`UPDATE shift_bids SET status = 'rejected' WHERE id = ?`).run(other.id);
      await db.prepare(
        `INSERT INTO notifications (personnel_id, type, title, message, created_at)
         VALUES (?, 'shift_bid', 'Teklifin reddedildi', 'Açık vardiya başka bir personele verildi.', ?)`
      ).run(other.personnel_id, now);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
