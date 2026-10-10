/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Elle yapılan değişikliklerin yük etkisi (2026-10-08, kayırma ve mobbinge karşı).
 *
 * Motor plan hazırlayınca her kişinin vardiyaları plan_generations'a yazılır (saveGeneration). Plan yayınlanınca
 * motorun verdiği ile yayınlanan arasındaki Adalet Puanı farkı kişi başı hesaplanır (manualLoadForWeek).
 * Elle yapılan değişiklikler üst üste MANUAL_LOAD_WEEKS yayınlanmış haftada hep aynı kişinin yükünü en az bir ortalama
 * vardiya puanı kadar artırıyor (ya da azaltıyorsa) hesap sahibine bildirim gider (alertManualLoad). Bildirim suçlama
 * değildir: izin, vardiya değişimi gibi sebepler olabilir; hesap sahibinin bakması istenir.
 */
import { calcWeeklyPoints, formatScore, resolveShiftDef, type AssignmentInput, type Rules, type ShiftDef } from "@/lib/fairness";
import { loadWeekInputs } from "@/lib/scoring";
import { sendPushToUser } from "@/lib/notifications";
import { weekRangeTR } from "@/lib/date";

/** Kaç yayınlanmış hafta üst üste aynı yönde olursa hesap sahibine bildirim gider. */
export const MANUAL_LOAD_WEEKS = 3;

type EngineAssignment = { personnelId: string; day: number; shiftId: number; start_time: string; end_time: string; kind?: string };

const parse = <T,>(raw: unknown, fb: T): T => {
  if (raw == null || raw === "") return fb;
  if (typeof raw !== "string") return raw as T;
  try { return JSON.parse(raw) as T; } catch { return fb; }
};

/**
 * Motorun bu çalıştırmada planladığı kişilerin vardiyalarını kaydeder (kişi başı; departman bazlı kısmi çalıştırmada
 * sadece o kişiler değişir). Vardiyası çıkmayan kişi de boş liste olarak yazılır.
 */
export async function saveGeneration(db: any, orgId: string, locationId: string, weekStart: string,
  personnelIds: string[], assignments: EngineAssignment[], shifts: { id?: string }[]) {
  const byPerson = new Map<string, { day: number; start_time: string; end_time: string; shift_id: string | null }[]>();
  for (const pid of personnelIds) byPerson.set(pid, []);
  for (const a of assignments) {
    if (a.kind && a.kind !== "regular") continue;
    if (!byPerson.has(a.personnelId)) continue;
    byPerson.get(a.personnelId)!.push({ day: a.day, start_time: a.start_time, end_time: a.end_time, shift_id: shifts[a.shiftId]?.id ?? null });
  }
  const now = Math.floor(Date.now() / 1000);
  for (const [pid, list] of byPerson) {
    await db.prepare(`
      INSERT INTO plan_generations (org_id, location_id, week_start, personnel_id, assignments, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (location_id, week_start, personnel_id) DO UPDATE SET assignments = EXCLUDED.assignments, created_at = EXCLUDED.created_at
    `).run(orgId, locationId, weekStart, pid, JSON.stringify(list), now);
  }
}

export interface WeekManualLoad {
  week_start: string;
  /** Yayınlanan plandaki ortalama vardiya puanı (eşik) */
  avg_shift_points: number;
  people: Record<string, { engine: number; published: number; delta: number }>;
}

