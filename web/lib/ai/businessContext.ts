/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Asistan için işletme özeti (lib/ai/chat bağlamı). Kullanıcının kapsamında, okunur düz metin.
 * Şube kapsamı: tek şubenin tam ayrıntısı (personel, bu/gelecek hafta planı, uygunluk, izinler,
 * bekleyen onaylar, mesai, açık vardiyalar, belgeler, bugünün durumu).
 * Tüm Şubeler kapsamı (patron / bölge müdürü): şube başına kısa özet.
 * Kişisel ücret sadece ücret izni olana (lib/ruleLocks "budget") gider.
 */
import type { AuthUser } from "@/lib/auth";
import { leaveTypeLabel } from "@/lib/leave";
import { addDays, businessNow } from "@/lib/date";
import { DAY_SHORT } from "@/lib/constants";
import { summarizeOperatingHours } from "@/lib/operatingHours";
import { industryFromRules } from "@/lib/templates";
import { autopilotSettings, autopilotWhen } from "@/lib/autopilotRules";
import { assignmentWorkMinutes } from "@/lib/legal";
import { hasPerm } from "@/lib/userAccess";
import { managerOutsideBranch } from "@/lib/access";
import { buildWeekCalendar, calendarLines } from "@/lib/weekCalendar";
import { departmentLabel, leafDepartments, sortDepartments } from "@/lib/departments";

const J = (raw: unknown, d: any) => { try { return typeof raw === "string" ? JSON.parse(raw) : (raw ?? d); } catch { return d; } };
const day = (d: number) => DAY_SHORT[d] ?? String(d);
const short = (iso: string) => { const [, m, dd] = iso.split("-"); return `${Number(dd)}.${Number(m)}`; };
const ROLE: Record<string, string> = { admin: "Hesap sahibi", supervisor: "Sorumlu (birden çok şube)", manager: "Sorumlu", employee: "Ekip üyesi" };
const DETAIL_BRANCH_LIMIT = 8;
const EMP: Record<string, string> = { full_time: "tam zamanlı", part_time: "yarı zamanlı" };

export async function weekRows(db: any, locationId: string, ws: string): Promise<any[]> {
  return await db.prepare(`
    SELECT id, personnel_id, day, start_time, end_time, shift_id, publication_status, COALESCE(kind,'regular') AS kind, check_in_at, department_id
    FROM shift_assignments WHERE location_id = ? AND week_start = ? ORDER BY day, start_time
  `).all(locationId, ws) as any[];
}

/** Bir haftanın planı okunur satırlarla: kişi kişi vardiyalar, gün gün kim çalışıyor (atanan/gereken), eksikler.
 *  Asistan (branchDetail) ve planı yazarak değiştirme (/api/plan/instruct) aynı metni kullanır. */
