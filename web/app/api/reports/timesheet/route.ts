/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// GET /api/reports/timesheet?location_id=X&month=YYYY-MM
// Check-in bazlı puantaj: kişi-gün satırları CSV olarak iner (bordro/muhasebe aktarımı).
// Kolonlar: sicil, ad, tarih, plan başlangıç/bitiş, plan saat, giriş, çıkış,
// gerçekleşen saat, geç kalma (dk), durum (geldi/gelmedi/devam ediyor).
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const month = searchParams.get("month"); // YYYY-MM
  if (!location_id || !month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "location_id ve month (YYYY-MM) zorunlu" }, { status: 400 });
  }

  const db = getDB();
  try {
    // Lokasyon org doğrulaması
    const loc = await db.prepare(`SELECT id FROM locations WHERE id = ? AND org_id = ?`).get(location_id, auth.org_id);
    if (!loc) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

    // Ayın gün aralığını kapsayan haftalar: ay başından 6 gün öncesi pazartesi'lerinden itibaren
    const monthStart = new Date(month + "-01T00:00:00Z");
    const monthEnd = new Date(monthStart);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

    const rows = await db.prepare(`
      SELECT sa.week_start, sa.day, sa.start_time, sa.end_time, sa.check_in_at, sa.check_out_at,
             p.name, p.employee_id
      FROM shift_assignments sa
      JOIN personnel p ON p.id = sa.personnel_id
      WHERE sa.location_id = ? AND sa.publication_status = 'published'
        AND sa.week_start >= ? AND sa.week_start <= ?
      ORDER BY p.name, sa.week_start, sa.day
    `).all(
      location_id,
      new Date(monthStart.getTime() - 6 * 86400_000).toISOString().split("T")[0],
      monthEnd.toISOString().split("T")[0],
    ) as any[];

    const toMin = (t?: string | null) => {
      if (!t) return null;
      const [h, m] = String(t).split(":").map(Number);
      return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
    };
    const fmtTs = (ts?: number | null) => {
      if (!ts) return "";
      const d = new Date(ts * 1000);
      return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
    };

    const lines = ["Sicil;Ad Soyad;Tarih;Plan Başlangıç;Plan Bitiş;Plan Saat;Giriş;Çıkış;Gerçekleşen Saat;Geç Kalma (dk);Durum"];
    const today = new Date();
    for (const r of rows) {
      const shiftDate = new Date(r.week_start + "T00:00:00Z");
      shiftDate.setUTCDate(shiftDate.getUTCDate() + Number(r.day ?? 0));
      if (shiftDate < monthStart || shiftDate >= monthEnd) continue; // ay dışı günleri ele
      const dateStr = shiftDate.toISOString().split("T")[0];

      const ps = toMin(r.start_time);
      let pe = toMin(r.end_time);
      let planH = "";
      if (ps !== null && pe !== null) {
        if (pe <= ps) pe += 1440;
        planH = ((pe - ps) / 60).toFixed(1).replace(".", ",");
      }

      let actualH = "";
      if (r.check_in_at && r.check_out_at) {
        actualH = (Math.max(0, r.check_out_at - r.check_in_at) / 3600).toFixed(1).replace(".", ",");
      }

      let lateMin = "";
      if (r.check_in_at && ps !== null) {
        const ci = new Date(r.check_in_at * 1000);
        const ciStr = ci.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Istanbul" });
        const ciMin = toMin(ciStr);
        if (ciMin !== null) {
          const diff = ciMin - ps;
          if (diff > 0 && diff < 12 * 60) lateMin = String(diff);
        }
      }

      const isPast = shiftDate.getTime() + 86400_000 < today.getTime();
      const status = r.check_out_at ? "Tamamlandı"
        : r.check_in_at ? "Devam ediyor / çıkış yok"
        : isPast ? "GELMEDİ" : "Planlı";

      const clean = (v: any) => String(v ?? "").replace(/;/g, ",");
      lines.push([
        clean(r.employee_id), clean(r.name), dateStr,
        clean(r.start_time), clean(r.end_time), planH,
        fmtTs(r.check_in_at), fmtTs(r.check_out_at), actualH, lateMin, status,
      ].join(";"));
    }

    // Excel'in Türkçe karakterleri doğru açması için UTF-8 BOM
    const csv = "﻿" + lines.join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="puantaj_${month}.csv"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
