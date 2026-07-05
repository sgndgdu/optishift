/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";
import bcrypt from "bcryptjs";

// God Mode platform-geneli kullanıcı yönetimi.
// Proxy /api/god/* altında tüm istekleri god token'ıyla korur (banners GET hariç).

// Temp şifre: 2 büyük + 2 küçük + 4 rakam — /api/users ile aynı desen
function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const chars = [pick(upper), pick(upper), pick(lower), pick(lower), pick(digits), pick(digits), pick(digits), pick(digits)];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

async function auditLog(req: NextRequest, action: string, org_id: string | null, user_id: string | null, payload: unknown) {
  const db = getDB();
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;
  await db.prepare(
    `INSERT INTO admin_audit_log (action, target_org_id, target_user_id, payload, ip_address, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`
  ).run(action, org_id, user_id, JSON.stringify(payload), ip, Math.floor(Date.now() / 1000));
}

// GET /api/god/users?q=&org_id=&role=&limit= — platform geneli kullanıcı arama
export async function GET(req: NextRequest) {
  try {
    const db = getDB();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim().toLowerCase();
    const org_id = searchParams.get("org_id");
    const role = searchParams.get("role");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 500);

    const where: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (q) {
      where.push(`(LOWER(u.name) LIKE $${i} OR LOWER(u.username) LIKE $${i} OR LOWER(u.email) LIKE $${i})`);
      values.push(`%${q}%`);
      i++;
    }
    if (org_id) { where.push(`u.org_id = $${i++}`); values.push(org_id); }
    if (role)   { where.push(`u.role = $${i++}`);   values.push(role); }

    const rows = (await db.prepare(
      `SELECT u.id, u.name, u.username, u.email, u.role, u.display_title,
              u.org_id, o.name as org_name, u.location_id,
              u.approval_status, u.is_temp_password, u.last_login_at, u.created_at
       FROM users u
       LEFT JOIN organizations o ON o.id = u.org_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY u.created_at DESC
       LIMIT ${limit}`
    ).all(...values)) as any[];

    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/god/users — body: { id, action, ...params }
//   action: "reset_password"                  → temp şifre üretir ve döner
//   action: "set_role"   { role }             → rol değiştirir
//   action: "set_status" { approval_status }  → active | pending | rejected
export async function PATCH(req: NextRequest) {
  try {
    const db = getDB();
    const body = await req.json();
    const { id, action } = body;
    if (!id || !action) return NextResponse.json({ error: "id ve action zorunlu" }, { status: 400 });

    const user = (await db.prepare(`SELECT * FROM users WHERE id = $1`).get(id)) as any;
    if (!user) return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });

    if (action === "reset_password") {
      const tempPassword = generateTempPassword();
      const hash = await bcrypt.hash(tempPassword, 10);
      await db.prepare(
        `UPDATE users SET password_hash = $1, is_temp_password = true WHERE id = $2`
      ).run(hash, id);
      await auditLog(req, `password_reset: ${user.name}`, user.org_id, id, { username: user.username });
      return NextResponse.json({ ok: true, temp_password: tempPassword, username: user.username });
    }

    if (action === "set_role") {
      const role = body.role;
      if (!["admin", "supervisor", "manager", "employee"].includes(role))
        return NextResponse.json({ error: "Geçersiz rol" }, { status: 400 });
      await db.prepare(`UPDATE users SET role = $1 WHERE id = $2`).run(role, id);
      await auditLog(req, `role_changed: ${user.name} ${user.role} → ${role}`, user.org_id, id, { from: user.role, to: role });
      return NextResponse.json({ ok: true });
    }

    if (action === "set_status") {
      const status = body.approval_status;
      if (!["active", "pending", "rejected"].includes(status))
        return NextResponse.json({ error: "Geçersiz durum" }, { status: 400 });
      await db.prepare(`UPDATE users SET approval_status = $1 WHERE id = $2`).run(status, id);
      await auditLog(req, `status_changed: ${user.name} ${user.approval_status} → ${status}`, user.org_id, id, { from: user.approval_status, to: status });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Bilinmeyen action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
