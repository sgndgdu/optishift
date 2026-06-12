/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import path from "path";
import { requireAuth } from "@/lib/auth";

const DB_PATH = path.join(process.cwd(), "optishift.db");

// GET: Departman veya lokasyona göre personeli getir
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const department_id = searchParams.get("department_id");
  const location_id = searchParams.get("location_id");

  const db = new Database(DB_PATH);
  try {
    const baseSelect = `
      SELECT p.*, u.username, u.id as user_id
      FROM personnel p
      LEFT JOIN users u ON u.personnel_id = p.id
    `;
    let rows;
    if (department_id) {
      // Departmanın bu org'a ait olduğunu doğrula
      const dept = db.prepare(`
        SELECT d.id FROM departments d
        JOIN locations l ON d.location_id = l.id
        WHERE d.id = ? AND l.org_id = ?
      `).get(department_id, auth.org_id);
      if (!dept) {
        db.close();
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = db.prepare(`${baseSelect} WHERE p.department_id = ? ORDER BY p.name ASC`).all(department_id);
    } else if (location_id) {
      // Lokasyonun bu org'a ait olduğunu doğrula
      const loc = db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
      if (!loc) {
        db.close();
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = db.prepare(`${baseSelect} WHERE p.assigned_location_ids LIKE ? ORDER BY p.name ASC`).all(`%"${location_id}"%`);
    } else {
      // org_id token'dan gelir — query param'a güvenilmez
      rows = db.prepare(`${baseSelect} WHERE p.org_id = ? ORDER BY p.name ASC`).all(auth.org_id);
    }

    const parsed = (rows as any[]).map((p) => ({
      ...p,
      assigned_location_ids: JSON.parse(p.assigned_location_ids || "[]"),
      roles: JSON.parse(p.roles || "[]"),
      role_levels: JSON.parse(p.role_levels || "{}"),
      preferred_shift_ids: JSON.parse(p.preferred_shift_ids || "[]"),
      preferred_days: JSON.parse(p.preferred_days || "[]"),
      preferred_roles: JSON.parse(p.preferred_roles || "[]"),
    }));

    db.close();
    return NextResponse.json(parsed);
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function toUsername(name: string): string {
  return name
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");
}

function findAvailableUsername(db: Database.Database, base: string): string {
  let candidate = base;
  let n = 1;
  while (db.prepare("SELECT id FROM users WHERE username = ?").get(candidate)) {
    candidate = `${base}${n++}`;
  }
  return candidate;
}

// POST: Yeni personel ekle
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // Sadece manager ve üstü personel ekleyebilir
  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = new Database(DB_PATH);
  try {
    const body = await req.json();
    const { location_id, name, email, phone, title, employment_type, role, temp_password } = body;

    if (!location_id || !name) {
      return NextResponse.json({ error: "Zorunlu alanlar eksik" }, { status: 400 });
    }

    // location_id'nin bu org'a ait olduğunu doğrula
    const loc = db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
    if (!loc) {
      db.close();
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    // Plan limit kontrolü: free plan en fazla 10 aktif personel
    const org = db.prepare("SELECT plan FROM organizations WHERE id = ?").get(auth.org_id) as any;
    if (!org || org.plan === "free" || !org.plan) {
      const personnelCount = (db.prepare("SELECT COUNT(*) as cnt FROM personnel WHERE org_id = ? AND status != 'inactive'").get(auth.org_id) as any).cnt;
      if (personnelCount >= 10) {
        db.close();
        return NextResponse.json(
          { error: "Free plan limiti: 10 personel. Daha fazlası için Pro'ya geçin.", upgrade: true },
          { status: 402 }
        );
      }
    }

    if (email?.trim()) {
      const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
      if (existingUser) {
        db.close();
        return NextResponse.json({ error: "Bu e-posta zaten kayıtlı" }, { status: 409 });
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const personnelId = `P-${Date.now()}`;
    const userId = `U-${Date.now()}`;
    const password = temp_password || Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(password, 10);
    const employeeId = `EMP-${Math.floor(Math.random() * 90000) + 10000}`;
    const username = findAvailableUsername(db, toUsername(name) || `user${Date.now()}`);

    db.transaction(() => {
      db.prepare(`
        INSERT INTO personnel (id, org_id, primary_location_id, assigned_location_ids, user_access_level, name, employee_id, email, phone, title, employment_type, status, max_weekly_hours, prev_score, hero_count, no_show_count, late_count, annual_leave_days_total, roles, role_levels, preferred_shift_ids, preferred_days, preferred_roles, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 45, 0, 0, 0, 0, 14, '[]', '{}', '[]', '[]', '[]', ?, ?)
      `).run(personnelId, auth.org_id, location_id, JSON.stringify([location_id]), role ?? "employee", name, employeeId, email?.toLowerCase() || null, phone ?? "", title ?? "Personel", employment_type ?? "full_time", now, now);

      db.prepare(`
        INSERT INTO users (id, personnel_id, username, email, password_hash, role, org_id, location_id, name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, personnelId, username, email?.toLowerCase() || null, passwordHash, role ?? "employee", auth.org_id, location_id, name, now);
    })();

    db.close();
    return NextResponse.json({ success: true, personnel_id: personnelId, username, temp_password: password });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Personel bilgilerini güncelle
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = new Database(DB_PATH);
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

    // Personelin bu org'a ait olduğunu doğrula
    const existing = db.prepare("SELECT id FROM personnel WHERE id = ? AND org_id = ?").get(id, auth.org_id);
    if (!existing) {
      db.close();
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    const body = await req.json();
    const { name, phone, title, employment_type, status, max_weekly_hours, min_weekly_hours, user_access_level, prev_score, roles, weekly_off_day } = body;

    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      UPDATE personnel SET name=COALESCE(?,name), phone=COALESCE(?,phone), title=COALESCE(?,title),
      employment_type=COALESCE(?,employment_type), status=COALESCE(?,status),
      max_weekly_hours=COALESCE(?,max_weekly_hours), min_weekly_hours=COALESCE(?,min_weekly_hours),
      user_access_level=COALESCE(?,user_access_level),
      prev_score=COALESCE(?,prev_score),
      roles=COALESCE(?,roles),
      updated_at=? WHERE id=?
    `).run(name, phone, title, employment_type, status, max_weekly_hours, min_weekly_hours ?? null,
      user_access_level, prev_score ?? null,
      roles !== undefined ? JSON.stringify(roles) : null, now, id);

    // weekly_off_day: undefined → dokunma, null → temizle, 0-6 → gün ata
    if (weekly_off_day !== undefined) {
      db.prepare("UPDATE personnel SET weekly_off_day=? WHERE id=?").run(
        weekly_off_day === null ? null : Number(weekly_off_day), id
      );
    }

    if (name) db.prepare("UPDATE users SET name=? WHERE personnel_id=?").run(name, id);
    if (user_access_level) db.prepare("UPDATE users SET role=? WHERE personnel_id=?").run(user_access_level, id);

    db.close();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Personeli devre dışı bırak
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = new Database(DB_PATH);
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

    // Personelin bu org'a ait olduğunu doğrula
    const existing = db.prepare("SELECT id FROM personnel WHERE id = ? AND org_id = ?").get(id, auth.org_id);
    if (!existing) {
      db.close();
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    const now = Math.floor(Date.now() / 1000);
    db.prepare("UPDATE personnel SET status='inactive', updated_at=? WHERE id=?").run(now, id);
    db.close();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