/** Bir haftanın kişi başı motor / yayınlanan Adalet Puanı farkı. Motor bu hafta için plan hazırlamadıysa null. */
export async function manualLoadForWeek(db: any, orgId: string, locationId: string, weekStart: string): Promise<WeekManualLoad | null> {
  const gens = await db.prepare(`SELECT personnel_id, assignments FROM plan_generations WHERE org_id = ? AND location_id = ? AND week_start = ?`)
    .all(orgId, locationId, weekStart) as any[];
  if (gens.length === 0) return null;
  const loc = await db.prepare(`SELECT shift_definitions, rules FROM locations WHERE id = ?`).get(locationId) as any;
  const defs = parse<ShiftDef[]>(loc?.shift_definitions, []);
  const rules = parse<Rules>(loc?.rules, {});
  const { assignments: publishedAll, availRows } = await loadWeekInputs(locationId, weekStart);
  const pids = new Set(gens.map(g => String(g.personnel_id)));
  // Plan sonrası olaylar (boş vardiyayı alma, izin gününde çağrılma, başka şube) iki tarafta da sayılmaz
  const strip = (a: AssignmentInput): AssignmentInput => ({ ...a, is_hero: false, is_force: false, is_away: false });
  const published = publishedAll.filter(a => pids.has(a.personnel_id)).map(strip);
  const engine: AssignmentInput[] = gens.flatMap(g => parse<any[]>(g.assignments, []).map(a => ({
    personnel_id: String(g.personnel_id), day: Number(a.day),
    shift_id: a.shift_id ?? resolveShiftDef(null, a.start_time, a.end_time, defs)?.id ?? "custom",
    start_time: a.start_time, end_time: a.end_time,
  })));
  const pubPts = new Map(calcWeeklyPoints(published, defs, availRows, rules, weekStart).map(b => [b.personnel_id, b.burden_score]));
  const engPts = new Map(calcWeeklyPoints(engine, defs, availRows, rules, weekStart).map(b => [b.personnel_id, b.burden_score]));
  const totalPub = [...pubPts.values()].reduce((a, b) => a + b, 0);
  const people: WeekManualLoad["people"] = {};
  for (const pid of pids) {
    const e = engPts.get(pid) ?? 0, p = pubPts.get(pid) ?? 0;
    people[pid] = { engine: e, published: p, delta: Math.round((p - e) * 10) / 10 };
  }
  return { week_start: weekStart, avg_shift_points: published.length ? totalPub / published.length : 0, people };
}

export type ManualLoadFlag = { personnel_id: string; direction: "more" | "less"; weeks: string[]; total: number };

/**
 * Üst üste son MANUAL_LOAD_WEEKS haftada (motorun plan hazırladığı yayınlanmış haftalar) elle değişiklik kişinin yükünü
 * her hafta en az o haftanın ortalama vardiya puanı kadar artırdıysa "more", azalttıysa "less". Saf fonksiyon.
 * `weeks` en yeni hafta sonda olacak şekilde sıralı.
 */
export function findManualLoadFlags(weeks: WeekManualLoad[]): ManualLoadFlag[] {
  const recent = weeks.slice(-MANUAL_LOAD_WEEKS);
  if (recent.length < MANUAL_LOAD_WEEKS) return [];
  const pids = new Set(recent.flatMap(w => Object.keys(w.people)));
  const flags: ManualLoadFlag[] = [];
  for (const pid of pids) {
    const deltas = recent.map(w => ({ d: w.people[pid]?.delta, t: w.avg_shift_points }));
    if (deltas.some(x => x.d === undefined || !(x.t > 0))) continue;
    const total = Math.round(deltas.reduce((a, x) => a + (x.d as number), 0) * 10) / 10;
    if (deltas.every(x => (x.d as number) >= x.t)) flags.push({ personnel_id: pid, direction: "more", weeks: recent.map(w => w.week_start), total });
    else if (deltas.every(x => (x.d as number) <= -x.t)) flags.push({ personnel_id: pid, direction: "less", weeks: recent.map(w => w.week_start), total });
  }
  return flags;
}

