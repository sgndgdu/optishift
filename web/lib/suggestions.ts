/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Hazır çözümler: TEK KAYNAK. Sorumlunun karar vermesi gereken bir iş için çözüm önceden hazırlanır,
 * Ana Sayfa'da "Uygula" ile tek dokunuşta uygulanır (lib/copilot/applyAction, mevcut uçlar).
 *  - Bekleyen izin talebi: o günlerdeki vardiyalara en uygun yedek seçilmiş "onayla" önerisi.
 *  - Bugün/yarın/öbür gün kimsenin almadığı ilan (çalışanın "Gelemeyeceğim" dediği vardiya dahil):
 *    en uygun kişiye verme önerisi.
 *  - Yayınlanmış planda önümüzdeki 7 günde ihtiyaç tablosuna göre eksik kalan vardiya (2026-10-08): en uygun kişiyi
 *    yazma önerisi; kendi şubesinde uygun kimse yoksa ve sorumlunun "Başka şubeden kişi" yetkisi varsa başka şubeden.
 * Talep geldiği anda sorumluya giden bildirim de aynı metni kullanır (lib/managerNotifications).
 * Kurallar yeni değil: yedek seçimi lib/openShiftCandidates, izin çakışmaları lib/leaveConflicts.
 */
import type { AuthUser } from "@/lib/auth";
import type { ProposedAction } from "@/lib/ai/actions";
import { addDays, businessNow, businessWallTime, dayIndexOf, formatDateTR, weekStartOf } from "@/lib/date";
import { canBorrow } from "@/lib/loans";
import { leaveTypeLabel } from "@/lib/leave";
import { coverFor, findConflicts } from "@/lib/leaveConflicts";
import { rankCandidates } from "@/lib/openShiftCandidates";
import { departmentScope, hasPerm } from "@/lib/userAccess";

export type Suggestion = {
  id: string;
  /** Bugün ya da yarını ilgilendiriyor */
  urgent: boolean;
  title: string;
  detail: string;
  action: ProposedAction;
  /** "Kendim bakarım": işin normal ekranı */
  href: string;
};

const OPEN_DAYS_AHEAD = 2;

const range = (a: string, b: string) => (a === b ? formatDateTR(a) : `${formatDateTR(a, { weekday: false })} - ${formatDateTR(b, { weekday: false })}`);

/** Bekleyen tek bir izin talebi için hazır çözüm (talep bulunamaz ya da karara bağlanmışsa null) */
export async function leaveSuggestion(db: any, orgId: string, locationId: string, leaveId: number): Promise<Suggestion | null> {
  const req = await db.prepare(`
    SELECT lr.*, p.name AS p_name, p.org_id AS p_org, p.primary_location_id AS p_loc
    FROM leave_requests lr JOIN personnel p ON p.id = lr.personnel_id
    WHERE lr.id = ? AND p.org_id = ? AND p.primary_location_id = ?
  `).get(leaveId, orgId, locationId) as any;
  if (!req || req.status !== "pending") return null;
  const today = businessNow().date;
  if (req.end_date < today) return null;

  const conflicts = (await findConflicts(db, req)).filter(c => c.date >= today);
  const replacements: Record<string, string> = {};
  const covered: { name: string; date: string; time: string }[] = [];
  let uncoveredDraft = 0, uncoveredPublished = 0;
  const covers = await Promise.all(conflicts.map(c => coverFor(db, req.personnel_id, c).catch(() => null)));
  for (const [i, c] of conflicts.entries()) {
    const pick = covers[i]?.candidates.find(x => x.ok);
    if (pick) { replacements[String(c.id)] = pick.personnel_id; covered.push({ name: pick.name, date: c.date, time: `${c.start_time}-${c.end_time}` }); }
    else if (c.published) uncoveredPublished++;
    else uncoveredDraft++;
  }

  const title = `${req.p_name}, ${range(req.start_date, req.end_date)} için ${leaveTypeLabel(req.type)} istedi.`;
  let detail: string;
  if (conflicts.length === 0) detail = "Bu günlerde vardiyası yok. Onaylarsanız plandan kimse eksilmez.";
  else if (conflicts.length === 1 && covered.length === 1) detail = `${formatDateTR(covered[0].date)} ${covered[0].time} vardiyası var. Onaylarsanız vardiya ${covered[0].name} adına yazılır.`;
  else {
    const parts = [`Bu günlerde ${conflicts.length} vardiyası var.`];
    if (covered.length) parts.push(`Onaylarsanız yedekler yazılır: ${covered.map(c => `${c.name} (${formatDateTR(c.date, { weekday: false })})`).join(", ")}.`);
    if (uncoveredDraft + uncoveredPublished) parts.push(covered.length ? "Kalan vardiyalar için kurallara uyan yedek yok." : "Kurallara uyan bir yedek yok.");
    if (uncoveredDraft) parts.push(`Onaylarsanız taslak plandaki ${uncoveredDraft} vardiyası plandan çıkar ve ${uncoveredDraft > 1 ? "o günlerde birer" : "o gün bir"} kişi eksik kalır.`);
    if (uncoveredPublished) parts.push(`Onaylarsanız yayınlanmış ${uncoveredPublished} vardiyası ekibe ilan olarak duyurulur.`);
    detail = parts.join(" ");
  }
  return {
    id: `leave-${req.id}`,
    urgent: req.start_date <= addDays(today, 1),
    title, detail, href: "/requests",
    action: { kind: "review_leave", leave_id: req.id, status: "approved", replacements, title: `${title} ${detail}` },
  };
}

