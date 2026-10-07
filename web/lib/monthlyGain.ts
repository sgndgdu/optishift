/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Aylık kazanç raporu: TEK KAYNAK. Bir şubenin bir ayda uygulamayla neler yaptığını SADECE kayıtlı veriden
 * özetler; "önlendi" gibi kanıtlanamayan iddia yoktur. Tahmin olan tek sayı (planlamada kazanılan süre)
 * varsayımıyla birlikte yazılır.
 *  - Planlar: yayınlanan haftalar ve motorun hazırladığı haftalar (platform_events "or_tools_call").
 *  - Gelemeyenler: ay içindeki ilanlar ve kaçının alındığı (open_shifts).
 *  - Talepler: ay içinde karara bağlanan izinler (reviewed_at) ve takaslar.
 *  - Kurallar: yayınlanan planlar dinlenme ve haftalık saat kuralına göre yeniden kontrol edilir (lib/assignmentCheck).
 *  - Fazla mesai ve çalışma saati: önceki aya göre.
 * Kullananlar: /api/reports/monthly-gain (Raporlar › Aylık Özet, Ana Sayfa kartı) ve ay başı bildirimi (sendMonthlyGainReports).
 */
import { addDays, businessToday } from "@/lib/date";
import { findAssignmentProblems, type TimedShift } from "@/lib/assignmentCheck";
import { effectiveWeeklyLimit } from "@/lib/legal";
import { isModuleOn } from "@/lib/moduleVisibility";
import { notifyBranchManagers } from "@/lib/managerNotifications";
import { monthLabel, monthRange, prevMonth } from "@/lib/months";
export { monthLabel, monthRange, prevMonth } from "@/lib/months";

/** Planlamada kazanılan süre tahmini: elle planlamada kişi başı haftada bu kadar dakika varsayılır */
export const MANUAL_MINUTES_PER_PERSON_WEEK = 5;
const OT_MULTIPLIER = 1.5;

export type MonthlyGain = {
  month: string;          // YYYY-MM
  label: string;          // "Eylül 2026"
  partial: boolean;       // içinde bulunulan ay (henüz bitmedi)
  plans: { published: number; generated: number; estHours: number };
  absences: { total: number; filled: number; unfilled: number };
  requests: { leaveApproved: number; leaveRejected: number; swapsDecided: number };
  compliance: { shifts: number; problems: number; examples: string[] };
  work: { hours: number; prevHours: number };
  overtime: { hours: number; prevHours: number; cost: number | null; prevCost: number | null } | null;
  /** Bildirimde ve Ana Sayfa kartında kullanılan kısa cümleler (sıfır olan konu yazılmaz) */
  highlights: string[];
};

const tsOf = (date: string) => Math.floor(Date.parse(date + "T00:00:00+03:00") / 1000);
const hoursOf = (s: { start_time: string; end_time: string }) => {
  const [a, b] = [s.start_time, s.end_time].map(t => { const [h, mi] = t.split(":").map(Number); return h * 60 + (mi || 0); });
  return ((b <= a ? b + 1440 : b) - a) / 60;
};
const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });

/** Yayınlanmış normal vardiyalar (tarih aralığında, şubede) */
async function publishedShifts(db: any, locationId: string, start: string, end: string) {
  const rows = await db.prepare(`
    SELECT sa.personnel_id, sa.week_start, sa.day, sa.start_time, sa.end_time
    FROM shift_assignments sa
    WHERE sa.location_id = ? AND sa.publication_status = 'published' AND COALESCE(sa.kind, 'regular') = 'regular'
      AND sa.start_time IS NOT NULL AND sa.end_time IS NOT NULL
      AND (sa.week_start::date + sa.day) BETWEEN ?::date AND ?::date
  `).all(locationId, start, end) as any[];
  return rows.map(r => ({ ...r, day: Number(r.day), date: addDays(r.week_start, Number(r.day)) }));
}

async function overtimeFor(db: any, locationId: string, start: string, end: string, withCost: boolean) {
  const rows = await db.prepare(`
    SELECT o.overtime_hours, p.hourly_wage FROM overtime_records o LEFT JOIN personnel p ON p.id = o.personnel_id
    WHERE o.location_id = ? AND o.status != 'rejected' AND o.week_start BETWEEN ? AND ?
  `).all(locationId, start, end) as any[];
  const hours = rows.reduce((t, r) => t + Number(r.overtime_hours || 0), 0);
  const priced = rows.filter(r => Number(r.hourly_wage) > 0);
  const cost = withCost && priced.length ? Math.round(priced.reduce((t, r) => t + Number(r.overtime_hours || 0) * Number(r.hourly_wage) * OT_MULTIPLIER, 0)) : null;
  return { hours: round1(hours), cost };
}

