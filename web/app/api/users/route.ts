/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { requireAuth } from "@/lib/auth";


// Rastgele temp şifre üretir: 2 büyük + 2 küçük + 4 rakam
function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const chars = [pick(upper), pick(upper), pick(lower), pick(lower), pick(digits), pick(digits), pick(digits), pick(digits)];
  // Karıştır
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// Ad soyaddan kullanıcı adı üretir: "ahmet kaya" → "ahmet.k.1234"
async function generateUsername(db: any, name: string): Promise<string> {
  const parts = name.trim().toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .split(/\s+/).filter(Boolean);
  const first = (parts[0] ?? "user").replace(/[^a-z0-9]/g, "");
  const lastInitial = parts[1] ? parts[1][0].replace(/[^a-z]/g, "") : "";
  const base = lastInitial ? `${first}.${lastInitial}` : first;

  let attempt = 0;
  while (attempt < 20) {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const candidate = `${base}.${suffix}`;
    const existing = await db.prepare("SELECT id FROM users WHERE username = ?").get(candidate);
    if (!existing) return candidate;
    attempt++;
  }
  return `${base}.${Date.now()}`;
}

// GET /api/users — org kullanıcılarını listele (admin/supervisor)
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "admin" && auth.role !== "supervisor" && auth.role !== "manager") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("approval_status"); // "pending" | null=tümü

    let query = "SELECT id, name, username, email, phone, role, display_title, location_id, department_id, is_temp_password, approval_status, created_by, approved_by, approved_at, created_at FROM users WHERE org_id = ?";
    const params: any[] = [auth.org_id];

    if (status) {
      query += " AND approval_status = ?";
      params.push(status);
    }

    // Manager sadece kendisi veya astlarını görebilir
    if (auth.role === "manager") {
      query += " AND (role = 'employee' OR id = ?)";
      params.push(auth.id);
    }

    query += " ORDER BY created_at DESC";
    const userList = await db.prepare(query).all(...params) as any[];
    return NextResponse.json(userList);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/users — yeni hesap oluştur + temp şifre üret
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const body = await req.json();
    const { name, email, phone, role, display_title, location_id, department_id, location_ids, department_ids, title, employment_type, max_weekly_hours } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Ad soyad zorunlu" }, { status: 400 });
    }

    // Rol yetki kontrolü: kimse kendi rolünden yüksek rol atayamaz
    const RANK: Record<string, number> = { employee: 0, manager: 1, supervisor: 2, admin: 3 };
    const targetRank = RANK[role ?? "employee"] ?? 0;
    const callerRank = RANK[auth.role] ?? 0;
    if (targetRank >= callerRank) {
      return NextResponse.json({ error: "Kendi rolünüzden yüksek rol atayamazsınız" }, { status: 403 });
    }

    const isEmployee = !role || role === "employee";

    // Personel için çoklu şube/departman desteği
    const effLocIds: string[] = Array.isArray(location_ids) && location_ids.length
      ? location_ids
      : (location_id ? [location_id] : []);
    const effDeptIds: string[] = Array.isArray(department_ids) && department_ids.length
      ? department_ids
      : (department_id ? [department_id] : []);

    if (isEmployee) {
      if (!effLocIds.length) return NextResponse.json({ error: "Personel için en az bir şube seçmelisiniz" }, { status: 400 });
      if (!effDeptIds.length) return NextResponse.json({ error: "Personel için en az bir departman seçmelisiniz" }, { status: 400 });
    }

    // Birincil şube
    const primaryLocId = effLocIds[0] ?? location_id ?? auth.location_id;

    // Manager sadece kendi şubesine ekleyebilir
    if (auth.role === "manager" && auth.location_id && primaryLocId !== auth.location_id) {
      return NextResponse.json({ error: "Sadece kendi şubenize hesap oluşturabilirsiniz" }, { status: 403 });
    }

    const tempPassword = generateTempPassword();
    const username = await generateUsername(db, name);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const now = Math.floor(Date.now() / 1000);
    const userId = `U-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Manager'ın oluşturduğu hesaplar patron onayına bekler; admin/supervisor direkt aktif
    const approvalStatus = (auth.role === "manager") ? "pending" : "active";

    // Personnel kaydı da oluştur (employee rolü için)
    let personnelId: string | null = null;
    if (isEmployee) {
      const employeeId = `EMP-${Math.floor(10000 + Math.random() * 90000)}`;
      personnelId = `P-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      await db.prepare(`
        INSERT INTO personnel (id, org_id, primary_location_id, assigned_location_ids, department_id, assigned_department_ids, user_access_level, name, employee_id, phone, email, title, employment_type, status, max_weekly_hours, prev_score, hero_count, no_show_count, late_count, annual_leave_days_total, roles, role_levels, preferred_shift_ids, preferred_days, preferred_roles, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'employee', ?, ?, ?, ?, ?, ?, 'active', ?, 0, 0, 0, 0, 14, '[]', '{}', '[]', '[]', '[]', ?, ?)
      `).run(
        personnelId, auth.org_id,
        primaryLocId ?? "",
        JSON.stringify(effLocIds),
        effDeptIds[0] ?? null,
        JSON.stringify(effDeptIds),
        name.trim(), employeeId, phone?.trim() ?? "", email?.trim()?.toLowerCase() ?? null,
        title?.trim() ?? "Personel",
        employment_type ?? "full_time",
        max_weekly_hours ? Number(max_weekly_hours) : 45,
        now, now
      );
    }

    await db.prepare(`
      INSERT INTO users (id, personnel_id, username, email, phone, password_hash, role, display_title, org_id, location_id, department_id, name, is_temp_password, approval_status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(userId, personnelId, username, email?.trim()?.toLowerCase() ?? null, phone?.trim() ?? null, passwordHash, role ?? "employee", display_title ?? null, auth.org_id, primaryLocId ?? null, effDeptIds[0] ?? department_id ?? null, name.trim(), approvalStatus, auth.id, now);

    // Departman müdürü ise departments tablosunu güncelle
    const primaryDeptId = effDeptIds[0] ?? department_id;
    if (primaryDeptId && (display_title === "Departman Müdürü" || role === "manager")) {
      await db.prepare("UPDATE departments SET manager_id = ? WHERE id = ?").run(userId, primaryDeptId);
    }

    // Otomatik davet token'ı oluştur
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const inviteId = `IT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await db.prepare(`
      INSERT INTO invite_tokens (id, token, user_id, org_id, location_id, role, invited_name, created_by, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(inviteId, inviteToken, userId, auth.org_id, primaryLocId ?? null, role ?? "employee", name.trim(), auth.id, now + 7 * 24 * 3600, now);
    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        username,
        name: name.trim(),
        role: role ?? "employee",
        display_title: display_title ?? null,
        approval_status: approvalStatus,
      },
      credentials: {
        username,
        temp_password: tempPassword,
      },
      inviteToken,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/users?id=xxx — onayla / reddet / güncelle
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    const target = await db.prepare("SELECT * FROM users WHERE id = ? AND org_id = ?").get(id, auth.org_id) as any;
    if (!target) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
    }

    const body = await req.json();
    const now = Math.floor(Date.now() / 1000);

    if (body.approval_status !== undefined) {
      // Onay/red işlemi — sadece admin/supervisor yapabilir
      if (auth.role !== "admin" && auth.role !== "supervisor") {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      await db.prepare("UPDATE users SET approval_status = ?, approved_by = ?, approved_at = ? WHERE id = ?")
        .run(body.approval_status, auth.id, now, id);
    }

    if (body.name !== undefined || body.phone !== undefined || body.location_id !== undefined || body.department_id !== undefined) {
      const fields: string[] = [];
      const vals: any[] = [];
      if (body.name !== undefined) { fields.push("name = ?"); vals.push(body.name); }
      if (body.phone !== undefined) { fields.push("phone = ?"); vals.push(body.phone); }
      if (body.location_id !== undefined) { fields.push("location_id = ?"); vals.push(body.location_id); }
      if (body.department_id !== undefined) { fields.push("department_id = ?"); vals.push(body.department_id); }
      if (body.display_title !== undefined) { fields.push("display_title = ?"); vals.push(body.display_title); }
      vals.push(id);
      await db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/users?id=xxx — hesap sil (sadece admin/supervisor)
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "admin" && auth.role !== "supervisor") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });
  if (id === auth.id) return NextResponse.json({ error: "Kendi hesabınızı silemezsiniz" }, { status: 400 });

  const db = getDB();
  try {
    const target = await db.prepare("SELECT id FROM users WHERE id = ? AND org_id = ?").get(id, auth.org_id);
    if (!target) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
    }
    await db.prepare("DELETE FROM users WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
