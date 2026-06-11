import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import bcrypt from "bcryptjs";
import path from "path";
import * as schema from "./schema";

const DB_PATH = path.join(process.cwd(), "optishift.db");

async function seed() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });

  console.log("🌱 Creating tables...");

  // Create tables with raw SQL since we don't have migrations set up
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      connected_erp TEXT,
      erp_mapped_fields TEXT
    );

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      name TEXT NOT NULL,
      operating_hours TEXT,
      shift_definitions TEXT,
      FOREIGN KEY (org_id) REFERENCES organizations(id)
    );

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      location_id TEXT NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (location_id) REFERENCES locations(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      personnel_id TEXT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      org_id TEXT NOT NULL,
      location_id TEXT,
      name TEXT NOT NULL,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS personnel (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      primary_location_id TEXT NOT NULL,
      assigned_location_ids TEXT,
      department_id TEXT,
      user_access_level TEXT NOT NULL DEFAULT 'employee',
      name TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      hire_date TEXT,
      contract_end_date TEXT,
      title TEXT,
      employment_type TEXT DEFAULT 'full_time',
      status TEXT DEFAULT 'active',
      erp_id TEXT,
      notes TEXT,
      roles TEXT,
      role_levels TEXT,
      preferred_shift_ids TEXT,
      preferred_days TEXT,
      preferred_roles TEXT,
      max_weekly_hours INTEGER DEFAULT 45,
      overtime_approved INTEGER DEFAULT 0,
      prev_score REAL DEFAULT 0,
      hero_count INTEGER DEFAULT 0,
      no_show_count INTEGER DEFAULT 0,
      late_count INTEGER DEFAULT 0,
      annual_leave_days_total INTEGER DEFAULT 14,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      personnel_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      day_0 TEXT DEFAULT 'available',
      day_1 TEXT DEFAULT 'available',
      day_2 TEXT DEFAULT 'available',
      day_3 TEXT DEFAULT 'available',
      day_4 TEXT DEFAULT 'available',
      day_5 TEXT DEFAULT 'available',
      day_6 TEXT DEFAULT 'available',
      day_0_start TEXT,
      day_0_end TEXT,
      day_1_start TEXT,
      day_1_end TEXT,
      day_2_start TEXT,
      day_2_end TEXT,
      day_3_start TEXT,
      day_3_end TEXT,
      day_4_start TEXT,
      day_4_end TEXT,
      day_5_start TEXT,
      day_5_end TEXT,
      day_6_start TEXT,
      day_6_end TEXT,
      submitted_at INTEGER,
      deadline TEXT,
      is_locked INTEGER DEFAULT 0,
      FOREIGN KEY (personnel_id) REFERENCES personnel(id),
      UNIQUE(personnel_id, week_start)
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      personnel_id TEXT NOT NULL,
      type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days INTEGER,
      note TEXT,
      status TEXT DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at INTEGER,
      created_at INTEGER,
      FOREIGN KEY (personnel_id) REFERENCES personnel(id)
    );

    CREATE TABLE IF NOT EXISTS shift_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      personnel_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      day INTEGER NOT NULL,
      shift_id TEXT NOT NULL,
      role_id TEXT,
      start_time TEXT,
      end_time TEXT,
      points REAL DEFAULT 0,
      status TEXT DEFAULT 'scheduled',
      created_at INTEGER,
      FOREIGN KEY (personnel_id) REFERENCES personnel(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      personnel_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      link TEXT,
      created_at INTEGER,
      FOREIGN KEY (personnel_id) REFERENCES personnel(id)
    );
  `);

  console.log("✅ Tables created.");
  console.log("🌱 Seeding data...");

  const now = Date.now();

  // Organizations
  sqlite.prepare(`INSERT OR IGNORE INTO organizations (id, name, connected_erp) VALUES (?, ?, ?)`).run("ORG-001", "Gratis Perakende A.Ş.", "SAP_SuccessFactors");
  sqlite.prepare(`INSERT OR IGNORE INTO organizations (id, name, connected_erp) VALUES (?, ?, ?)`).run("ORG-002", "Hilton Premium Hotel", "SAP_ERP");

  // Locations
  const defaultHours = JSON.stringify({ 0: { isOpen: true, open: "09:00", close: "22:00" }, 1: { isOpen: true, open: "09:00", close: "22:00" }, 2: { isOpen: true, open: "09:00", close: "22:00" }, 3: { isOpen: true, open: "09:00", close: "22:00" }, 4: { isOpen: true, open: "09:00", close: "22:00" }, 5: { isOpen: true, open: "09:00", close: "22:00" }, 6: { isOpen: true, open: "09:00", close: "22:00" } });
  const defaultShifts = JSON.stringify([
    { id: "s1", name: "Açılış", start: "09:00", end: "17:00", base_points: 3 },
    { id: "s2", name: "Kapanış", start: "14:00", end: "22:00", base_points: 5 },
  ]);

  sqlite.prepare(`INSERT OR IGNORE INTO locations (id, org_id, name, operating_hours, shift_definitions) VALUES (?, ?, ?, ?, ?)`).run("L-001", "ORG-001", "Gratis İzmir Merkez Mağazası", defaultHours, defaultShifts);
  sqlite.prepare(`INSERT OR IGNORE INTO locations (id, org_id, name, operating_hours, shift_definitions) VALUES (?, ?, ?, ?, ?)`).run("L-002", "ORG-001", "Gratis İstanbul Kadıköy Şubesi", defaultHours, defaultShifts);
  sqlite.prepare(`INSERT OR IGNORE INTO locations (id, org_id, name, operating_hours, shift_definitions) VALUES (?, ?, ?, ?, ?)`).run("L-003", "ORG-002", "Hilton Bodrum Resort", defaultHours, defaultShifts);

  // Departments
  sqlite.prepare(`INSERT OR IGNORE INTO departments (id, location_id, name) VALUES (?, ?, ?)`).run("D-001", "L-001", "Mağaza İçi Servis");
  sqlite.prepare(`INSERT OR IGNORE INTO departments (id, location_id, name) VALUES (?, ?, ?)`).run("D-002", "L-001", "Kasa & Ödeme");

  // Personnel
  const personnelData = [
    { id: "P001", org_id: "ORG-001", primary_location_id: "L-001", department_id: "D-002", user_access_level: "employee", name: "Ahmet Yılmaz", employee_id: "100001", phone: "+90 532 111 22 33", email: "ahmet@gratis-izmir.com", hire_date: "2022-03-15", title: "Kasiyer", employment_type: "full_time", status: "active", erp_id: "SAP-00001", prev_score: 32, hero_count: 1, no_show_count: 0, late_count: 2, annual_leave_days_total: 14 },
    { id: "P002", org_id: "ORG-001", primary_location_id: "L-001", department_id: "D-002", user_access_level: "employee", name: "Fatma Şahin", employee_id: "100002", phone: "+90 543 222 33 44", email: "fatma@gratis-izmir.com", hire_date: "2021-07-01", title: "Kasa Sorumlusu", employment_type: "full_time", status: "active", erp_id: "SAP-00002", prev_score: 28, hero_count: 3, no_show_count: 0, late_count: 0, annual_leave_days_total: 20 },
    { id: "P003", org_id: "ORG-001", primary_location_id: "L-001", department_id: "D-001", user_access_level: "employee", name: "Mehmet Demir", employee_id: "100003", phone: "+90 505 333 44 55", email: "mehmet@gratis-izmir.com", hire_date: "2023-01-10", title: "Reyon Görevlisi", employment_type: "part_time", status: "active", erp_id: "SAP-00003", prev_score: 35, hero_count: 0, no_show_count: 1, late_count: 3, annual_leave_days_total: 14 },
    { id: "P006", org_id: "ORG-001", primary_location_id: "L-001", department_id: null, user_access_level: "manager", name: "Zeynep Arslan", employee_id: "100006", phone: "+90 505 666 77 88", email: "zeynep@gratis-izmir.com", hire_date: "2019-11-05", title: "Mağaza Müdürü", employment_type: "full_time", status: "active", erp_id: "SAP-00006", prev_score: 40, hero_count: 5, no_show_count: 0, late_count: 0, annual_leave_days_total: 26 },
  ];

  const insertPersonnel = sqlite.prepare(`
    INSERT OR IGNORE INTO personnel (id, org_id, primary_location_id, assigned_location_ids, department_id, user_access_level, name, employee_id, phone, email, hire_date, title, employment_type, status, erp_id, prev_score, hero_count, no_show_count, late_count, annual_leave_days_total, roles, role_levels, preferred_shift_ids, preferred_days, preferred_roles, max_weekly_hours, overtime_approved, created_at)
    VALUES (@id, @org_id, @primary_location_id, @assigned_location_ids, @department_id, @user_access_level, @name, @employee_id, @phone, @email, @hire_date, @title, @employment_type, @status, @erp_id, @prev_score, @hero_count, @no_show_count, @late_count, @annual_leave_days_total, @roles, @role_levels, @preferred_shift_ids, @preferred_days, @preferred_roles, @max_weekly_hours, @overtime_approved, @created_at)
  `);

  for (const p of personnelData) {
    insertPersonnel.run({
      ...p,
      assigned_location_ids: JSON.stringify(["L-001"]),
      roles: JSON.stringify(["R-001", "R-002"]),
      role_levels: JSON.stringify({ "R-001": "primary" }),
      preferred_shift_ids: JSON.stringify(["s1"]),
      preferred_days: JSON.stringify([0, 1, 3, 4]),
      preferred_roles: JSON.stringify(["R-001"]),
      max_weekly_hours: 45,
      overtime_approved: 0,
      created_at: now,
    });
  }

  // Users (portal login)
  const passwordHash = await bcrypt.hash("1234", 10);

  const insertUser = sqlite.prepare(`
    INSERT OR IGNORE INTO users (id, personnel_id, email, password_hash, role, org_id, location_id, name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run("U-001", "P001", "ahmet@gratis-izmir.com", passwordHash, "employee", "ORG-001", "L-001", "Ahmet Yılmaz", now);
  insertUser.run("U-002", "P002", "fatma@gratis-izmir.com", passwordHash, "employee", "ORG-001", "L-001", "Fatma Şahin", now);
  insertUser.run("U-003", "P003", "mehmet@gratis-izmir.com", passwordHash, "employee", "ORG-001", "L-001", "Mehmet Demir", now);
  insertUser.run("U-006", "P006", "zeynep@gratis-izmir.com", passwordHash, "manager", "ORG-001", "L-001", "Zeynep Arslan", now);

  // Shift assignments (bu hafta)
  const weekStart = "2026-08-22";
  const insertShift = sqlite.prepare(`
    INSERT OR IGNORE INTO shift_assignments (personnel_id, location_id, week_start, day, shift_id, role_id, start_time, end_time, points, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)
  `);

  const shifts = [
    ["P001", "L-001", weekStart, 0, "s1", "R-001", "09:00", "17:00", 3],
    ["P001", "L-001", weekStart, 1, "s2", "R-001", "14:00", "22:00", 5],
    ["P001", "L-001", weekStart, 4, "s2", "R-001", "14:00", "22:00", 8],
    ["P001", "L-001", weekStart, 5, "s2", "R-002", "14:00", "22:00", 8],
    ["P002", "L-001", weekStart, 2, "s2", "R-001", "14:00", "22:00", 5],
    ["P002", "L-001", weekStart, 3, "s2", "R-003", "14:00", "22:00", 5],
    ["P002", "L-001", weekStart, 5, "s2", "R-001", "14:00", "22:00", 8],
    ["P002", "L-001", weekStart, 6, "s2", "R-001", "14:00", "22:00", 10],
    ["P003", "L-001", weekStart, 1, "s2", "R-002", "14:00", "22:00", 5],
    ["P003", "L-001", weekStart, 4, "s1", "R-002", "09:00", "17:00", 8],
    ["P003", "L-001", weekStart, 5, "s1", "R-002", "09:00", "17:00", 8],
  ];

  for (const s of shifts) {
    insertShift.run(...s, now);
  }

  // Notifications
  const insertNotif = sqlite.prepare(`
    INSERT OR IGNORE INTO notifications (personnel_id, type, title, message, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertNotif.run("P001", "schedule", "Yeni Vardiya Programı", "22-28 Ağustos haftası için vardiya programınız yayınlandı.", 0, now - 7200000);
  insertNotif.run("P001", "leave_approved", "İzin Talebiniz Onaylandı", "29 Ağustos tarihindeki Yıllık İzin talebiniz onaylandı.", 0, now - 86400000);
  insertNotif.run("P001", "trade_request", "Vardiya Takas İsteği", "Fatma Şahin, 16 Ağustos vardiyasını sizinle değiştirmek istiyor.", 1, now - 172800000);
  insertNotif.run("P001", "alert", "Müsaitlik Hatırlatması", "Gelecek hafta için müsaitlik durumunuzu henüz girmediniz.", 1, now - 259200000);

  // Leave requests
  sqlite.prepare(`
    INSERT OR IGNORE INTO leave_requests (personnel_id, type, start_date, end_date, days, note, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run("P001", "annual", "2026-04-01", "2026-04-07", 5, "", "approved", now);

  console.log("✅ Seed completed!");
  console.log("📧 Test kullanıcıları:");
  console.log("   ahmet@gratis-izmir.com / 1234  (Personel)");
  console.log("   fatma@gratis-izmir.com / 1234  (Personel)");
  console.log("   zeynep@gratis-izmir.com / 1234 (Mağaza Müdürü)");

  sqlite.close();
}

seed().catch(console.error);
