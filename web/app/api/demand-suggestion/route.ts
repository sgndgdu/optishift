/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { managerOutsideBranch } from "@/lib/access";
import { getDB } from "@/lib/db/client";
import { computeForecastWithWeeks } from "@/lib/forecast";
import { suggestDemand } from "@/lib/demandSuggestion";
import { getHolidaysForDate } from "@/lib/holidays";
import { addDays } from "@/lib/date";

// GET ?location_id=&week_start= → Personel İhtiyacı tablosu önerisi (lib/demandSuggestion).
// Tahmin modülü (rules.forecasting_enabled) kapalı olsa da çalışır: öneri sadece gösterilir,
// müdür "Tabloya uygula" demeden hiçbir şey kaydedilmez.
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const week_start = searchParams.get("week_start");
  if (!location_id || !week_start || !/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
    return NextResponse.json({ error: "location_id ve week_start zorunlu" }, { status: 400 });
  }
  if (managerOutsideBranch(auth, location_id)) {
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  }

  const db = getDB();
  try {
    const loc = await db.prepare(`SELECT id, rules, shift_definitions, operating_hours FROM locations WHERE id = ? AND org_id = ?`)
      .get(location_id, auth.org_id) as any;
    if (!loc) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

    const parse = (v: any, fb: any) => { try { return typeof v === "string" ? JSON.parse(v) : (v ?? fb); } catch { return fb; } };
    const rules = parse(loc.rules, {});
    const defs = (parse(loc.shift_definitions, []) as any[])
      .filter(d => d?.id && d?.start && d?.end)
      .map(d => ({ id: String(d.id), name: String(d.name ?? ""), start: d.start, end: d.end }));
    const hours = parse(loc.operating_hours, {});
    const closedDays = [0, 1, 2, 3, 4, 5, 6].filter(d => hours?.[d]?.isOpen === false);

    // /api/generate ile aynı kişi kümesi: şubenin aktif personeli, yönetici hesapları hariç (ayar açık değilse)
    let people = await db.prepare(`SELECT user_access_level FROM personnel WHERE assigned_location_ids LIKE ? AND status = 'active'`)
      .all(`%"${location_id}"%`) as any[];
    if (!rules.include_managers_in_schedule) {
      people = people.filter(p => !["manager", "admin", "supervisor"].includes(p.user_access_level));
    }

    const holidays = [0, 1, 2, 3, 4, 5, 6].flatMap(d => {
      const h = getHolidaysForDate(addDays(week_start, d))[0];
      return h ? [{ day: d, name: h.name }] : [];
    });

    const { matrix: history, weeks } = await computeForecastWithWeeks(location_id, week_start);
    const suggestion = suggestDemand({
      shiftDefs: defs, history, historyWeeks: weeks, closedDays,
      personnelCount: people.length,
      maxWeeklyHours: typeof rules.max_weekly_hours === "number" ? rules.max_weekly_hours : 45,
      holidays,
    });
    return NextResponse.json({ ...suggestion, history_weeks: weeks });
  } catch (err: any) {
    console.error("[demand-suggestion]", err);
    return NextResponse.json({ error: "Öneri hesaplanamadı" }, { status: 500 });
  }
}
