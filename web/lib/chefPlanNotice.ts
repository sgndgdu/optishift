/**
 * Hesap sahibi (ya da şube geneli sorumlu) haftanın planını oluşturunca, o hafta kendi planını
 * göndermemiş departman sorumlularına haber verilir: departmanlarının vardiyaları da yazıldı.
 * Haftada bir kez (aynı hafta için ikinci oluşturmada tekrar gönderilmez).
 */
import { weekRangeTR } from "@/lib/date";
import { parseAccess } from "@/lib/userAccess";
import { sendPushToPersonnel } from "@/lib/notifications";

type Db = { prepare: (sql: string) => { all: (...a: unknown[]) => Promise<unknown[]> | unknown[]; get: (...a: unknown[]) => Promise<unknown> | unknown; run: (...a: unknown[]) => Promise<unknown> | unknown } };

export async function notifyChefsOfPlan(db: Db, opts: { orgId: string; locationId: string; weekStart: string; byUserId: string; byName: string | null | undefined }): Promise<number> {
  const chefs = (await db.prepare(
    `SELECT id, personnel_id, permissions FROM users WHERE org_id = ? AND location_id = ? AND role = 'manager' AND personnel_id IS NOT NULL AND id <> ? AND COALESCE(approval_status, 'active') = 'active'`
  ).all(opts.orgId, opts.locationId, opts.byUserId)) as { id: string; personnel_id: string; permissions: string | null }[];
  const withDept = chefs.map(c => ({ ...c, dept: parseAccess(c.permissions)?.department_id ?? null })).filter(c => c.dept);
  if (withDept.length === 0) return 0;

  const submitted = new Set(((await db.prepare(
    `SELECT department_id FROM plan_submissions WHERE location_id = ? AND week_start = ?`
  ).all(opts.locationId, opts.weekStart)) as { department_id: string }[]).map(r => r.department_id));
  const names = new Map(((await db.prepare(`SELECT id, name FROM departments WHERE location_id = ?`).all(opts.locationId)) as { id: string; name: string }[]).map(d => [d.id, d.name]));

  const range = weekRangeTR(opts.weekStart);
  const link = "/schedule?week=next";
  const now = Math.floor(Date.now() / 1000);
  let sent = 0;
  for (const c of withDept) {
    if (submitted.has(c.dept!)) continue;
    const dept = names.get(c.dept!) ?? "Departmanın";
    const message = `${opts.byName ?? "Hesap sahibi"} ${range} planını oluşturdu, ${dept} vardiyaları da yazıldı. Kontrol edebilirsin.`;
    // Aynı hafta için bir kez
    const dup = await db.prepare(`SELECT id FROM notifications WHERE personnel_id = ? AND type = 'dept_plan' AND message LIKE ? LIMIT 1`).get(c.personnel_id, `%${range}%`);
    if (dup) continue;
    await db.prepare(
      `INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at) VALUES (?, 'dept_plan', ?, ?, ?, false, ?)`
    ).run(c.personnel_id, `${dept} planı hazırlandı`, message, link, now);
    await sendPushToPersonnel(c.personnel_id, opts.orgId, { title: `${dept} planı hazırlandı`, body: message, url: link }).catch(() => {});
    sent++;
  }
  return sent;
}
