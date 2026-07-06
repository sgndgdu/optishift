/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAuth } from "@/lib/auth";
import { computeWeekBreakdowns } from "@/lib/scoring";

const DAY_NAMES = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const week_start  = searchParams.get("week_start");

  if (!location_id || !week_start) {
    return NextResponse.json({ error: "location_id ve week_start zorunlu" }, { status: 400 });
  }

  const db = getDB();
  try {
    // Verify location belongs to auth org
    const locCheck = await db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
    if (!locCheck) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    // Fetch shifts + personnel
    const shifts: any[] = await db.prepare(`
      SELECT sa.*, p.name as personnel_name, p.title, p.prev_score
      FROM shift_assignments sa
      LEFT JOIN personnel p ON sa.personnel_id = p.id
      WHERE sa.location_id = ? AND sa.week_start = ?
      ORDER BY p.name ASC, sa.day ASC
    `).all(location_id, week_start);

    const location: any = await db.prepare(`SELECT * FROM locations WHERE id = ?`).get(location_id);
    const orgRow: any   = await db.prepare(`SELECT * FROM organizations WHERE id = ?`).get(location?.org_id ?? "");

    // ── Sheet 1: Yönetici KPI Özeti ─────────────────────────────────────
    // Haftalık yük resmi formülle hesaplanır (lib/fairness.ts calcWeeklyBurden —
    // zorluk × saat × çarpanlar); kümülatif puan yayınlanmışsa score_history'den okunur.
    const breakdowns = await computeWeekBreakdowns(auth.org_id, location_id, week_start);
    const burdenByPid = Object.fromEntries(breakdowns.map(b => [b.personnel_id, b]));

    const scoredRows = await db.prepare(
      `SELECT personnel_id, cumulative_burden FROM score_history WHERE location_id = ? AND week_start = ?`
    ).all(location_id, week_start) as any[];
    const cumulativeByPid: Record<string, number> = {};
    for (const r of scoredRows) cumulativeByPid[r.personnel_id] = r.cumulative_burden ?? 0;

    const personnelMap = new Map<string, any>();
    for (const s of shifts) {
      if (!personnelMap.has(s.personnel_id)) {
        const bd = burdenByPid[s.personnel_id];
        personnelMap.set(s.personnel_id, {
          name: s.personnel_name ?? s.personnel_id,
          title: s.title ?? "",
          shifts: [],
          total_hours: bd?.total_hours ?? 0,
          week_burden: bd?.burden_score ?? 0,
          // Yayınlanmış hafta: kesin kümülatif; değilse önizleme (birikimli + bu haftanın yükü)
          cumulative: cumulativeByPid[s.personnel_id] ?? Math.round(((s.prev_score ?? 0) + (bd?.burden_score ?? 0)) * 10) / 10,
        });
      }
      personnelMap.get(s.personnel_id).shifts.push(s);
    }

    const weekDate = new Date(week_start);
    const weekEnd  = new Date(week_start);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const kpiRows: any[][] = [
      [`OptiShift — Yönetici Özeti`],
      [`Şube: ${location?.name ?? location_id}`],
      [`Organizasyon: ${orgRow?.name ?? "—"}`],
      [`Hafta: ${weekDate.toLocaleDateString("tr-TR")} – ${weekEnd.toLocaleDateString("tr-TR")}`],
      [],
      ["Ad Soyad", "Unvan", "Toplam Vardiya", "Toplam Saat", "Haftalık Yük Puanı", "Kümülatif Adalet Puanı", "Durum"],
    ];

    let totalShifts = 0, totalHours = 0;
    for (const [, p] of personnelMap) {
      kpiRows.push([
        p.name,
        p.title,
        p.shifts.length,
        Math.round(p.total_hours * 10) / 10,
        Math.round(p.week_burden * 10) / 10,
        Math.round(p.cumulative * 10) / 10,
        p.total_hours > 45 ? "⚠ Fazla Mesai" : "✓ Normal",
      ]);
      totalShifts += p.shifts.length;
      totalHours  += p.total_hours;
    }

    kpiRows.push([]);
    kpiRows.push(["TOPLAM", "", totalShifts, Math.round(totalHours * 10) / 10, "", "", ""]);

    // ── Sheet 2: Haftalık Matris ─────────────────────────────────────────
    const personnel = [...personnelMap.entries()];
    const header = ["Ad Soyad", "Unvan", ...DAY_NAMES];

    const matrixRows: any[][] = [header];
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(week_start);
      d.setDate(d.getDate() + i);
      return `${DAY_NAMES[i]}\n${d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })}`;
    });
    matrixRows[0] = ["Ad Soyad", "Unvan", ...weekDates];

    for (const [pid, p] of personnel) {
      const row: any[] = [p.name, p.title];
      for (let day = 0; day < 7; day++) {
        const shift = p.shifts.find((s: any) => s.day === day);
        if (shift) {
          row.push(shift.start_time && shift.end_time ? `${shift.start_time}–${shift.end_time}` : "✓");
        } else {
          row.push("—");
        }
      }
      matrixRows.push(row);
    }

    // ── Build workbook ───────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();

    const ws1 = wb.addWorksheet("Yönetici Özeti");
    ws1.columns = [{ width: 22 }, { width: 16 }, { width: 14 }, { width: 12 }, { width: 16 }, { width: 20 }, { width: 14 }];
    ws1.addRows(kpiRows);

    const ws2 = wb.addWorksheet("Haftalık Plan");
    ws2.columns = [{ width: 22 }, { width: 14 }, ...Array(7).fill({ width: 14 })];
    ws2.addRows(matrixRows);

    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    // Content-Disposition header ASCII-only gerektirir; Türkçe karakterleri kaldır
    const safeLocName = (location?.name ?? location_id)
      .replace(/[ğĞ]/g, "g").replace(/[üÜ]/g, "u").replace(/[şŞ]/g, "s")
      .replace(/[ıİ]/g, "i").replace(/[öÖ]/g, "o").replace(/[çÇ]/g, "c")
      .replace(/[^a-zA-Z0-9-]/g, "_");
    const filename = `optishift-${safeLocName}-${week_start}.xlsx`;
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
