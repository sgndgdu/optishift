/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "optishift.db");

// POST: Excel'den kopyalanan listeyi toplu olarak ekle
export async function POST(req: NextRequest) {
  const db = new Database(DB_PATH);
  try {
    const body = await req.json();
    const { org_id, location_id, personnel_list } = body;

    if (!org_id || !location_id || !Array.isArray(personnel_list)) {
      return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });
    }

    const now = Math.floor(Date.now() / 1000);
    const results: any[] = [];
    let addedCount = 0;
    let errorCount = 0;

    db.transaction(() => {
      for (const p of personnel_list) {
        if (!p.name || !p.email) continue;

        // Email uniqueness check
        const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(p.email.toLowerCase());
        if (existingUser) {
          errorCount++;
          continue;
        }

        const personnelId = `P-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const userId = `U-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const password = Math.random().toString(36).slice(-8); // Generate temp pass
        const passwordHash = bcrypt.hashSync(password, 10);
        const employeeId = `EMP-${Math.floor(Math.random() * 90000) + 10000}`;

        db.prepare(`
          INSERT INTO personnel (id, org_id, primary_location_id, assigned_location_ids, user_access_level, name, employee_id, email, phone, title, employment_type, status, max_weekly_hours, prev_score, hero_count, no_show_count, late_count, annual_leave_days_total, roles, role_levels, preferred_shift_ids, preferred_days, preferred_roles, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'employee', ?, ?, ?, ?, ?, 'full_time', 'active', 45, 0, 0, 0, 0, 14, '[]', '{}', '[]', '[]', '[]', ?, ?)
        `).run(personnelId, org_id, location_id, JSON.stringify([location_id]), p.name, employeeId, p.email.toLowerCase(), p.phone || "", p.title || "Personel", now, now);

        db.prepare(`
          INSERT INTO users (id, personnel_id, email, password_hash, role, org_id, location_id, name, created_at)
          VALUES (?, ?, ?, ?, 'employee', ?, ?, ?, ?)
        `).run(userId, personnelId, p.email.toLowerCase(), passwordHash, org_id, location_id, p.name, now);

        addedCount++;
        results.push({ name: p.name, email: p.email, temp_password: password });
      }
    })();

    db.close();
    return NextResponse.json({ success: true, addedCount, errorCount, results });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
