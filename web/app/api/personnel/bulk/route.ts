/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { requireAuth } from "@/lib/auth";
import { generateTempPassword, generateUsername } from "@/lib/accountCreation";

// POST: Excel'den kopyalanan listeyi toplu olarak ekle
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const body = await req.json();
    const { location_id, personnel_list } = body;

    if (!location_id || !Array.isArray(personnel_list)) {
      return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });
    }

    // Manager sadece kendi şubesine toplu ekleyebilir
    if (auth.role === "manager" && auth.location_id && location_id !== auth.location_id) {
      return NextResponse.json({ error: "Sadece kendi şubenize toplu ekleme yapabilirsiniz" }, { status: 403 });
    }

    // location_id gerçekten çağıranın org'una mı ait, doğrula
    const loc = await db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
    if (!loc) return NextResponse.json({ error: "Şube bulunamadı" }, { status: 404 });

    const org_id = auth.org_id;
    const now = Math.floor(Date.now() / 1000);
    // Manager'ın oluşturduğu hesaplar patron onayına bekler; admin/supervisor direkt aktif (tekil akışla aynı kural)
    const approvalStatus = auth.role === "manager" ? "pending" : "active";
    const results: any[] = [];
    let addedCount = 0;
    let errorCount = 0;

    for (const p of personnel_list) {
      if (!p.name || !p.email) { errorCount++; continue; }

      const existingUser = await db.prepare("SELECT id FROM users WHERE email = ?").get(p.email.toLowerCase());
      if (existingUser) { errorCount++; continue; }

      const personnelId = `P-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const userId = `U-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const tempPassword = generateTempPassword();
      const username = await generateUsername(db, p.name);
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const employeeId = `EMP-${Math.floor(10000 + Math.random() * 90000)}`;

      try {
        await db.prepare(`
          INSERT INTO personnel (id, org_id, primary_location_id, assigned_location_ids, user_access_level, name, employee_id, email, phone, title, employment_type, status, max_weekly_hours, prev_score, hero_count, no_show_count, late_count, annual_leave_days_total, roles, role_levels, preferred_shift_ids, preferred_days, preferred_roles, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'employee', ?, ?, ?, ?, ?, 'full_time', 'active', 45, 0, 0, 0, 0, 14, '[]', '{}', '[]', '[]', '[]', ?, ?)
        `).run(personnelId, org_id, location_id, JSON.stringify([location_id]), p.name, employeeId, p.email.toLowerCase(), p.phone || "", p.title || "Personel", now, now);

        await db.prepare(`
          INSERT INTO users (id, personnel_id, username, email, password_hash, role, org_id, location_id, name, is_temp_password, approval_status, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, 'employee', ?, ?, ?, true, ?, ?, ?)
        `).run(userId, personnelId, username, p.email.toLowerCase(), passwordHash, org_id, location_id, p.name, approvalStatus, auth.id, now);

        // Davet token'ı — tekil oluşturmayla (/api/users) aynı /setup akışı
        const inviteToken = crypto.randomBytes(32).toString("hex");
        const inviteId = `IT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        await db.prepare(`
          INSERT INTO invite_tokens (id, token, user_id, org_id, location_id, role, invited_name, created_by, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?, 'employee', ?, ?, ?, ?)
        `).run(inviteId, inviteToken, userId, org_id, location_id, p.name, auth.id, now + 7 * 24 * 3600, now);

        addedCount++;
        results.push({ name: p.name, email: p.email, username, temp_password: tempPassword, invite_token: inviteToken });
      } catch {
        // users INSERT başarısız olduysa orphan personnel kaydını temizle (tekil akışla aynı desen)
        await db.prepare("DELETE FROM personnel WHERE id = ?").run(personnelId).catch(() => undefined);
        errorCount++;
      }
    }

    return NextResponse.json({ success: true, addedCount, errorCount, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
