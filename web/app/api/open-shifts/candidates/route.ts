/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// GET ?id=<open_shift_id> — açık vardiya için uygun aday listesi (müdür).
// Filtre: o gün başka vardiyası olan, "kesinlikle gelemem" işaretleyen, gece
// kısıtlısı (gece vardiyasıysa) elenir. Kalanlar adalet puanına göre (en az
// yük taşıyan önce) sıralanır; saat limiti ve dinlenme sıkıntıları uyarı olur.
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    const os = await db.prepare(`SELECT * FROM open_shifts WHERE id = ? AND org_id = ?`).get(id, auth.org_id) as any;
    if (!os) return NextResponse.json({ error: "Açık vardiya bulunamadı" }, { status: 404 });

    // Tarih → hafta + gün indeksi
    const dt = new Date(os.date + "T00:00:00Z");
    const dayIdx = (dt.getUTCDay() + 6) % 7; // 0 = Pazartesi
    const monday = new Date(dt);
    monday.setUTCDate(dt.getUTCDate() - dayIdx);
    const week_start = monday.toISOString().split("T")[0];

    const toMin = (t?: string | null) => {
      if (!t) return null;
      const [h, m] = String(t).split(":").map(Number);
      return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
    };
    const osStart = toMin(os.start_time) ?? 0;
    let osEnd = toMin(os.end_time) ?? 0;
    if (osEnd <= osStart) osEnd += 1440;
    const osDurationH = (osEnd - osStart) / 60;
    const osIsNight = osStart >= 22 * 60 || osEnd > 24 * 60;

    // Lokasyondaki aktif personel (müdür/admin hariç)
    const people = await db.prepare(`
      SELECT id, name, prev_score, max_weekly_hours, night_restriction, weekly_off_day, user_access_level
      FROM personnel
      WHERE assigned_location_ids LIKE ? AND status = 'active'
    `).all(`%"${os.location_id}"%`) as any[];
    const eligible = people.filter(p => !["manager", "admin", "supervisor"].includes(p.user_access_level));

    // O haftanın atamaları (gün çakışması, saat toplamı, dinlenme kontrolü)
    const asgs = await db.prepare(`
      SELECT personnel_id, day, start_time, end_time FROM shift_assignments
      WHERE location_id = ? AND week_start = ?
    `).all(os.location_id, week_start) as any[];
    const byPerson: Record<string, any[]> = {};
    for (const a of asgs) (byPerson[a.personnel_id] ??= []).push(a);

    // O haftanın müsaitliği
    const ids = eligible.map(p => p.id);
    let availRows: any[] = [];
    if (ids.length > 0) {
      const ph = ids.map((_, i) => `$${i + 1}`).join(",");
      availRows = await db.prepare(
        `SELECT * FROM availability WHERE personnel_id IN (${ph}) AND week_start = $${ids.length + 1}`
      ).all(...ids, week_start) as any[];
    }
    const availByPerson: Record<string, any> = {};
    for (const av of availRows) availByPerson[av.personnel_id] = av;
    const dayStatus = (pid: string) => {
      const raw = availByPerson[pid]?.[`day_${dayIdx}`];
      if (!raw) return "available";
      if (typeof raw === "string" && raw.startsWith("{")) {
        try { return JSON.parse(raw)?.status ?? "available"; } catch { return "available"; }
      }
      return raw;
    };

    const candidates = [];
    for (const p of eligible) {
      // O gün zaten vardiyası varsa veya sabit izin günüyse elenir
      const mine = byPerson[p.id] ?? [];
      if (mine.some(a => Number(a.day) === dayIdx)) continue;
      if (p.weekly_off_day !== null && Number(p.weekly_off_day) === dayIdx) continue;
      if (dayStatus(p.id) === "unavailable") continue;
      if (osIsNight && p.night_restriction) continue;

      const warnings: string[] = [];
      if (dayStatus(p.id) === "preferred_not") warnings.push("Bu günü tercih etmiyor (sarı)");

      // Haftalık saat toplamı + bu vardiya limiti aşar mı?
      let weekMin = 0;
      for (const a of mine) {
        const s = toMin(a.start_time); let e = toMin(a.end_time);
        if (s === null || e === null) continue;
        if (e <= s) e += 1440;
        weekMin += e - s;
      }
      const maxH = p.max_weekly_hours ?? 45;
      const newTotalH = Math.round((weekMin / 60 + osDurationH) * 10) / 10;
      if (newTotalH > maxH) warnings.push(`Haftalık ${newTotalH}s olur — limit ${maxH}s`);

      // Komşu gün dinlenme kontrolü (11 saat)
      const prevA = mine.find(a => Number(a.day) === dayIdx - 1);
      if (prevA) {
        const pe = toMin(prevA.end_time); const ps = toMin(prevA.start_time);
        if (pe !== null && ps !== null) {
          const prevEnd = pe <= ps ? pe + 1440 : pe;
          const gap = (osStart + 1440) - prevEnd;
          if (gap < 11 * 60) warnings.push(`Önceki günle arasında ${Math.round(gap / 6) / 10}s dinlenme kalır (min 11s)`);
        }
      }
      const nextA = mine.find(a => Number(a.day) === dayIdx + 1);
      if (nextA) {
        const ns = toMin(nextA.start_time);
        if (ns !== null) {
          const gap = (ns + 1440) - osEnd;
          if (gap < 11 * 60) warnings.push(`Ertesi günle arasında ${Math.round(gap / 6) / 10}s dinlenme kalır (min 11s)`);
        }
      }

      candidates.push({
        personnel_id: p.id,
        name: p.name,
        prev_score: p.prev_score ?? 0,
        warnings,
      });
    }

    // En az yük taşıyan (adalet sırası önde) + uyarısızlar önce
    candidates.sort((a, b) =>
      (a.warnings.length - b.warnings.length) || (a.prev_score - b.prev_score)
    );

    return NextResponse.json({ candidates: candidates.slice(0, 10), is_night: osIsNight });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
