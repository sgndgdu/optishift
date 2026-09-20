/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/auth";
import { generateUsername } from "@/lib/accountCreation";

// Kalıcı, tekrar kullanılabilir personel kendi-kendine-kayıt linki (Shiftio'dan
// ilham — Model A'daki tek-kişilik/tek-kullanımlık davet token'ının aksine, bu
// token bir ŞUBEYE bağlıdır ve yönetici yeniden oluşturana kadar sınırsız kişi
// aynı linkle kayıt olabilir). Oluşan hesap her zaman approval_status='pending'
// ile başlar — link paylaşıldığı için kimin kaydolduğu önceden bilinmiyor,
// müdür/admin mevcut "Onay Bekleyen Hesaplar" akışından onaylar/reddeder.

// GET /api/self-signup?token=xxx — token doğrula, şube/org adını göster (herkese açık)
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    const loc = await db.prepare(
      "SELECT id, org_id, name FROM locations WHERE self_signup_token = ?"
    ).get(token) as any;
    if (!loc) return NextResponse.json({ error: "Geçersiz veya kapatılmış kayıt linki" }, { status: 404 });

    const org = await db.prepare("SELECT name FROM organizations WHERE id = ?").get(loc.org_id) as any;
    return NextResponse.json({ valid: true, org_name: org?.name ?? "", location_name: loc.name });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/self-signup — personel kendi hesabını oluşturur (herkese açık, onay bekler)
export async function POST(req: NextRequest) {
  const db = getDB();
  try {
    const { token, name, phone, password } = await req.json();
    if (!token) return NextResponse.json({ error: "Token zorunlu" }, { status: 400 });
    if (!name?.trim()) return NextResponse.json({ error: "Ad Soyad zorunlu" }, { status: 400 });
    if (!password || password.length < 6) {
      return NextResponse.json({ error: "Şifre en az 6 karakter olmalı" }, { status: 400 });
    }

    const loc = await db.prepare(
      "SELECT id, org_id FROM locations WHERE self_signup_token = ?"
    ).get(token) as any;
    if (!loc) return NextResponse.json({ error: "Geçersiz veya kapatılmış kayıt linki" }, { status: 404 });

    const now = Math.floor(Date.now() / 1000);
    const personnelId = `P-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const userId = `U-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const employeeId = `EMP-${Math.floor(10000 + Math.random() * 90000)}`;
    const username = await generateUsername(db, name);
    const passwordHash = await bcrypt.hash(password, 10);

    try {
      await db.prepare(`
        INSERT INTO personnel (id, org_id, primary_location_id, assigned_location_ids, user_access_level, name, employee_id, phone, title, employment_type, status, max_weekly_hours, prev_score, hero_count, no_show_count, late_count, annual_leave_days_total, roles, role_levels, preferred_shift_ids, preferred_days, preferred_roles, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'employee', ?, ?, ?, 'Personel', 'full_time', 'active', 45, 0, 0, 0, 0, 14, '[]', '{}', '[]', '[]', '[]', ?, ?)
      `).run(personnelId, loc.org_id, loc.id, JSON.stringify([loc.id]), name.trim(), employeeId, phone?.trim() || "", now, now);

      await db.prepare(`
        INSERT INTO users (id, personnel_id, username, password_hash, role, org_id, location_id, name, phone, is_temp_password, approval_status, created_by, created_at)
        VALUES (?, ?, ?, ?, 'employee', ?, ?, ?, ?, false, 'pending', 'self-signup', ?)
      `).run(userId, personnelId, username, passwordHash, loc.org_id, loc.id, name.trim(), phone?.trim() || null, now);

      return NextResponse.json({ success: true, username });
    } catch (err: any) {
      await db.prepare("DELETE FROM personnel WHERE id = ?").run(personnelId).catch(() => undefined);
      throw err;
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/self-signup — link oluştur/yenile/kapat (auth gerekir — manager/admin/supervisor)
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const { location_id, action } = await req.json();
    if (!location_id || !["generate", "disable"].includes(action)) {
      return NextResponse.json({ error: "location_id ve geçerli action zorunlu" }, { status: 400 });
    }

    const loc = await db.prepare("SELECT id, org_id FROM locations WHERE id = ?").get(location_id) as any;
    if (!loc || loc.org_id !== auth.org_id) {
      return NextResponse.json({ error: "Şube bulunamadı" }, { status: 404 });
    }
    if (auth.role === "manager" && auth.location_id && location_id !== auth.location_id) {
      return NextResponse.json({ error: "Sadece kendi şubeniz için link yönetebilirsiniz" }, { status: 403 });
    }

    const newToken = action === "generate" ? crypto.randomBytes(20).toString("hex") : null;
    await db.prepare("UPDATE locations SET self_signup_token = ? WHERE id = ?").run(newToken, location_id);

    return NextResponse.json({ success: true, token: newToken });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
