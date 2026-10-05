/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Departman planı onayı (lib/userAccess): departman şefi kendi departmanının haftalık taslağını
 * "onaya gönderir", şube yöneticisi her departmanın durumunu görüp yayınlar.
 * Şefin yeni değişikliği (PATCH /api/shifts sync_draft_week) ve haftanın yayını kaydı siler.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { canManageLocation } from "@/lib/access";
import { departmentScope, parseAccess } from "@/lib/userAccess";

/** GET ?location_id=&week_start= → şubenin departmanları: şefi, gönderim durumu. */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const week_start = searchParams.get("week_start");
  if (!location_id || !week_start) return NextResponse.json({ error: "location_id ve week_start zorunlu" }, { status: 400 });
  const db = getDB();
  if (!(await canManageLocation(db, auth, location_id))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

  const depts = await db.prepare("SELECT id, name FROM departments WHERE location_id = ? ORDER BY name").all(location_id) as { id: string; name: string }[];
  const chefs = await db.prepare(
    "SELECT name, permissions FROM users WHERE org_id = ? AND role = 'manager' AND location_id = ? AND permissions IS NOT NULL"
  ).all(auth.org_id, location_id) as { name: string; permissions: string }[];
  const subs = await db.prepare(
    "SELECT department_id, submitted_by_name, submitted_at FROM plan_submissions WHERE location_id = ? AND week_start = ?"
  ).all(location_id, week_start) as any[];

  const chefByDept = new Map<string, string>();
  for (const c of chefs) {
    const d = parseAccess(c.permissions)?.department_id;
    if (d && !chefByDept.has(d)) chefByDept.set(d, c.name);
  }
  const subByDept = new Map(subs.map(s => [s.department_id, s]));
  const scope = departmentScope(auth);
  const rows = depts
    .filter(d => !scope || d.id === scope)
    .map(d => ({
      department_id: d.id,
      department_name: d.name,
      chef_name: chefByDept.get(d.id) ?? null,
      submitted: subByDept.has(d.id),
      submitted_by_name: subByDept.get(d.id)?.submitted_by_name ?? null,
      submitted_at: subByDept.get(d.id)?.submitted_at ?? null,
    }));
  return NextResponse.json({ departments: rows });
}

/** POST {location_id, week_start} → şef kendi departmanının planını onaya gönderir. DELETE ile geri çeker. */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const dept = departmentScope(auth);
  if (!dept) return NextResponse.json({ error: "Sadece departman sorumlusu planı onaya gönderir" }, { status: 403 });
  const { location_id, week_start } = await req.json().catch(() => ({}));
  if (!location_id || !week_start) return NextResponse.json({ error: "location_id ve week_start zorunlu" }, { status: 400 });
  const db = getDB();
  if (!(await canManageLocation(db, auth, location_id))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  const now = Math.floor(Date.now() / 1000);
  await db.prepare("DELETE FROM plan_submissions WHERE location_id = ? AND week_start = ? AND department_id = ?").run(location_id, week_start, dept);
  await db.prepare(`
    INSERT INTO plan_submissions (id, org_id, location_id, department_id, week_start, submitted_by, submitted_by_name, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(`PS-${Date.now()}-${Math.floor(Math.random() * 1000)}`, auth.org_id, location_id, dept, week_start, auth.id, auth.name, now);
  return NextResponse.json({ success: true, submitted_at: now });
}

export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const dept = departmentScope(auth);
  if (!dept) return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const week_start = searchParams.get("week_start");
  if (!location_id || !week_start) return NextResponse.json({ error: "location_id ve week_start zorunlu" }, { status: 400 });
  const db = getDB();
  if (!(await canManageLocation(db, auth, location_id))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  await db.prepare("DELETE FROM plan_submissions WHERE location_id = ? AND week_start = ? AND department_id = ?").run(location_id, week_start, dept);
  return NextResponse.json({ success: true });
}
