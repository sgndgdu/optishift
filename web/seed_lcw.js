/* eslint-disable @typescript-eslint/no-require-imports */
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const path = require("path");

const DB_PATH = path.join(__dirname, "optishift.db");
const db = new Database(DB_PATH);

async function seedLCW() {
  console.log("Seeding LC Waikiki data...");
  const now = Math.floor(Date.now() / 1000);
  
  const orgId = "ORG-LCW";
  
  // Create Organization
  db.prepare("INSERT OR REPLACE INTO organizations (id, name) VALUES (?, ?)").run(orgId, "LC Waikiki");
  
  // Create Locations
  const locKadikoy = "LOC-KADIKOY";
  const locModa = "LOC-MODA";
  db.prepare("INSERT OR REPLACE INTO locations (id, org_id, name) VALUES (?, ?, ?)").run(locKadikoy, orgId, "LCW Kadıköy Şubesi");
  db.prepare("INSERT OR REPLACE INTO locations (id, org_id, name) VALUES (?, ?, ?)").run(locModa, orgId, "LCW Moda Şubesi");

  const passwordHash = bcrypt.hashSync("123456", 10);
  
  // Helper to insert personnel and user
  function addPerson(name, role, locId, assignedLocIds) {
    const personnelId = `P-${Date.now()}-${Math.floor(Math.random()*10000)}`;
    const userId = `U-${Date.now()}-${Math.floor(Math.random()*10000)}`;
    const email = `${name.toLowerCase().replace(/ /g, ".")}@lcw.com`;
    const employeeId = `EMP-${Math.floor(Math.random() * 90000) + 10000}`;
    
    db.prepare(`
      INSERT INTO personnel (id, org_id, primary_location_id, assigned_location_ids, user_access_level, name, employee_id, email, title, employment_type, status, max_weekly_hours, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'full_time', 'active', 45, ?, ?)
    `).run(personnelId, orgId, locId, JSON.stringify(assignedLocIds), role, name, employeeId, email, role === "manager" ? "Mağaza Müdürü" : "Satış Danışmanı", now, now);

    db.prepare(`
      INSERT INTO users (id, personnel_id, email, password_hash, role, org_id, location_id, name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, personnelId, email, passwordHash, role, orgId, locId, name, now);
    
    console.log(`Added: ${name} (${email}) - 123456`);
  }

  db.transaction(() => {
    // Kadıköy
    addPerson("Ahmet Mudur Kadikoy", "manager", locKadikoy, [locKadikoy]);
    addPerson("Ayse Yrd Kadikoy", "supervisor", locKadikoy, [locKadikoy]);
    // Personel 1 is a JOKER
    addPerson("Joker Hasan Kadikoy", "employee", locKadikoy, [locKadikoy, locModa]); 
    addPerson("Cemil Kadikoy", "employee", locKadikoy, [locKadikoy]);
    addPerson("Derya Kadikoy", "employee", locKadikoy, [locKadikoy]);
    addPerson("Efe Kadikoy", "employee", locKadikoy, [locKadikoy]);
    addPerson("Figen Kadikoy", "employee", locKadikoy, [locKadikoy]);

    // Moda
    addPerson("Mehmet Mudur Moda", "manager", locModa, [locModa]);
    addPerson("Fatma Yrd Moda", "supervisor", locModa, [locModa]);
    addPerson("Gamze Moda", "employee", locModa, [locModa]);
    addPerson("Hakan Moda", "employee", locModa, [locModa]);
    addPerson("Irmak Moda", "employee", locModa, [locModa]);
    addPerson("Kaan Moda", "employee", locModa, [locModa]);
    addPerson("Lale Moda", "employee", locModa, [locModa]);
  })();

  console.log("Seeding complete.");
  db.close();
}

seedLCW().catch(console.error);
