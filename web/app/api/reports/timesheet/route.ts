/* eslint-disable @typescript-eslint/no-explicit-any */
import { breakMinutes, definedBreakFor, netWorkMinutes, shiftDefsFrom } from "@/lib/legal";
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { managerOutsideBranch } from "@/lib/access";

// GET /api/reports/timesheet?location_id=X&month=YYYY-MM
// Giriş bazlı puantaj: kişi-gün satırları CSV olarak iner (bordro/muhasebe aktarımı).
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
    const loc = await db.prepare(`SELECT id, shift_definitions FROM locations WHERE id = ? AND org_id = ?`).get(location_id, auth.org_id) as any;
    if (managerOutsideBranch(auth, location_id)) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    if (!loc) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    const shiftDefs = shiftDefsFrom(loc.shift_definitions);

    // Ayın gün aralığını kapsayan haftalar: ay başından 6 gün öncesi pazartesi'lerinden itibaren
    const monthStart = new Date(month + "-01T00:00:00Z");
    const monthEnd = new Date(monthStart);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

    const rows = await db.prepare(`
      SELECT sa.shift_id, sa.week_start, sa.day, sa.start_time, sa.end_time,
             p.name, p.employee_id
      FROM shift_assignments sa
      JOIN personnel p ON p.id = sa.personnel_id
      WHERE sa.location_id = ? AND sa.publication_status = 'published'
        AND sa.week_start >= ? AND sa.week_start <= ?
        AND COALESCE(sa.kind, 'regular') = 'regular'
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
    // Giriş/çıkış kaldırıldı (2026-10-10): saatler vardiyanın kendisinden (onaylanan saat düzeltmeleri vardiyaya yazılır)
    const lines = ["Sicil;Ad Soyad;Tarih;Başlangıç;Bitiş;Mola (dk);Saat;Durum"];
    const today = new Date();
    for (const r of rows) {
      const shiftDate = new Date(r.week_start + "T00:00:00Z");
      shiftDate.setUTCDate(shiftDate.getUTCDate() + Number(r.day ?? 0));
      if (shiftDate < monthStart || shiftDate >= monthEnd) continue; // ay dışı günleri ele
      const dateStr = shiftDate.toISOString().split("T")[0];

      const ps = toMin(r.start_time);
      let pe = toMin(r.end_time);
      // Saatler mola düşülerek (lib/legal: vardiya tanımındaki mola, yoksa yasal asgari)
      const defBreak = definedBreakFor(shiftDefs, r);
      let planH = "";
      let breakMin = "";
      if (ps !== null && pe !== null) {
        if (pe <= ps) pe += 1440;
        breakMin = String(breakMinutes(pe - ps, defBreak));
        planH = (netWorkMinutes(pe - ps, defBreak) / 60).toFixed(1).replace(".", ",");
      }

      const isPast = shiftDate.getTime() + 86400_000 < today.getTime();
      const status = isPast ? "Çalıştı" : "Planlı";

      const clean = (v: any) => String(v ?? "").replace(/;/g, ",");
      lines.push([
        clean(r.employee_id), clean(r.name), dateStr,
        clean(r.start_time), clean(r.end_time), breakMin, planH,
        status,
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
