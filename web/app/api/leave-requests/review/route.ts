import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leaveRequests, notifications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Database from "better-sqlite3";
import path from "path";
import { requireAuth } from "@/lib/auth";

const DB_PATH = path.join(process.cwd(), "optishift.db");

/**
 * İzin tarihleri arasındaki her gün için { week_start: string, day: number } listesi döndürür.
 * week_start = ISO Pazartesi tarihi, day = 0 (Pzt) … 6 (Paz)
 */
function getAffectedDays(startDate: string, endDate: string): { week_start: string; day: number }[] {
  const result: { week_start: string; day: number }[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  const cur = new Date(start);
  while (cur <= end) {
    const jsDay = cur.getDay(); // 0=Pazar, 1=Pzt … 6=Cmt
    const dayIdx = jsDay === 0 ? 6 : jsDay - 1; // 0=Pzt … 6=Paz

    // Haftanın Pazartesi'si
    const monday = new Date(cur);
    monday.setDate(cur.getDate() - dayIdx);
    const week_start = monday.toISOString().split("T")[0];

    result.push({ week_start, day: dayIdx });
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

// PATCH /api/leave-requests/review?id=X → {"status":"approved"|"rejected","reviewed_by":"P006"}
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!["manager", "admin", "supervisor"].includes(auth.role)) {
    return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

    const body = await req.json();
    const { status, reviewed_by } = body;

    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "status: approved veya rejected olmalı" }, { status: 400 });
    }

    // İzin talebini güncelle
    await db
      .update(leaveRequests)
      .set({ status, reviewed_by, reviewed_at: Math.floor(Date.now() / 1000) })
      .where(eq(leaveRequests.id, parseInt(id)));

    // Güncel kaydı çek
    const [request] = await db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.id, parseInt(id)))
      .limit(1);

    if (request) {
      const isApproved = status === "approved";

      // Personele bildirim gönder
      await db.insert(notifications).values({
        personnel_id: request.personnel_id,
        type: isApproved ? "leave_approved" : "leave_rejected",
        title: isApproved ? "İzin Talebiniz Onaylandı" : "İzin Talebiniz Reddedildi",
        message: `${request.start_date} - ${request.end_date} tarihli izin talebiniz ${isApproved ? "onaylandı" : "reddedildi"}.`,
        is_read: false,
        created_at: Math.floor(Date.now() / 1000),
      });

      // Onaylandıysa: shift_assignments ve availability'yi güncelle
      if (isApproved) {
        const affectedDays = getAffectedDays(request.start_date, request.end_date);
        const raw = new Database(DB_PATH);
        let affectedShiftCount = 0;

        try {
          for (const { week_start, day } of affectedDays) {
            // shift_assignments: o personelin o gün planlanan vardiyalarını absent yap
            const saResult = raw.prepare(`
              UPDATE shift_assignments
              SET status = 'absent'
              WHERE personnel_id = ? AND week_start = ? AND day = ? AND status != 'absent'
            `).run(request.personnel_id, week_start, day);
            affectedShiftCount += saResult.changes;

            // availability: o günü unavailable olarak işaretle
            // day_N sütununu dinamik olarak güncelliyoruz (day 0-6 → day_0…day_6)
            const dayCol = `day_${day}`;
            // Mevcut availability kaydı varsa güncelle, yoksa insert et
            const existing = raw.prepare(
              `SELECT id FROM availability WHERE personnel_id = ? AND week_start = ?`
            ).get(request.personnel_id, week_start) as { id: number } | undefined;

            if (existing) {
              raw.prepare(
                `UPDATE availability SET ${dayCol} = 'unavailable' WHERE personnel_id = ? AND week_start = ?`
              ).run(request.personnel_id, week_start);
            } else {
              // Yeni kayıt: varsayılan available, sadece izin günü unavailable
              const cols = ["day_0", "day_1", "day_2", "day_3", "day_4", "day_5", "day_6"];
              const vals = cols.map((c) => (c === dayCol ? "'unavailable'" : "'available'")).join(", ");
              raw.prepare(
                `INSERT INTO availability (personnel_id, week_start, ${cols.join(", ")}) VALUES (?, ?, ${vals})`
              ).run(request.personnel_id, week_start);
            }
          }

          console.log(`[leave-requests/review] İzin onaylandı — etkilenen vardiya: ${affectedShiftCount}`);
        } finally {
          raw.close();
        }
      }
    }

    return NextResponse.json({ success: true, status });
  } catch (err) {
    console.error("Leave request PATCH error:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
