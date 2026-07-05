/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sendSMS, sendEmail, sendPushToPersonnel } from "@/lib/notifications";
import { rescoreWeek } from "@/lib/scoring";
import { deriveOvertimeForWeek } from "@/lib/overtime";
import { type ShiftDef } from "@/lib/fairness";


export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const body = await req.json();
    const { location_id, week_start } = body;

    if (!location_id || !week_start) {
      return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });
    }

    const loc = await db.prepare("SELECT id, shift_definitions, rules FROM locations WHERE id = ? AND org_id = ?")
      .get(location_id, auth.org_id) as any;
    if (!loc) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    const shiftDefs: ShiftDef[] = loc.shift_definitions
      ? (typeof loc.shift_definitions === "string" ? JSON.parse(loc.shift_definitions) : loc.shift_definitions)
      : [];

    // ── 1-6. Haftayı deterministik olarak puanla ─────────────────────────────
    // score_history DELETE+INSERT + kümülatif/z recompute — re-publish idempotent.
    // Kahraman ve zorunlu atama çarpanları lib/scoring.ts içinde uygulanır.
    await rescoreWeek(auth.org_id, location_id, week_start);

    // ── Mesai derive: yayınlanan saatlerden kişi başı haftalık toplam →
    // eşik üstü pending overtime_records (upsert — re-publish idempotent).
    // Yayınlanan plan otoritedir; motor taslağının kaydını günceller/temizler.
    // Mesaisi doğan personele onay bildirimi gider (İş K. m.41 — işçi onayı).
    try {
      const derivedOT = await deriveOvertimeForWeek(auth.org_id, location_id, week_start);
      for (const d of derivedOT) {
        await db.prepare(`
          INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
          VALUES (?, 'overtime', ?, ?, '/portal/requests', false, ?)
        `).run(
          d.personnelId,
          "Fazla Mesai Onayın Gerekiyor ⏰",
          `${week_start} haftasında ${d.overtimeHours} saat fazla mesain planlandı. Talepler sayfasından onayla ve telafi türünü seç (zamlı ücret / serbest zaman).`,
          Math.floor(Date.now() / 1000),
        );
      }
    } catch (e) {
      console.error("[publish] mesai derive hatası:", e);
    }

    // ── 7. Bildirimler ────────────────────────────────────────────────────────
    const activePersonnel = await db.prepare(`
      SELECT * FROM personnel WHERE assigned_location_ids LIKE ? AND status = 'active'
    `).all(`%"${location_id}"%`) as any[];

    let sentCount = 0;
    for (const p of activePersonnel) {
      await db.prepare(`
        INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
        VALUES (?, 'schedule', ?, ?, '/portal/calendar', false, ?)
      `).run(
        p.id,
        "Vardiya Programı Yayınlandı 📅",
        `${week_start} haftası için vardiya programı hazır. Takvimini kontrol et!`,
        Math.floor(Date.now() / 1000),
      );
      if (p.phone)  await sendSMS(p.phone, `Merhaba ${p.name}, ${week_start} haftası vardiya programın yayınlandı.`);
      if (p.email)  await sendEmail(p.email, "Yeni Vardiya Programı Yayınlandı", `Merhaba ${p.name},\n\n${week_start} haftası için vardiya programın sisteme yüklendi.`);
      await sendPushToPersonnel(p.id, auth.org_id, {
        title: "Vardiya Programın Yayınlandı 📅",
        body: `${week_start} haftası programın hazır. Kontrol et!`,
        url: "/portal/calendar",
      });
      sentCount++;
    }

    // ── 8. Yayın kaydı — revision takibi + snapshot ──────────────────────────
    const prevPub = await db.prepare(
      `SELECT MAX(revision) as max_rev FROM schedule_publications WHERE org_id = ? AND location_id = ? AND week_start = ?`
    ).get(auth.org_id, location_id, week_start) as any;
    const revision = prevPub?.max_rev != null ? prevPub.max_rev + 1 : 0;

    // Snapshot: atamalar + personel + departman bilgileri
    const locInfo = await db.prepare(`SELECT name FROM locations WHERE id = ?`).get(location_id) as any;
    const personnelRows2 = await db.prepare(
      `SELECT id, name, department_id FROM personnel WHERE org_id = ? AND assigned_location_ids LIKE ?`
    ).all(auth.org_id, `%"${location_id}"%`) as any[];
    const deptInfo = await db.prepare(`SELECT id, name FROM departments WHERE location_id = ?`).all(location_id) as any[];
    const pubAssignments = await db.prepare(
      `SELECT personnel_id, day, start_time, end_time, shift_id, points
       FROM shift_assignments WHERE location_id = ? AND week_start = ? AND publication_status = 'published'`
    ).all(location_id, week_start) as any[];

    const deptMap: Record<string, string> = {};
    for (const d of deptInfo) deptMap[d.id] = d.name;
    const personnelMap: Record<string, { name: string; dept_id: string }> = {};
    for (const p of personnelRows2) personnelMap[p.id] = { name: p.name, dept_id: p.department_id };

    const snapshot = JSON.stringify({
      locationName: locInfo?.name ?? "",
      shiftDefs,
      departments: deptInfo,
      assignments: pubAssignments.map((a: any) => ({
        personnelId: a.personnel_id,
        personnelName: personnelMap[a.personnel_id]?.name ?? a.personnel_id,
        departmentId: personnelMap[a.personnel_id]?.dept_id ?? null,
        departmentName: deptMap[personnelMap[a.personnel_id]?.dept_id ?? ""] ?? "Diğer",
        day: a.day,
        startTime: a.start_time,
        endTime: a.end_time,
        shiftId: a.shift_id,
        points: a.points,
      })),
    });

    await db.prepare(
      `INSERT INTO schedule_publications (org_id, location_id, week_start, revision, published_by, published_by_name, published_at, snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(auth.org_id, location_id, week_start, revision, auth.id, auth.name ?? "Yönetici", Math.floor(Date.now() / 1000), snapshot);
    return NextResponse.json({ success: true, message: `${sentCount} personele bildirim gönderildi.`, revision });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