/** Kimsenin almadığı tek bir ilan için hazır çözüm (uygun kişi yoksa null) */
export async function openShiftSuggestion(db: any, os: any): Promise<Suggestion | null> {
  if (!os || os.status !== "open" || os.claimed_by) return null;
  const today = businessNow().date;
  // Başlamış vardiya için öneri yok (Türkiye saatiyle)
  if (os.date < today || businessWallTime(os.date, os.start_time).getTime() <= Date.now()) return null;

  let releasedName: string | null = null;
  let departmentId: string | null = null;
  if (os.released_by) {
    const p = await db.prepare(`SELECT name, department_id FROM personnel WHERE id = ?`).get(os.released_by) as any;
    releasedName = p?.name ?? null;
    departmentId = p?.department_id ?? null;
  }
  if (os.source_assignment_id) {
    const sa = await db.prepare(`SELECT department_id FROM shift_assignments WHERE id = ?`).get(os.source_assignment_id) as any;
    departmentId = sa?.department_id ?? departmentId;
  }
  const { candidates } = await rankCandidates(db, {
    location_id: os.location_id, date: os.date, start_time: os.start_time, end_time: os.end_time,
    excludePersonnelId: os.released_by ?? undefined, departmentId,
  }).catch(() => ({ candidates: [] as any[] }));
  const pick = candidates.find((c: any) => !c.blocking && !c.other_branch && c.warnings.length === 0)
    ?? candidates.find((c: any) => !c.blocking && !c.other_branch);
  if (!pick) return null;

  const when = `${formatDateTR(os.date)} ${os.start_time}-${os.end_time}`;
  const title = releasedName
    ? `${releasedName}, ${when} vardiyasına gelemiyor. Vardiyayı henüz kimse almadı.`
    : `${when} ilanını henüz kimse almadı.`;
  const why = pick.reasons?.[0] ? ` (${String(pick.reasons[0]).replace(/\.$/, "")})` : "";
  const detail = `${pick.name} uygun${why}. Onaylarsanız vardiya ${pick.name} adına yazılır ve kendisine bildirim gider.`;
  return {
    id: `open-${os.id}`,
    urgent: os.date <= addDays(today, 1),
    title, detail, href: `/schedule?week=${os.date}`,
    action: { kind: "assign_open_shift", open_shift_id: os.id, personnel_id: pick.personnel_id, name: pick.name, title: `${title} ${detail}` },
  };
}

