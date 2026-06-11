/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import * as XLSX from "xlsx";
import { requireAuth } from "@/lib/auth";

const DB_PATH = path.join(process.cwd(), "optishift.db");
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

  const db = new Database(DB_PATH);
  try {
    // Verify location belongs to auth org
    const locCheck = db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
    if (!locCheck) {
      db.close();
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    // Fetch shifts + personnel
    const shifts: any[] = db.prepare(`
      SELECT sa.*, p.name as personnel_name, p.title, p.prev_score
      FROM shift_assignments sa
      LEFT JOIN personnel p ON sa.personnel_id = p.id
      WHERE sa.location_id = ? AND sa.week_start = ?
      ORDER BY p.name ASC, sa.day ASC
    `).all(location_id, week_start);

    const location: any = db.prepare(`SELECT * FROM locations WHERE id = ?`).get(location_id);
    const orgRow: any   = db.prepare(`SELECT * FROM organizations WHERE id = ?`).get(location?.org_id ?? "");

    db.close();

    // ── Sheet 1: Yönetici KPI Özeti ─────────────────────────────────────
    const personnelMap = new Map<string, any>();
    for (const s of shifts) {
      if (!personnelMap.has(s.personnel_id)) {
        personnelMap.set(s.personnel_id, {
          name: s.personnel_name ?? s.personnel_id,
          title: s.title ?? "",
          shifts: [],
          total_hours: 0,
          prev_score: s.prev_score ?? 0,
          week_points: 0,
        });
      }
      const p = personnelMap.get(s.personnel_id);
      p.shifts.push(s);
      if (s.start_time && s.end_time) {
        const [sh, sm] = s.start_time.split(":").map(Number);
        const [eh, em] = s.end_time.split(":").map(Number);
        const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
        p.total_hours += Math.max(0, hours);
        // Bu haftanın puan hesabı (hafta sonu ×1.5, gece 22:00+ +2)
        const endMin = eh * 60 + em;
        const isWeekend = s.day === 5 || s.day === 6;
        const lateBonus = endMin > 22 * 60 ? 2 : 0;
        p.week_points += Math.round(hours * (isWeekend ? 1.5 : 1)) + lateBonus;
      }
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
      ["Ad Soyad", "Unvan", "Toplam Vardiya", "Toplam Saat", "Adalet Puanı", "Durum"],
    ];

    let totalShifts = 0, totalHours = 0;
    for (const [, p] of personnelMap) {
      kpiRows.push([
        p.name,
        p.title,
        p.shifts.length,
        Math.round(p.total_hours * 10) / 10,
        Math.round((p.prev_score + p.week_points) * 10) / 10,
        p.total_hours > 45 ? "⚠ Fazla Mesai" : "✓ Normal",
      ]);
      totalShifts += p.shifts.length;
      totalHours  += p.total_hours;
    }

    kpiRows.push([]);
    kpiRows.push(["TOPLAM", "", totalShifts, Math.round(totalHours * 10) / 10, "", ""]);

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
    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.aoa_to_sheet(kpiRows);
    ws1["!cols"] = [{ wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Yönetici Özeti");

    const ws2 = XLSX.utils.aoa_to_sheet(matrixRows);
    ws2["!cols"] = [{ wch: 22 }, { wch: 14 }, ...Array(7).fill({ wch: 14 })];
    XLSX.utils.book_append_sheet(wb, ws2, "Haftalık Plan");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

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
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
