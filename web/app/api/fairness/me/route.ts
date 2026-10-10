import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { personnel, locations, scoreHistory, scoreAdjustments } from "@/lib/db/schema";
import { and, eq, desc, avg } from "drizzle-orm";
import { comparableScore, fairnessLabelForEmployee } from "@/lib/fairness";

/**
 * GET /api/fairness/me — personelin KENDİ adalet puanı görünümü.
 * Başka personelin puanı/sıralaması asla serialize edilmez; takım konumu
 * yalnızca etiket olarak döner (şubenin aktif personel ortalamasına göre,
 * raporla aynı kural, personele hitap eden dille: fairnessLabelForEmployee).
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (!auth.personnel_id) {
    return NextResponse.json({ error: "Personel hesabı gerekli" }, { status: 403 });
  }

  try {
    const me = (await db
      .select({
        id: personnel.id,
        org_id: personnel.org_id,
        primary_location_id: personnel.primary_location_id,
        prev_score: personnel.prev_score,
        max_weekly_hours: personnel.max_weekly_hours,
        hero_count: personnel.hero_count,
      })
      .from(personnel)
      .where(and(eq(personnel.id, auth.personnel_id), eq(personnel.org_id, auth.org_id))))[0];

    if (!me) {
      return NextResponse.json({ error: "Personel bulunamadı" }, { status: 404 });
    }

    // Uygunluk toplama kapalıysa sarı gün alanları personele gösterilmez
    let prefNotVisible = true;
    let branchMax: number | undefined;
    const loc = (await db
      .select({ rules: locations.rules })
      .from(locations)
      .where(eq(locations.id, me.primary_location_id)))[0];
    if (loc?.rules) {
      try {
        const rules = typeof loc.rules === "string" ? JSON.parse(loc.rules) : loc.rules;
        prefNotVisible = rules?.availability_collection_enabled !== false;
        if (typeof rules?.max_weekly_hours === "number") branchMax = rules.max_weekly_hours;
      } catch { /* varsayılan: görünür */ }
    }

    const history = await db
      .select({
        week_start: scoreHistory.week_start,
        burden_score: scoreHistory.burden_score,
        total_hours: scoreHistory.total_hours,
        weekend_shifts: scoreHistory.weekend_shifts,
        night_shifts: scoreHistory.night_shifts,
        pref_not_shifts: scoreHistory.pref_not_shifts,
        clopening_count: scoreHistory.clopening_count,
        cumulative_burden: scoreHistory.cumulative_burden,
      })
      .from(scoreHistory)
      .where(eq(scoreHistory.personnel_id, me.id))
      .orderBy(desc(scoreHistory.week_start))
      .limit(8);

    const adjustments = await db
      .select({
        type: scoreAdjustments.type,
        points: scoreAdjustments.points,
        week_start: scoreAdjustments.week_start,
        note: scoreAdjustments.note,
        created_at: scoreAdjustments.created_at,
      })
      .from(scoreAdjustments)
      .where(eq(scoreAdjustments.personnel_id, me.id))
      .orderBy(desc(scoreAdjustments.created_at))
      .limit(20);

    // Karşılaştırma kişinin haftalık süresine oranlanır (lib/fairness comparableScore); ekibin sayıları dönmez
    const teamRows = await db
      .select({ prev_score: personnel.prev_score, max_weekly_hours: personnel.max_weekly_hours })
      .from(personnel)
      .where(and(
        eq(personnel.org_id, me.org_id),
        eq(personnel.primary_location_id, me.primary_location_id),
        eq(personnel.status, "active"),
      ));
    const teamCmp = teamRows.map(r => comparableScore(r.prev_score ?? 0, r.max_weekly_hours, branchMax));
    const teamAvg = teamCmp.length ? teamCmp.reduce((a, b) => a + b, 0) / teamCmp.length : 0;
    const myCmp = comparableScore(me.prev_score ?? 0, me.max_weekly_hours, branchMax);
    return NextResponse.json({
      score: me.prev_score ?? 0,
      label: fairnessLabelForEmployee(myCmp, teamAvg), // { text, level }; ortalama da dönmüyor
      hero_count: me.hero_count ?? 0,
      // Kronolojik sıra (en eski önce) — sparkline için
      history: history.reverse().map(h => ({
        week_start: h.week_start,
        burden_score: h.burden_score ?? 0,
        total_hours: h.total_hours ?? 0,
        weekend_shifts: h.weekend_shifts ?? 0,
        night_shifts: h.night_shifts ?? 0,
        ...(prefNotVisible ? { pref_not_shifts: h.pref_not_shifts ?? 0 } : {}),
        clopening_count: h.clopening_count ?? 0,
        cumulative_burden: h.cumulative_burden ?? 0,
      })),
      adjustments,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