/** Ana Sayfa listesi: kullanıcının yetkisi olan işler için hazır çözümler, acil olanlar önce */
export async function buildSuggestions(db: any, auth: AuthUser, locationId: string): Promise<Suggestion[]> {
  // Departman sorumlusu onay ve ilan işlerini yapmaz (lib/userAccess isChefBlocked ile aynı sınır)
  if (auth.role === "employee" || departmentScope(auth)) return [];
  const today = businessNow().date;
  const out: Suggestion[] = [];

  const leavePart = async (): Promise<Suggestion[]> => {
    if (!hasPerm(auth, "approvals")) return [];
    const leaves = await db.prepare(`
      SELECT lr.id FROM leave_requests lr JOIN personnel p ON p.id = lr.personnel_id
      WHERE p.org_id = ? AND p.primary_location_id = ? AND lr.status = 'pending' AND lr.end_date >= ?
      ORDER BY lr.start_date
    `).all(auth.org_id, locationId, today) as any[];
    // Aynı anda hesaplanır (sırayla saniyeler sürüyordu)
    const built = await Promise.all(leaves.map(l => leaveSuggestion(db, auth.org_id, locationId, l.id).catch(() => null)));
    return built.filter((x): x is Suggestion => !!x);
  };
  const openPart = async (): Promise<Suggestion[]> => {
    if (!hasPerm(auth, "plan_settings")) return [];
    const open = await db.prepare(`
      SELECT * FROM open_shifts WHERE org_id = ? AND location_id = ? AND status = 'open' AND claimed_by IS NULL
        AND date >= ? AND date <= ? ORDER BY date, start_time
    `).all(auth.org_id, locationId, today, addDays(today, OPEN_DAYS_AHEAD)) as any[];
    const built = await Promise.all(open.map(os => openShiftSuggestion(db, os).catch(() => null)));
    return built.filter((x): x is Suggestion => !!x);
  };
  const gapPart = async (): Promise<Suggestion[]> => {
    if (!hasPerm(auth, "plan_settings")) return [];
    return gapSuggestions(db, auth, locationId).catch(e => { console.error("[suggestions] eksik vardiya", e); return [] as Suggestion[]; });
  };
  const parts = await Promise.all([leavePart(), openPart(), gapPart()]);
  out.push(...parts.flat());
  return out.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}

const GAP_DAYS_AHEAD = 6;
const J = (v: unknown, d: any) => { try { return typeof v === "string" ? JSON.parse(v) : (v ?? d); } catch { return d; } };

/**
 * Yayınlanmış planda önümüzdeki 7 gün içinde ihtiyaç tablosuna göre eksik kalan vardiyalar için hazır çözüm.
 * Eksik sayısından ilanda bekleyenler düşülür. Önerilen kişi kurala uyan, o gün boşta, uyarısız ve (departmanlı
 * şubede) ana departmanı o departman olan en az yüklü kişidir (lib/openShiftCandidates).
 */
