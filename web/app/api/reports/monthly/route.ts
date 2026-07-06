/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAuth } from "@/lib/auth";

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
}

async function buildMonthlyReportXlsx(
  locationName: string,
  month: string,
  rows: { name: string; title: string; shift_count: number; total_hours: number; overtime_hours: number; overtime_cost: number | null }[],
) {
  const wsData: any[][] = [
    [`OptiShift — Aylık Çalışma Saati Raporu`],
    [`Şube: ${locationName}`],
    [`Dönem: ${monthLabel(month)}`],
    [],
    ["Ad Soyad", "Unvan", "Vardiya Sayısı", "Toplam Saat", "Fazla Mesai (sa)", "Mesai Maliyeti (₺, ×1,5)"],
    ...rows.map(r => [r.name, r.title, r.shift_count, r.total_hours, r.overtime_hours, r.overtime_cost ?? ""]),
    [],
    ["TOPLAM", "", rows.reduce((s, r) => s + r.shift_count, 0),
      Math.round(rows.reduce((s, r) => s + r.total_hours, 0) * 10) / 10,
      Math.round(rows.reduce((s, r) => s + r.overtime_hours, 0) * 10) / 10,
      rows.reduce((s, r) => s + (r.overtime_cost ?? 0), 0)],
  ];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Aylık Rapor");
  ws.columns = [{ width: 26 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 20 }];
  ws.addRows(wsData);
  ["A1", "A5", "B5", "C5", "D5", "E5", "F5"].forEach(cell => {
    ws.getCell(cell).font = { bold: true };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}


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
    const loc = await db.prepare("SELECT id, name, rules FROM locations WHERE id = ? AND org_id = ?")
      .get(location_id, auth.org_id) as { id: string; name: string; rules?: unknown } | undefined;
    if (!loc) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    // Mesai eşiği lokasyon kuralından (varsayılan 45s/hafta)
    let overtimeThresholdHours = 45;
    try {
      const r = typeof loc.rules === "string" ? JSON.parse(loc.rules) : loc.rules;
      if (typeof r?.overtime_threshold_hours === "number") overtimeThresholdHours = r.overtime_threshold_hours;
    } catch { /* varsayılan */ }

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
        p.hourly_wage,
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
      hourly_wage: number | null;
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
          hourly_wage: typeof row.hourly_wage === "number" ? row.hourly_wage : null,
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

    // Calculate overtime: per week, hours over threshold = overtime
    const WEEKLY_LIMIT = overtimeThresholdHours * 60;
    for (const person of personMap.values()) {
      for (const weekMinutes of person.week_hours.values()) {
        if (weekMinutes > WEEKLY_LIMIT) {
          person.overtime_minutes += weekMinutes - WEEKLY_LIMIT;
        }
      }
    }

    // Build output — maliyet: mesai saati × saatlik ücret × 1,5 (%50 zamlı)
    const result = Array.from(personMap.values()).map(p => {
      const overtime_hours = Math.round((p.overtime_minutes / 60) * 10) / 10;
      return {
        personnel_id: p.personnel_id,
        name: p.name,
        title: p.title,
        shift_count: p.shift_count,
        total_hours: Math.round((p.total_minutes / 60) * 10) / 10,
        overtime_hours,
        overtime_cost: p.hourly_wage ? Math.round(overtime_hours * p.hourly_wage * 1.5) : null,
      };
    });

    if (searchParams.get("format") === "xlsx") {
      const buf = await buildMonthlyReportXlsx(loc.name, month, result);
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="optishift-rapor-${month}.xlsx"`,
        },
      });
    }

    return NextResponse.json({ month, location: loc.name, overtime_threshold_hours: overtimeThresholdHours, rows: result });
  } finally {
  }
}
