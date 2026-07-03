/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { rescoreWeek } from "@/lib/scoring";


const DAY_TR = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

// GET /api/schedule/force-assignments?personnel_id=X
// Personelin bekleyen zorunlu atama taleplerini getirir
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const personnel_id = searchParams.get("personnel_id");

  if (!personnel_id) {
    return NextResponse.json({ error: "personnel_id gerekli" }, { status: 400 });
  }

  // Güvenlik: employee sadece kendisine ait kayıtları görebilir
  if (auth.role === "employee" && auth.personnel_id !== personnel_id) {
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  }

  const db = getDB();
  try {
    const rows = await db.prepare(`
      SELECT sa.id, sa.personnel_id, sa.location_id, sa.week_start, sa.day,
             sa.start_time, sa.end_time, sa.shift_id, sa.force_bonus_multiplier,
             sa.force_acceptance_status, sa.publication_status,
             l.name as location_name
      FROM shift_assignments sa
      LEFT JOIN locations l ON sa.location_id = l.id
      WHERE sa.personnel_id = ? AND sa.force_assigned = true AND sa.force_acceptance_status = 'pending'
      ORDER BY sa.week_start, sa.day
    `).all(personnel_id) as any[];

    // Date label ekle
    const enriched = rows.map((r: any) => {
      const d = new Date(`${r.week_start}T00:00:00`);
      d.setDate(d.getDate() + r.day);
      return {
        ...r,
        date_str: d.toISOString().split("T")[0],
        day_label: DAY_TR[r.day] ?? "",
        date_label: `${DAY_TR[r.day] ?? ""} ${d.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}`,
      };
    });
    return NextResponse.json(enriched);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/schedule/force-assignments
// Personel zorunlu atamayı kabul veya reddeder
// body: { shift_id: number, action: 'accept' | 'reject' }
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { shift_id, action } = body;

  if (!shift_id || !["accept", "reject"].includes(action)) {
    return NextResponse.json({ error: "shift_id ve action (accept|reject) gerekli" }, { status: 400 });
  }

  const db = getDB();
  try {
    const shiftRow = await db.prepare(`
      SELECT sa.*, p.name as personnel_name, p.hero_count, p.prev_score, l.name as location_name
      FROM shift_assignments sa
      JOIN personnel p ON p.id = sa.personnel_id
      LEFT JOIN locations l ON sa.location_id = l.id
      WHERE sa.id = ?
    `).get(shift_id) as any;

    if (!shiftRow) {
      return NextResponse.json({ error: "Vardiya bulunamadı" }, { status: 404 });
    }

    // Güvenlik: employee sadece kendi vardiyasına yanıt verebilir
    if (auth.role === "employee" && auth.personnel_id !== shiftRow.personnel_id) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    if (shiftRow.force_acceptance_status !== "pending") {
      return NextResponse.json({ error: "Bu atama zaten yanıtlanmış" }, { status: 409 });
    }

    const now = Math.floor(Date.now() / 1000);
    const DAY_TR2 = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
    const shiftDate = new Date(`${shiftRow.week_start}T00:00:00`);
    shiftDate.setDate(shiftDate.getDate() + shiftRow.day);
    const dateLabel = `${DAY_TR2[shiftRow.day] ?? ""} ${shiftDate.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}`;
    const timeStr = shiftRow.start_time && shiftRow.end_time ? ` ${shiftRow.start_time}–${shiftRow.end_time}` : "";

    if (action === "accept") {
      const multiplier = shiftRow.force_bonus_multiplier ?? 1.5;

      await db.prepare(`
        UPDATE shift_assignments SET force_acceptance_status = 'accepted' WHERE id = ?
      `).run(shift_id);

      await db.prepare(`
        UPDATE personnel SET hero_count = COALESCE(hero_count, 0) + 1 WHERE id = ?
      `).run(shiftRow.personnel_id);

      // Bonus, o vardiyanın yük puanına ×force_bonus_multiplier çarpanı olarak işlenir —
      // prev_score'a düz puan eklenmez, hafta deterministik yeniden puanlanır.
      await rescoreWeek(auth.org_id, shiftRow.location_id, shiftRow.week_start);

      // Personele onay bildirimi
      await db.prepare(`
        INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
        VALUES (?, 'schedule', 'Zorunlu Atama Kabul Edildi', ?, '/portal/calendar', false, ?)
      `).run(
        shiftRow.personnel_id,
        `${dateLabel}${timeStr} vardiyasını kabul ettin. Bu vardiyanın puanı ×${multiplier} bonus çarpanıyla hesaplanacak.`,
        now,
      );

      // Müdüre bildirim — lokasyondaki manager/admin kullanıcıları bul
      const managers = await db.prepare(`
        SELECT u.personnel_id FROM users u
        WHERE u.org_id = ? AND u.role IN ('manager', 'admin') AND u.location_id = ?
      `).all(auth.org_id, shiftRow.location_id) as any[];

      for (const m of managers) {
        if (m.personnel_id) {
          await db.prepare(`
            INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
            VALUES (?, 'alert', 'Zorunlu Atama Kabul Edildi', ?, '/schedule', false, ?)
          `).run(
            m.personnel_id,
            `${shiftRow.personnel_name} — ${dateLabel}${timeStr} zorunlu atamasını kabul etti.`,
            now,
          );
        }
      }
      return NextResponse.json({ success: true, action: "accepted", bonus_multiplier: multiplier });
    }

    // Reject
    await db.prepare(`
      UPDATE shift_assignments SET force_acceptance_status = 'rejected', status = 'absent' WHERE id = ?
    `).run(shift_id);

    // Personele red bildirimi
    await db.prepare(`
      INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
      VALUES (?, 'alert', 'Zorunlu Atama Reddedildi', ?, '/portal/calendar', false, ?)
    `).run(
      shiftRow.personnel_id,
      `${dateLabel}${timeStr} zorunlu atamasını reddedин. Müdürün bilgilendirildi.`,
      now,
    );

    // Müdüre bildirim
    const managers2 = await db.prepare(`
      SELECT u.personnel_id FROM users u
      WHERE u.org_id = ? AND u.role IN ('manager', 'admin') AND u.location_id = ?
    `).all(auth.org_id, shiftRow.location_id) as any[];

    for (const m of managers2) {
      if (m.personnel_id) {
        await db.prepare(`
          INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
          VALUES (?, 'alert', 'Zorunlu Atama Reddedildi', ?, '/', false, ?)
        `).run(
          m.personnel_id,
          `${shiftRow.personnel_name} — ${dateLabel}${timeStr} zorunlu atamasını reddetti. İlgili vardiya açık bırakıldı.`,
          now,
        );
      }
    }
    return NextResponse.json({ success: true, action: "rejected" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