/** withCost: ücret görme yetkisi (lib/userAccess "budget") varsa mesai maliyeti hesaplanır */
export async function buildMonthlyGain(db: any, orgId: string, locationId: string, month: string, withCost: boolean): Promise<MonthlyGain> {
  const { start, end } = monthRange(month);
  const prev = monthRange(prevMonth(month));
  const today = businessToday();
  const loc = await db.prepare(`SELECT rules FROM locations WHERE id = ? AND org_id = ?`).get(locationId, orgId) as any;
  let rules: any = {};
  try { rules = typeof loc?.rules === "string" ? JSON.parse(loc.rules || "{}") : (loc?.rules ?? {}); } catch { /* varsayılan */ }

  // ── Planlar
  const shifts = await publishedShifts(db, locationId, start, end);
  const published = new Set(shifts.map(s => s.week_start)).size;
  const events = await db.prepare(`
    SELECT meta FROM platform_events WHERE type = 'or_tools_call' AND org_id = ? AND created_at BETWEEN ? AND ? AND meta LIKE ?
  `).all(orgId, tsOf(start), tsOf(addDays(end, 1)) - 1, `%"location_id":"${locationId}"%`) as any[];
  const genWeeks = new Map<string, number>();
  for (const e of events) {
    try { const m = JSON.parse(e.meta); if (m.week_start) genWeeks.set(m.week_start, Number(m.personnel_count) || 0); } catch { /* bozuk kayıt */ }
  }
  const estHours = round1([...genWeeks.values()].reduce((t, n) => t + n * MANUAL_MINUTES_PER_PERSON_WEEK, 0) / 60);

  // ── Gelemeyenler (ilanlar)
  const open = await db.prepare(`
    SELECT status, date FROM open_shifts WHERE org_id = ? AND location_id = ? AND date BETWEEN ? AND ? AND status != 'cancelled'
  `).all(orgId, locationId, start, end) as any[];
  const filled = open.filter(o => o.status === "claimed").length;
  const unfilled = open.filter(o => o.status === "open" && o.date < today).length;

  // ── Talepler
  const leaves = await db.prepare(`
    SELECT lr.status FROM leave_requests lr JOIN personnel p ON p.id = lr.personnel_id
    WHERE p.org_id = ? AND p.primary_location_id = ? AND lr.reviewed_at BETWEEN ? AND ? AND lr.status IN ('approved','rejected')
  `).all(orgId, locationId, tsOf(start), tsOf(addDays(end, 1)) - 1) as any[];
  const swaps = await db.prepare(`
    SELECT COUNT(*)::int AS n FROM shift_swap_requests sr JOIN shift_assignments sa ON sa.id = sr.requester_shift_id
    WHERE sr.org_id = ? AND sa.location_id = ? AND sr.status IN ('manager_approved','manager_rejected') AND sr.created_at BETWEEN ? AND ?
  `).get(orgId, locationId, tsOf(start), tsOf(addDays(end, 1)) - 1).catch(() => ({ n: 0 })) as any;

  // ── Kurallar: yayınlanan planda dinlenme ve haftalık saat (bir önceki haftayla birlikte, sınır geçişi için)
  const ruleMax = typeof rules.max_weekly_hours === "number" ? rules.max_weekly_hours : 45;
  const minRest = typeof rules.min_rest_hours === "number" ? rules.min_rest_hours : 11;
  const balancing = typeof rules.balancing_period_weeks === "number" ? rules.balancing_period_weeks : 1;
  const ctx = await publishedShifts(db, locationId, addDays(start, -7), end);
  const people = await db.prepare(`SELECT id, name, max_weekly_hours FROM personnel WHERE org_id = ?`).all(orgId) as any[];
  const personOf = new Map(people.map(p => [p.id, p]));
  const examples: string[] = [];
  let problems = 0;
  for (const pid of new Set(shifts.map(s => s.personnel_id))) {
    const p = personOf.get(pid);
    const personMax = effectiveWeeklyLimit(p?.max_weekly_hours, ruleMax);
    const pr = { maxWeeklyHours: balancing >= 2 && personMax >= ruleMax ? 66 : personMax, minRestHours: minRest };
    const all: TimedShift[] = ctx.filter(s => s.personnel_id === pid);
    for (const ws of new Set(shifts.filter(s => s.personnel_id === pid).map(s => s.week_start))) {
      const added = all.filter(s => s.week_start === ws);
      const found = findAssignmentProblems(all, added, pr);
      problems += found.length;
      for (const f of found) if (examples.length < 3) examples.push(`${p?.name ?? "Bir kişi"}: ${f}`);
    }
  }

  // ── Çalışma saati ve fazla mesai
  const prevShifts = await publishedShifts(db, locationId, prev.start, prev.end);
  const work = { hours: round1(shifts.reduce((t, s) => t + hoursOf(s), 0)), prevHours: round1(prevShifts.reduce((t, s) => t + hoursOf(s), 0)) };
  let overtime: MonthlyGain["overtime"] = null;
  if (isModuleOn(rules, "overtime_tracking_enabled")) {
    const cur = await overtimeFor(db, locationId, start, end, withCost);
    const pre = await overtimeFor(db, locationId, prev.start, prev.end, withCost);
    overtime = { hours: cur.hours, prevHours: pre.hours, cost: cur.cost, prevCost: pre.cost };
  }

  const r: MonthlyGain = {
    month, label: monthLabel(month), partial: end >= today,
    plans: { published, generated: genWeeks.size, estHours },
    absences: { total: open.length, filled, unfilled },
    requests: { leaveApproved: leaves.filter(l => l.status === "approved").length, leaveRejected: leaves.filter(l => l.status === "rejected").length, swapsDecided: Number(swaps?.n ?? 0) },
    compliance: { shifts: shifts.length, problems, examples },
    work, overtime, highlights: [],
  };
  r.highlights = highlights(r);
  return r;
}