export function weekPlanLines(rows: any[], o: {
  label: string; ws: string; loc: any; defs: any[]; active: any[]; nameOf: Map<string, string>;
  depts: any[]; personDept: Map<string, string | null>; today: number | null;
}): string[] {
  const out: string[] = [];
  const { label, ws, loc, defs, active, nameOf, depts, personDept } = o;
  const defName = new Map(defs.map(d => [String(d.id), d.name]));
  const deptName = (id: string | null | undefined) => { const d = id ? depts.find(x => x.id === id) : null; return d ? departmentLabel(depts, d) : null; };
  const status = rows.length === 0 ? "plan yok" : rows.some(r => r.publication_status === "published") ? "yayınlandı" : "taslak (personel görmüyor)";
  out.push(`### ${label} planı (${short(ws)}-${short(addDays(ws, 6))}, ${status})`);
  const byPerson = new Map<string, string[]>();
  const hours = new Map<string, number>();
  for (const r of rows) {
    // [v<id>]: asistanın işlem önerisinde vardiyayı göstermesi için (lib/ai/actions)
    const tag = `${day(r.day)} ${short(addDays(ws, Number(r.day)))} ${r.start_time}-${r.end_time}${r.kind === "on_call" ? " icap" : ""}${defName.get(String(r.shift_id)) ? ` (${defName.get(String(r.shift_id))})` : ""} [v${r.id}]`;
    byPerson.set(r.personnel_id, [...(byPerson.get(r.personnel_id) ?? []), tag]);
    if (r.kind !== "on_call" && r.start_time && r.end_time) {
      // Mola düşülmüş çalışma saati (lib/legal)
      hours.set(r.personnel_id, (hours.get(r.personnel_id) ?? 0) + assignmentWorkMinutes(defs, r) / 60);
    }
  }
  for (const [pid, list] of byPerson) out.push(`- ${nameOf.get(pid) ?? pid} (${Math.round((hours.get(pid) ?? 0) * 10) / 10} s): ${list.join("; ")}`);
  const idle = active.filter(p => !byPerson.has(p.id)).map(p => p.name);
  if (rows.length && idle.length) out.push(`- Vardiyası olmayanlar: ${idle.join(", ")}`);
  // Gün gün kim nerede: "Cmt 17.10 Akşam Servisi · Bar: Kaan Yıldız, Cansu Oral (2/2 kişi)"
  // Vardiyanın departmanı: kayıttaki departman (joker) ya da kişinin ana departmanı
  const leaves = depts.length ? leafDepartments(depts) : [];
  const rowDept = (r: any) => (r.department_id ?? personDept.get(r.personnel_id) ?? null) as string | null;
  const needOf = (deptId: string | null, defId: string, g: number) => {
    const m = deptId ? J(depts.find(d => d.id === deptId)?.demand_matrix, {}) : J(loc.demand_matrix, {});
    return Number(m?.[defId]?.[g] ?? m?.[defId]?.[String(g)] ?? 0) || 0;
  };
  const gaps: string[] = [];
  if (rows.length) {
    out.push(`#### ${label}: gün gün kim çalışıyor (atanan/gereken)`);
    const groups: (string | null)[] = depts.length ? [...leaves.map(d => d.id), null] : [null];
    for (let g = 0; g < 7; g++) for (const d of defs) {
      if (d.on_call) continue;
      for (const gid of groups) {
        // Vardiya kimliği tutmayan kayıt (ör. ilandan gelen "open-shift") saatinden eşleşir
        const isDef = (r: any) => String(r.shift_id) === String(d.id) || (!defName.has(String(r.shift_id)) && r.start_time === d.start && r.end_time === d.end);
        const here = rows.filter(r => r.day === g && isDef(r) && r.kind !== "on_call" && (!depts.length || rowDept(r) === gid));
        const need = depts.length && gid === null ? 0 : needOf(gid, d.id, g);
        if (!here.length && !need) continue;
        const where = depts.length ? ` · ${gid ? deptName(gid) : "departmansız"}` : "";
        out.push(`- ${day(g)} ${short(addDays(ws, g))} ${d.name}${where}: ${here.map(r => nameOf.get(r.personnel_id) ?? r.personnel_id).join(", ") || "kimse yok"}${need ? ` (${here.length}/${need})` : ""}`);
        if (need && here.length < need) gaps.push(`${day(g)} ${d.name}${where} ${here.length}/${need}`);
      }
    }
  }
  if (rows.length && gaps.length) out.push(`- Eksik (atanan/gereken): ${gaps.join(", ")}`);
  if (o.today !== null) {
    const dayIdx = o.today;
    const todays = rows.filter(r => r.day === dayIdx && r.publication_status === "published" && r.kind !== "on_call");
    if (todays.length) out.push(`- Bugün (${day(dayIdx)}): ${todays.map(r => `${nameOf.get(r.personnel_id) ?? r.personnel_id} ${r.start_time}-${r.end_time}${r.check_in_at ? " (geldi)" : ""}`).join(", ")}`);
  }
  return out;
}

