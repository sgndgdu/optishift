/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "optishift.db");

// GET /api/invites?token=xxx — token doğrula
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token zorunlu" }, { status: 400 });

  const db = new Database(DB_PATH);
  try {
    const invite = db.prepare("SELECT * FROM invite_tokens WHERE token = ?").get(token) as any;
    if (!invite) return NextResponse.json({ error: "Davet linki geçersiz" }, { status: 404 });
    if (invite.used_at) return NextResponse.json({ error: "Bu davet linki zaten kullanılmış" }, { status: 410 });
    if (invite.expires_at < Math.floor(Date.now() / 1000)) {
      return NextResponse.json({ error: "Bu davet linkinin süresi dolmuş" }, { status: 410 });
    }

    const org = db.prepare("SELECT name FROM organizations WHERE id = ?").get(invite.org_id) as any;
    const loc = db.prepare("SELECT name FROM locations WHERE id = ?").get(invite.location_id) as any;

    db.close();
    return NextResponse.json({
      valid: true,
      org_name: org?.name,
      location_name: loc?.name,
      invited_name: invite.invited_name,
      role: invite.role,
      org_id: invite.org_id,
      location_id: invite.location_id,
      department_id: invite.department_id,
    });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/invites — yeni davet token üret
export async function POST(req: NextRequest) {
  const db = new Database(DB_PATH);
  try {
    const body = await req.json();
    const { org_id, location_id, department_id, invited_name, role, created_by } = body;

    if (!org_id || !location_id || !created_by) {
      return NextResponse.json({ error: "org_id, location_id, created_by zorunlu" }, { status: 400 });
    }

    const token = Array.from({ length: 12 }, () =>
      "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]
    ).join("");

    const id = `INV-${Date.now()}`;
    const now = Math.floor(Date.now() / 1000);
    const expires_at = now + 7 * 24 * 60 * 60; // 7 gün

    db.prepare(`
      INSERT INTO invite_tokens (id, token, org_id, location_id, department_id, invited_name, role, created_by, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, token, org_id, location_id, department_id || null, invited_name?.trim() || null, role || "employee", created_by, expires_at, now);

    db.close();
    return NextResponse.json({ token, link: `/join/${token}` });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/invites?token=xxx — token kullan (kayıt tamamla)
export async function PATCH(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token zorunlu" }, { status: 400 });

  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");
  try {
    const invite = db.prepare("SELECT * FROM invite_tokens WHERE token = ?").get(token) as any;
    if (!invite) return NextResponse.json({ error: "Geçersiz davet linki" }, { status: 404 });
    if (invite.used_at) return NextResponse.json({ error: "Bu davet linki zaten kullanılmış" }, { status: 410 });
    if (invite.expires_at < Math.floor(Date.now() / 1000)) {
      return NextResponse.json({ error: "Davet linkinin süresi dolmuş" }, { status: 410 });
    }

    const { name, username, password } = await req.json();
    if (!name?.trim() || !username?.trim() || !password) {
      return NextResponse.json({ error: "Ad, kullanıcı adı ve şifre zorunlu" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Şifre en az 6 karakter olmalı" }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (cleanUsername.length < 3) {
      return NextResponse.json({ error: "Kullanıcı adı en az 3 karakter olmalı" }, { status: 400 });
    }

    const existingUsername = db.prepare("SELECT id FROM users WHERE username = ?").get(cleanUsername);
    if (existingUsername) {
      return NextResponse.json({ error: "Bu kullanıcı adı zaten alınmış" }, { status: 409 });
    }

    const { hash } = await import("bcryptjs");
    const passwordHash = await hash(password, 10);
    const now = Math.floor(Date.now() / 1000);
    const personnelId = `P-${Date.now()}`;
    const userId = `U-${Date.now()}`;
    const employeeId = `EMP-${Math.floor(Math.random() * 90000) + 10000}`;

    db.transaction(() => {
      db.prepare(`
        INSERT INTO personnel (id, org_id, primary_location_id, assigned_location_ids, user_access_level, name, employee_id, email, phone, title, employment_type, status, max_weekly_hours, prev_score, hero_count, no_show_count, late_count, annual_leave_days_total, roles, role_levels, preferred_shift_ids, preferred_days, preferred_roles, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, null, '', 'Personel', 'full_time', 'active', 45, 0, 0, 0, 0, 14, '[]', '{}', '[]', '[]', '[]', ?, ?)
      `).run(personnelId, invite.org_id, invite.location_id, JSON.stringify([invite.location_id]), invite.role, name.trim(), employeeId, now, now);

      db.prepare(`
        INSERT INTO users (id, personnel_id, username, email, password_hash, role, org_id, location_id, department_id, name, created_at)
        VALUES (?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, personnelId, cleanUsername, passwordHash, invite.role, invite.org_id, invite.location_id, invite.department_id || null, name.trim(), now);

      db.prepare("UPDATE invite_tokens SET used_at = ? WHERE token = ?").run(now, token);
    })();

    db.close();
    return NextResponse.json({ success: true, username: cleanUsername });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
