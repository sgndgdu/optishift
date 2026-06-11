import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "optishift.db");

// POST /api/schedule/send-for-review
// Body: { location_id, week_start }
// Tüm personele taslak inceleme bildirimi gönderir.
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!["manager", "admin", "supervisor"].includes(auth.role)) {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const { location_id, week_start } = await req.json();
  if (!location_id || !week_start) {
    return NextResponse.json({ error: "location_id ve week_start zorunlu" }, { status: 400 });
  }

  const db = new Database(DB_PATH);
  try {
    // Lokasyon bu org'a ait mi?
    const loc = db.prepare("SELECT id, name FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id) as { id: string; name: string } | undefined;
    if (!loc) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    // Bu haftada taslak vardiyası olan personel listesi
    const affected = db.prepare(`
      SELECT DISTINCT s.personnel_id
      FROM shift_assignments s
      WHERE s.location_id = ? AND s.week_start = ? AND s.publication_status = 'draft'
    `).all(location_id, week_start) as { personnel_id: string }[];

    if (affected.length === 0) {
      return NextResponse.json({ error: "Bu hafta için taslak vardiya bulunamadı." }, { status: 400 });
    }

    const weekLabel = new Date(week_start).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
    const now = Math.floor(Date.now() / 1000);

    const insertNotif = db.prepare(`
      INSERT INTO notifications (personnel_id, type, title, message, is_read, link, created_at)
      VALUES (?, 'schedule', ?, ?, 0, '/portal/calendar', ?)
    `);

    db.transaction(() => {
      for (const { personnel_id } of affected) {
        insertNotif.run(
          personnel_id,
          "Vardiya Planınız İncelemenize Sunuldu",
          `${weekLabel} haftasının taslak planı hazır. 48 saat içinde itirazlarınızı Talepler sayfasından iletebilirsiniz.`,
          now
        );
      }
    })();

    return NextResponse.json({ success: true, notified: affected.length });
  } finally {
    db.close();
  }
}