/** Sıfır olmayan konulardan kısa, tam cümleler */
export function highlights(r: MonthlyGain): string[] {
  const out: string[] = [];
  if (r.plans.generated) out.push(`${r.plans.generated} haftanın planı otomatik hazırlandı. Bu, elle planlamaya göre yaklaşık ${fmt(r.plans.estHours)} saat demek (tahmin).`);
  else if (r.plans.published) out.push(`${r.plans.published} haftanın planı yayınlandı.`);
  if (r.absences.total) out.push(`Boşalan ${r.absences.total} vardiyanın ${r.absences.filled} tanesine biri bulundu.`);
  const decided = r.requests.leaveApproved + r.requests.leaveRejected + r.requests.swapsDecided;
  if (decided) out.push(`${decided} izin ve vardiya değiştirme talebi karara bağlandı.`);
  if (r.compliance.shifts) out.push(r.compliance.problems === 0
    ? `Yayınlanan ${r.compliance.shifts} vardiyanın hiçbirinde dinlenme ya da haftalık saat sınırı aşılmadı.`
    : `Yayınlanan planlarda ${r.compliance.problems} yerde dinlenme ya da haftalık saat sınırı aşıldı.`);
  // Süren ay tam ayla karşılaştırılmaz (yanıltır): sadece bugüne kadarki saat
  if (r.overtime && r.partial && r.overtime.hours) out.push(`Bu ay şu ana kadar ${fmt(r.overtime.hours)} saat fazla mesai yazıldı.`);
  else if (r.overtime && !r.partial && (r.overtime.hours || r.overtime.prevHours)) {
    const diff = round1(r.overtime.hours - r.overtime.prevHours);
    out.push(diff < 0 ? `Fazla mesai bir önceki aya göre ${fmt(-diff)} saat azaldı (${fmt(r.overtime.hours)} saat).`
      : diff > 0 ? `Fazla mesai bir önceki aya göre ${fmt(diff)} saat arttı (${fmt(r.overtime.hours)} saat).`
      : `Fazla mesai bir önceki ayla aynı kaldı (${fmt(r.overtime.hours)} saat).`);
  }
  return out;
}

/**
 * Ay başı bildirimi (günlük zamanlanmış görevden çağrılır, ayın ilk 3 günü): geçen ayın özeti şubenin
 * sorumlularına zil + telefon bildirimi olarak gider. Şube başına ayda bir kez (rules.gain_report_sent).
 * O ay yayınlanmış plan yoksa gönderilmez.
 */
export async function sendMonthlyGainReports(db: any, budgetMs = 60_000): Promise<{ sent: number; checked: number }> {
  const today = businessToday();
  if (Number(today.slice(8, 10)) > 3) return { sent: 0, checked: 0 };
  const month = prevMonth(today.slice(0, 7));
  const started = Date.now();
  const locs = await db.prepare(`SELECT id, org_id, rules FROM locations`).all() as any[];
  let sent = 0;
  for (const loc of locs) {
    if (Date.now() - started > budgetMs) break;
    let rules: any = {};
    try { rules = typeof loc.rules === "string" ? JSON.parse(loc.rules || "{}") : (loc.rules ?? {}); } catch { /* varsayılan */ }
    if (rules.gain_report_sent === month) continue;
    try {
      const r = await buildMonthlyGain(db, loc.org_id, loc.id, month, false);
      if (r.compliance.shifts > 0 && r.highlights.length) {
        await notifyBranchManagers(db, loc.org_id, loc.id, null, {
          type: "monthly_report",
          title: `${r.label} özeti`,
          message: r.highlights.slice(0, 3).join(" "),
          link: `/reports?tab=ozet&month=${month}`,
        });
        sent++;
      }
      // Kurallar yeniden okunup tek anahtar yazılır (arada kaydedilen ayar ezilmesin)
      const fresh = await db.prepare(`SELECT rules FROM locations WHERE id = ?`).get(loc.id) as any;
      let fr: any = {};
      try { fr = typeof fresh?.rules === "string" ? JSON.parse(fresh.rules || "{}") : (fresh?.rules ?? {}); } catch { /* varsayılan */ }
      await db.prepare(`UPDATE locations SET rules = ? WHERE id = ?`).run(JSON.stringify({ ...fr, gain_report_sent: month }), loc.id);
    } catch (e) {
      console.error("[monthlyGain]", loc.id, e);
    }
  }
  return { sent, checked: locs.length };
}
