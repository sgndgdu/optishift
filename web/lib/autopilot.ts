/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { addDays, businessNow } from "@/lib/date";
import { autopilotDecision, autopilotSettings, matrixHasDemand, type AutopilotRules } from "@/lib/autopilotRules";
import { generatePlan } from "@/lib/generatePlan";
import { loadLocDefs, syncDraftWeek, type DraftShiftRow } from "@/lib/draftSync";
import { sendPushToPersonnel } from "@/lib/notifications";

export * from "@/lib/autopilotRules";

/**
 * Otomatik pilot: her hafta belirlenen gün gelecek haftanın planını TASLAK olarak hazırlar,
 * müdür kontrol edip yayınlar. Personel taslağı görmez.
 * Ayar: locations.rules.autopilot = { enabled?: boolean (varsayılan açık), day?: 0-6 (Pzt=0, varsayılan Perşembe),
 *   last_run_week?: bu haftanın pazartesisi (haftada bir kez), last_draft_week?: hazırlanan haftanın pazartesisi }
 */
async function markRun(db: any, loc: any, rules: any, patch: Partial<AutopilotRules>) {
  const next = { ...rules, autopilot: { ...(rules?.autopilot ?? {}), ...patch } };
  await db.prepare(`UPDATE locations SET rules = ? WHERE id = ? AND org_id = ?`)
    .run(JSON.stringify(next), loc.id, loc.org_id);
}

async function notifyManagers(db: any, loc: any, title: string, message: string, url: string) {
  const recipients = await db.prepare(`
    SELECT DISTINCT personnel_id FROM users
    WHERE location_id = ? AND role IN ('manager', 'admin') AND personnel_id IS NOT NULL
  `).all(loc.id) as any[];
  const now = Math.floor(Date.now() / 1000);
  for (const r of recipients) {
    await db.prepare(`
      INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
      VALUES (?, 'schedule', ?, ?, ?, false, ?)
    `).run(r.personnel_id, title, message, url, now);
    await sendPushToPersonnel(r.personnel_id, loc.org_id, { title, body: message, url }).catch(() => {});
  }
}

async function loadRules(db: any, loc: { id: string; org_id: string }) {
  const row = await db.prepare(`SELECT rules, demand_matrix FROM locations WHERE id = ? AND org_id = ?`)
    .get(loc.id, loc.org_id) as any;
  let rules: any = {};
  try { rules = typeof row?.rules === "string" ? JSON.parse(row.rules) : (row?.rules ?? {}); } catch { rules = {}; }
  return { row, rules };
}

async function decide(db: any, locId: string, row: any, rules: any, at: Date) {
  const { dayIdx, weekStart } = businessNow(at);
  const nextWeek = addDays(weekStart, 7);
  const [cnt, deptRows, staff] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM shift_assignments WHERE location_id = ? AND week_start = ?`).get(locId, nextWeek),
    db.prepare(`SELECT demand_matrix FROM departments WHERE location_id = ?`).all(locId),
    db.prepare(`SELECT COUNT(*) AS n FROM personnel WHERE assigned_location_ids LIKE ? AND status = 'active' AND schedulable IS NOT FALSE`).get(`%"${locId}"%`),
  ]) as any[];
  const defs = await loadLocDefs(db, locId);
  const hasDemand = (deptRows as any[]).length > 0
    ? (deptRows as any[]).some(d => matrixHasDemand(d.demand_matrix))
    : matrixHasDemand(row.demand_matrix);

  const inputs = {
    rules, todayIdx: dayIdx, weekStart, nextWeekRows: Number(cnt?.n ?? 0), hasDemand,
    hasSetup: defs.length > 0 && Number(staff?.n ?? 0) > 0,
  };
  return { dayIdx, weekStart, defs, inputs, decision: autopilotDecision(inputs) };
}

/** Ekranlar için durum (Ana Sayfa, Vardiya Planı): ayar + bu hafta hazırlanacak mı + son taslak haftası. */
export async function autopilotStatus(loc: { id: string; org_id: string }, at: Date = new Date()) {
  const db = getDB();
  const { row, rules } = await loadRules(db, loc);
  if (!row) return null;
  const s = autopilotSettings(rules);
  const { inputs, decision } = await decide(db, loc.id, row, rules, at);
  return {
    ...s,
    // Gün gelmedi ama gün gelse çalışacak (kurulum, ihtiyaç tablosu tamam, hafta boş): taslak hazırlanacak
    upcoming: !decision.run && decision.reason === "not_due" && autopilotDecision({ ...inputs, todayIdx: 6 }).run,
    last_draft_week: (rules?.autopilot?.last_draft_week as string | undefined) ?? null,
  };
}

export type AutopilotResult = { location_id: string; status: string; synced?: number; error?: string };

/** Tek şube için çalıştırır. Hata olursa işaretlemez: ertesi gün tekrar denenir. */
export async function runAutopilotForLocation(loc: { id: string; org_id: string; name?: string }, at: Date = new Date()): Promise<AutopilotResult> {
  const db = getDB();
  const { row, rules } = await loadRules(db, loc);
  if (!row) return { location_id: loc.id, status: "not_found" };

  const { weekStart, defs, decision } = await decide(db, loc.id, row, rules, at);
  if (!decision.run) {
    // Müdür zaten başladıysa bu hafta bir daha bakmaya gerek yok
    if (decision.reason === "week_started") await markRun(db, loc, rules, { last_run_week: weekStart });
    return { location_id: loc.id, status: decision.reason };
  }

  const gen = await generatePlan(loc.org_id, loc.id, decision.targetWeek, {});
  if (gen.status !== 200 || gen.body?.error) {
    return { location_id: loc.id, status: "error", error: String(gen.body?.error ?? gen.status) };
  }

  // Motor çıktısı → taslak satırları (on_call için shiftId vardiya tanımı sırası, Vardiya Planı ile aynı)
  const rows: DraftShiftRow[] = [];
  for (const a of (gen.body.assignments ?? []) as any[]) {
    if (!a?.personnelId || !Number.isInteger(a.day)) continue;
    if (a.kind === "on_call") {
      const def: any = defs[a.shiftId];
      if (def) rows.push({ personnel_id: a.personnelId, day: a.day, shift_id: def.id, start_time: def.start, end_time: def.end, kind: "on_call" });
      continue;
    }
    if (a.start_time && a.end_time) rows.push({ personnel_id: a.personnelId, day: a.day, shift_id: null, start_time: a.start_time, end_time: a.end_time, department_id: a.department_id ?? null });
  }

  // Motor çalışırken müdür plan yapmaya başladıysa üzerine yazma
  const again = await db.prepare(`SELECT COUNT(*) AS n FROM shift_assignments WHERE location_id = ? AND week_start = ?`)
    .get(loc.id, decision.targetWeek) as any;
  if (Number(again?.n ?? 0) > 0) {
    await markRun(db, loc, rules, { last_run_week: weekStart });
    return { location_id: loc.id, status: "week_started" };
  }

  const synced = rows.length ? await syncDraftWeek(db, loc.id, decision.targetWeek, rows) : 0;
  await markRun(db, loc, rules, { last_run_week: weekStart, ...(synced > 0 ? { last_draft_week: decision.targetWeek } : {}) });
  if (synced > 0) {
    await notifyManagers(db, loc, "Gelecek haftanın planı hazır",
      "Plan taslak olarak otomatik hazırlandı. Kontrol edip yayınlayın, ekip yayınlanınca görür.",
      "/schedule?week=next").catch(() => {});
  }
  return { location_id: loc.id, status: synced > 0 ? "drafted" : "empty", synced };
}
