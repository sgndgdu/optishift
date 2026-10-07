/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Yayınlanmış plandaki tek tek atama değişikliklerinin kural kontrolü: TEK KAYNAK.
 *
 * Takas (personel kabulü + müdür onayı) ve açık vardiya üstlenme aynı fonksiyonu çağırır.
 * Kişinin değişiklik sonrası takvimine bakar: aynı gün ikinci/çakışan vardiya, iki vardiya
 * arası asgari dinlenme (rules.min_rest_hours, varsayılan 11) ve haftalık çalışma sınırı
 * (lib/legal effectiveWeeklyLimit: şube sınırı üst sınır, kişinin değeri sadece daha düşükse; denkleştirmede tek hafta tavanı 66,
 * lib/copilot/snapshot ile aynı). Bulgu varsa değişiklik engellenir; müdür açıkça
 * onaylarsa (force) yine de yapılabilir.
 */
import { definedBreakFor, effectiveWeeklyLimit, netWorkMinutes } from "@/lib/legal";

export interface TimedShift {
  /** Haftanın pazartesisi (YYYY-MM-DD) */
  week_start: string;
  /** 0 = Pazartesi */
  day: number;
  start_time: string;
  end_time: string;
  /** Vardiya tanımındaki mola (dk); yoksa yasal asgari. Haftalık toplam mola düşülerek sayılır. */
  break_minutes?: number;
}

export interface PersonRules {
  maxWeeklyHours: number;
  minRestHours: number;
}

const DAY = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const toMin = (t: string) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };
const fmt = (h: number) => h.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
const weekDiffDays = (a: string, b: string) =>
  Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86_400_000);

/** Vardiyanın mutlak [başlangıç, bitiş) dakikası, `base` haftasının pazartesi 00:00'ından. */
function span(s: TimedShift, base: string): [number, number] {
  const dayOffset = weekDiffDays(s.week_start, base) + Number(s.day);
  const start = dayOffset * 1440 + toMin(s.start_time);
  let end = dayOffset * 1440 + toMin(s.end_time);
  if (end <= start) end += 1440;
  return [start, end];
}

/**
 * Saf kontrol: `shifts` kişinin değişiklik SONRASI vardiyaları (komşu haftalar dahil olabilir),
 * `added` yeni gelen vardiyalar (yalnız bunlara dokunan sorunlar raporlanır; eski sorunlar
 * bu değişikliğin suçu değil). Dönen liste boşsa sorun yok.
 */
export function findAssignmentProblems(shifts: TimedShift[], added: TimedShift[], rules: PersonRules): string[] {
  if (added.length === 0) return [];
  const base = added[0].week_start;
  const all = shifts.map(s => ({ s, span: span(s, base) })).sort((a, b) => a.span[0] - b.span[0]);
  const isAdded = (s: TimedShift) => added.includes(s);
  const out: string[] = [];

  for (let i = 0; i < all.length; i++) {
    const cur = all[i];
    const prev = all[i - 1];
    if (!prev || !(isAdded(cur.s) || isAdded(prev.s))) continue;
    const label = `${DAY[Number(prev.s.day)]} ${prev.s.start_time}-${prev.s.end_time} ile ${DAY[Number(cur.s.day)]} ${cur.s.start_time}-${cur.s.end_time}`;
    const gapH = (cur.span[0] - prev.span[1]) / 60;
    if (gapH < 0) out.push(`${label} vardiyaları çakışıyor`);
    else if (gapH < rules.minRestHours) out.push(`${label} arasında ${fmt(gapH)} saat kalıyor, en az ${fmt(rules.minRestHours)} olmalı`);
  }

  // Haftalık sınır: değişikliğin dokunduğu her hafta için
  for (const ws of new Set(added.map(a => a.week_start))) {
    const total = shifts.filter(s => s.week_start === ws)
      .reduce((t, s) => { const [a, b] = span(s, ws); return t + netWorkMinutes(b - a, s.break_minutes) / 60; }, 0);
    if (total > rules.maxWeeklyHours + 1e-9) {
      out.push(`Haftalık çalışma ${fmt(total)} saate çıkıyor (sınır ${fmt(rules.maxWeeklyHours)})`);
    }
  }
  return out;
}

