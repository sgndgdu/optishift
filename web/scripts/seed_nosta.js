/* eslint-disable @typescript-eslint/no-require-imports */
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "optishift.db");

async function seedNosta() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = OFF");

  // ─── Temizle ────────────────────────────────────────────────────────────────
  console.log("🗑️  Tüm veriler temizleniyor...");
  const tables = [
    "notifications", "availability", "score_history", "break_sessions",
    "shift_swap_requests", "shift_edit_requests", "open_shifts", "shift_assignments",
    "leave_requests", "push_subscriptions", "messages", "password_reset_tokens",
    "invite_tokens", "users", "personnel", "departments", "locations", "organizations",
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
  const ORG = "ORG-NOSTA";

  // ─── Organizasyon ────────────────────────────────────────────────────────────
  db.prepare("INSERT INTO organizations (id, name) VALUES (?, ?)").run(ORG, "Nosta Restoran Grubu");

  // ─── Vardiya Tanımları & Çalışma Saatleri ────────────────────────────────────
  const shiftDefs = JSON.stringify([
    { id: "sdf-ogle",  name: "Öğle Vardiyası",   start: "11:00", end: "17:00", base_points: 3 },
    { id: "sdf-aksam", name: "Akşam Vardiyası",  start: "17:00", end: "23:00", base_points: 5 },
    { id: "sdf-gece",  name: "Kapanış Vardiyası", start: "20:00", end: "02:00", base_points: 8 },
  ]);
  const opHours = JSON.stringify({
    0: { isOpen: true, open: "11:00", close: "23:00" },
    1: { isOpen: true, open: "11:00", close: "23:00" },
    2: { isOpen: true, open: "11:00", close: "23:00" },
    3: { isOpen: true, open: "11:00", close: "23:00" },
    4: { isOpen: true, open: "11:00", close: "23:00" },
    5: { isOpen: true, open: "12:00", close: "01:00" },
    6: { isOpen: true, open: "12:00", close: "01:00" },
  });
  const rules = JSON.stringify({
    max_weekly_hours: 45, min_rest_hours: 11, force_skills_match: false, overtime_allowed: true,
  });

  // ─── Mekanlar ─────────────────────────────────────────────────────────────────
  const LOC_KDK = "LOC-KDK";
  const LOC_BSK = "LOC-BSK";
  db.prepare("INSERT INTO locations (id, org_id, name, operating_hours, shift_definitions, rules) VALUES (?, ?, ?, ?, ?, ?)")
    .run(LOC_KDK, ORG, "Nosta Kadıköy", opHours, shiftDefs, rules);
  db.prepare("INSERT INTO locations (id, org_id, name, operating_hours, shift_definitions, rules) VALUES (?, ?, ?, ?, ?, ?)")
    .run(LOC_BSK, ORG, "Nosta Beşiktaş", opHours, shiftDefs, rules);

  // ─── Departmanlar ────────────────────────────────────────────────────────────
  const deps = [
    ["DEP-KDK-BAR", LOC_KDK, "Bar"],
    ["DEP-KDK-MUT", LOC_KDK, "Mutfak"],
    ["DEP-KDK-SAL", LOC_KDK, "Salon"],
    ["DEP-BSK-BAR", LOC_BSK, "Bar"],
    ["DEP-BSK-MUT", LOC_BSK, "Mutfak"],
    ["DEP-BSK-SAL", LOC_BSK, "Salon"],
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
      VALUES (?,?,?,?,?,?,?,?,?,?,  'full_time','active',45,?,  0,0,0,14,  ?,?)
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

    // ── Patron (Admin) ───────────────────────────────────────────────────────
    addU("U-PATRON", null, "patron", "patron@nosta.com", "admin", null, null, "Nosta Restoran Grubu");

    // ━━━━━━━━━━━━━━━━ NOSTA KADIKÖY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Müdür
    addP("P-KDK-MGR", LOC_KDK, null,          "manager",  "Aylin Çelik",    "EMP-1001", "mudur.kadikoy@nosta.com",    "Restoran Müdürü",   42);
    addU("U-KDK-MGR", "P-KDK-MGR", "mudur.kadikoy",    "mudur.kadikoy@nosta.com",    "manager",  LOC_KDK, null,          "Aylin Çelik");

    // Bar → Barmenler
    addP("P-KDK-B1",  LOC_KDK, "DEP-KDK-BAR", "employee", "Kaan Yıldız",    "EMP-1002", "kaan.yildiz@nosta.com",      "Barmen",            28);
    addU("U-KDK-B1",  "P-KDK-B1",  "kaan.yildiz",      "kaan.yildiz@nosta.com",      "employee", LOC_KDK, "DEP-KDK-BAR", "Kaan Yıldız");

    addP("P-KDK-B2",  LOC_KDK, "DEP-KDK-BAR", "employee", "Selin Arslan",   "EMP-1003", "selin.arslan@nosta.com",     "Barmen",            24);
    addU("U-KDK-B2",  "P-KDK-B2",  "selin.arslan",     "selin.arslan@nosta.com",     "employee", LOC_KDK, "DEP-KDK-BAR", "Selin Arslan");

    // Mutfak → Aşçılar
    addP("P-KDK-M1",  LOC_KDK, "DEP-KDK-MUT", "employee", "Hüseyin Öztürk","EMP-1004", "huseyin.ozturk@nosta.com",   "Baş Aşçı",          55);
    addU("U-KDK-M1",  "P-KDK-M1",  "huseyin.ozturk",   "huseyin.ozturk@nosta.com",   "employee", LOC_KDK, "DEP-KDK-MUT", "Hüseyin Öztürk");

    addP("P-KDK-M2",  LOC_KDK, "DEP-KDK-MUT", "employee", "Elif Kaya",      "EMP-1005", "elif.kaya@nosta.com",        "Aşçı",              31);
    addU("U-KDK-M2",  "P-KDK-M2",  "elif.kaya",        "elif.kaya@nosta.com",        "employee", LOC_KDK, "DEP-KDK-MUT", "Elif Kaya");

    addP("P-KDK-M3",  LOC_KDK, "DEP-KDK-MUT", "employee", "Murat Doğan",    "EMP-1006", "murat.dogan@nosta.com",      "Aşçı Yardımcısı",  18);
    addU("U-KDK-M3",  "P-KDK-M3",  "murat.dogan",      "murat.dogan@nosta.com",      "employee", LOC_KDK, "DEP-KDK-MUT", "Murat Doğan");

    // Salon → Garsonlar
    addP("P-KDK-G1",  LOC_KDK, "DEP-KDK-SAL", "employee", "Zeynep Şahin",   "EMP-1007", "zeynep.sahin@nosta.com",     "Kıdemli Garson",   47);
    addU("U-KDK-G1",  "P-KDK-G1",  "zeynep.sahin",     "zeynep.sahin@nosta.com",     "employee", LOC_KDK, "DEP-KDK-SAL", "Zeynep Şahin");

    addP("P-KDK-G2",  LOC_KDK, "DEP-KDK-SAL", "employee", "Emre Demir",     "EMP-1008", "emre.demir@nosta.com",       "Garson",            33);
    addU("U-KDK-G2",  "P-KDK-G2",  "emre.demir",       "emre.demir@nosta.com",       "employee", LOC_KDK, "DEP-KDK-SAL", "Emre Demir");

    addP("P-KDK-G3",  LOC_KDK, "DEP-KDK-SAL", "employee", "Buse Yılmaz",    "EMP-1009", "buse.yilmaz@nosta.com",      "Garson",            21);
    addU("U-KDK-G3",  "P-KDK-G3",  "buse.yilmaz",      "buse.yilmaz@nosta.com",      "employee", LOC_KDK, "DEP-KDK-SAL", "Buse Yılmaz");

    addP("P-KDK-G4",  LOC_KDK, "DEP-KDK-SAL", "employee", "Tolga Aydın",    "EMP-1010", "tolga.aydin@nosta.com",      "Garson",            12);
    addU("U-KDK-G4",  "P-KDK-G4",  "tolga.aydin",      "tolga.aydin@nosta.com",      "employee", LOC_KDK, "DEP-KDK-SAL", "Tolga Aydın");

    // ━━━━━━━━━━━━━━━━ NOSTA BEŞİKTAŞ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Müdür
    addP("P-BSK-MGR", LOC_BSK, null,          "manager",  "Barış Koç",      "EMP-2001", "mudur.besiktas@nosta.com",   "Restoran Müdürü",   38);
    addU("U-BSK-MGR", "P-BSK-MGR", "mudur.besiktas",   "mudur.besiktas@nosta.com",   "manager",  LOC_BSK, null,          "Barış Koç");

    // Bar → Barmenler
    addP("P-BSK-B1",  LOC_BSK, "DEP-BSK-BAR", "employee", "Deniz Çetin",    "EMP-2002", "deniz.cetin@nosta.com",      "Barmen",            26);
    addU("U-BSK-B1",  "P-BSK-B1",  "deniz.cetin",      "deniz.cetin@nosta.com",      "employee", LOC_BSK, "DEP-BSK-BAR", "Deniz Çetin");

    addP("P-BSK-B2",  LOC_BSK, "DEP-BSK-BAR", "employee", "Özge Bulut",     "EMP-2003", "ozge.bulut@nosta.com",       "Barmen",            19);
    addU("U-BSK-B2",  "P-BSK-B2",  "ozge.bulut",       "ozge.bulut@nosta.com",       "employee", LOC_BSK, "DEP-BSK-BAR", "Özge Bulut");

    // Mutfak → Aşçılar
    addP("P-BSK-M1",  LOC_BSK, "DEP-BSK-MUT", "employee", "Ahmet Sarı",     "EMP-2004", "ahmet.sari@nosta.com",       "Baş Aşçı",          60);
    addU("U-BSK-M1",  "P-BSK-M1",  "ahmet.sari",       "ahmet.sari@nosta.com",       "employee", LOC_BSK, "DEP-BSK-MUT", "Ahmet Sarı");

    addP("P-BSK-M2",  LOC_BSK, "DEP-BSK-MUT", "employee", "Fatma Güler",    "EMP-2005", "fatma.guler@nosta.com",      "Aşçı",              44);
    addU("U-BSK-M2",  "P-BSK-M2",  "fatma.guler",      "fatma.guler@nosta.com",      "employee", LOC_BSK, "DEP-BSK-MUT", "Fatma Güler");

    addP("P-BSK-M3",  LOC_BSK, "DEP-BSK-MUT", "employee", "Ömer Polat",     "EMP-2006", "omer.polat@nosta.com",       "Aşçı Yardımcısı",   8);
    addU("U-BSK-M3",  "P-BSK-M3",  "omer.polat",       "omer.polat@nosta.com",       "employee", LOC_BSK, "DEP-BSK-MUT", "Ömer Polat");

    // Salon → Garsonlar
    addP("P-BSK-G1",  LOC_BSK, "DEP-BSK-SAL", "employee", "Nur Arslan",     "EMP-2007", "nur.arslan@nosta.com",       "Kıdemli Garson",   52);
    addU("U-BSK-G1",  "P-BSK-G1",  "nur.arslan",       "nur.arslan@nosta.com",       "employee", LOC_BSK, "DEP-BSK-SAL", "Nur Arslan");

    addP("P-BSK-G2",  LOC_BSK, "DEP-BSK-SAL", "employee", "Can Yıldırım",   "EMP-2008", "can.yildirim@nosta.com",     "Garson",            35);
    addU("U-BSK-G2",  "P-BSK-G2",  "can.yildirim",     "can.yildirim@nosta.com",     "employee", LOC_BSK, "DEP-BSK-SAL", "Can Yıldırım");

    addP("P-BSK-G3",  LOC_BSK, "DEP-BSK-SAL", "employee", "Pınar Şen",      "EMP-2009", "pinar.sen@nosta.com",        "Garson",            22);
    addU("U-BSK-G3",  "P-BSK-G3",  "pinar.sen",        "pinar.sen@nosta.com",        "employee", LOC_BSK, "DEP-BSK-SAL", "Pınar Şen");

    addP("P-BSK-G4",  LOC_BSK, "DEP-BSK-SAL", "employee", "Ali Rıza Öz",    "EMP-2010", "ali.riza@nosta.com",         "Garson",             6);
    addU("U-BSK-G4",  "P-BSK-G4",  "ali.riza",         "ali.riza@nosta.com",         "employee", LOC_BSK, "DEP-BSK-SAL", "Ali Rıza Öz");

  })();

  db.pragma("foreign_keys = ON");
  db.close();

  // ─── Özet ────────────────────────────────────────────────────────────────────
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║         NOSTA RESTORAN GRUBU — Test Verisi Hazır          ║");
  console.log("╠═══════════════════════════════════════════════════════════╣");
  console.log("║  Tüm şifreler: 1234                                       ║");
  console.log("╠═══════════════════════════════════════════════════════════╣");
  console.log("║  👑  PATRON (Admin)                                        ║");
  console.log("║     patron@nosta.com                                      ║");
  console.log("╠═══════════════════════════════════════════════════════════╣");
  console.log("║  🍽️   NOSTA KADIKÖY                                        ║");
  console.log("║  Müdür: mudur.kadikoy@nosta.com  (Aylin Çelik)            ║");
  console.log("║  Bar:                                                     ║");
  console.log("║    kaan.yildiz@nosta.com         (Kaan Yıldız — Barmen)   ║");
  console.log("║    selin.arslan@nosta.com         (Selin Arslan — Barmen)  ║");
  console.log("║  Mutfak:                                                  ║");
  console.log("║    huseyin.ozturk@nosta.com       (Hüseyin Öztürk — Baş Aşçı)║");
  console.log("║    elif.kaya@nosta.com            (Elif Kaya — Aşçı)       ║");
  console.log("║    murat.dogan@nosta.com          (Murat Doğan — Aş. Yrd.)║");
  console.log("║  Salon:                                                   ║");
  console.log("║    zeynep.sahin@nosta.com         (Zeynep Şahin — Kıd. Garson)║");
  console.log("║    emre.demir@nosta.com           (Emre Demir — Garson)   ║");
  console.log("║    buse.yilmaz@nosta.com          (Buse Yılmaz — Garson)  ║");
  console.log("║    tolga.aydin@nosta.com          (Tolga Aydın — Garson)  ║");
  console.log("╠═══════════════════════════════════════════════════════════╣");
  console.log("║  🍹  NOSTA BEŞİKTAŞ                                       ║");
  console.log("║  Müdür: mudur.besiktas@nosta.com  (Barış Koç)             ║");
  console.log("║  Bar:                                                     ║");
  console.log("║    deniz.cetin@nosta.com          (Deniz Çetin — Barmen)  ║");
  console.log("║    ozge.bulut@nosta.com           (Özge Bulut — Barmen)   ║");
  console.log("║  Mutfak:                                                  ║");
  console.log("║    ahmet.sari@nosta.com           (Ahmet Sarı — Baş Aşçı)║");
  console.log("║    fatma.guler@nosta.com          (Fatma Güler — Aşçı)    ║");
  console.log("║    omer.polat@nosta.com           (Ömer Polat — Aş. Yrd.) ║");
  console.log("║  Salon:                                                   ║");
  console.log("║    nur.arslan@nosta.com           (Nur Arslan — Kıd. Garson)║");
  console.log("║    can.yildirim@nosta.com         (Can Yıldırım — Garson) ║");
  console.log("║    pinar.sen@nosta.com            (Pınar Şen — Garson)    ║");
  console.log("║    ali.riza@nosta.com             (Ali Rıza Öz — Garson)  ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
}

seedNosta().catch(console.error);
