/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sendPushToPersonnel } from "@/lib/notifications";
import { rescoreWeek } from "@/lib/scoring";


function getDb() {
  return getDB();
}

// GET:
// ?location_id=...           → müdür: tüm açık vardiyalar
// ?location_id=...&status=open → personel: yalnız açık olanlar
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const status = searchParams.get("status");
  const org_id = auth.org_id; // token'dan al

  if (!location_id) {
    return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });
  }

  const db = getDB();
  try {
    let rows: any[];
    if (status) {
      rows = await db.prepare(`
        SELECT * FROM open_shifts
        WHERE org_id = ? AND location_id = ? AND status = ?
        ORDER BY date ASC, start_time ASC
      `).all(org_id, location_id, status);
    } else {
      rows = await db.prepare(`
        SELECT * FROM open_shifts
        WHERE org_id = ? AND location_id = ?
        ORDER BY date ASC, start_time ASC
      `).all(org_id, location_id);
    }
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Yeni açık vardiya ilanı (müdür)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const { location_id, date, start_time, end_time, note, hero_bonus_multiplier } = await req.json();
    const org_id = auth.org_id;

    if (!location_id || !date || !start_time || !end_time) {
      return NextResponse.json({ error: "Zorunlu alanlar eksik" }, { status: 400 });
    }

    const now = Math.floor(Date.now() / 1000);
    const result = await db.prepare(`
      INSERT INTO open_shifts (org_id, location_id, date, start_time, end_time, note, hero_bonus_multiplier, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
    `).run(org_id, location_id, date, start_time, end_time, note ?? null, hero_bonus_multiplier ?? 1.5, now);

    // Lokasyondaki tüm aktif personele bildirim gönder
    const activePersonnel = await db.prepare(
      `SELECT id FROM personnel WHERE primary_location_id = ? AND status = 'active'`
    ).all(location_id) as any[];
    const insertNotif = await db.prepare(`
      INSERT INTO notifications (personnel_id, type, title, message, created_at)
      VALUES (?, 'open_shift', ?, ?, ?)
    `);
    for (const p of activePersonnel) {
      insertNotif.run(
        p.id,
        `Acil Açık Vardiya — ${date}`,
        `${start_time}–${end_time} vardiyası için gönüllü aranıyor. Kabul edersen 1.5x Kahraman Bonusu kazanırsın!`,
        now
      );
      await sendPushToPersonnel(p.id, org_id, {
        title: `⚡ Acil Açık Vardiya — ${date}`,
        body: `${start_time}–${end_time} saatleri için gönüllü aranıyor. Kabul edersen ${hero_bonus_multiplier ?? 1.5}x bonus!`,
        url: "/portal/notifications",
      });
    }
    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH:
// Personel üstlenir: { id, claimed_by, claimed_by_name }  (claimed_by = personnel_id)
// Müdür iptal eder:  { id, status: 'cancelled' }
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const body = await req.json();
    const { id, claimed_by, claimed_by_name, status } = body;

    if (!id) {
      return NextResponse.json({ error: "id zorunlu" }, { status: 400 });
    }

    // Verify open shift belongs to this org
    const os = await db.prepare(`SELECT * FROM open_shifts WHERE id = ? AND org_id = ?`).get(id, auth.org_id) as any;
    if (!os) {
      return NextResponse.json({ error: "Vardiya bulunamadı" }, { status: 404 });
    }

    if (claimed_by) {
      const now = Math.floor(Date.now() / 1000);
      await db.prepare(`
        UPDATE open_shifts
        SET claimed_by = ?, claimed_by_name = ?, claimed_at = ?, status = 'claimed'
        WHERE id = ? AND status = 'open'
      `).run(claimed_by, claimed_by_name ?? null, now, id);

      // Kahraman bonusu: claimed_by = personnel_id
      await db.prepare(`UPDATE personnel SET hero_count = COALESCE(hero_count, 0) + 1 WHERE id = ?`).run(claimed_by);

      // Kapılan vardiyayı kahramanın takvimine işle (yoksa vardiya hiçbir takvimde görünmez)
      const dt = new Date(os.date + "T00:00:00Z");
      const dayIdx = (dt.getUTCDay() + 6) % 7; // 0 = Pazartesi
      const monday = new Date(dt);
      monday.setUTCDate(dt.getUTCDate() - dayIdx);
      const week_start = monday.toISOString().split("T")[0];
      const dup = await db.prepare(`
        SELECT id FROM shift_assignments
        WHERE personnel_id = ? AND week_start = ? AND day = ? AND start_time = ?
      `).get(claimed_by, week_start, dayIdx, os.start_time);
      if (!dup) {
        await db.prepare(`
          INSERT INTO shift_assignments (personnel_id, location_id, week_start, day, shift_id, start_time, end_time, points, status, publication_status, created_at)
          VALUES (?, ?, ?, ?, 'open-shift', ?, ?, 0, 'scheduled', 'published', ?)
        `).run(claimed_by, os.location_id, week_start, dayIdx, os.start_time, os.end_time, now);
      }

      // Kahraman çarpanı (×hero_bonus_multiplier) yük formülünde uygulanır —
      // prev_score'a doğrudan yazılmaz, hafta deterministik olarak yeniden puanlanır.
      await rescoreWeek(auth.org_id, os.location_id, week_start);

      // Kahramana onay bildirimi
      await db.prepare(`
        INSERT INTO notifications (personnel_id, type, title, message, created_at)
        VALUES (?, 'hero_bonus', '🦸 Kahraman Bonusu Kazandın!', ?, ?)
      `).run(
        claimed_by,
        `${os.date} tarihli ${os.start_time}–${os.end_time} vardiyasını üstlendin. Bu vardiya için ${os.hero_bonus_multiplier ?? 1.5}x bonus puan uygulandı.`,
        Math.floor(Date.now() / 1000)
      );
    } else if (status) {
      if (auth.role === "employee") {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      await db.prepare(`UPDATE open_shifts SET status = ? WHERE id = ?`).run(status, id);
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Vardiyayı sil (müdür)
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    // Verify ownership before deleting
    const existing = await db.prepare(`SELECT id FROM open_shifts WHERE id = ? AND org_id = ?`).get(id, auth.org_id);
    if (!existing) {
      return NextResponse.json({ error: "Vardiya bulunamadı" }, { status: 404 });
    }
    await db.prepare(`DELETE FROM open_shifts WHERE id = ?`).run(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
