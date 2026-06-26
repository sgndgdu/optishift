/* eslint-disable @typescript-eslint/no-require-imports */
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const path = require("path");

const DB_PATH = path.join(__dirname, "optishift.db");

async function seedBrulee() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = OFF");

  // ─── Temizle ────────────────────────────────────────────────────────────────
  console.log("🗑️  Tüm veriler temizleniyor...");
  const tables = [
    "notifications", "availability", "score_history", "break_sessions",
    "shift_swap_requests", "shift_edit_requests", "open_shifts", "shift_assignments",
    "leave_requests", "push_subscriptions", "messages", "password_reset_tokens",
    "invite_tokens", "schedule_edit_requests", "schedule_publications",
    "location_events", "users", "personnel", "departments", "locations", "organizations",
  ];
  db.transaction(() => {
    for (const t of tables) {
      try { db.prepare(`DELETE FROM ${t}`).run(); } catch (_) {}
    }
    try { db.prepare("DELETE FROM sqlite_sequence").run(); } catch (_) {}
  })();
  console.log("✅ Temizlendi.\n");

  const now = Math.floor(Date.now() / 1000);
  const pw = bcrypt.hashSync("1234", 10);
  const ORG = "ORG-BRULEE";

  // ─── Organizasyon ────────────────────────────────────────────────────────────
  db.prepare("INSERT INTO organizations (id, name, plan) VALUES (?, ?, ?)").run(ORG, "Brûlée Cafe", "pro");

  // ─── Vardiya Tanımları (Cafe'ye özgü) ────────────────────────────────────────
  const shiftDefs = JSON.stringify([
    { id: "sdf-acilis",  name: "Açılış Vardiyası",  start: "07:00", end: "13:00", base_points: 4 },
    { id: "sdf-ogle",    name: "Öğle Vardiyası",    start: "11:00", end: "17:00", base_points: 3 },
    { id: "sdf-kapanis", name: "Kapanış Vardiyası", start: "14:00", end: "21:00", base_points: 5 },
  ]);

  // ─── Çalışma Saatleri (Cafe) ─────────────────────────────────────────────────
  const opHours = JSON.stringify({
    0: { isOpen: true,  open: "07:00", close: "21:00" },
    1: { isOpen: true,  open: "07:00", close: "21:00" },
    2: { isOpen: true,  open: "07:00", close: "21:00" },
    3: { isOpen: true,  open: "07:00", close: "21:00" },
    4: { isOpen: true,  open: "07:00", close: "21:00" },
    5: { isOpen: true,  open: "08:00", close: "22:00" },
    6: { isOpen: true,  open: "09:00", close: "21:00" },
  });

  // ─── Kurallar ────────────────────────────────────────────────────────────────
  const rules = JSON.stringify({
    max_weekly_hours: 45,
    min_rest_hours: 11,
    force_skills_match: false,
    overtime_allowed: false,
    clopening_min_rest_hours: 13,
    preferred_not_multiplier: 1.5,
    max_preferred_not_days: 1,
    change_compensation_points: 2,
  });

  // ─── Kapasite Matrisi ─────────────────────────────────────────────────────
  // Hafta içi (0–4): Açılış 1, Öğle 1, Kapanış 1
  // Hafta sonu (5–6): Açılış 2, Kapanış 2
  const demandMatrix = JSON.stringify({
    "sdf-acilis":  { "0": 1, "1": 1, "2": 1, "3": 1, "4": 1, "5": 2, "6": 2 },
    "sdf-ogle":    { "0": 1, "1": 1, "2": 1, "3": 1, "4": 1, "5": 0, "6": 0 },
    "sdf-kapanis": { "0": 1, "1": 1, "2": 1, "3": 1, "4": 1, "5": 2, "6": 2 },
  });

  // ─── Şubeler ──────────────────────────────────────────────────────────────────
  const LOC_MODA = "LOC-MODA";
  const LOC_NIS  = "LOC-NIS";

  db.prepare(`
    INSERT INTO locations (id, org_id, name, operating_hours, shift_definitions, rules, demand_matrix)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(LOC_MODA, ORG, "Brûlée Cafe — Moda", opHours, shiftDefs, rules, demandMatrix);

  db.prepare(`
    INSERT INTO locations (id, org_id, name, operating_hours, shift_definitions, rules, demand_matrix)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(LOC_NIS, ORG, "Brûlée Cafe — Nişantaşı", opHours, shiftDefs, rules, demandMatrix);

  // ─── Departmanlar ────────────────────────────────────────────────────────────
  const deps = [
    ["DEP-MODA-BAR",    LOC_MODA, "Bar & Espresso"],
    ["DEP-MODA-SERVIS", LOC_MODA, "Servis"],
    ["DEP-NIS-BAR",     LOC_NIS,  "Bar & Espresso"],
    ["DEP-NIS-SERVIS",  LOC_NIS,  "Servis"],
  ];
  for (const [id, locId, name] of deps) {
    db.prepare("INSERT INTO departments (id, location_id, name) VALUES (?, ?, ?)").run(id, locId, name);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function addP(id, locId, deptId, access, name, empId, email, title, score) {
    db.prepare(`
      INSERT INTO personnel
        (id, org_id, primary_location_id, assigned_location_ids, department_id,
         user_access_level, name, employee_id, email, title,
         employment_type, status, max_weekly_hours, prev_score,
         hero_count, no_show_count, late_count, annual_leave_days_total,
         created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?, 'full_time','active',45,?, 0,0,0,14, ?,?)
    `).run(id, ORG, locId, JSON.stringify([locId]), deptId,
           access, name, empId, email, title, score ?? 0, now, now);
  }

  function addU(id, personnelId, username, email, role, locId, deptId, name) {
    db.prepare(`
      INSERT INTO users
        (id, personnel_id, username, email, password_hash, role, org_id, location_id, department_id, name, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, personnelId, username, email, pw, role, ORG, locId, deptId, name, now);
  }

  // ─── Veri Ekleme ─────────────────────────────────────────────────────────────
  db.transaction(() => {

    // ── Cafe Sahibi (Admin) ──────────────────────────────────────────────────
    addU("U-SAHIP", null, "sahip", "sahip@brulee.com", "admin", null, null, "Brûlée Cafe");

    // ━━━━━━━━━━━━━━━━ BRÛLÉE CAFE — MODA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Müdür
    addP("P-MODA-MGR", LOC_MODA, null,             "manager",  "Ayşe Tunç",    "EMP-1001", "mudur.moda@brulee.com",   "Cafe Müdürü",   20);
    addU("U-MODA-MGR", "P-MODA-MGR", "mudur.moda", "mudur.moda@brulee.com",   "manager",  LOC_MODA, null,            "Ayşe Tunç");

    // Bar & Espresso — Baristalar
    addP("P-MODA-B1",  LOC_MODA, "DEP-MODA-BAR",  "employee", "Berk Çelik",   "EMP-1002", "berk.celik@brulee.com",   "Barista",       14);
    addU("U-MODA-B1",  "P-MODA-B1",  "berk.celik",  "berk.celik@brulee.com",  "employee", LOC_MODA, "DEP-MODA-BAR",  "Berk Çelik");

    addP("P-MODA-B2",  LOC_MODA, "DEP-MODA-BAR",  "employee", "Seda Kara",    "EMP-1003", "seda.kara@brulee.com",    "Barista",        8);
    addU("U-MODA-B2",  "P-MODA-B2",  "seda.kara",   "seda.kara@brulee.com",   "employee", LOC_MODA, "DEP-MODA-BAR",  "Seda Kara");

    // Servis — Garson
    addP("P-MODA-S1",  LOC_MODA, "DEP-MODA-SERVIS", "employee", "Cem Aydın",  "EMP-1004", "cem.aydin@brulee.com",    "Servis Görevlisi", 11);
    addU("U-MODA-S1",  "P-MODA-S1",  "cem.aydin",   "cem.aydin@brulee.com",   "employee", LOC_MODA, "DEP-MODA-SERVIS", "Cem Aydın");

    // ━━━━━━━━━━━━━━━━ BRÛLÉE CAFE — NİŞANTAŞI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Müdür
    addP("P-NIS-MGR",  LOC_NIS,  null,             "manager",  "Hakan Şen",    "EMP-2001", "mudur.nisantasi@brulee.com", "Cafe Müdürü",   18);
    addU("U-NIS-MGR",  "P-NIS-MGR",  "mudur.nisantasi", "mudur.nisantasi@brulee.com", "manager", LOC_NIS, null,         "Hakan Şen");

    // Bar & Espresso — Baristalar
    addP("P-NIS-B1",   LOC_NIS,  "DEP-NIS-BAR",   "employee", "Lale Özcan",   "EMP-2002", "lale.ozcan@brulee.com",   "Barista",        9);
    addU("U-NIS-B1",   "P-NIS-B1",   "lale.ozcan",  "lale.ozcan@brulee.com",  "employee", LOC_NIS,  "DEP-NIS-BAR",   "Lale Özcan");

    addP("P-NIS-B2",   LOC_NIS,  "DEP-NIS-BAR",   "employee", "Mert Güler",   "EMP-2003", "mert.guler@brulee.com",   "Barista",        5);
    addU("U-NIS-B2",   "P-NIS-B2",   "mert.guler",  "mert.guler@brulee.com",  "employee", LOC_NIS,  "DEP-NIS-BAR",   "Mert Güler");

    // Servis — Garson
    addP("P-NIS-S1",   LOC_NIS,  "DEP-NIS-SERVIS","employee", "İpek Arslan",  "EMP-2004", "ipek.arslan@brulee.com",  "Servis Görevlisi", 7);
    addU("U-NIS-S1",   "P-NIS-S1",   "ipek.arslan", "ipek.arslan@brulee.com", "employee", LOC_NIS,  "DEP-NIS-SERVIS","İpek Arslan");

  })();

  db.pragma("foreign_keys = ON");
  db.close();

  // ─── Özet ────────────────────────────────────────────────────────────────────
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║            BRÛLÉE CAFE — Test Verisi Hazır                   ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  Tüm şifreler: 1234                                          ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  👑  CAFe SAHİBİ (Admin)                                     ║");
  console.log("║     sahip@brulee.com                                         ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  ☕  BRÛLÉE CAFE — MODA                                      ║");
  console.log("║  Müdür:  mudur.moda@brulee.com        (Ayşe Tunç)            ║");
  console.log("║  Bar:    berk.celik@brulee.com        (Berk Çelik — Barista) ║");
  console.log("║          seda.kara@brulee.com         (Seda Kara — Barista)  ║");
  console.log("║  Servis: cem.aydin@brulee.com         (Cem Aydın — Garson)   ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  ☕  BRÛLÉE CAFE — NİŞANTAŞI                                ║");
  console.log("║  Müdür:  mudur.nisantasi@brulee.com   (Hakan Şen)            ║");
  console.log("║  Bar:    lale.ozcan@brulee.com        (Lale Özcan — Barista) ║");
  console.log("║          mert.guler@brulee.com        (Mert Güler — Barista) ║");
  console.log("║  Servis: ipek.arslan@brulee.com       (İpek Arslan — Garson) ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  Vardiyalar: Açılış 07-13 | Öğle 11-17 | Kapanış 14-21      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
}

seedBrulee().catch(console.error);
