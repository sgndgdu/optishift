/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tüm Şubeler › Genel Bakış için şube başına TEK BAKIŞ durumu (patron / bölge müdürü):
 * gelecek haftanın planı (published | draft | none), bugün vardiyadaki kişi sayısı ve
 * müdürün kararını bekleyen talep sayısı (izin + takas + saat düzeltme + fazla mesai).
 * Bölge müdürü sadece atandığı şubeleri alır (lib/access scopedLocationIds).
 */
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";
import { requireAuth } from "@/lib/auth";
import { getWeekStart, businessToday } from "@/lib/date";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "admin" && auth.role !== "supervisor") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  const db = getDB();
  try {
    let locs = await db.prepare("SELECT id FROM locations WHERE org_id = ?").all(auth.org_id) as { id: string }[];
    if (auth.role === "supervisor" && auth.managed_location_ids?.length) {
      locs = locs.filter(l => auth.managed_location_ids!.includes(l.id));
    }
    const ids = locs.map(l => l.id);
    if (!ids.length) return NextResponse.json({});
    const ph = ids.map(() => "?").join(",");
    const thisWeek = getWeekStart(0);
    const nextWeek = getWeekStart(1);
    const today = businessToday();
    const todayIdx = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7;

    const nextRows = await db.prepare(`
      SELECT location_id, publication_status, COUNT(*)::int AS n FROM shift_assignments
      WHERE location_id IN (${ph}) AND week_start = ? AND COALESCE(kind, 'regular') = 'regular'
      GROUP BY location_id, publication_status`).all(...ids, nextWeek) as any[];
    const todayRows = await db.prepare(`
      SELECT location_id, COUNT(DISTINCT personnel_id)::int AS n FROM shift_assignments
      WHERE location_id IN (${ph}) AND week_start = ? AND day = ? AND publication_status = 'published'
        AND COALESCE(kind, 'regular') = 'regular'
      GROUP BY location_id`).all(...ids, thisWeek, todayIdx) as any[];
    const pending = await db.prepare(`
      SELECT loc, COUNT(*)::int AS n FROM (
        SELECT p.primary_location_id AS loc FROM leave_requests r JOIN personnel p ON p.id = r.personnel_id
          WHERE r.status = 'pending' AND p.primary_location_id IN (${ph})
        UNION ALL
        SELECT p.primary_location_id FROM shift_swap_requests r JOIN personnel p ON p.id = r.requester_id
          WHERE r.status = 'peer_accepted' AND r.org_id = ? AND p.primary_location_id IN (${ph})
        UNION ALL
        SELECT p.primary_location_id FROM shift_edit_requests r JOIN personnel p ON p.id = r.personnel_id
          WHERE r.status = 'pending' AND r.org_id = ? AND p.primary_location_id IN (${ph})
        UNION ALL
        SELECT location_id FROM overtime_records WHERE status = 'pending' AND org_id = ? AND location_id IN (${ph})
      ) x GROUP BY loc`).all(...ids, auth.org_id, ...ids, auth.org_id, ...ids, auth.org_id, ...ids) as any[];

    const out: Record<string, { next_week: "published" | "draft" | "none"; today: number; pending: number }> = {};
    for (const id of ids) {
      const nr = nextRows.filter(r => r.location_id === id);
      const published = nr.some(r => r.publication_status === "published" && r.n > 0);
      const draft = nr.some(r => r.publication_status !== "published" && r.n > 0);
      out[id] = {
        next_week: published ? "published" : draft ? "draft" : "none",
        today: todayRows.find(r => r.location_id === id)?.n ?? 0,
        pending: pending.find(r => r.loc === id)?.n ?? 0,
      };
    }
    return NextResponse.json(out);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