async function branchDetail(db: any, auth: AuthUser, loc: any): Promise<string[]> {
  const out: string[] = [];
  const rules = J(loc.rules, {});
  const { weekStart, dayIdx, date: today } = businessNow();
  const nextWeek = addDays(weekStart, 7);
  const wageOk = hasPerm(auth, "budget");
  const defs: any[] = J(loc.shift_definitions, []);
  const defName = new Map(defs.map(d => [String(d.id), d.name]));

  out.push(`## Şube: ${loc.name}`);
  const ind = industryFromRules(rules);
  if (ind) out.push(`İşletme türü: ${ind.label}`);
  out.push(`Çalışma saatleri: ${summarizeOperatingHours(J(loc.operating_hours, null))}`);
  if (defs.length) out.push(`Vardiyalar: ${defs.map(d => `${d.name} ${d.start}-${d.end}${d.on_call ? " (icap)" : ""}`).join(", ")}`);
  out.push(`Kurallar: haftalık en fazla ${rules.max_weekly_hours ?? 45} saat, iki vardiya arası en az ${rules.min_rest_hours ?? 11} saat dinlenme, en fazla ${rules.max_consecutive_days ?? 6} gün üst üste`);
  const ap = rules.autopilot ?? {};
  out.push(`Otomatik pilot: ${ap.enabled === false ? "kapalı" : `açık (her hafta ${autopilotWhen(autopilotSettings(rules))})`}`);

  // Personel
  const people = await db.prepare(`
    SELECT p.*, u.username, u.role AS user_role FROM personnel p LEFT JOIN users u ON u.personnel_id = p.id
    WHERE p.org_id = ? AND (p.primary_location_id = ? OR p.assigned_location_ids LIKE ?) ORDER BY p.name
  `).all(auth.org_id, loc.id, `%"${loc.id}"%`) as any[];
  const active = people.filter(p => p.status !== "inactive");
  const nameOf = new Map(people.map(p => [p.id, p.name]));

  // Departmanlar: kişi ana departmanında ve yardım ettiği departmanlarda (joker) görünür; plan ve eksikler departman departman
  const depts = sortDepartments(await db.prepare(`SELECT id, name, parent_id, demand_matrix FROM departments WHERE location_id = ?`).all(loc.id) as any[]);
  const deptName = (id: string | null | undefined) => { const d = id ? depts.find(x => x.id === id) : null; return d ? departmentLabel(depts, d) : null; };
  const personDept = new Map<string, string | null>(people.map(p => [p.id, p.department_id ?? null]));
  if (depts.length) out.push(`Departmanlar: ${leafDepartments(depts).map(d => departmentLabel(depts, d)).join(", ")}`);
  out.push(`### Personel (${active.length} aktif${people.length > active.length ? `, ${people.length - active.length} pasif` : ""})`);
  for (const p of active) {
    const extra = (J(p.assigned_department_ids, []) as string[]).filter(id => id !== p.department_id).map(deptName).filter(Boolean);
    const bits = [
      depts.length ? (deptName(p.department_id) ? `departman ${deptName(p.department_id)}${extra.length ? ` (ayrıca ${extra.join(", ")})` : ""}` : "departmanı seçilmemiş") : (p.title || "Personel"),
      EMP[p.employment_type] ?? p.employment_type, `haftalık sınır ${p.max_weekly_hours ?? 45} s`,
    ];
    if (p.weekly_off_day !== null && p.weekly_off_day !== undefined) bits.push(`sabit izin günü ${day(Number(p.weekly_off_day))}`);
    if (p.hire_date) bits.push(`işe giriş ${p.hire_date}`);
    if (p.night_restriction) bits.push("gece çalıştırılamaz");
    if (Number(p.ytd_overtime_hours) > 0) bits.push(`bu yıl fazla mesai ${Math.round(Number(p.ytd_overtime_hours))} s`);
    if (p.prev_score !== null && p.prev_score !== undefined) bits.push(`adalet puanı ${Math.round(Number(p.prev_score))}`);
    if (wageOk && p.hourly_wage) bits.push(`saatlik ücret ₺${p.hourly_wage}`);
    bits.push(p.username ? "giriş hesabı var" : "giriş hesabı yok");
    out.push(`- ${p.name}: ${bits.join(", ")}`);
  }

  // Plan: bu hafta ve gelecek hafta
  for (const [label, ws] of [["Bu hafta", weekStart], ["Gelecek hafta", nextWeek]] as const) {
    out.push(...weekPlanLines(await weekRows(db, loc.id, ws), { label, ws, loc, defs, active, nameOf, depts, personDept, today: ws === weekStart ? dayIdx : null }));
  }

  // Takvim: bu ve gelecek haftanın özel günleri, işletmenin aynı gündeki geçmişiyle (lib/weekCalendar; hava yok, hızlı kalsın)
  // Önümüzdeki 5 hafta: bayram gibi günler için önceden soru sorulabilsin (geçmiş karşılaştırması yok, cevap hızlı kalsın)
  const cal = (await Promise.all([0, 1, 2, 3, 4].map(w =>
    buildWeekCalendar(db, loc.id, addDays(weekStart, 7 * w), { weather: false, history: false }).catch(() => [])))).flat();
  if (cal.length) { out.push("### Takvim (önümüzdeki haftaların özel günleri)"); out.push(...calendarLines(cal).map(l => `- ${l}`)); }

  // Gelecek haftanın uygunluğu
  const avail = await db.prepare(`SELECT * FROM availability WHERE week_start = ? AND personnel_id IN (SELECT id FROM personnel WHERE org_id = ? AND (primary_location_id = ? OR assigned_location_ids LIKE ?))`)
    .all(nextWeek, auth.org_id, loc.id, `%"${loc.id}"%`) as any[];
  const submitted = new Set(avail.map(a => a.personnel_id));
  const missing = active.filter(p => !submitted.has(p.id)).map(p => p.name);
  out.push(`### Gelecek hafta uygunluk: ${submitted.size} kişi girdi${missing.length ? `, girmeyenler: ${missing.join(", ")}` : ""}`);
  for (const a of avail) {
    const no = [0, 1, 2, 3, 4, 5, 6].filter(d => a[`day_${d}`] === "unavailable").map(day);
    const flex = [0, 1, 2, 3, 4, 5, 6].filter(d => a[`day_${d}`] === "preferred_not").map(day);
    if (no.length || flex.length) out.push(`- ${nameOf.get(a.personnel_id) ?? a.personnel_id}: ${no.length ? `gelemez ${no.join(",")}` : ""}${no.length && flex.length ? "; " : ""}${flex.length ? `tercih etmiyor ${flex.join(",")}` : ""}`);
  }

  // İzinler (bekleyen + önümüzdeki 30 gün onaylı)
  const leaves = await db.prepare(`
    SELECT lr.* FROM leave_requests lr JOIN personnel p ON p.id = lr.personnel_id
    WHERE p.org_id = ? AND p.primary_location_id = ? AND (lr.status = 'pending' OR (lr.status = 'approved' AND lr.end_date >= ? AND lr.start_date <= ?))
    ORDER BY lr.start_date
  `).all(auth.org_id, loc.id, today, addDays(today, 30)) as any[];
  if (leaves.length) {
    out.push("### İzinler");
    for (const l of leaves) out.push(`- ${nameOf.get(l.personnel_id) ?? l.personnel_id}: ${leaveTypeLabel(l.type)} ${l.start_date}→${l.end_date} (${l.days} gün, ${l.status === "pending" ? `onay bekliyor [izin ${l.id}]` : "onaylı"})`);
  }

  // Bekleyen onaylar
  const swaps = await db.prepare(`
    SELECT sr.* FROM shift_swap_requests sr JOIN shift_assignments sa ON sa.id = sr.requester_shift_id
    WHERE sr.org_id = ? AND sa.location_id = ? AND sr.status IN ('pending','peer_accepted')
  `).all(auth.org_id, loc.id) as any[];
  const edits = await db.prepare(`
    SELECT er.* FROM shift_edit_requests er JOIN shift_assignments sa ON sa.id = er.shift_id
    WHERE er.org_id = ? AND sa.location_id = ? AND er.status = 'pending'
  `).all(auth.org_id, loc.id) as any[];
  const ots = await db.prepare(`SELECT * FROM overtime_records WHERE org_id = ? AND location_id = ? AND status = 'pending' ORDER BY week_start`).all(auth.org_id, loc.id) as any[];
  if (swaps.length || edits.length || ots.length) {
    out.push("### Bekleyen talepler");
    for (const s of swaps) out.push(`- Vardiya değiştirme: ${s.requester_name} ↔ ${s.target_name} (${s.status === "peer_accepted" ? `sorumlu onayı bekliyor [takas ${s.id}]` : "arkadaşın yanıtı bekleniyor"})`);
    for (const e of edits) out.push(`- Saat düzeltme: ${e.personnel_name ?? nameOf.get(e.personnel_id)}: ${e.reason}`);
    for (const o of ots) out.push(`- Fazla mesai: ${o.personnel_name ?? nameOf.get(o.personnel_id)} ${short(o.week_start)} haftası ${o.overtime_hours} s`);
  }

  const open = await db.prepare(`SELECT * FROM open_shifts WHERE org_id = ? AND location_id = ? AND status = 'open' AND date >= ? ORDER BY date`).all(auth.org_id, loc.id, today) as any[];
  if (open.length) out.push(`### Açık vardiyalar: ${open.map(o => `${o.date} ${o.start_time}-${o.end_time}`).join(", ")}`);

  const docs = await db.prepare(`
    SELECT d.* FROM personnel_documents d JOIN personnel p ON p.id = d.personnel_id
    WHERE d.org_id = ? AND p.primary_location_id = ? AND d.expiry_date IS NOT NULL AND d.expiry_date <= ?
  `).all(auth.org_id, loc.id, addDays(today, 30)).catch(() => []) as any[];
  if (docs.length) out.push(`### Belgeler (süresi dolmuş ya da 30 gün içinde dolacak): ${docs.map(d => `${nameOf.get(d.personnel_id) ?? d.personnel_id} ${d.doc_type} ${d.expiry_date}`).join(", ")}`);

  return out;
}