const addDaysISO = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};

/** Kişinin kuralları: kişi sınırı / şube kuralı / denkleştirme (lib/copilot/snapshot ile aynı mantık). */
export async function loadPersonRules(db: any, personnelId: string, locationId: string): Promise<PersonRules> {
  let rules: any = {};
  try {
    const row = await db.prepare(`SELECT rules FROM locations WHERE id = ?`).get(locationId) as any;
    rules = typeof row?.rules === "string" ? JSON.parse(row.rules || "{}") : (row?.rules ?? {});
  } catch { /* varsayılan */ }
  const p = await db.prepare(`SELECT max_weekly_hours FROM personnel WHERE id = ?`).get(personnelId) as any;
  const ruleMax = typeof rules.max_weekly_hours === "number" ? rules.max_weekly_hours : 45;
  const personMax = effectiveWeeklyLimit(p?.max_weekly_hours, ruleMax);
  const balancing = typeof rules.balancing_period_weeks === "number" ? rules.balancing_period_weeks : 1;
  return {
    maxWeeklyHours: balancing >= 2 && personMax >= ruleMax ? 66 : personMax,
    minRestHours: typeof rules.min_rest_hours === "number" ? rules.min_rest_hours : 11,
  };
}

/**
 * DB'den kişinin ilgili haftalarını (bir önceki ve sonraki hafta dahil, tüm şubeler) okuyup
 * değişikliği uygular ve kontrol eder. `removeIds`: kişiden çıkacak atamalar, `add`: gelecekler.
 */
export async function checkPersonChange(
  db: any,
  personnelId: string,
  locationId: string,
  change: { removeIds?: number[]; add: TimedShift[] },
): Promise<string[]> {
  if (change.add.length === 0) return [];
  const weeks = new Set<string>();
  for (const a of change.add) { weeks.add(addDaysISO(a.week_start, -7)); weeks.add(a.week_start); weeks.add(addDaysISO(a.week_start, 7)); }
  const wl = [...weeks];
  const rows = await db.prepare(`
    SELECT id, location_id, shift_id, week_start, day, start_time, end_time FROM shift_assignments
    WHERE personnel_id = ? AND week_start IN (${wl.map(() => "?").join(",")})
      AND COALESCE(kind, 'regular') = 'regular' AND status != 'swapped' AND status != 'absent'
      AND start_time IS NOT NULL AND end_time IS NOT NULL
  `).all(personnelId, ...wl) as any[];
  const remove = new Set((change.removeIds ?? []).map(Number));
  // Mola: her vardiyanın kendi şubesindeki tanımından (yoksa yasal asgari)
  const locIds = [...new Set([locationId, ...rows.map(r => String(r.location_id))])];
  const defsByLoc = new Map<string, any[]>();
  try {
    const locRows = await db.prepare(`SELECT id, shift_definitions FROM locations WHERE id IN (${locIds.map(() => "?").join(",")})`).all(...locIds) as any[];
    for (const l of locRows) {
      try { const d = typeof l.shift_definitions === "string" ? JSON.parse(l.shift_definitions) : l.shift_definitions; defsByLoc.set(String(l.id), Array.isArray(d) ? d : []); } catch { /* boş */ }
    }
  } catch { /* yasal asgari */ }
  const kept: TimedShift[] = rows.filter(r => !remove.has(Number(r.id))).map(r => ({
    week_start: String(r.week_start), day: Number(r.day), start_time: String(r.start_time), end_time: String(r.end_time),
    break_minutes: definedBreakFor(defsByLoc.get(String(r.location_id)), r),
  }));
  const add = change.add.map(a => a.break_minutes !== undefined ? a : { ...a, break_minutes: definedBreakFor(defsByLoc.get(locationId), a) });
  const rules = await loadPersonRules(db, personnelId, locationId);
  return findAssignmentProblems([...kept, ...add], add, rules);
}
