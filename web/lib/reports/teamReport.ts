/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Raporlar › Özet: TEK KAYNAK (2026-10-09, kullanıcı: "ihtiyaç duyulmayan bilgiler var, daha çok ihtiyaç duyulacak
 * bilgiler olmalı"). Bir ayda ekip ne kadar çalıştı, maliyeti ne, planda eksik kalan yer, kim sınırı aştı,
 * kim geç geldi, iş kimin üstünde toplandı. Şube raporu tek şube, Tüm Şubeler raporu birden çok şube için çağırır.
 * Sadece yayınlanmış vardiyalar sayılır; saatler molası düşülmüş çalışma süresidir (lib/legal).
 */
import { addDays, businessToday } from "@/lib/date";
import { monthLabel, monthRange, prevMonth } from "@/lib/months";
import { definedBreakFor, effectiveWeeklyLimit, netWorkMinutes } from "@/lib/legal";
import { departmentLabel, leafDepartments } from "@/lib/departments";
import { DAY_NAMES } from "@/lib/constants";
import { isModuleOn } from "@/lib/moduleVisibility";

const J = (raw: unknown, d: any) => { try { return typeof raw === "string" ? JSON.parse(raw) : (raw ?? d); } catch { return d; } };
const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
/** 10 dakikadan fazla gecikme geç gelme sayılır */

export type TeamPerson = {
  id: string; name: string; branch: string; department: string | null;
  hours: number; shifts: number; weekend: number; night: number; leaveDays: number;
  overLimitWeeks: number; cost: number | null;
  /** Fazla mesai: haftalık çalışması mesai başlangıcını (rules.overtime_threshold_hours, varsayılan 45) aşan haftalar.
   *  Hafta, başladığı ayın raporunda sayılır ve bütün haftanın süresiyle hesaplanır. */
  overtime: { weekStart: string; worked: number; over: number }[];
  overtimeHours: number;
};
export type TeamReport = {
  month: string; label: string; partial: boolean;
  totals: {
    hours: number; prevHours: number; shifts: number; people: number;
    cost: number | null; prevCost: number | null; pricedPeople: number;
    gaps: number; leaveDays: number;
    overLimitPeople: number;
    overtimePeople: number;
    overtimeHours: number;
    /** En az bir şubede fazla mesai takibi açık */
    overtimeOn: boolean;
  };
  people: TeamPerson[];
  departments: { name: string; hours: number; people: number }[];
  weekdays: number[];
  branches: { id: string; name: string; hours: number; cost: number | null; gaps: number; people: number; overLimit: number; overtimePeople: number }[];
  /** Dikkat edilecekler: tam cümleler, önemli olan önce */
  attention: string[];
};

type Shift = {
  location_id: string; personnel_id: string; week_start: string; day: number; date: string;
  start_time: string; end_time: string; shift_id: string | null; department_id: string | null; hours: number;
};

async function shiftsIn(db: any, ids: string[], start: string, end: string, defsByLoc: Map<string, any[]>): Promise<Shift[]> {
  if (!ids.length) return [];
  const rows = await db.prepare(`
    SELECT location_id, personnel_id, week_start, day, start_time, end_time, shift_id, department_id
    FROM shift_assignments
    WHERE location_id IN (${ids.map(() => "?").join(",")}) AND publication_status = 'published' AND COALESCE(kind, 'regular') = 'regular'
      AND start_time IS NOT NULL AND end_time IS NOT NULL
      AND (week_start::date + day) BETWEEN ?::date AND ?::date
  `).all(...ids, start, end) as any[];
  return rows.map(r => {
    const s = toMin(r.start_time); let e = toMin(r.end_time); if (e <= s) e += 1440;
    const hours = netWorkMinutes(e - s, definedBreakFor(defsByLoc.get(r.location_id) ?? [], r)) / 60;
    return { ...r, day: Number(r.day), date: addDays(r.week_start, Number(r.day)), hours };
  });
}

/** withCost: ücret görme yetkisi (lib/userAccess "budget") */
export async function buildTeamReport(db: any, orgId: string, locationIds: string[], month: string, withCost: boolean): Promise<TeamReport> {
  const { start, end } = monthRange(month);
  const prev = monthRange(prevMonth(month));
  const today = businessToday();
  const ph = locationIds.map(() => "?").join(",");

  const locs = locationIds.length
    ? await db.prepare(`SELECT id, name, rules, shift_definitions, demand_matrix FROM locations WHERE org_id = ? AND id IN (${ph})`).all(orgId, ...locationIds) as any[]
    : [];
  const ids = locs.map(l => l.id);
  const defsByLoc = new Map<string, any[]>(locs.map(l => [l.id, J(l.shift_definitions, [])]));
  const locName = new Map<string, string>(locs.map(l => [l.id, l.name]));
  const ruleMax = new Map<string, number>(locs.map(l => [l.id, Number(J(l.rules, {}).max_weekly_hours) || 45]));
  // Fazla mesai başlangıcı (Ayarlar › Gelişmiş › Çalışma Süresi; İş K. m.41 haftalık 45).
  // Fazla mesai takibi kapalı şubede fazla mesai hiç hesaplanmaz (Ayarlar › Özellikler)
  const ruleOt = new Map<string, number>(locs.filter(l => isModuleOn(J(l.rules, {}), "overtime_tracking_enabled"))
    .map(l => [l.id, Number(J(l.rules, {}).overtime_threshold_hours) || 45]));
  const depts = ids.length ? await db.prepare(`SELECT id, location_id, parent_id, name, demand_matrix FROM departments WHERE location_id IN (${ids.map(() => "?").join(",")})`).all(...ids) as any[] : [];
  const people = await db.prepare(`SELECT id, name, primary_location_id, department_id, max_weekly_hours, hourly_wage, weekly_off_day FROM personnel WHERE org_id = ?`).all(orgId) as any[];
  const personOf = new Map<string, any>(people.map(p => [p.id, p]));

  const shifts = await shiftsIn(db, ids, start, end, defsByLoc);
  const prevShifts = await shiftsIn(db, ids, prev.start, prev.end, defsByLoc);
  // Ayın son haftası ertesi aya taşar: fazla mesai için o haftanın tamamı
  const tailShifts = await shiftsIn(db, ids, addDays(end, 1), addDays(end, 7), defsByLoc);
  const weekSum = new Map<string, number>(); // kişi|hafta → saat (ay içinde başlayan haftalar)
  for (const s of [...shifts, ...tailShifts]) {
    if (s.week_start < start || s.week_start > end) continue;
    const k = `${s.personnel_id}|${s.week_start}`;
    weekSum.set(k, (weekSum.get(k) ?? 0) + s.hours);
  }
  const wage = (pid: string) => Number(personOf.get(pid)?.hourly_wage) || 0;

  // İzinler (onaylı), ay içine düşen günler
  const leaves = ids.length ? await db.prepare(`
    SELECT lr.personnel_id, lr.start_date, lr.end_date FROM leave_requests lr JOIN personnel p ON p.id = lr.personnel_id
    WHERE p.org_id = ? AND p.primary_location_id IN (${ids.map(() => "?").join(",")}) AND lr.status = 'approved'
      AND lr.start_date <= ? AND lr.end_date >= ?
  `).all(orgId, ...ids, end, start) as any[] : [];
  const leaveDays = new Map<string, number>();
  for (const l of leaves) {
    const off = personOf.get(l.personnel_id)?.weekly_off_day;
    let n = 0;
    for (let d = l.start_date < start ? start : l.start_date; d <= (l.end_date > end ? end : l.end_date); d = addDays(d, 1)) {
      const wd = (new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7;
      if (off === null || off === undefined || Number(off) !== wd) n++;
    }
    leaveDays.set(l.personnel_id, (leaveDays.get(l.personnel_id) ?? 0) + n);
  }


  // Kişi kişi
  const byPerson = new Map<string, Shift[]>();
  for (const s of shifts) byPerson.set(s.personnel_id, [...(byPerson.get(s.personnel_id) ?? []), s]);
  const deptName = (id: string | null | undefined) => {
    const d = id ? depts.find(x => x.id === id) : null;
    return d ? departmentLabel(depts.filter(x => x.location_id === d.location_id), d) : null;
  };
  const list: TeamPerson[] = [];
  for (const [pid, ss] of byPerson) {
    const p = personOf.get(pid);
    const home = p?.primary_location_id && locName.has(p.primary_location_id) ? p.primary_location_id : ss[0].location_id;
    const limit = effectiveWeeklyLimit(p?.max_weekly_hours, ruleMax.get(home) ?? 45);
    const weeks = new Map<string, number>();
    for (const s of ss) weeks.set(s.week_start, (weeks.get(s.week_start) ?? 0) + s.hours);
    const hours = ss.reduce((t, s) => t + s.hours, 0);
    const otAt = ruleOt.get(home);
    const overtime = otAt === undefined ? [] : [...weekSum.entries()].filter(([k]) => k.startsWith(`${pid}|`))
      .map(([k, h]) => ({ weekStart: k.split("|")[1], worked: round1(h), over: round1(h - otAt) }))
      .filter(w => w.over > 0.05).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    list.push({
      id: pid, name: p?.name ?? "Silinmiş kişi", branch: locName.get(home) ?? "", department: deptName(p?.department_id),
      hours: round1(hours), shifts: ss.length,
      weekend: ss.filter(s => s.day >= 5).length,
      night: ss.filter(s => toMin(s.start_time) >= 22 * 60 || toMin(s.end_time) <= toMin(s.start_time)).length,
      leaveDays: leaveDays.get(pid) ?? 0,
      overLimitWeeks: [...weeks.values()].filter(h => h > limit + 0.01).length,
      cost: withCost && wage(pid) ? Math.round(hours * wage(pid)) : null,
      overtime, overtimeHours: round1(overtime.reduce((t, w) => t + w.over, 0)),
    });
  }
  // Ay içinde hiç vardiyası olmayan ama izinli olanlar da listede görünsün
  for (const [pid, n] of leaveDays) if (!byPerson.has(pid)) {
    const p = personOf.get(pid);
    list.push({ id: pid, name: p?.name ?? "", branch: locName.get(p?.primary_location_id) ?? "", department: deptName(p?.department_id),
      hours: 0, shifts: 0, weekend: 0, night: 0, leaveDays: n, overLimitWeeks: 0, cost: null, overtime: [], overtimeHours: 0 });
  }
  list.sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, "tr"));

  // Eksik kalan: yayınlanan haftalarda kayıtlı kişi sayısı − yazılan (ay içindeki günler)
  const gapsByLoc = new Map<string, number>();
  const gapPlaces = new Map<string, number>();
  for (const loc of locs) {
    const defs = (defsByLoc.get(loc.id) ?? []).filter((d: any) => !d.on_call);
    const leavesD = leafDepartments(depts.filter(d => d.location_id === loc.id));
    const groups = leavesD.length ? leavesD.map(d => ({ id: d.id as string | null, name: d.name as string | null, m: J(d.demand_matrix, {}) })) : [{ id: null, name: null, m: J(loc.demand_matrix, {}) }];
    const here = shifts.filter(s => s.location_id === loc.id);
    for (const ws of new Set(here.map(s => s.week_start))) {
      for (let day = 0; day < 7; day++) {
        const date = addDays(ws, day);
        if (date < start || date > end) continue;
        for (const g of groups) for (const d of defs) {
          const need = Number(g.m?.[d.id]?.[day] ?? g.m?.[d.id]?.[String(day)] ?? 0) || 0;
          if (!need) continue;
          const have = here.filter(s => s.week_start === ws && s.day === day && (String(s.shift_id) === String(d.id) || (s.start_time === d.start && s.end_time === d.end))
            && (!leavesD.length || (s.department_id ?? personOf.get(s.personnel_id)?.department_id ?? null) === g.id)).length;
          const miss = Math.max(0, need - have);
          if (!miss) continue;
          gapsByLoc.set(loc.id, (gapsByLoc.get(loc.id) ?? 0) + miss);
          const key = `${DAY_NAMES[day]} ${d.name}${g.name ? ` (${g.name})` : ""}${locs.length > 1 ? `, ${loc.name}` : ""}`;
          gapPlaces.set(key, (gapPlaces.get(key) ?? 0) + miss);
        }
      }
    }
  }

  // Departmanlar ve günler
  const deptHours = new Map<string, { hours: number; people: Set<string> }>();
  for (const s of shifts) {
    const name = deptName(s.department_id ?? personOf.get(s.personnel_id)?.department_id) ?? "Departmansız";
    const label = locs.length > 1 ? `${name} · ${locName.get(s.location_id)}` : name;
    const e = deptHours.get(label) ?? { hours: 0, people: new Set<string>() };
    e.hours += s.hours; e.people.add(s.personnel_id);
    deptHours.set(label, e);
  }
  const weekdays = [0, 1, 2, 3, 4, 5, 6].map(d => round1(shifts.filter(s => s.day === d).reduce((t, s) => t + s.hours, 0)));

  const cost = withCost && shifts.some(s => wage(s.personnel_id)) ? Math.round(shifts.reduce((t, s) => t + s.hours * wage(s.personnel_id), 0)) : null;
  const prevCost = withCost && prevShifts.some(s => wage(s.personnel_id)) ? Math.round(prevShifts.reduce((t, s) => t + s.hours * wage(s.personnel_id), 0)) : null;
  const totals: TeamReport["totals"] = {
    hours: round1(shifts.reduce((t, s) => t + s.hours, 0)), prevHours: round1(prevShifts.reduce((t, s) => t + s.hours, 0)),
    shifts: shifts.length, people: byPerson.size, cost, prevCost,
    pricedPeople: [...byPerson.keys()].filter(pid => wage(pid) > 0).length,
    gaps: [...gapsByLoc.values()].reduce((a, b) => a + b, 0),
    leaveDays: [...leaveDays.values()].reduce((a, b) => a + b, 0),
    overLimitPeople: list.filter(p => p.overLimitWeeks > 0).length,
    overtimePeople: list.filter(p => p.overtimeHours > 0).length,
    overtimeHours: round1(list.reduce((t, p) => t + p.overtimeHours, 0)),
    overtimeOn: ruleOt.size > 0,
  };

  const branches = locs.map(l => {
    const ss = shifts.filter(s => s.location_id === l.id);
    const pids = new Set(ss.map(s => s.personnel_id));
    return {
      id: l.id, name: l.name, hours: round1(ss.reduce((t, s) => t + s.hours, 0)),
      cost: withCost && ss.some(s => wage(s.personnel_id)) ? Math.round(ss.reduce((t, s) => t + s.hours * wage(s.personnel_id), 0)) : null,
      gaps: gapsByLoc.get(l.id) ?? 0, people: pids.size,
      overLimit: list.filter(p => pids.has(p.id) && p.overLimitWeeks > 0).length,
      overtimePeople: list.filter(p => pids.has(p.id) && p.overtimeHours > 0).length,
    };
  });

  // Dikkat edilecekler
  const attention: string[] = [];
  const names = (xs: TeamPerson[]) => xs.length <= 3 ? xs.map(x => x.name).join(", ") : `${xs.slice(0, 3).map(x => x.name).join(", ")} ve ${xs.length - 3} kişi daha`;
  const over = list.filter(p => p.overLimitWeeks > 0);
  const ot = list.filter(p => p.overtimeHours > 0).sort((a, b) => b.overtimeHours - a.overtimeHours);
  if (ot.length) attention.push(`${ot.length} kişi fazla mesai yaptı, toplam ${fmt(totals.overtimeHours)} saat. En çok: ${ot[0].name} (${fmt(ot[0].overtimeHours)} saat).`);
  if (over.length) attention.push(`${over.length} kişi en az bir hafta haftalık çalışma sınırını aştı: ${names(over)}.`);
  if (totals.gaps) {
    const top = [...gapPlaces].sort((a, b) => b[1] - a[1])[0];
    attention.push(`Yayınlanan planlarda toplam ${totals.gaps} kişilik eksik kaldı. En çok eksik olan vardiya: ${top[0]} (${top[1]} kişi).`);
  }
  const working = list.filter(p => p.shifts >= 4);
  if (working.length >= 3) {
    const avgW = working.reduce((t, p) => t + p.weekend, 0) / working.length;
    const topW = [...working].sort((a, b) => b.weekend - a.weekend)[0];
    if (topW.weekend >= 4 && topW.weekend >= avgW * 2) attention.push(`Hafta sonu işi ${topW.name} üzerinde toplanıyor: ${topW.weekend} vardiya, ekip ortalaması ${fmt(round1(avgW))}.`);
    const avgN = working.reduce((t, p) => t + p.night, 0) / working.length;
    const topN = [...working].sort((a, b) => b.night - a.night)[0];
    if (topN.night >= 4 && topN.night >= avgN * 2) attention.push(`Gece vardiyaları ${topN.name} üzerinde toplanıyor: ${topN.night} vardiya, ekip ortalaması ${fmt(round1(avgN))}.`);
  }
  const partial = end >= today;
  if (!partial && totals.prevHours) {
    const diff = round1(totals.hours - totals.prevHours);
    const pct = Math.round((diff / totals.prevHours) * 100);
    if (Math.abs(pct) >= 10) attention.push(`Toplam çalışma süresi bir önceki aya göre %${Math.abs(pct)} ${diff > 0 ? "arttı" : "azaldı"} (${fmt(totals.prevHours)} saatten ${fmt(totals.hours)} saate).`);
  }

  return {
    month, label: monthLabel(month), partial, totals, people: list,
    departments: [...deptHours].map(([name, v]) => ({ name, hours: round1(v.hours), people: v.people.size })).sort((a, b) => b.hours - a.hours),
    weekdays, branches, attention,
  };
}
