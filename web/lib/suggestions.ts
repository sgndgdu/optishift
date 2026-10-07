/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Hazır çözümler: TEK KAYNAK. Sorumlunun karar vermesi gereken bir iş için çözüm önceden hazırlanır,
 * Ana Sayfa'da "Uygula" ile tek dokunuşta uygulanır (lib/copilot/applyAction, mevcut uçlar).
 *  - Bekleyen izin talebi: o günlerdeki vardiyalara en uygun yedek seçilmiş "onayla" önerisi.
 *  - Bugün/yarın/öbür gün kimsenin almadığı ilan (çalışanın "Gelemeyeceğim" dediği vardiya dahil):
 *    en uygun kişiye verme önerisi.
 * Talep geldiği anda sorumluya giden bildirim de aynı metni kullanır (notifyBranchManagers).
 * Kurallar yeni değil: yedek seçimi lib/openShiftCandidates, izin çakışmaları lib/leaveConflicts.
 */
import type { AuthUser } from "@/lib/auth";
import type { ProposedAction } from "@/lib/ai/actions";
import { addDays, businessNow, businessWallTime, formatDateTR } from "@/lib/date";
import { leaveTypeLabel } from "@/lib/leave";
import { coverFor, findConflicts } from "@/lib/leaveConflicts";
import { rankCandidates } from "@/lib/openShiftCandidates";
import { departmentScope, hasPerm, parseAccess, type Perm } from "@/lib/userAccess";
import { sendPushToUser } from "@/lib/notifications";

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

const MAX_LEAVES = 5;
const MAX_OPEN = 5;
const MAX_CONFLICTS = 7;
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

  const conflicts = (await findConflicts(db, req)).filter(c => c.date >= today).slice(0, MAX_CONFLICTS);
  const replacements: Record<string, string> = {};
  const covered: { name: string; date: string; time: string }[] = [];
  let uncoveredDraft = 0, uncoveredPublished = 0;
  for (const c of conflicts) {
    const cover = await coverFor(db, req.personnel_id, c).catch(() => null);
    const pick = cover?.candidates.find(x => x.ok);
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
    title, detail, href: "/open-shifts",
    action: { kind: "assign_open_shift", open_shift_id: os.id, personnel_id: pick.personnel_id, name: pick.name, title: `${title} ${detail}` },
  };
}

/** Ana Sayfa listesi: kullanıcının yetkisi olan işler için hazır çözümler, acil olanlar önce */
export async function buildSuggestions(db: any, auth: AuthUser, locationId: string): Promise<Suggestion[]> {
  // Departman sorumlusu onay ve ilan işlerini yapmaz (lib/userAccess isChefBlocked ile aynı sınır)
  if (auth.role === "employee" || departmentScope(auth)) return [];
  const today = businessNow().date;
  const out: Suggestion[] = [];

  if (hasPerm(auth, "approvals")) {
    const leaves = await db.prepare(`
      SELECT lr.id FROM leave_requests lr JOIN personnel p ON p.id = lr.personnel_id
      WHERE p.org_id = ? AND p.primary_location_id = ? AND lr.status = 'pending' AND lr.end_date >= ?
      ORDER BY lr.start_date LIMIT ?
    `).all(auth.org_id, locationId, today, MAX_LEAVES) as any[];
    for (const l of leaves) {
      const s = await leaveSuggestion(db, auth.org_id, locationId, l.id).catch(() => null);
      if (s) out.push(s);
    }
  }

  if (hasPerm(auth, "plan_settings")) {
    const open = await db.prepare(`
      SELECT * FROM open_shifts WHERE org_id = ? AND location_id = ? AND status = 'open' AND claimed_by IS NULL
        AND date >= ? AND date <= ? ORDER BY date, start_time LIMIT ?
    `).all(auth.org_id, locationId, today, addDays(today, OPEN_DAYS_AHEAD), MAX_OPEN) as any[];
    for (const os of open) {
      const s = await openShiftSuggestion(db, os).catch(() => null);
      if (s) out.push(s);
    }
  }
  return out.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}

/**
 * Şubenin sorumlularına (şube sorumlusu, bölge sorumlusu, hesap sahibi) yönetim paneli bildirimi + telefon bildirimi.
 * Sadece işi yapma yetkisi (perm) olan ve departman sorumlusu olmayanlar alır. Bildirim hesaba (user_id) yazılır:
 * çalışan kaydı olmayan sahip de alır, bildirim zilinde görür (components/NotificationBell).
 */
export async function notifyBranchManagers(db: any, orgId: string, locationId: string, perm: Perm, n: { type: string; title: string; message: string; link: string }) {
  const rows = await db.prepare(`
    SELECT id, role, permissions FROM users
    WHERE org_id = ? AND COALESCE(approval_status, 'active') = 'active'
      AND (role = 'admin' OR (role = 'manager' AND location_id = ?)
        OR (role = 'supervisor' AND (managed_location_ids IS NULL OR managed_location_ids = '' OR managed_location_ids = '[]' OR managed_location_ids LIKE ?)))
  `).all(orgId, locationId, `%"${locationId}"%`) as { id: string; role: string; permissions: string | null }[];
  const managers = rows.filter(r => {
    const u = { role: r.role, access: parseAccess(r.permissions) };
    return !departmentScope(u) && hasPerm(u, perm);
  });
  const now = Math.floor(Date.now() / 1000);
  await Promise.allSettled(managers.map(async m => {
    await db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, link, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, false, ?)
    `).run(m.id, n.type, n.title, n.message, n.link, now);
    await sendPushToUser(m.id, orgId, { title: n.title, body: n.message, url: n.link }).catch(() => {});
  }));
}
