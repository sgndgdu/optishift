/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sanitizeAnswers, surveyReasons } from "@/lib/fairnessSurvey";
import {
  closeExpiredSurveys, currentDayPoints, loadLocation, nowSec, parseJson, recentRuleChanges, surveyResults, surveyWeeks, workedAt,
} from "@/lib/fairnessSurveyDb";

/**
 * Ekip anketi, ekip üyesi tarafı (portal › Anket). Çalışan kaydı olan herkes (plana dahil yönetici de) kullanır.
 * GET: çalıştığı şubelerdeki açık anketler, sadece son haftalarda çalıştığı vardiya ve günlerle; kendi cevabı;
 *   kapanmış son anketin sonucu (ekibin değeri ve uygulanan değer yan yana) ve Adalet Puanı kural değişiklikleri.
 * POST { survey_id, answers }: cevabı kaydeder ya da günceller (anket açıkken). Çalışmadığı vardiya yok sayılır.
 */
async function myLocationIds(db: any, orgId: string, personnelId: string): Promise<string[]> {
  const p = await db.prepare(`SELECT primary_location_id, assigned_location_ids FROM personnel WHERE id = ? AND org_id = ?`).get(personnelId, orgId) as any;
  if (!p) return [];
  return [...new Set([p.primary_location_id, ...parseJson<string[]>(p.assigned_location_ids, [])].filter(Boolean).map(String))];
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.personnel_id) return NextResponse.json({ open: [], results: [], changes: [] });
  const db = getDB();
  try {
    await closeExpiredSurveys(db, auth.org_id);
    const locIds = await myLocationIds(db, auth.org_id, auth.personnel_id);
    const open: any[] = [];
    const results: any[] = [];
    const changes: any[] = [];
    for (const locId of locIds) {
      const loc = await loadLocation(db, auth.org_id, locId);
      if (!loc) continue;
      const survey = await db.prepare(`SELECT * FROM fairness_surveys WHERE org_id = ? AND location_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1`).get(auth.org_id, locId) as any;
      if (survey) {
        const snapshot = parseJson<any[]>(survey.shifts, []);
        const worked = await workedAt(db, locId, auth.personnel_id, snapshot, surveyWeeks(loc.rules));
        if (worked.shiftIds.size > 0 || worked.days.size > 0) {
          const mine = await db.prepare(`SELECT answers FROM fairness_survey_responses WHERE survey_id = ? AND personnel_id = ?`).get(survey.id, auth.personnel_id) as any;
          open.push({
            survey_id: survey.id, location_id: locId, location_name: loc.name, closes_at: survey.closes_at,
            days_left: Math.max(0, Math.ceil((Number(survey.closes_at) - nowSec()) / 86400)),
            shifts: snapshot.filter(s => worked.shiftIds.has(s.id)).map(s => ({ id: s.id, name: s.name, start: s.start, end: s.end })),
            days: [...worked.days].sort((a, b) => a - b),
            reasons: surveyReasons(loc.rules.industry as string | undefined, loc.rules.industry_variant as string | undefined),
            answered: !!mine,
            answers: mine ? parseJson(mine.answers, null) : null,
          });
        }
      }
      // Şeffaflık: kapanmış son anketin sonucu ve hesap sahibinin uyguladığı değerler
      const last = await db.prepare(`SELECT * FROM fairness_surveys WHERE org_id = ? AND location_id = ? AND status = 'closed' ORDER BY closed_at DESC LIMIT 1`).get(auth.org_id, locId) as any;
      if (last) {
        const r = await surveyResults(db, last);
        results.push({
          location_name: loc.name, closed_at: last.closed_at, responses: r.responses, enough: r.enough,
          applied_at: last.applied_at, applied_by_name: last.applied_by_name,
          shifts: r.shifts.map(s => ({ name: s.name, team: s.median, suggested: s.suggested, current: loc.shifts.find(x => x.id === s.id)?.difficulty_pct ?? null, agreement: s.agreement })),
          days: r.days.map(d => ({ day: d.day, team: d.median, suggested: d.suggested, current: currentDayPoints(loc.rules)[d.day] })),
          fairness: r.fairness,
        });
      }
      for (const c of await recentRuleChanges(db, auth.org_id, locId, 15)) changes.push({ ...c, location_name: loc.name });
    }
    changes.sort((a, b) => b.created_at - a.created_at);
    return NextResponse.json({ open, results, changes: changes.slice(0, 20), multi_branch: locIds.length > 1 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.personnel_id) return NextResponse.json({ error: "Anketi ekip üyeleri cevaplar" }, { status: 403 });
  const db = getDB();
  try {
    const { survey_id, answers } = await req.json();
    await closeExpiredSurveys(db, auth.org_id);
    const survey = await db.prepare(`SELECT * FROM fairness_surveys WHERE id = ? AND org_id = ?`).get(Number(survey_id), auth.org_id) as any;
    if (!survey) return NextResponse.json({ error: "Anket bulunamadı" }, { status: 404 });
    if (survey.status !== "open") return NextResponse.json({ error: "Anket kapandı" }, { status: 409 });
    if (!(await myLocationIds(db, auth.org_id, auth.personnel_id)).includes(survey.location_id)) return NextResponse.json({ error: "Bu anket sizin şubenize ait değil" }, { status: 403 });
    const loc = await loadLocation(db, auth.org_id, survey.location_id);
    if (!loc) return NextResponse.json({ error: "Şube bulunamadı" }, { status: 404 });
    const snapshot = parseJson<any[]>(survey.shifts, []);
    const worked = await workedAt(db, survey.location_id, auth.personnel_id, snapshot, surveyWeeks(loc.rules));
    const clean = sanitizeAnswers(answers, {
      shiftIds: worked.shiftIds, days: worked.days,
      reasons: surveyReasons(loc.rules.industry as string | undefined, loc.rules.industry_variant as string | undefined),
    });
    if (!clean) return NextResponse.json({ error: "En az bir soruyu cevaplayın" }, { status: 400 });
    const now = nowSec();
    await db.prepare(`
      INSERT INTO fairness_survey_responses (survey_id, org_id, personnel_id, answers, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (survey_id, personnel_id) DO UPDATE SET answers = EXCLUDED.answers, updated_at = EXCLUDED.updated_at
    `).run(survey.id, auth.org_id, auth.personnel_id, JSON.stringify(clean), now, now);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
