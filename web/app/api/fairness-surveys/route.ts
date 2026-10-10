/* eslint-disable @typescript-eslint/no-explicit-any */
import { shiftDifficultyPct } from "@/lib/fairness";
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { canManageLocation } from "@/lib/access";
import { hasPerm } from "@/lib/userAccess";
import { DAY_NAMES_TR } from "@/lib/fairness";
import { describeFairnessChanges } from "@/lib/fairnessChanges";
import { SURVEY_MIN_RESPONSES } from "@/lib/fairnessSurvey";
import {
  closeExpiredSurveys, currentDayPoints, eligiblePersonnel, loadLocation, logRuleChanges, notifyPersonnel,
  nowSec, parseJson, recentRuleChanges, surveyResults, surveyWeeks,
} from "@/lib/fairnessSurveyDb";

/**
 * Ekip anketi, yönetim tarafı (lib/fairnessSurvey). Ayarlar › Adalet Puanı › Ekip anketi.
 * GET ?location_id=: açık anket (sadece cevap sayısı: açıkken sonuç gösterilmez, her cevaptan sonra bakılıp kimin ne
 *   dediği çıkarılmasın), son kapanan anketin sonucu, geçmiş ve Adalet Puanı kural değişiklikleri.
 * POST { location_id, days }: anketi başlatır (sadece hesap sahibi). Son haftalarda çalışmış herkese bildirim gider.
 * PATCH { id, action: "close" }: anketi şimdi kapatır. { id, action: "apply", shifts: {id: 1-10}, days: {gün: 0-20} }:
 *   sonucu uygular (sadece hesap sahibi, kapanmış ve yeterli cevaplı anket); cevap verenlere sonuç bildirimi.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const locationId = new URL(req.url).searchParams.get("location_id");
  const db = getDB();
  try {
    if (!locationId || !(await canManageLocation(db, auth, locationId)) || !hasPerm(auth, "plan_settings")) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }
    await closeExpiredSurveys(db, auth.org_id);
    const loc = await loadLocation(db, auth.org_id, locationId);
    if (!loc) return NextResponse.json({ error: "Şube bulunamadı" }, { status: 404 });
    const surveys = await db.prepare(`
      SELECT s.*, (SELECT COUNT(*) FROM fairness_survey_responses r WHERE r.survey_id = s.id) AS responses
      FROM fairness_surveys s WHERE s.org_id = ? AND s.location_id = ? ORDER BY s.created_at DESC LIMIT 12
    `).all(auth.org_id, locationId) as any[];
    const open = surveys.find(s => s.status === "open") ?? null;
    const lastClosed = surveys.find(s => s.status === "closed") ?? null;
    const eligible = (await eligiblePersonnel(db, auth.org_id, locationId, surveyWeeks(loc.rules))).length;
    return NextResponse.json({
      can_manage: auth.role === "admin",
      min_responses: SURVEY_MIN_RESPONSES,
      eligible,
      has_shifts: loc.shifts.length > 0,
      open: open && { id: open.id, created_at: open.created_at, closes_at: open.closes_at, days_left: Math.max(0, Math.ceil((Number(open.closes_at) - nowSec()) / 86400)), responses: Number(open.responses), created_by_name: open.created_by_name },
      last: lastClosed && {
        id: lastClosed.id, created_at: lastClosed.created_at, closed_at: lastClosed.closed_at,
        applied: parseJson(lastClosed.applied, null), applied_by_name: lastClosed.applied_by_name, applied_at: lastClosed.applied_at,
        results: await surveyResults(db, lastClosed),
        current_shifts: Object.fromEntries(loc.shifts.map(s => [s.id, s.difficulty_pct])),
        current_days: currentDayPoints(loc.rules),
      },
      history: surveys.filter(s => s.status === "closed").map(s => ({ id: s.id, created_at: s.created_at, closed_at: s.closed_at, responses: Number(s.responses), applied_at: s.applied_at })),
      changes: await recentRuleChanges(db, auth.org_id, locationId),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "admin") return NextResponse.json({ error: "Anketi hesap sahibi başlatır" }, { status: 403 });
  const db = getDB();
  try {
    const { location_id, days } = await req.json();
    if (!location_id || !(await canManageLocation(db, auth, location_id))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    const openDays = Math.round(Number(days));
    if (!Number.isFinite(openDays) || openDays < 1 || openDays > 30) return NextResponse.json({ error: "Anket 1 ile 30 gün arası açık kalabilir" }, { status: 400 });
    await closeExpiredSurveys(db, auth.org_id);
    const loc = await loadLocation(db, auth.org_id, location_id);
    if (!loc) return NextResponse.json({ error: "Şube bulunamadı" }, { status: 404 });
    if (loc.shifts.length === 0) return NextResponse.json({ error: "Önce vardiyaları tanımlayın" }, { status: 400 });
    const already = await db.prepare(`SELECT id FROM fairness_surveys WHERE org_id = ? AND location_id = ? AND status = 'open'`).get(auth.org_id, location_id);
    if (already) return NextResponse.json({ error: "Bu şubede açık bir anket var" }, { status: 409 });
    const people = await eligiblePersonnel(db, auth.org_id, location_id, surveyWeeks(loc.rules));
    if (people.length < SURVEY_MIN_RESPONSES) {
      return NextResponse.json({ error: `Son haftalarda bu şubede çalışan ${people.length} kişi var. Sonucun gizli kalması için en az ${SURVEY_MIN_RESPONSES} kişinin cevap verebilmesi gerekir.` }, { status: 400 });
    }
    const now = nowSec();
    const row = await db.prepare(`
      INSERT INTO fairness_surveys (org_id, location_id, status, shifts, day_points, closes_at, created_by, created_by_name, created_at)
      VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?) RETURNING id
    `).get(auth.org_id, location_id, JSON.stringify(loc.shifts), JSON.stringify(currentDayPoints(loc.rules)), now + openDays * 86400, auth.id, auth.name ?? null, now) as any;
    await notifyPersonnel(db, auth.org_id, people, {
      type: "fairness_survey",
      title: "Vardiyaların zorluğunu puanlayın",
      message: `${loc.name}: çalıştığınız vardiyaların ne kadar zor olduğunu soruyoruz. Cevabınız gizlidir, kimin ne dediği görünmez.`,
      link: "/portal/survey",
    });
    return NextResponse.json({ success: true, id: row?.id, notified: people.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "admin") return NextResponse.json({ error: "Bunu hesap sahibi yapar" }, { status: 403 });
  const db = getDB();
  try {
    const body = await req.json();
    const survey = await db.prepare(`SELECT * FROM fairness_surveys WHERE id = ? AND org_id = ?`).get(Number(body.id), auth.org_id) as any;
    if (!survey || !(await canManageLocation(db, auth, survey.location_id))) return NextResponse.json({ error: "Anket bulunamadı" }, { status: 404 });

    if (body.action === "close") {
      if (survey.status === "open") await db.prepare(`UPDATE fairness_surveys SET status = 'closed', closed_at = ? WHERE id = ?`).run(nowSec(), survey.id);
      return NextResponse.json({ success: true });
    }
    if (body.action !== "apply") return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
    if (survey.status !== "closed") return NextResponse.json({ error: "Sonuç anket kapanınca uygulanır" }, { status: 400 });
    const results = await surveyResults(db, survey);
    if (!results.enough) return NextResponse.json({ error: "Yeterli cevap gelmedi" }, { status: 400 });

    const loc = await loadLocation(db, auth.org_id, survey.location_id);
    if (!loc) return NextResponse.json({ error: "Şube bulunamadı" }, { status: 404 });
    const wantShifts = (body.shifts && typeof body.shifts === "object" ? body.shifts : {}) as Record<string, unknown>;
    const wantDays = (body.days && typeof body.days === "object" ? body.days : {}) as Record<string, unknown>;
    const applied = parseJson<{ shifts: Record<string, any>; days: Record<string, any> }>(survey.applied, { shifts: {}, days: {} });

    const oldDefs = loc.defs;
    const newDefs = oldDefs.map((d: any) => {
      const v = Math.round(Number(wantShifts[d?.id]));
      if (!d?.id || !(String(d.id) in wantShifts) || !Number.isFinite(v) || v < 0 || v > 100) return d;
      const team = results.shifts.find(s => s.id === String(d.id))?.median ?? null;
      applied.shifts[d.id] = { name: d.name, from: shiftDifficultyPct(d), to: v, team };
      return { ...d, difficulty_pct: v };
    });
    const oldDayPoints = currentDayPoints(loc.rules);
    const newDayPoints = [...oldDayPoints];
    for (const [k, raw] of Object.entries(wantDays)) {
      const d = Number(k), v = Math.round(Number(raw));
      if (!(d >= 0 && d <= 6) || !Number.isFinite(v) || v < 0 || v > 100) continue;
      newDayPoints[d] = v;
      applied.days[d] = { name: DAY_NAMES_TR[d], from: oldDayPoints[d], to: v, team: results.days[d]?.median ?? null };
    }
    const newRules = { ...loc.rules, hard_day_pct: newDayPoints };
    const lines = describeFairnessChanges(loc.rules, newRules, oldDefs, newDefs);
    if (lines.length === 0) return NextResponse.json({ success: true, changed: 0 });

    await db.prepare(`UPDATE locations SET shift_definitions = ?, rules = ? WHERE id = ?`).run(JSON.stringify(newDefs), JSON.stringify(newRules), loc.id);
    await db.prepare(`UPDATE fairness_surveys SET applied = ?, applied_by_name = ?, applied_at = ? WHERE id = ?`)
      .run(JSON.stringify(applied), auth.name ?? null, nowSec(), survey.id);
    await logRuleChanges(db, auth.org_id, loc.id, "survey", lines.map(l => `${l} (ekip anketiyle)`), { id: auth.id, name: auth.name });

    const respondents = await db.prepare(`SELECT personnel_id FROM fairness_survey_responses WHERE survey_id = ?`).all(survey.id) as any[];
    await notifyPersonnel(db, auth.org_id, respondents.map(r => String(r.personnel_id)), {
      type: "fairness_survey_result",
      title: "Anketin sonucu uygulandı",
      message: `${loc.name}: ekibin cevaplarına göre ${lines.length} değer değişti. Ayrıntılar Anket sayfasında.`,
      link: "/portal/survey",
    });
    return NextResponse.json({ success: true, changed: lines.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
