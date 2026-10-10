/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Ekip anketi ve Adalet Puanı kural kaydı: veritabanı tarafı (kurallar lib/fairnessSurvey.ts).
 */
import { resolveShiftDef, resolveHardDayRules, shiftDifficultyPct, type Rules } from "@/lib/fairness";
import { addDays, businessToday, weekStartOf } from "@/lib/date";
import { sendPushToPersonnel } from "@/lib/notifications";
import { aggregateSurvey, eligibilityWeeks, type SurveyAnswers, type SurveyResults, type SurveyShift } from "@/lib/fairnessSurvey";

export const nowSec = () => Math.floor(Date.now() / 1000);

export function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  if (typeof raw !== "string") return raw as T;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export async function loadLocation(db: any, orgId: string, locationId: string) {
  const loc = await db.prepare(`SELECT id, name, rules, shift_definitions FROM locations WHERE id = ? AND org_id = ?`).get(locationId, orgId) as any;
  if (!loc) return null;
  const rules = parseJson<Rules & Record<string, any>>(loc.rules, {});
  const defs = parseJson<any[]>(loc.shift_definitions, []);
  const shifts: SurveyShift[] = (Array.isArray(defs) ? defs : [])
    .filter(d => d && d.id && !d.on_call)
    .map(d => ({ id: String(d.id), name: String(d.name ?? "Vardiya"), start: String(d.start ?? ""), end: String(d.end ?? ""), difficulty_pct: shiftDifficultyPct(d) }));
  return { id: loc.id as string, name: loc.name as string, rules, defs, shifts };
}

/** Puanlama penceresi: bugünden geriye `weeks` hafta (bugün dahil, sadece geçmiş günler sayılır). */
function windowFrom(weeks: number) {
  const today = businessToday();
  return { today, from: addDays(weekStartOf(today), -7 * (weeks - 1)) };
}

/**
 * Kişinin bu şubede son haftalarda YAYINLANMIŞ planda gerçekten çalıştığı vardiyalar ve günler.
 * Ankette sadece bunlar puanlanabilir (hiç çalışmadığı vardiyayı "kolay" diyerek başkasına itemesin).
 */
export async function workedAt(db: any, locationId: string, personnelId: string, shifts: SurveyShift[], weeks: number) {
  const { today, from } = windowFrom(weeks);
  const rows = await db.prepare(`
    SELECT week_start, day, shift_id, start_time, end_time FROM shift_assignments
    WHERE location_id = ? AND personnel_id = ? AND publication_status = 'published' AND COALESCE(kind, 'regular') = 'regular' AND week_start >= ?
  `).all(locationId, personnelId, from) as any[];
  const shiftIds = new Set<string>();
  const days = new Set<number>();
  for (const r of rows) {
    if (addDays(r.week_start, Number(r.day)) > today) continue;
    days.add(Number(r.day));
    const def = resolveShiftDef(r.shift_id, r.start_time, r.end_time, shifts);
    if (def) shiftIds.add(def.id);
  }
  return { shiftIds, days };
}

/** Son haftalarda bu şubede yayınlanmış planda çalışmış, hâlâ aktif kişiler (anketi cevaplayabilecekler). */
export async function eligiblePersonnel(db: any, orgId: string, locationId: string, weeks: number): Promise<string[]> {
  const { today, from } = windowFrom(weeks);
  const rows = await db.prepare(`
    SELECT sa.personnel_id, sa.week_start, sa.day FROM shift_assignments sa
    JOIN personnel p ON p.id = sa.personnel_id AND p.org_id = ? AND p.status = 'active'
    WHERE sa.location_id = ? AND sa.publication_status = 'published' AND COALESCE(sa.kind, 'regular') = 'regular' AND sa.week_start >= ?
  `).all(orgId, locationId, from) as any[];
  return [...new Set(rows.filter(r => addDays(r.week_start, Number(r.day)) <= today).map(r => String(r.personnel_id)))];
}

/** Süresi dolan açık anketleri kapatır (ayrı zamanlanmış görev gerekmez, okunurken kapanır). */
export async function closeExpiredSurveys(db: any, orgId: string) {
  await db.prepare(`UPDATE fairness_surveys SET status = 'closed', closed_at = closes_at WHERE org_id = ? AND status = 'open' AND closes_at <= ?`)
    .run(orgId, nowSec());
}

export async function surveyResults(db: any, survey: any): Promise<SurveyResults> {
  const rows = await db.prepare(`SELECT answers FROM fairness_survey_responses WHERE survey_id = ?`).all(survey.id) as any[];
  const answers = rows.map(r => parseJson<SurveyAnswers | null>(r.answers, null)).filter(Boolean) as SurveyAnswers[];
  return aggregateSurvey(parseJson<SurveyShift[]>(survey.shifts, []), parseJson<number[]>(survey.day_points, []), answers, Number(survey.id));
}

export function surveyWeeks(rules: Rules) {
  return eligibilityWeeks(rules.fairness_window_weeks);
}

export function currentDayPoints(rules: Rules) {
  return resolveHardDayRules(rules).dayPct;
}

/** Ekip üyelerine bildirim + telefon bildirimi (personnel_id ile, lib/managerNotifications'ın ekip karşılığı). */
export async function notifyPersonnel(db: any, orgId: string, personnelIds: string[], n: { type: string; title: string; message: string; link: string }) {
  const now = nowSec();
  await Promise.allSettled(personnelIds.map(async pid => {
    await db.prepare(`INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, false, ?)`)
      .run(pid, n.type, n.title, n.message, n.link, now);
    await sendPushToPersonnel(pid, orgId, { title: n.title, body: n.message, url: n.link }).catch(() => {});
  }));
}

export async function logRuleChanges(db: any, orgId: string, locationId: string, source: "settings" | "survey", lines: string[], by: { id?: string | null; name?: string | null }) {
  const now = nowSec();
  for (const summary of lines) {
    await db.prepare(`INSERT INTO fairness_rule_changes (org_id, location_id, source, summary, changed_by, changed_by_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(orgId, locationId, source, summary.slice(0, 500), by.id ?? null, by.name ?? null, now);
  }
}

export async function recentRuleChanges(db: any, orgId: string, locationId: string, limit = 30) {
  return await db.prepare(`
    SELECT source, summary, changed_by_name, created_at FROM fairness_rule_changes
    WHERE org_id = ? AND location_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(orgId, locationId, limit) as { source: string; summary: string; changed_by_name: string | null; created_at: number }[];
}

export async function userDisplayName(db: any, userId: string): Promise<string | null> {
  const u = await db.prepare(`SELECT name, username FROM users WHERE id = ?`).get(userId) as any;
  return u?.name ?? u?.username ?? null;
}
