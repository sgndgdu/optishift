/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { requireAuth } from "@/lib/auth";
import { generateTempPassword, generateUsername } from "@/lib/accountCreation";
import { MAX_IMPORT_ROWS, checkRows, unknownDepartments, type ImportRow } from "@/lib/personnelImport";

// POST { location_id, rows: ImportRow[], create_departments?: boolean }
// Excel/CSV toplu personel aktarımı (lib/personnelImport): sunucu satırları aynı kuralla yeniden
// doğrular, geçerlileri personel + giriş hesabı + davet bağlantısıyla ekler. Departman adları
// şubenin departmanlarıyla eşleşir; create_departments ise olmayanlar oluşturulur (varsayılan
// kapalı: departman eklemek ihtiyaç tablosunu departman bazına çevirir).
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const body = await req.json();
    const { location_id, rows, create_departments } = body;

    if (!location_id || !Array.isArray(rows)) {
      return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json({ error: `Tek seferde en fazla ${MAX_IMPORT_ROWS} kişi aktarılabilir` }, { status: 400 });
    }

    // Manager sadece kendi şubesine toplu ekleyebilir
    if (auth.role === "manager" && auth.location_id && location_id !== auth.location_id) {
      return NextResponse.json({ error: "Sadece kendi şubenize toplu ekleme yapabilirsiniz" }, { status: 403 });
    }

    // location_id gerçekten çağıranın org'una mı ait, doğrula
    const loc = await db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
    if (!loc) return NextResponse.json({ error: "Şube bulunamadı" }, { status: 404 });

    // İstemciden gelen satırı güvenli biçime getir (tipler + uzunluklar)
    const clean: ImportRow[] = rows.map((r: any, i: number) => ({
      line: Number.isInteger(r?.line) ? r.line : i + 2,
      name: String(r?.name ?? "").trim().slice(0, 120),
      department: String(r?.department ?? "").trim().slice(0, 80),
      skills: (Array.isArray(r?.skills) ? r.skills : []).map((s: any) => String(s).trim().slice(0, 60)).filter(Boolean).slice(0, 20),
      phone: String(r?.phone ?? "").replace(/[^\d+]/g, "").slice(0, 20),
      email: String(r?.email ?? "").trim().toLowerCase().slice(0, 160),
    }));

    let departments = await db.prepare("SELECT id, name FROM departments WHERE location_id = ?").all(location_id) as { id: string; name: string }[];
    const createdDepartments: string[] = [];
    if (create_departments === true) {
      for (const name of unknownDepartments(clean, departments)) {
        const id = `D-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        await db.prepare("INSERT INTO departments (id, location_id, name) VALUES (?, ?, ?)").run(id, location_id, name);
        createdDepartments.push(name);
      }
      if (createdDepartments.length) {
        departments = await db.prepare("SELECT id, name FROM departments WHERE location_id = ?").all(location_id) as { id: string; name: string }[];
      }
    }

    const existing = await db.prepare(
      "SELECT name, phone FROM personnel WHERE assigned_location_ids LIKE ? AND status = 'active'"
    ).all(`%"${location_id}"%`) as { name: string; phone: string | null }[];
    const checked = checkRows(clean, { departments, existing, createDepartments: create_departments === true });

    const org_id = auth.org_id;
    const now = Math.floor(Date.now() / 1000);
    // Manager'ın oluşturduğu hesaplar patron onayına bekler; admin/supervisor direkt aktif (tekil akışla aynı kural)
    const approvalStatus = auth.role === "manager" ? "pending" : "active";
    const results: any[] = [];
    const skipped: { line: number; name: string; reason: string }[] = [];

    for (const p of checked) {
      if (p.status === "skip") { skipped.push({ line: p.line, name: p.name, reason: p.notes[0] ?? "Atlandı" }); continue; }
      if (p.email) {
        const existingUser = await db.prepare("SELECT id FROM users WHERE email = ?").get(p.email);
        if (existingUser) { skipped.push({ line: p.line, name: p.name, reason: "E-posta başka bir hesapta kayıtlı" }); continue; }
      }

      const personnelId = `P-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      const userId = `U-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      const tempPassword = generateTempPassword();
      const username = await generateUsername(db, p.name);
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const employeeId = `EMP-${Math.floor(10000 + Math.random() * 90000)}`;

      try {
        await db.prepare(`
          INSERT INTO personnel (id, org_id, primary_location_id, assigned_location_ids, user_access_level, name, employee_id, email, phone, title, employment_type, status, max_weekly_hours, prev_score, hero_count, no_show_count, late_count, annual_leave_days_total, roles, role_levels, preferred_shift_ids, preferred_days, preferred_roles, department_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'employee', ?, ?, ?, ?, 'Personel', 'full_time', 'active', 45, 0, 0, 0, 0, 14, ?, '{}', '[]', '[]', '[]', ?, ?, ?)
        `).run(personnelId, org_id, location_id, JSON.stringify([location_id]), p.name, employeeId, p.email || null, p.phone || "",
          JSON.stringify(p.skills), p.departmentId, now, now);

        await db.prepare(`
          INSERT INTO users (id, personnel_id, username, email, password_hash, role, org_id, location_id, department_id, name, is_temp_password, approval_status, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, 'employee', ?, ?, ?, ?, true, ?, ?, ?)
        `).run(userId, personnelId, username, p.email || null, passwordHash, org_id, location_id, p.departmentId, p.name, approvalStatus, auth.id, now);

        // Davet token'ı — tekil oluşturmayla (/api/users) aynı /setup akışı
        const inviteToken = crypto.randomBytes(32).toString("hex");
        const inviteId = `IT-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        await db.prepare(`
          INSERT INTO invite_tokens (id, token, user_id, org_id, location_id, role, invited_name, created_by, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?, 'employee', ?, ?, ?, ?)
        `).run(inviteId, inviteToken, userId, org_id, location_id, p.name, auth.id, now + 7 * 24 * 3600, now);

        results.push({ name: p.name, username, temp_password: tempPassword, invite_token: inviteToken });
      } catch {
        // users INSERT başarısız olduysa orphan personnel kaydını temizle (tekil akışla aynı desen)
        await db.prepare("DELETE FROM personnel WHERE id = ?").run(personnelId).catch(() => undefined);
        skipped.push({ line: p.line, name: p.name, reason: "Kaydedilemedi" });
      }
    }

    return NextResponse.json({
      success: true,
      addedCount: results.length,
      errorCount: skipped.length,
      results,
      skipped,
      createdDepartments,
      approvalPending: approvalStatus === "pending",
    });
  } catch (err: any) {
    console.error("[personnel/bulk]", err);
    return NextResponse.json({ error: "Aktarım sırasında hata oluştu" }, { status: 500 });
  }
}