async function branchSummary(db: any, auth: AuthUser, loc: any): Promise<string> {
  const { weekStart } = businessNow();
  const [cnt, thisW, nextW, pendLeave] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM personnel WHERE org_id = ? AND status != 'inactive' AND (primary_location_id = ? OR assigned_location_ids LIKE ?)`).get(auth.org_id, loc.id, `%"${loc.id}"%`),
    db.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN publication_status='published' THEN 1 ELSE 0 END) AS pub FROM shift_assignments WHERE location_id = ? AND week_start = ?`).get(loc.id, weekStart),
    db.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN publication_status='published' THEN 1 ELSE 0 END) AS pub FROM shift_assignments WHERE location_id = ? AND week_start = ?`).get(loc.id, addDays(weekStart, 7)),
    db.prepare(`SELECT COUNT(*) AS n FROM leave_requests lr JOIN personnel p ON p.id = lr.personnel_id WHERE p.org_id = ? AND p.primary_location_id = ? AND lr.status = 'pending'`).get(auth.org_id, loc.id),
  ]) as any[];
  const st = (w: any) => (!Number(w?.n) ? "plan yok" : Number(w?.pub) ? `yayınlandı (${w.n} vardiya)` : `taslak (${w.n} vardiya)`);
  return `- ${loc.name}: ${cnt?.n ?? 0} personel; bu hafta ${st(thisW)}; gelecek hafta ${st(nextW)}; bekleyen izin ${pendLeave?.n ?? 0}`;
}

/** Asistan bağlamı. locationId verilirse o şubenin ayrıntısı, verilmezse kapsamdaki şubelerin özeti. */
export async function buildBusinessContext(db: any, auth: AuthUser, locationId: string | null): Promise<string> {
  const org = await db.prepare("SELECT name FROM organizations WHERE id = ?").get(auth.org_id) as any;
  const { date, dayIdx } = businessNow();
  const lines = [
    `İşletme: ${org?.name ?? ""}`,
    `Soran: ${auth.name} (${ROLE[auth.role] ?? auth.role})`,
    `Bugün: ${date} ${["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"][dayIdx]}`,
  ];
  if (locationId) {
    const loc = await db.prepare("SELECT * FROM locations WHERE id = ? AND org_id = ?").get(locationId, auth.org_id) as any;
    if (loc) lines.push(...await branchDetail(db, auth, loc));
    return lines.join("\n");
  }
  const locs = (await db.prepare("SELECT * FROM locations WHERE org_id = ? ORDER BY name").all(auth.org_id) as any[])
    .filter(l => !managerOutsideBranch(auth, l.id));
  lines.push(`## Şubeler (${locs.length})`);
  for (const l of locs) lines.push(await branchSummary(db, auth, l));
  // Az şubede her şubenin ayrıntısı da (karşılaştırmalı sorular için); çok şubede bağlam fazla büyümesin
  if (locs.length <= DETAIL_BRANCH_LIMIT) {
    for (const l of locs) lines.push("", ...await branchDetail(db, auth, l));
  }
  const mgrs = await db.prepare(`SELECT name, role, location_id FROM users WHERE org_id = ? AND role IN ('manager','supervisor') AND COALESCE(approval_status,'active')='active'`).all(auth.org_id) as any[];
  const locName = new Map(locs.map(l => [l.id, l.name]));
  const visible = mgrs.filter(m => m.role === "supervisor" || locName.has(m.location_id));
  if (visible.length) lines.push(`## Sorumlular: ${visible.map(m => `${m.name} (${m.role === "supervisor" ? "Sorumlu, birden çok şube" : `Sorumlu, ${locName.get(m.location_id)}`})`).join(", ")}`);
  if (locs.length > DETAIL_BRANCH_LIMIT) lines.push("Not: Tek bir şubenin ayrıntısı için o şubeye girip asistana sorun.");
  return lines.join("\n");
}