export async function gapSuggestions(db: any, auth: AuthUser, locationId: string): Promise<Suggestion[]> {
  const now = businessNow();
  const today = now.date;
  const loc = await db.prepare(`SELECT shift_definitions, demand_matrix FROM locations WHERE id = ? AND org_id = ?`).get(locationId, auth.org_id) as any;
  if (!loc) return [];
  const defs = (J(loc.shift_definitions, []) as any[]).filter(d => d && d.id && d.start && d.end && !d.on_call);
  if (defs.length === 0) return [];
  const depts = await db.prepare(`SELECT id, name, demand_matrix, parent_id FROM departments WHERE location_id = ?`).all(locationId) as any[];
  const parents = new Set(depts.map(d => d.parent_id).filter(Boolean));
  const sources = depts.length
    ? depts.filter(d => !parents.has(d.id)).map(d => ({ deptId: d.id as string | null, deptName: d.name as string | null, matrix: J(d.demand_matrix, {}) }))
    : [{ deptId: null, deptName: null, matrix: J(loc.demand_matrix, {}) }];

  const end = addDays(today, GAP_DAYS_AHEAD);
  const weeks = [...new Set([weekStartOf(today), weekStartOf(end)])];
  const rows = await db.prepare(`
    SELECT sa.week_start, sa.day, sa.shift_id, sa.start_time, sa.end_time, COALESCE(sa.department_id, p.department_id) AS dept
    FROM shift_assignments sa JOIN personnel p ON p.id = sa.personnel_id
    WHERE sa.location_id = ? AND sa.week_start IN (${weeks.map(() => "?").join(",")}) AND sa.publication_status = 'published'
      AND COALESCE(sa.kind, 'regular') = 'regular'
  `).all(locationId, ...weeks) as any[];
  const publishedWeeks = new Set(rows.map(r => r.week_start));
  if (publishedWeeks.size === 0) return [];
  const listed = await db.prepare(`
    SELECT date, start_time, end_time FROM open_shifts WHERE location_id = ? AND status IN ('open', 'loan_pending') AND date >= ? AND date <= ?
  `).all(locationId, today, end) as any[];
  const people = await db.prepare(`SELECT id, department_id FROM personnel WHERE org_id = ? AND status = 'active'`).all(auth.org_id) as any[];
  const mainDept = new Map(people.map(p => [p.id, p.department_id]));
  const borrow = canBorrow(auth);

  // Önce eksikler bulunur, sonra adaylar aynı anda hesaplanır (sırayla 10+ sn sürüyordu)
  const gaps: { date: string; ws: string; def: any; src: (typeof sources)[number]; missing: number }[] = [];
  for (let i = 0; i <= GAP_DAYS_AHEAD; i++) {
    const date = addDays(today, i);
    const ws = weekStartOf(date);
    if (!publishedWeeks.has(ws)) continue;
    const day = dayIndexOf(date);
    for (const def of defs) {
      if (businessWallTime(date, def.start).getTime() <= Date.now()) continue; // başlamış vardiya
      const sameShift = (r: any) => String(r.shift_id) === String(def.id) || (r.start_time === def.start && r.end_time === def.end);
      for (const src of sources) {
        const need = Number(src.matrix?.[def.id]?.[day] ?? src.matrix?.[def.id]?.[String(day)] ?? 0);
        if (!need) continue;
        const got = rows.filter(r => r.week_start === ws && Number(r.day) === day && sameShift(r) && (!src.deptId || r.dept === src.deptId)).length;
        const onListing = listed.filter(l => l.date === date && l.start_time === def.start && l.end_time === def.end).length;
        const missing = need - got - onListing;
        if (missing > 0) gaps.push({ date, ws, def, src, missing });
      }
    }
  }

  const built = await Promise.all(gaps.map(async ({ date, ws, def, src, missing }): Promise<Suggestion | null> => {
    const { candidates } = await rankCandidates(db, {
      location_id: locationId, date, start_time: def.start, end_time: def.end, departmentId: src.deptId,
    }).catch(() => ({ candidates: [] as any[] }));
    const fits = (c: any) => !c.blocking && (!src.deptId || mainDept.get(c.personnel_id) === src.deptId);
    const pick = candidates.find((c: any) => fits(c) && !c.other_branch && c.warnings.length === 0)
      ?? candidates.find((c: any) => fits(c) && !c.other_branch)
      ?? (borrow ? candidates.find((c: any) => fits(c) && c.other_branch && c.warnings.length === 0) : undefined);
    if (!pick) return null;
    const title = `${formatDateTR(date)} ${def.start}-${def.end} ${def.name ?? ""} vardiyasında${src.deptName ? `, ${src.deptName} departmanında` : ""} ${missing} kişi eksik.`.replace(/\s+/g, " ");
    const why = !pick.other_branch && pick.reasons?.[0] ? ` (${String(pick.reasons[0]).replace(/\.$/, "")})` : "";
    const detail = pick.other_branch
      ? `Şubenizde uygun kimse yok. ${pick.name} (${pick.other_branch} şubesi) uygun. Onaylarsanız yazılır, kendi şubesinin sorumlusu onaylayınca kesinleşir.`
      : `${pick.name} uygun${why}. Onaylarsanız vardiyaya yazılır ve kendisine bildirim gider.${missing > 1 ? ` Uyguladıktan sonra kalan ${missing - 1} kişi için yeni öneri çıkar.` : ""}`;
    return {
      id: `gap-${date}-${def.id}-${src.deptId ?? ""}`,
      urgent: date <= addDays(today, 1),
      title, detail, href: `/schedule?week=${ws}`,
      action: { kind: "fill_gap", location_id: locationId, date, start_time: def.start, end_time: def.end, personnel_id: pick.personnel_id, name: pick.name, title: `${title} ${detail}` },
    };
  }));
  return built.filter((x): x is Suggestion => !!x);
}
