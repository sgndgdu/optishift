/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";


// GET /api/reports/monthly?location_id=X&month=YYYY-MM
// Returns per-person monthly hours summary (published shifts only)
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const month = searchParams.get("month"); // YYYY-MM

  if (!location_id || !month) {
    return NextResponse.json({ error: "location_id ve month zorunlu" }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month formatı YYYY-MM olmalı" }, { status: 400 });
  }

  const db = getDB();
  try {
    // Verify location belongs to this org
    const loc = await db.prepare("SELECT id, name FROM locations WHERE id = ? AND org_id = ?")
      .get(location_id, auth.org_id) as { id: string; name: string } | undefined;
    if (!loc) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    // Calculate month boundaries
    const [year, mon] = month.split("-").map(Number);
    const monthStart = `${month}-01`;
    const lastDay = new Date(year, mon, 0).getDate();
    const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;

    // Include weeks that overlap with the month:
    // week [Monday..Sunday] overlaps if Monday <= monthEnd AND Monday+6 >= monthStart
    // → week_start <= monthEnd AND week_start >= date(monthStart, '-6 days')
    const weekRangeStart = new Date(monthStart);
    weekRangeStart.setDate(weekRangeStart.getDate() - 6);
    const weekRangeStartStr = weekRangeStart.toISOString().split("T")[0];

    const rows = await db.prepare(`
      SELECT
        sa.personnel_id,
        p.name AS personnel_name,
        p.title,
        sa.start_time,
        sa.end_time,
        sa.day,
        sa.week_start
      FROM shift_assignments sa
      JOIN personnel p ON sa.personnel_id = p.id
      WHERE sa.location_id = ?
        AND sa.week_start >= ?
        AND sa.week_start <= ?
        AND sa.publication_status = 'published'
        AND sa.status NOT IN ('absent', 'swapped')
      ORDER BY p.name ASC, sa.week_start ASC, sa.day ASC
    `).all(location_id, weekRangeStartStr, monthEnd) as any[];

    // Aggregate per person
    const personMap = new Map<string, {
      personnel_id: string;
      name: string;
      title: string;
      shift_count: number;
      total_minutes: number;
      overtime_minutes: number;
      week_hours: Map<string, number>;
    }>();

    for (const row of rows) {
      if (!personMap.has(row.personnel_id)) {
        personMap.set(row.personnel_id, {
          personnel_id: row.personnel_id,
          name: row.personnel_name ?? row.personnel_id,
          title: row.title ?? "",
          shift_count: 0,
          total_minutes: 0,
          overtime_minutes: 0,
          week_hours: new Map(),
        });
      }
      const person = personMap.get(row.personnel_id)!;

      if (row.start_time && row.end_time) {
        const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
        const startMin = toMin(row.start_time);
        let endMin = toMin(row.end_time);
        if (endMin <= startMin) endMin += 1440; // overnight shift
        const shiftMinutes = endMin - startMin;

        person.shift_count += 1;
        person.total_minutes += shiftMinutes;

        // Track weekly hours for overtime calculation (weekly > 45h = overtime)
        const weekKey = row.week_start;
        const prev = person.week_hours.get(weekKey) ?? 0;
        person.week_hours.set(weekKey, prev + shiftMinutes);
      } else {
        person.shift_count += 1;
      }
    }

    // Calculate overtime: per week, hours over 45h = overtime
    const WEEKLY_LIMIT = 45 * 60;
    for (const person of personMap.values()) {
      for (const weekMinutes of person.week_hours.values()) {
        if (weekMinutes > WEEKLY_LIMIT) {
          person.overtime_minutes += weekMinutes - WEEKLY_LIMIT;
        }
      }
    }

    // Build output
    const result = Array.from(personMap.values()).map(p => ({
      personnel_id: p.personnel_id,
      name: p.name,
      title: p.title,
      shift_count: p.shift_count,
      total_hours: Math.round((p.total_minutes / 60) * 10) / 10,
      overtime_hours: Math.round((p.overtime_minutes / 60) * 10) / 10,
    }));

    return NextResponse.json({ month, location: loc.name, rows: result });
  } finally {
  }
}
