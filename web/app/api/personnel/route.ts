/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/auth";


// Rol hiyerarşisi: bir rol kendisinin ve altındakilerin rollerini atayabilir
const ROLE_RANK: Record<string, number> = { employee: 0, manager: 1, supervisor: 2, admin: 3 };
function canAssignRole(assignerRole: string, targetRole: string): boolean {
  return (ROLE_RANK[assignerRole] ?? 0) >= (ROLE_RANK[targetRole] ?? 0);
}

// GET: Departman veya lokasyona göre personeli getir
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const department_id = searchParams.get("department_id");
  const location_id = searchParams.get("location_id");

  const db = getDB();
  try {
    const baseSelect = `
      SELECT p.*, u.username, u.id as user_id
      FROM personnel p
      LEFT JOIN users u ON u.personnel_id = p.id
    `;
    let rows;
    if (department_id) {
      // Departmanın bu org'a ait olduğunu doğrula
      const dept = await db.prepare(`
        SELECT d.id FROM departments d
        JOIN locations l ON d.location_id = l.id
        WHERE d.id = ? AND l.org_id = ?
      `).get(department_id, auth.org_id);
      if (!dept) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = await db.prepare(`${baseSelect} WHERE p.department_id = ? ORDER BY p.name ASC`).all(department_id);
    } else if (location_id) {
      // Lokasyonun bu org'a ait olduğunu doğrula
      const loc = await db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
      if (!loc) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = await db.prepare(`${baseSelect} WHERE p.assigned_location_ids LIKE ? ORDER BY p.name ASC`).all(`%"${location_id}"%`);
    } else {
      // org_id token'dan gelir — query param'a güvenilmez
      rows = await db.prepare(`${baseSelect} WHERE p.org_id = ? ORDER BY p.name ASC`).all(auth.org_id);
    }

    const parsed = (rows as any[]).map((p) => ({
      ...p,
      assigned_location_ids: JSON.parse(p.assigned_location_ids || "[]"),
      assigned_department_ids: JSON.parse(p.assigned_department_ids || "[]"),
      roles: JSON.parse(p.roles || "[]"),
      role_levels: JSON.parse(p.role_levels || "{}"),
      preferred_shift_ids: JSON.parse(p.preferred_shift_ids || "[]"),
      preferred_days: JSON.parse(p.preferred_days || "[]"),
      preferred_roles: JSON.parse(p.preferred_roles || "[]"),
    }));
    return NextResponse.json(parsed);
  } catch (err: any) {
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

async function findAvailableUsername(db: any, base: string): Promise<string> {
  let candidate = base;
  let n = 1;
  while (await db.prepare("SELECT id FROM users WHERE username = ?").get(candidate)) {
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

  const db = getDB();
  try {
    const body = await req.json();
    const { location_id, name, email, phone, title, employment_type, role, temp_password } = body;

    if (!location_id || !name) {
      return NextResponse.json({ error: "Zorunlu alanlar eksik" }, { status: 400 });
    }

    // Atanan rol, atayan kişinin rolünü aşamaz
    const requestedRole = role ?? "employee";
    if (!canAssignRole(auth.role, requestedRole)) {
      return NextResponse.json({ error: `${auth.role} rolü, ${requestedRole} rolü atayamaz` }, { status: 403 });
    }

    // Manager sadece kendi şubesine personel ekleyebilir
    if (auth.role === "manager" && auth.location_id && location_id !== auth.location_id) {
      return NextResponse.json({ error: "Sadece kendi şubenize personel ekleyebilirsiniz" }, { status: 403 });
    }

    // location_id'nin bu org'a ait olduğunu doğrula
    const loc = await db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
    if (!loc) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    // Plan limit kontrolü: free plan en fazla 10 aktif personel
    const org = await db.prepare("SELECT plan FROM organizations WHERE id = ?").get(auth.org_id) as any;
    if (!org || org.plan === "free" || !org.plan) {
      const personnelCount = ((await db.prepare("SELECT COUNT(*) as cnt FROM personnel WHERE org_id = ? AND status != 'inactive'").get(auth.org_id)) as any).cnt;
      if (personnelCount >= 10) {
        return NextResponse.json(
          { error: "Free plan limiti: 10 personel. Daha fazlası için Pro'ya geçin.", upgrade: true },
          { status: 402 }
        );
      }
    }

    if (email?.trim()) {
      const existingUser = await db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
      if (existingUser) {
        return NextResponse.json({ error: "Bu e-posta zaten kayıtlı" }, { status: 409 });
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const personnelId = `P-${Date.now()}`;
    const userId = `U-${Date.now()}`;
    const password = temp_password || Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(password, 10);
    const employeeId = `EMP-${Math.floor(Math.random() * 90000) + 10000}`;
    const username = await findAvailableUsername(db, toUsername(name) || `user${Date.now()}`);

    await db.prepare(`
      INSERT INTO personnel (id, org_id, primary_location_id, assigned_location_ids, user_access_level, name, employee_id, email, phone, title, employment_type, status, max_weekly_hours, prev_score, hero_count, no_show_count, late_count, annual_leave_days_total, roles, role_levels, preferred_shift_ids, preferred_days, preferred_roles, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 45, 0, 0, 0, 0, 14, '[]', '{}', '[]', '[]', '[]', ?, ?)
    `).run(personnelId, auth.org_id, location_id, JSON.stringify([location_id]), role ?? "employee", name, employeeId, email?.toLowerCase() || null, phone ?? "", title ?? "Personel", employment_type ?? "full_time", now, now);

    await db.prepare(`
      INSERT INTO users (id, personnel_id, username, email, password_hash, role, org_id, location_id, name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, personnelId, username, email?.toLowerCase() || null, passwordHash, role ?? "employee", auth.org_id, location_id, name, now);

    return NextResponse.json({ success: true, personnel_id: personnelId, username, temp_password: password });
  } catch (err: any) {
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

  const db = getDB();
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

    // Personelin bu org'a ait olduğunu doğrula
    const existing = await db.prepare("SELECT id, primary_location_id, user_access_level FROM personnel WHERE id = ? AND org_id = ?").get(id, auth.org_id) as any;
    if (!existing) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    // Manager sadece kendi şubesindeki personeli düzenleyebilir
    if (auth.role === "manager" && auth.location_id && existing.primary_location_id !== auth.location_id) {
      return NextResponse.json({ error: "Sadece kendi şubenizin personelini düzenleyebilirsiniz" }, { status: 403 });
    }

    const body = await req.json();
    // Not: prev_score body'den kabul edilmez — türetilmiş önbellektir, tek yazarı
    // lib/scoring.ts recompute'udur. Manuel düzeltme için score_adjustments (type: manual).
    const { name, phone, title, employment_type, status, max_weekly_hours, min_weekly_hours, user_access_level, roles, weekly_off_day, crew_id, hourly_wage } = body;

    // Atanan rol, atayan kişinin rolünü aşamaz
    if (user_access_level && !canAssignRole(auth.role, user_access_level)) {
      return NextResponse.json({ error: `${auth.role} rolü, ${user_access_level} rolü atayamaz` }, { status: 403 });
    }

    const now = Math.floor(Date.now() / 1000);
    await db.prepare(`
      UPDATE personnel SET name=COALESCE(?,name), phone=COALESCE(?,phone), title=COALESCE(?,title),
      employment_type=COALESCE(?,employment_type), status=COALESCE(?,status),
      max_weekly_hours=COALESCE(?,max_weekly_hours), min_weekly_hours=COALESCE(?,min_weekly_hours),
      user_access_level=COALESCE(?,user_access_level),
      roles=COALESCE(?,roles),
      updated_at=? WHERE id=?
    `).run(name, phone, title, employment_type, status, max_weekly_hours, min_weekly_hours ?? null,
      user_access_level,
      roles !== undefined ? JSON.stringify(roles) : null, now, id);

    // hourly_wage: undefined → dokunma, null → temizle, sayı → ata
    if (hourly_wage !== undefined) {
      await db.prepare("UPDATE personnel SET hourly_wage=? WHERE id=?").run(
        hourly_wage === null ? null : Number(hourly_wage), id
      );
    }

    // weekly_off_day: undefined → dokunma, null → temizle, 0-6 → gün ata
    if (weekly_off_day !== undefined) {
      await db.prepare("UPDATE personnel SET weekly_off_day=? WHERE id=?").run(
        weekly_off_day === null ? null : Number(weekly_off_day), id
      );
    }

    // crew_id: undefined → dokunma, null → ekipten çıkar, string → ekip ata
    if (crew_id !== undefined) {
      await db.prepare("UPDATE personnel SET crew_id=? WHERE id=?").run(crew_id ?? null, id);
    }

    if (name) await db.prepare("UPDATE users SET name=? WHERE personnel_id=?").run(name, id);
    if (user_access_level) await db.prepare("UPDATE users SET role=? WHERE personnel_id=?").run(user_access_level, id);

    // Terfi/rol değişikliği bildirimi — eski rol farklıysa kişiye bildir
    if (user_access_level && user_access_level !== existing.user_access_level) {
      const ROLE_LABELS: Record<string, string> = { employee: "Personel", manager: "Müdür / Yönetici", supervisor: "Süpervizör", admin: "Admin" };
      const newLabel = ROLE_LABELS[user_access_level] ?? user_access_level;
      await db.prepare(`
        INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
        VALUES (?, 'alert', 'Sistem Rolünüz Güncellendi', ?, '/portal', false, ?)
      `).run(
        id,
        `Sistem rolünüz "${newLabel}" olarak güncellendi. Yeni yetkileriniz için çıkış yapıp tekrar giriş yapın.`,
        now
      );
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
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

  const db = getDB();
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

    // Personelin bu org'a ait olduğunu doğrula
    const existing = await db.prepare("SELECT id FROM personnel WHERE id = ? AND org_id = ?").get(id, auth.org_id);
    if (!existing) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    const now = Math.floor(Date.now() / 1000);
    await db.prepare("UPDATE personnel SET status='inactive', updated_at=? WHERE id=?").run(now, id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
