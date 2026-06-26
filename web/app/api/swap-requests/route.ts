/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { swapReducer, toSwapEvent, SwapStatus } from "@/lib/swapReducer";
import { sendPushToPersonnel } from "@/lib/notifications";


// GET:
// ?requester_id=...           → benim gönderdiklerim
// ?target_id=...              → bana gelen talepler
// ?location_id=...&status=... → müdür: bekleyen onay listesi
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const requester_id = searchParams.get("requester_id");
  const target_id    = searchParams.get("target_id");
  const location_id  = searchParams.get("location_id");
  const status       = searchParams.get("status");
  const org_id       = auth.org_id;

  const db = getDB();
  try {
    let rows: any[];

    if (location_id && status) {
      if (auth.role === "employee") {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      rows = await db.prepare(`
        SELECT sr.*,
          rs.personnel_id as req_personnel_id, rs.day as req_day, rs.week_start as req_week_start, rs.start_time as req_start, rs.end_time as req_end,
          ts.personnel_id as tgt_personnel_id, ts.day as tgt_day, ts.week_start as tgt_week_start, ts.start_time as tgt_start, ts.end_time as tgt_end
        FROM shift_swap_requests sr
        LEFT JOIN shift_assignments rs ON sr.requester_shift_id = rs.id
        LEFT JOIN shift_assignments ts ON sr.target_shift_id = ts.id
        WHERE sr.org_id = ? AND sr.status = ? AND (rs.location_id = ? OR ts.location_id = ?)
        ORDER BY sr.created_at DESC
      `).all(org_id, status, location_id, location_id);
    } else if (requester_id) {
      // Employee can only read their own requests
      if (auth.role === "employee" && auth.personnel_id !== requester_id) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = await db.prepare(`
        SELECT sr.*,
          rs.day as req_day, rs.week_start as req_week_start, rs.start_time as req_start, rs.end_time as req_end,
          ts.day as tgt_day, ts.week_start as tgt_week_start, ts.start_time as tgt_start, ts.end_time as tgt_end
        FROM shift_swap_requests sr
        LEFT JOIN shift_assignments rs ON sr.requester_shift_id = rs.id
        LEFT JOIN shift_assignments ts ON sr.target_shift_id = ts.id
        WHERE sr.org_id = ? AND sr.requester_id = ?
        ORDER BY sr.created_at DESC
      `).all(org_id, requester_id);
    } else if (target_id) {
      if (auth.role === "employee" && auth.personnel_id !== target_id) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = await db.prepare(`
        SELECT sr.*,
          rs.day as req_day, rs.week_start as req_week_start, rs.start_time as req_start, rs.end_time as req_end,
          ts.day as tgt_day, ts.week_start as tgt_week_start, ts.start_time as tgt_start, ts.end_time as tgt_end
        FROM shift_swap_requests sr
        LEFT JOIN shift_assignments rs ON sr.requester_shift_id = rs.id
        LEFT JOIN shift_assignments ts ON sr.target_shift_id = ts.id
        WHERE sr.org_id = ? AND sr.target_id = ? AND sr.status = 'pending'
        ORDER BY sr.created_at DESC
      `).all(org_id, target_id);
    } else {
      return NextResponse.json({ error: "requester_id, target_id veya location_id+status zorunlu" }, { status: 400 });
    }
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Yeni swap talebi (personel)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const { requester_id, requester_name, target_id, target_name, requester_shift_id, target_shift_id, note } = await req.json();
    const org_id = auth.org_id;

    if (!requester_id || !target_id || !requester_shift_id || !target_shift_id) {
      return NextResponse.json({ error: "Zorunlu alanlar eksik" }, { status: 400 });
    }

    // Employee can only submit requests for themselves
    if (auth.role === "employee" && auth.personnel_id !== requester_id) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    const now = Math.floor(Date.now() / 1000);
    const result = await db.prepare(`
      INSERT INTO shift_swap_requests (org_id, requester_id, requester_name, target_id, target_name, requester_shift_id, target_shift_id, status, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(org_id, requester_id, requester_name ?? null, target_id, target_name ?? null, requester_shift_id, target_shift_id, note ?? null, now);

    // Hedef personele bildirim gönder
    const rName = requester_name ?? "Bir personel";
    await db.prepare(`
      INSERT INTO notifications (personnel_id, type, title, message, is_read, link, created_at)
      VALUES (?, 'trade_request', 'Vardiya Takas Teklifi', ?, 0, '/portal/requests', ?)
    `).run(
      target_id,
      `${rName} sizinle vardiya takas etmek istiyor. Talepler sayfasından yanıtlayın.`,
      now
    );
    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Durum güncelle — Factor 12 stateless reducer pattern
// API yüzeyi değişmedi: { id, status } gönderilir
// Geçerli geçişler swapReducer.ts'de tanımlı
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const { id, status } = await req.json();

    if (!id || !status) {
      return NextResponse.json({ error: "id ve status zorunlu" }, { status: 400 });
    }

    // Manager statüslerini sadece manager/admin/supervisor kullanabilir
    const managerStatuses = ["manager_approved", "manager_rejected"];
    if (managerStatuses.includes(status) && auth.role === "employee") {
      return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
    }

    const existing = await db.prepare(
      `SELECT * FROM shift_swap_requests WHERE id = ? AND org_id = ?`
    ).get(id, auth.org_id) as any;

    if (!existing) {
      return NextResponse.json({ error: "Talep bulunamadı" }, { status: 404 });
    }

    // API body → SwapEvent
    const event = toSwapEvent(status, auth.personnel_id);
    if (!event) {
      return NextResponse.json({ error: "Geçersiz durum değeri" }, { status: 400 });
    }

    // location_id'yi requester shift'ten al (Factor 6: hangi lokasyonun müdürüne gideceğini bilmek için)
    const requesterShift = await db.prepare(
      `SELECT location_id FROM shift_assignments WHERE id = ?`
    ).get(existing.requester_shift_id) as any;
    const location_id = requesterShift?.location_id ?? "";

    // Reducer: (mevcutDurum, olay, bağlam) → yeniDurum + yan etkiler
    const result = swapReducer(
      existing.status as SwapStatus,
      event,
      {
        target_id:          existing.target_id,
        requester_id:       existing.requester_id,
        requester_name:     existing.requester_name ?? "Personel",
        target_name:        existing.target_name    ?? "Personel",
        requester_shift_id: existing.requester_shift_id,
        target_shift_id:    existing.target_shift_id,
        location_id,
      }
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.httpStatus });
    }

    // Durum güncelle
    await db.prepare(`UPDATE shift_swap_requests SET status = ? WHERE id = ?`)
      .run(result.newStatus, id);

    // Yan etkileri uygula
    const now = Math.floor(Date.now() / 1000);
    const pushPromises: Promise<void>[] = [];

    for (const effect of result.sideEffects) {
      if (effect.type === "SWAP_SHIFTS") {
        const sa_r = await db.prepare(`SELECT * FROM shift_assignments WHERE id = ?`).get(effect.requester_shift_id) as any;
        const sa_t = await db.prepare(`SELECT * FROM shift_assignments WHERE id = ?`).get(effect.target_shift_id) as any;
        if (sa_r && sa_t) {
          await db.prepare(`UPDATE shift_assignments SET personnel_id = ?, status = 'scheduled' WHERE id = ?`)
            .run(sa_t.personnel_id, sa_r.id);
          await db.prepare(`UPDATE shift_assignments SET personnel_id = ?, status = 'scheduled' WHERE id = ?`)
            .run(sa_r.personnel_id, sa_t.id);
        }
      }

      if (effect.type === "NOTIFY") {
        await db.prepare(`
          INSERT INTO notifications (personnel_id, type, title, message, is_read, created_at)
          VALUES (?, 'trade_request', ?, ?, 0, ?)
        `).run(effect.personnel_id, effect.title, effect.message, now);

        // Push bildirimi de gönder (VAPID yapılandırıldıysa)
        pushPromises.push(
          sendPushToPersonnel(effect.personnel_id, auth.org_id, {
            title: effect.title,
            body: effect.message,
            url: "/portal/requests",
          })
        );
      }

      // Factor 7: akış duraklar → müdürü bul → bildir (Launch/Pause → insana araç gibi sor)
      if (effect.type === "NOTIFY_MANAGER") {
        const managers = await db.prepare(`
          SELECT personnel_id FROM users
          WHERE location_id = ? AND role IN ('manager', 'admin') AND personnel_id IS NOT NULL
        `).all(effect.location_id) as any[];

        for (const mgr of managers) {
          await db.prepare(`
            INSERT INTO notifications (personnel_id, type, title, message, is_read, created_at)
            VALUES (?, 'trade_request', ?, ?, 0, ?)
          `).run(mgr.personnel_id, effect.title, effect.message, now);

          pushPromises.push(
            sendPushToPersonnel(mgr.personnel_id, auth.org_id, {
              title: effect.title,
              body: effect.message,
              url: "/(app)/requests",
            })
          );
        }
      }
    }

    // Push bildirimleri DB kapandıktan sonra async gönder — HTTP yanıtını bloklamaz
    Promise.allSettled(pushPromises);

    return NextResponse.json({ success: true, newStatus: result.newStatus });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
