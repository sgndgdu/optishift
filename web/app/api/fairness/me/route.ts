import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { personnel, locations, scoreHistory, scoreAdjustments } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { fairnessLabel } from "@/lib/fairness";

/**
 * GET /api/fairness/me — personelin KENDİ adalet puanı görünümü.
 * Başka personelin puanı/sıralaması asla serialize edilmez; takım konumu
 * yalnızca fairnessLabel etiketi olarak döner (z, scoring.ts tarafından
 * lokasyon genelinde hesaplanıp personnel.fairness_z_score'a yazılmıştır).
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
        fairness_z_score: personnel.fairness_z_score,
        hero_count: personnel.hero_count,
      })
      .from(personnel)
      .where(and(eq(personnel.id, auth.personnel_id), eq(personnel.org_id, auth.org_id))))[0];

    if (!me) {
      return NextResponse.json({ error: "Personel bulunamadı" }, { status: 404 });
    }

    // Müsaitlik toplama kapalıysa sarı gün alanları personele gösterilmez
    let prefNotVisible = true;
    const loc = (await db
      .select({ rules: locations.rules })
      .from(locations)
      .where(eq(locations.id, me.primary_location_id)))[0];
    if (loc?.rules) {
      try {
        const rules = typeof loc.rules === "string" ? JSON.parse(loc.rules) : loc.rules;
        prefNotVisible = rules?.availability_collection_enabled !== false;
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

    const z = me.fairness_z_score ?? 0;
    return NextResponse.json({
      score: me.prev_score ?? 0,
      label: fairnessLabel(z), // { text, level } — sayısal z bile dönmüyoruz
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