/** Şubenin son yayınlanmış haftaları (en yeni sonda), motorun plan hazırladığı haftalarla sınırlı. */
export async function manualLoadHistory(db: any, orgId: string, locationId: string, maxWeeks: number): Promise<WeekManualLoad[]> {
  const rows = await db.prepare(`
    SELECT DISTINCT g.week_start FROM plan_generations g
    WHERE g.org_id = ? AND g.location_id = ?
      AND EXISTS (SELECT 1 FROM shift_assignments sa WHERE sa.location_id = g.location_id AND sa.week_start = g.week_start AND sa.publication_status = 'published')
    ORDER BY g.week_start DESC LIMIT ?
  `).all(orgId, locationId, maxWeeks) as any[];
  const out: WeekManualLoad[] = [];
  for (const r of rows.reverse()) {
    const w = await manualLoadForWeek(db, orgId, locationId, r.week_start);
    if (w) out.push(w);
  }
  return out;
}

/**
 * Yayından sonra çağrılır. Elle yapılan değişiklikler üst üste haftalarda aynı kişinin yükünü değiştiriyorsa hesap
 * sahibine (sadece admin) bildirim gider. Aynı kişi ve hafta için bir kez (rules.manual_load_alerts).
 */
export async function alertManualLoad(db: any, orgId: string, locationId: string, weekStart: string): Promise<number> {
  const history = await manualLoadHistory(db, orgId, locationId, MANUAL_LOAD_WEEKS);
  if (history.length === 0 || history[history.length - 1].week_start !== weekStart) return 0;
  const flags = findManualLoadFlags(history);
  if (flags.length === 0) return 0;
  const loc = await db.prepare(`SELECT name, rules FROM locations WHERE id = ?`).get(locationId) as any;
  const rules = parse<Record<string, any>>(loc?.rules, {});
  const sent: Record<string, string> = rules.manual_load_alerts && typeof rules.manual_load_alerts === "object" ? rules.manual_load_alerts : {};
  const fresh = flags.filter(f => sent[f.personnel_id] !== weekStart);
  if (fresh.length === 0) return 0;
  const names = new Map((await db.prepare(`SELECT id, name FROM personnel WHERE id IN (${fresh.map(() => "?").join(",")})`)
    .all(...fresh.map(f => f.personnel_id)) as any[]).map(p => [String(p.id), String(p.name)]));
  const owners = await db.prepare(`SELECT id FROM users WHERE org_id = ? AND role = 'admin' AND COALESCE(approval_status, 'active') = 'active'`).all(orgId) as any[];
  const now = Math.floor(Date.now() / 1000);
  for (const f of fresh) {
    const name = names.get(f.personnel_id) ?? "Bir ekip üyesi";
    const message = f.direction === "more"
      ? `${loc?.name}: son ${MANUAL_LOAD_WEEKS} haftanın planında elle yapılan değişiklikler her hafta ${name} adlı kişinin yükünü artırdı (toplam +${formatScore(f.total)} puan, ${weekRangeTR(f.weeks[0])} haftasından beri). İzin ya da vardiya değişimi gibi bir sebebi olabilir. Adalet Puanı raporundan kontrol edebilirsiniz.`
      : `${loc?.name}: son ${MANUAL_LOAD_WEEKS} haftanın planında elle yapılan değişiklikler her hafta ${name} adlı kişinin yükünü azalttı (toplam ${formatScore(f.total)} puan, ${weekRangeTR(f.weeks[0])} haftasından beri). İzin ya da vardiya değişimi gibi bir sebebi olabilir. Adalet Puanı raporundan kontrol edebilirsiniz.`;
    for (const o of owners) {
      await db.prepare(`INSERT INTO notifications (user_id, type, title, message, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, false, ?)`)
        .run(o.id, "manual_load", "Elle yapılan değişiklikler aynı kişiyi etkiliyor", message, "/reports?tab=adalet", now);
      await sendPushToUser(o.id, orgId, { title: "Elle yapılan değişiklikler aynı kişiyi etkiliyor", body: message, url: "/reports?tab=adalet" }).catch(() => {});
    }
    sent[f.personnel_id] = weekStart;
  }
  await db.prepare(`UPDATE locations SET rules = ? WHERE id = ?`).run(JSON.stringify({ ...rules, manual_load_alerts: sent }), locationId);
  return fresh.length;
}
