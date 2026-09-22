/**
 * Mega Stres Testi Seed'i — canlı (prod Neon) veritabanı.
 *
 * 5 şube (kafe/otel/fabrika/perakende/restoran), toplam 150 personel,
 * ~13 haftalık (≈3 ay) gerçekleşmiş vardiya/check-in/check-out/adalet puanı
 * geçmişi + onaylanmış izinler + mesai kayıtları + mola verileri, son 1
 * haftalık takas/teklif verisi. Her şubede farklı bir opsiyonel modül açık
 * bırakılır (kiosk/tip/bidding/task/forecast) — playwright/e2e_mega_test.spec.ts
 * bu modülleri ve genel yükü test eder.
 *
 * BİLİNÇLİ OLARAK BOŞ BIRAKILAN: her şubenin GELECEK haftası (ve bu haftanın
 * henüz gelmemiş günleri) — Playwright testi "Otomatik Oluştur" butonunu
 * gerçek OR-Tools çağrısıyla test edebilsin diye (buton sadece boş haftada
 * görünür, bkz. app/(app)/schedule/page.tsx).
 *
 * Çalıştırma: cd web && node scripts/seed_mega_test.mjs
 * Idempotent: org-mega-test'e ait tüm veriyi silip yeniden kurar.
 */
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const dbUrl = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (!dbUrl) throw new Error("DATABASE_URL bulunamadı (.env.local)");
const sql = neon(dbUrl);

const ORG = "org-mega-test";
const KIOSK_PIN = "4711";
const PASSWORD = "1234";
const PAST_WEEKS = 13; // ~3 ay tam geçmiş hafta
const now = Math.floor(Date.now() / 1000);

// ─── Tarih yardımcıları (lib/date.ts ile birebir aynı mantık) ────────────────
function weekStartOffset(offsetWeeks) {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7) + offsetWeeks * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dateForWeekDay(weekStart, day) {
  const [y, m, d] = weekStart.split("-").map(Number);
  const dt = new Date(y, m - 1, d + day);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function dateToTs(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.floor(new Date(y, m - 1, d).getTime() / 1000);
}
function isoDateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function weekStartAndDayForDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // 0=Pzt
  const monday = new Date(dt);
  monday.setDate(dt.getDate() - dow);
  const ws = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  return { weekStart: ws, day: dow };
}
const THIS_MONDAY = weekStartOffset(0);
const TODAY_DAY = (new Date().getDay() + 6) % 7; // 0=Pzt...6=Paz
const LAST_FULL_WEEK = weekStartOffset(-1);

function shiftHoursOf(sd) {
  const [sh, sm] = sd.start.split(":").map(Number);
  const [eh, em] = sd.end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 1440;
  return Math.round(diff / 60 * 10) / 10;
}
const isWeekend = (day) => day === 5 || day === 6;
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const wk = (mf, sat, sun) => ({ 0: mf, 1: mf, 2: mf, 3: mf, 4: mf, 5: sat, 6: sun });

const FIRST = ["Ali", "Mehmet", "Ayşe", "Fatma", "Mustafa", "Emine", "Ahmet", "Hatice", "Hüseyin", "Zeynep", "İbrahim", "Elif", "Hasan", "Meryem", "Osman", "Şerife", "Yusuf", "Sultan", "Ramazan", "Hanife", "Halil", "Merve", "Süleyman", "Esra", "İsmail", "Fadime", "Ömer", "Özlem", "Murat", "Yasemin", "Abdullah", "Emel", "Recep", "Havva", "Salih", "Zehra", "Kadir", "Songül", "Kemal", "Dilek", "Ferhat", "Gül", "Serkan", "Nurcan", "Volkan", "Sevim", "Barış", "Tuğba", "Onur", "Pınar", "Burak", "Ebru", "Cem", "Selin", "Deniz", "Aslı", "Engin", "İpek"];
const LAST = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Yıldırım", "Öztürk", "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin", "Kara", "Koç", "Kurt", "Özkan", "Şimşek", "Polat", "Korkmaz", "Erdoğan", "Aksoy", "Güneş", "Bulut", "Taş", "Işık", "Turan", "Toprak", "Sarı", "Ateş", "Uçar", "Acar", "Güler", "Tekin", "Bozkurt", "Keskin", "Duman", "Yavuz", "Sezer", "Vural", "Tunç", "Bal", "Erdem", "Uysal", "Bilgin", "Karaca", "Şen", "Akın"];
const nameAt = (i) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + 3) % LAST.length]}`;

// ─── Şube tanımları ───────────────────────────────────────────────────────────
const BASE_RULES = {
  max_weekly_hours: 45,
  min_rest_hours: 11,
  availability_collection_enabled: true,
  simple_mode: false,
  hard_shift_points: 3,
  hard_shift_weekend: true,
  hard_shift_night: true,
  hard_shift_preferred_not: false,
  hero_bonus_points: 5,
  force_bonus_points: 8,
  fairness_window_weeks: 8,
  pre_publish_check: true,
  overtime_threshold_hours: 45,
  clopening_enabled: true,
  clopening_min_rest_hours: 13,
};

const LOCATIONS = [
  {
    id: "loc-mega-kafe", name: "Zeytin Sahil Kafe", sector: "kafe",
    shiftDefs: [
      { id: "s-sabah", name: "Sabah", start: "08:00", end: "16:00", base_points: 4 },
      { id: "s-aksam", name: "Akşam", start: "16:00", end: "24:00", base_points: 5 },
    ],
    rules: { ...BASE_RULES, kiosk_mode_enabled: true, simple_mode: true },
    departments: [
      { id: "dept-mega-kafe-kasa", name: "Kasa", role: "kasa", count: 10, wage: [90, 105],
        demand: { "s-sabah": wk(2, 3, 3), "s-aksam": wk(2, 3, 3) } },
      { id: "dept-mega-kafe-mutfak", name: "Mutfak", role: "mutfak", count: 10, wage: [95, 115],
        demand: { "s-sabah": wk(2, 2, 3), "s-aksam": wk(2, 3, 3) } },
    ],
  },
  {
    id: "loc-mega-otel", name: "Boğaz Manzara Otel", sector: "otel",
    shiftDefs: [
      { id: "s-sabah", name: "Sabah", start: "07:00", end: "15:00", base_points: 4 },
      { id: "s-aksam", name: "Akşam", start: "15:00", end: "23:00", base_points: 5 },
      { id: "s-gece", name: "Gece", start: "23:00", end: "07:00", base_points: 8, is_night: true },
    ],
    rules: { ...BASE_RULES, tip_pooling_enabled: true, consecutive_night_weeks_enabled: false },
    departments: [
      { id: "dept-mega-otel-resepsiyon", name: "Resepsiyon", role: "resepsiyon", count: 10, wage: [105, 130],
        demand: { "s-sabah": wk(2, 2, 2), "s-aksam": wk(2, 2, 2), "s-gece": wk(1, 1, 1) } },
      { id: "dept-mega-otel-kat", name: "Kat Hizmetleri", role: "kat-hizmetleri", count: 15, wage: [90, 100],
        demand: { "s-sabah": wk(3, 4, 4), "s-aksam": wk(3, 3, 3), "s-gece": wk(0, 0, 0) } },
      { id: "dept-mega-otel-mutfak", name: "Mutfak", role: "mutfak", count: 10, wage: [100, 120],
        demand: { "s-sabah": wk(2, 2, 2), "s-aksam": wk(2, 2, 2), "s-gece": wk(1, 1, 1) } },
    ],
  },
  {
    id: "loc-mega-fabrika", name: "Marmara Üretim Tesisi", sector: "fabrika",
    shiftDefs: [
      { id: "s-sabah", name: "Sabah", start: "06:00", end: "14:00", base_points: 4 },
      { id: "s-aksam", name: "Akşam", start: "14:00", end: "22:00", base_points: 5 },
      { id: "s-gece", name: "Gece", start: "22:00", end: "05:30", base_points: 8, is_night: true },
    ],
    rules: { ...BASE_RULES, shift_bidding_enabled: true, compliance_tracking_enabled: true, availability_collection_enabled: false,
      // Chrome'dan manuel doğrulandıktan sonra (bkz. konuşma geçmişi) Playwright
      // suite'i kendi başına tekrar çalıştırılabilsin diye açık bırakıldı.
      handover_log_enabled: true, fatigue_radar_enabled: true },
    departments: [
      { id: "dept-mega-fab-pres", name: "Pres Hattı", role: "pres-operatörü", count: 15, wage: [105, 135],
        demand: { "s-sabah": wk(3, 2, 2), "s-aksam": wk(3, 2, 2), "s-gece": wk(2, 1, 1) } },
      { id: "dept-mega-fab-montaj", name: "Montaj Hattı", role: "montaj", count: 20, wage: [95, 115],
        demand: { "s-sabah": wk(4, 3, 3), "s-aksam": wk(4, 3, 3), "s-gece": wk(2, 2, 2) } },
      { id: "dept-mega-fab-kalite", name: "Kalite Kontrol", role: "kalite-kontrol", count: 10, wage: [115, 135],
        demand: { "s-sabah": wk(2, 1, 1), "s-aksam": wk(1, 1, 1), "s-gece": wk(0, 0, 0) } },
    ],
  },
  {
    id: "loc-mega-perakende", name: "ModaPlus Mağaza", sector: "perakende",
    shiftDefs: [
      { id: "s-sabah", name: "Sabah", start: "09:00", end: "17:00", base_points: 4 },
      { id: "s-aksam", name: "Akşam", start: "13:00", end: "21:00", base_points: 5 },
    ],
    rules: { ...BASE_RULES, task_management_enabled: true },
    taskTemplates: { "*": ["Vitrin Düzeni Kontrolü", "Kasa Sayımı"] },
    departments: [
      { id: "dept-mega-pk-kasa", name: "Kasa", role: "kasa", count: 12, wage: [90, 105],
        demand: { "s-sabah": wk(2, 3, 3), "s-aksam": wk(2, 3, 4) } },
      { id: "dept-mega-pk-reyon", name: "Reyon", role: "reyon", count: 13, wage: [88, 100],
        demand: { "s-sabah": wk(2, 2, 3), "s-aksam": wk(2, 3, 4) } },
    ],
  },
  {
    id: "loc-mega-restoran", name: "Liman Restoran", sector: "restoran",
    shiftDefs: [
      { id: "s-ogle", name: "Öğle", start: "11:00", end: "16:00", base_points: 3 },
      { id: "s-aksam", name: "Akşam", start: "17:00", end: "24:00", base_points: 6 },
    ],
    rules: { ...BASE_RULES, forecasting_enabled: true },
    departments: [
      { id: "dept-mega-rs-salon", name: "Salon", role: "salon", count: 13, wage: [95, 110],
        demand: { "s-ogle": wk(2, 3, 3), "s-aksam": wk(3, 4, 5) } },
      { id: "dept-mega-rs-mutfak", name: "Mutfak", role: "mutfak", count: 12, wage: [100, 120],
        demand: { "s-ogle": wk(2, 2, 2), "s-aksam": wk(3, 3, 4) } },
    ],
  },
];

// ─── Personel üretimi ─────────────────────────────────────────────────────────
let pIdx = 0;
function makePerson(loc, dept, k) {
  const i = pIdx++;
  const employmentType = k > 0 && Math.random() < 0.3 ? "part_time" : "full_time";
  return {
    id: `P-MEGA-${String(i + 1).padStart(3, "0")}`,
    name: nameAt(i),
    employee_id: `MEGA-${2000 + i}`,
    primary_location_id: loc.id,
    department_id: dept.id,
    title: k === 0 ? `Kıdemli ${dept.name} Görevlisi` : `${dept.name} Görevlisi`,
    employment_type: employmentType,
    hourly_wage: randInt(dept.wage[0], dept.wage[1]),
    max_weekly_hours: employmentType === "part_time" ? 28 : 45,
    roles: [dept.role],
    night_restriction: null,
    hire_date: isoDateNDaysAgo(randInt(120, 1600)),
    kiosk: false,
  };
}
for (const loc of LOCATIONS) {
  for (const dept of loc.departments) {
    dept.people = Array.from({ length: dept.count }, (_, k) => makePerson(loc, dept, k));
  }
}

// Kiosk E2E testi için 2 kişi (kafe/kasa) — "bugün" check-in yapılmamış olarak kalacak
const KAFE = LOCATIONS[0];
const KAFE_KASA = KAFE.departments[0];
KAFE_KASA.people[0].kiosk = true;
KAFE_KASA.people[1].kiosk = true;

// Fabrika/Montaj: 1 gebe + 1 çırak (18 yaş altı) — gece yasağı senaryosu
const FABRIKA = LOCATIONS.find((l) => l.id === "loc-mega-fabrika");
const FAB_MONTAJ = FABRIKA.departments.find((d) => d.id === "dept-mega-fab-montaj");
FAB_MONTAJ.people[3].night_restriction = "pregnant";
FAB_MONTAJ.people[15].night_restriction = "under18";

// ── 2 Yeni Endüstriyel Modül E2E fixture'ları (loc-mega-fabrika) ─────────────
// rules.handover_log_enabled / rules.fatigue_radar_enabled BİLİNÇLİ OLARAK
// kapalı bırakılıyor (varsayılan) — Chrome'dan Ayarlar'dan açılıp gerçek
// toggle-tetikler-davranış akışı test edilecek. Burada sadece altta yatan
// veri deterministik hazırlanıyor.
const FATIGUE_TEST_PERSON = FAB_MONTAJ.people[0];   // kıdemli, gece kısıtı yok — 3 ardışık gece verilecek
const HANDOVER_TARGET_PERSON = FAB_MONTAJ.people[1]; // bugün "s-sabah" vardiyası, check-in engellenecek
const HANDOVER_AUTHOR_PERSON = FAB_MONTAJ.people[2]; // devir notunu "bırakan" kişi

const ALL_PEOPLE = LOCATIONS.flatMap((l) => l.departments.flatMap((d) => d.people));
const PEOPLE_BY_ID = new Map(ALL_PEOPLE.map((p) => [p.id, p]));
const TOTAL_PEOPLE = ALL_PEOPLE.length;

// ─── Batch insert / update yardımcıları ───────────────────────────────────────
async function batchInsert(table, columns, rows, chunkSize = 300) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const placeholders = chunk.map((row, ri) => {
      const base = ri * columns.length;
      return `(${columns.map((_, ci) => `$${base + ci + 1}`).join(",")})`;
    }).join(",");
    const params = chunk.flat();
    await sql(`INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders}`, params);
  }
}

async function batchUpdatePersonnelStats(rows, chunkSize = 200) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const valuesSql = chunk.map((_, ri) => {
      const b = ri * 5;
      return `($${b + 1},$${b + 2}::float,$${b + 3}::float,$${b + 4}::int,$${b + 5}::int)`;
    }).join(",");
    const params = chunk.flat();
    await sql(
      `UPDATE personnel AS p SET prev_score = v.prev_score, fairness_z_score = v.fairness_z_score,
         no_show_count = v.no_show_count, late_count = v.late_count
       FROM (VALUES ${valuesSql}) AS v(id, prev_score, fairness_z_score, no_show_count, late_count)
       WHERE p.id = v.id`,
      params,
    );
  }
}

// ─── Temizlik (idempotent) ─────────────────────────────────────────────────────
async function cleanup() {
  const pids = (await sql`SELECT id FROM personnel WHERE org_id = ${ORG}`).map((r) => r.id);
  const locIds = LOCATIONS.map((l) => l.id);
  if (pids.length) {
    await sql`DELETE FROM shift_tasks WHERE shift_assignment_id IN (SELECT id FROM shift_assignments WHERE personnel_id = ANY(${pids}))`;
    await sql`DELETE FROM shift_swap_requests WHERE requester_shift_id IN (SELECT id FROM shift_assignments WHERE personnel_id = ANY(${pids})) OR target_shift_id IN (SELECT id FROM shift_assignments WHERE personnel_id = ANY(${pids}))`;
    await sql`DELETE FROM shift_edit_requests WHERE personnel_id = ANY(${pids})`;
    await sql`DELETE FROM score_adjustments WHERE personnel_id = ANY(${pids})`;
    await sql`DELETE FROM score_history WHERE personnel_id = ANY(${pids})`;
    await sql`DELETE FROM break_sessions WHERE personnel_id = ANY(${pids})`;
    await sql`DELETE FROM overtime_records WHERE personnel_id = ANY(${pids})`;
    await sql`DELETE FROM leave_requests WHERE personnel_id = ANY(${pids})`;
    await sql`DELETE FROM notifications WHERE personnel_id = ANY(${pids})`;
    await sql`DELETE FROM availability WHERE personnel_id = ANY(${pids})`;
    await sql`DELETE FROM tip_allocations WHERE personnel_id = ANY(${pids})`;
    await sql`DELETE FROM shift_assignments WHERE personnel_id = ANY(${pids})`;
    await sql`DELETE FROM shift_handovers WHERE author_personnel_id = ANY(${pids}) OR read_by_personnel_id = ANY(${pids})`;
  }
  await sql`DELETE FROM shift_bids WHERE open_shift_id IN (SELECT id FROM open_shifts WHERE org_id = ${ORG})`;
  await sql`DELETE FROM open_shifts WHERE org_id = ${ORG}`;
  await sql`DELETE FROM tip_pools WHERE org_id = ${ORG}`;
  await sql`DELETE FROM personnel_documents WHERE org_id = ${ORG}`;
  await sql`DELETE FROM location_sales_data WHERE org_id = ${ORG}`;
  await sql`DELETE FROM users WHERE org_id = ${ORG}`;
  await sql`DELETE FROM personnel WHERE org_id = ${ORG}`;
  await sql`DELETE FROM departments WHERE location_id = ANY(${locIds})`;
  await sql`DELETE FROM locations WHERE org_id = ${ORG}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG}`;
  console.log("Eski mega-test verisi temizlendi.");
}

// ─── Org / Şube / Departman ─────────────────────────────────────────────────────
async function insertOrgLocationsDepartments() {
  await sql`INSERT INTO organizations (id, name, plan, subscription_status, created_at, last_activity_at)
            VALUES (${ORG}, ${"Mega Test Holding"}, 'pro', 'active', ${now}, ${now})`;
  for (const loc of LOCATIONS) {
    await sql`INSERT INTO locations (id, org_id, name, shift_definitions, rules, zone_quotas, task_templates)
              VALUES (${loc.id}, ${ORG}, ${loc.name}, ${JSON.stringify(loc.shiftDefs)},
                      ${JSON.stringify(loc.rules)}, ${"{}"}, ${loc.taskTemplates ? JSON.stringify(loc.taskTemplates) : null})`;
    for (const dept of loc.departments) {
      await sql`INSERT INTO departments (id, location_id, name, demand_matrix)
                VALUES (${dept.id}, ${loc.id}, ${dept.name}, ${JSON.stringify(dept.demand)})`;
    }
  }
  console.log(`${LOCATIONS.length} şube + ${LOCATIONS.reduce((a, l) => a + l.departments.length, 0)} departman eklendi.`);
}

// ─── Personel + Kullanıcılar ─────────────────────────────────────────────────────
async function insertPersonnel(kioskHash) {
  for (const p of ALL_PEOPLE) {
    await sql`INSERT INTO personnel (
        id, org_id, primary_location_id, assigned_location_ids, department_id,
        user_access_level, name, employee_id, hire_date, title, employment_type, status,
        roles, role_levels, max_weekly_hours, overtime_approved, hourly_wage,
        night_restriction, prev_score, fairness_z_score, no_show_count, late_count,
        kiosk_pin, kiosk_pin_set_at
      ) VALUES (
        ${p.id}, ${ORG}, ${p.primary_location_id}, ${JSON.stringify([p.primary_location_id])}, ${p.department_id},
        'employee', ${p.name}, ${p.employee_id}, ${p.hire_date}, ${p.title}, ${p.employment_type}, 'active',
        ${JSON.stringify(p.roles)}, ${"{}"}, ${p.max_weekly_hours}, ${p.employment_type === "full_time"}, ${p.hourly_wage},
        ${p.night_restriction}, 0, 50, 0, 0,
        ${p.kiosk ? kioskHash : null}, ${p.kiosk ? now : null}
      )`;
  }
  console.log(`${ALL_PEOPLE.length} personel eklendi.`);
}

async function insertUsers(pwHash) {
  await sql`INSERT INTO users (id, username, email, password_hash, role, org_id, location_id, name, display_title, approval_status)
            VALUES ('u-mega-admin', 'mega.admin', 'admin@megatest.demo', ${pwHash}, 'admin', ${ORG}, ${KAFE.id}, ${"Genel Müdür"}, ${"Admin"}, 'active')`;
  await sql`INSERT INTO users (id, username, email, password_hash, role, org_id, location_id, name, display_title, approval_status)
            VALUES ('u-mega-supervisor', 'mega.supervisor', 'supervisor@megatest.demo', ${pwHash}, 'supervisor', ${ORG}, NULL, ${"Bölge Direktörü"}, ${"Süpervizör"}, 'active')`;
  for (const loc of LOCATIONS) {
    const uid = `u-mega-mgr-${loc.sector}`;
    await sql`INSERT INTO users (id, username, email, password_hash, role, org_id, location_id, name, display_title, approval_status)
              VALUES (${uid}, ${`mega.mudur.${loc.sector}`}, ${`mudur.${loc.sector}@megatest.demo`}, ${pwHash}, 'manager', ${ORG}, ${loc.id}, ${`${loc.name} Müdürü`}, ${"Şube Müdürü"}, 'active')`;
    const testEmployee = loc.departments[0].people[loc.departments[0].people.length - 1];
    await sql`INSERT INTO users (id, personnel_id, username, email, password_hash, role, org_id, location_id, name, approval_status)
              VALUES (${`u-mega-emp-${loc.sector}`}, ${testEmployee.id}, ${`mega.calisan.${loc.sector}`}, ${`calisan.${loc.sector}@megatest.demo`}, ${pwHash}, 'employee', ${ORG}, ${loc.id}, ${testEmployee.name}, 'active')`;
  }
  // Devir-Teslim Defteri E2E testi için ayrı bir portal girişi — HANDOVER_TARGET_PERSON
  // (fabrika/montaj), bugün s-sabah vardiyası check-in bekliyor, okunmamış notu var.
  await sql`INSERT INTO users (id, personnel_id, username, email, password_hash, role, org_id, location_id, name, approval_status)
            VALUES ('u-mega-handover-target', ${HANDOVER_TARGET_PERSON.id}, 'mega.calisan.fabrika.montaj', 'calisan.fabrika.montaj@megatest.demo', ${pwHash}, 'employee', ${ORG}, ${FABRIKA.id}, ${HANDOVER_TARGET_PERSON.name}, 'active')`;
  console.log("Kullanıcılar oluşturuldu.");
}

// ─── Vardiya geçmişi üretimi (saf JS, DB'ye dokunmaz) ─────────────────────────
const ASSIGNMENTS = [];

function pushAssignment(loc, dept, person, weekStart, day, dateStr, sd, mode, forceNoCheckIn, countsForScore) {
  const hours = shiftHoursOf(sd);
  const hard = (isWeekend(day) && loc.rules.hard_shift_weekend) || (sd.is_night && loc.rules.hard_shift_night);
  const points = Math.round((hours * (sd.base_points / 5) + (hard ? loc.rules.hard_shift_points : 0)) * 10) / 10;
  const dayStartTs = dateToTs(dateStr);
  const [sh, sm] = sd.start.split(":").map(Number);
  const [eh, em] = sd.end.split(":").map(Number);
  let startTs = dayStartTs + sh * 3600 + sm * 60;
  let endTs = dayStartTs + eh * 3600 + em * 60;
  if (endTs <= startTs) endTs += 86400;

  let status, checkIn, checkOut, noShow = false, late = false;
  if (forceNoCheckIn) {
    status = "scheduled"; checkIn = null; checkOut = null;
  } else if (mode === "live") {
    status = "scheduled";
    if (Math.random() < 0.3) {
      checkIn = null; checkOut = null;
    } else {
      const lateMin = Math.random() < 0.15 ? randInt(1, 15) : 0;
      checkIn = startTs + lateMin * 60;
      checkOut = null;
      late = lateMin > 10;
    }
  } else if (Math.random() < 0.04) {
    status = "absent"; checkIn = null; checkOut = null; noShow = true;
  } else {
    status = "completed";
    const lateMin = Math.random() < 0.12 ? randInt(1, 20) : 0;
    const earlyMin = Math.random() < 0.05 ? randInt(1, 15) : 0;
    checkIn = startTs + lateMin * 60;
    checkOut = endTs - earlyMin * 60;
    late = lateMin > 10;
  }

  ASSIGNMENTS.push({
    personId: person.id, personName: person.name, locId: loc.id, weekStart, day, dateStr,
    shiftId: sd.id, startTime: sd.start, endTime: sd.end, points, status, checkIn, checkOut,
    hours, weekend: isWeekend(day), night: !!sd.is_night, noShow, late, countsForScore,
    publishedAt: dayStartTs,
  });
}

function weeksToGenerate() {
  const list = [];
  for (let w = PAST_WEEKS; w >= 1; w--) {
    list.push({ weekStart: weekStartOffset(-w), days: [0, 1, 2, 3, 4, 5, 6], mode: "past", countsForScore: true });
  }
  const pastDaysThisWeek = Array.from({ length: TODAY_DAY }, (_, d) => d);
  if (pastDaysThisWeek.length) {
    list.push({ weekStart: THIS_MONDAY, days: pastDaysThisWeek, mode: "past", countsForScore: false });
  }
  list.push({ weekStart: THIS_MONDAY, days: [TODAY_DAY], mode: "live", countsForScore: false });
  return list;
}

function generateAllAssignments() {
  for (const wkDef of weeksToGenerate()) {
    for (const loc of LOCATIONS) {
      for (const dept of loc.departments) {
        const weekShiftCounts = new Map();
        let ptr = Math.floor(Math.random() * dept.people.length);
        for (const day of wkDef.days) {
          const dateStr = dateForWeekDay(wkDef.weekStart, day);
          const usedToday = new Set();
          const isKioskLiveToday = wkDef.mode === "live" && dept.id === KAFE_KASA.id;
          const pool = isKioskLiveToday ? dept.people.filter((p) => !p.kiosk) : dept.people;

          for (const sd of loc.shiftDefs) {
            const required = dept.demand[sd.id]?.[day] ?? 0;
            if (!required || pool.length === 0) continue;
            const picks = [];
            let attempts = 0;
            while (picks.length < required && attempts < pool.length * 2) {
              const person = pool[ptr % pool.length];
              ptr++; attempts++;
              if (usedToday.has(person.id)) continue;
              if ((weekShiftCounts.get(person.id) || 0) >= 6) continue;
              picks.push(person);
              usedToday.add(person.id);
              weekShiftCounts.set(person.id, (weekShiftCounts.get(person.id) || 0) + 1);
            }
            for (const person of picks) {
              pushAssignment(loc, dept, person, wkDef.weekStart, day, dateStr, sd, wkDef.mode, false, wkDef.countsForScore);
            }
          }

          // Kiosk E2E carve-out: bugün için kiosk test kişilerine garanti, check-in yapılmamış vardiya
          if (isKioskLiveToday) {
            for (const person of dept.people.filter((p) => p.kiosk)) {
              pushAssignment(loc, dept, person, wkDef.weekStart, day, dateStr, loc.shiftDefs[0], "live", true, false);
            }
          }
        }
      }
    }
  }
  console.log(`${ASSIGNMENTS.length} vardiya kaydı üretildi (JS, henüz DB'ye yazılmadı).`);
}

// 2 Yeni Endüstriyel Modül fixture'ları — generateAllAssignments()'ten SONRA,
// insertShiftAssignments()'tan ÖNCE çağrılır. Hedef kişilerin o günkü
// atamasını (varsa) kaldırıp yerine deterministik bir tane koyar — kiosk
// carve-out'uyla aynı desen (bkz. yukarıdaki isKioskLiveToday bloğu).
function removeAssignment(personId, dateStr) {
  for (let i = ASSIGNMENTS.length - 1; i >= 0; i--) {
    if (ASSIGNMENTS[i].personId === personId && ASSIGNMENTS[i].dateStr === dateStr) ASSIGNMENTS.splice(i, 1);
  }
}
function forceAssignment(person, weekStart, day, dateStr, sd, { status, checkIn, checkOut }) {
  const hours = shiftHoursOf(sd);
  const hard = (isWeekend(day) && FABRIKA.rules.hard_shift_weekend) || (sd.is_night && FABRIKA.rules.hard_shift_night);
  const points = Math.round((hours * (sd.base_points / 5) + (hard ? FABRIKA.rules.hard_shift_points : 0)) * 10) / 10;
  ASSIGNMENTS.push({
    personId: person.id, personName: person.name, locId: FABRIKA.id, weekStart, day, dateStr,
    shiftId: sd.id, startTime: sd.start, endTime: sd.end, points, status, checkIn, checkOut,
    hours, weekend: isWeekend(day), night: !!sd.is_night, noShow: false, late: false,
    countsForScore: false, publishedAt: dateToTs(dateStr),
  });
}

function injectModuleTestFixtures() {
  const nightSd = FABRIKA.shiftDefs.find((s) => s.id === "s-gece");
  // Doğal üretim FATIGUE_TEST_PERSON'a bugün gece-dışı bir vardiya da atamış
  // olabilir — computeFatigueRisk en son (kronolojik) günden geriye sayar,
  // bugün gece-dışıysa zincir sıfırlanır. Bugünü tamamen boş bırak.
  removeAssignment(FATIGUE_TEST_PERSON.id, dateForWeekDay(THIS_MONDAY, TODAY_DAY));
  for (let back = 3; back >= 1; back--) {
    const dateStr = isoDateNDaysAgo(back);
    const { weekStart, day } = weekStartAndDayForDate(dateStr);
    removeAssignment(FATIGUE_TEST_PERSON.id, dateStr);
    const dayStart = dateToTs(dateStr);
    forceAssignment(FATIGUE_TEST_PERSON, weekStart, day, dateStr, nightSd, {
      status: "completed", checkIn: dayStart + 22 * 3600, checkOut: dayStart + (24 + 5.5) * 3600,
    });
  }
  console.log(`Kaza Risk Radarı fixture: ${FATIGUE_TEST_PERSON.name} (${FATIGUE_TEST_PERSON.id}) son 3 gün ardışık gece vardiyası.`);

  const sabahSd = FABRIKA.shiftDefs.find((s) => s.id === "s-sabah");
  const todayDateStr = dateForWeekDay(THIS_MONDAY, TODAY_DAY);
  removeAssignment(HANDOVER_TARGET_PERSON.id, todayDateStr);
  forceAssignment(HANDOVER_TARGET_PERSON, THIS_MONDAY, TODAY_DAY, todayDateStr, sabahSd, {
    status: "scheduled", checkIn: null, checkOut: null,
  });
  console.log(`Devir-Teslim fixture: ${HANDOVER_TARGET_PERSON.name} (${HANDOVER_TARGET_PERSON.id}) bugün s-sabah, check-in yapılmamış.`);
}

async function insertHandoverTestFixture() {
  const noteTs = now - 3600;
  await sql`INSERT INTO shift_handovers (org_id, location_id, department_id, author_personnel_id, target_shift_def_id, note, created_at)
            VALUES (${ORG}, ${FABRIKA.id}, ${FAB_MONTAJ.id}, ${HANDOVER_AUTHOR_PERSON.id}, ${"s-sabah"},
                    ${"E2E test: 3 no'lu pres arızalı, teknik servis çağrıldı. Sevkiyat paletleri hazır."}, ${noteTs})`;
  console.log(`Devir-teslim notu eklendi — yazan: ${HANDOVER_AUTHOR_PERSON.name}, hedef: s-sabah/${FAB_MONTAJ.name}, okunmamış.`);
}

async function insertShiftAssignments() {
  const columns = ["personnel_id", "location_id", "week_start", "day", "shift_id", "role_id", "start_time", "end_time", "points", "status", "publication_status", "published_at", "check_in_at", "check_out_at", "created_at"];
  const rows = ASSIGNMENTS.map((a) => [
    a.personId, a.locId, a.weekStart, a.day, a.shiftId, null, a.startTime, a.endTime,
    a.points, a.status, "published", a.publishedAt, a.checkIn, a.checkOut, a.publishedAt,
  ]);
  await batchInsert("shift_assignments", columns, rows);
  console.log(`${rows.length} shift_assignments satırı yazıldı.`);
}

// ─── Adalet puanı geçmişi + personel önbelleği ─────────────────────────────────
function buildScoreHistoryAndStats() {
  const byLocWeek = new Map();
  for (const a of ASSIGNMENTS) {
    if (!a.countsForScore) continue;
    const key = `${a.locId}|${a.weekStart}`;
    const list = byLocWeek.get(key) || [];
    list.push(a);
    byLocWeek.set(key, list);
  }

  const scoreRows = [];
  const cumulative = new Map();
  const lastPercentile = new Map();
  const statsAgg = new Map();

  for (let w = PAST_WEEKS; w >= 1; w--) {
    const weekStart = weekStartOffset(-w);
    for (const loc of LOCATIONS) {
      const entries = byLocWeek.get(`${loc.id}|${weekStart}`) || [];
      const byPerson = new Map();
      for (const e of entries) {
        const agg = byPerson.get(e.personId) || { name: e.personName, hours: 0, burden: 0, weekend: 0, night: 0, noShow: 0, late: 0 };
        agg.hours += e.hours;
        agg.burden += e.points;
        if (e.weekend) agg.weekend++;
        if (e.night) agg.night++;
        if (e.noShow) agg.noShow++;
        if (e.late) agg.late++;
        byPerson.set(e.personId, agg);
      }
      const rows = [...byPerson.entries()].map(([pid, agg]) => ({ pid, ...agg }));
      rows.sort((a, b) => a.burden - b.burden);
      const n = rows.length;
      rows.forEach((r, idx) => {
        const percentile = n > 1 ? Math.round((1 - idx / (n - 1)) * 1000) / 10 : 50;
        const prevCum = cumulative.get(r.pid) || 0;
        const newCum = Math.round((prevCum + r.burden) * 10) / 10;
        cumulative.set(r.pid, newCum);
        lastPercentile.set(r.pid, percentile);
        const agg2 = statsAgg.get(r.pid) || { noShow: 0, late: 0 };
        agg2.noShow += r.noShow; agg2.late += r.late;
        statsAgg.set(r.pid, agg2);
        scoreRows.push([
          ORG, loc.id, r.pid, r.name, weekStart, r.burden, r.hours, r.burden, r.burden,
          r.weekend, r.night, 0, 0, newCum, percentile, 0, r.noShow, dateToTs(weekStart),
        ]);
      });
    }
  }

  const personnelStats = ALL_PEOPLE
    .filter((p) => cumulative.has(p.id))
    .map((p) => [p.id, cumulative.get(p.id), lastPercentile.get(p.id) ?? 50, statsAgg.get(p.id)?.noShow ?? 0, statsAgg.get(p.id)?.late ?? 0]);

  return { scoreRows, personnelStats };
}

async function insertScoreHistory(scoreRows) {
  const columns = ["org_id", "location_id", "personnel_id", "personnel_name", "week_start", "score", "total_hours", "raw_score", "burden_score", "weekend_shifts", "night_shifts", "pref_not_shifts", "clopening_count", "cumulative_burden", "fairness_z_score", "hero_count", "no_show_count", "created_at"];
  await batchInsert("score_history", columns, scoreRows);
  console.log(`${scoreRows.length} score_history satırı yazıldı.`);
}

// ─── İzinler / Mesai / Molalar (son 3 ay) ─────────────────────────────────────
async function insertLeaveRequests() {
  const rows = [];
  for (const p of ALL_PEOPLE) {
    if (Math.random() > 0.3) continue;
    const type = ["annual", "annual", "annual", "sick", "excuse"][randInt(0, 4)];
    const days = type === "annual" ? randInt(2, 5) : randInt(1, 2);
    const startOffset = randInt(3, 88);
    const startDate = isoDateNDaysAgo(startOffset);
    const endDate = isoDateNDaysAgo(Math.max(0, startOffset - days + 1));
    const mgrId = `u-mega-mgr-${LOCATIONS.find((l) => l.id === p.primary_location_id).sector}`;
    const ts = dateToTs(startDate);
    rows.push([p.id, type, startDate, endDate, days, null, "approved", mgrId, ts + 3600, ts - 172800]);
  }
  const columns = ["personnel_id", "type", "start_date", "end_date", "days", "note", "status", "reviewed_by", "reviewed_at", "created_at"];
  await batchInsert("leave_requests", columns, rows);
  console.log(`${rows.length} onaylanmış izin talebi eklendi.`);
}

async function insertOvertimeRecords() {
  const rows = [];
  for (const p of ALL_PEOPLE) {
    if (p.employment_type !== "full_time") continue;
    for (let w = PAST_WEEKS; w >= 1; w--) {
      if (Math.random() > 0.15) continue;
      const weekStart = weekStartOffset(-w);
      const scheduled = randInt(46, 55);
      const overtime = scheduled - 45;
      const mgrId = `u-mega-mgr-${LOCATIONS.find((l) => l.id === p.primary_location_id).sector}`;
      const ts = dateToTs(weekStart);
      const empStatus = Math.random() < 0.7 ? "accepted" : "pending";
      rows.push([
        ORG, p.primary_location_id, p.id, p.name, weekStart, scheduled, overtime, "approved",
        mgrId, ts + 604800, empStatus, empStatus === "accepted" ? ts + 172800 : null,
        Math.random() < 0.5 ? "paid" : "time_off", null, null, ts,
      ]);
    }
  }
  const columns = ["org_id", "location_id", "personnel_id", "personnel_name", "week_start", "scheduled_hours", "overtime_hours", "status", "approved_by", "approved_at", "employee_status", "employee_responded_at", "compensation_type", "comp_time_used_at", "note", "created_at"];
  await batchInsert("overtime_records", columns, rows);
  console.log(`${rows.length} fazla mesai kaydı eklendi.`);
}

async function insertBreakSessions() {
  const rows = [];
  for (const a of ASSIGNMENTS) {
    if (a.status !== "completed" || !a.checkIn || Math.random() > 0.25) continue;
    const offsetMin = randInt(60, 180);
    const durationMin = randInt(15, 40);
    const startAt = a.checkIn + offsetMin * 60;
    rows.push([ORG, a.locId, a.personId, a.personName, a.dateStr, startAt, startAt + durationMin * 60, durationMin]);
  }
  const columns = ["org_id", "location_id", "personnel_id", "personnel_name", "date", "start_at", "end_at", "duration_min"];
  await batchInsert("break_sessions", columns, rows);
  console.log(`${rows.length} mola kaydı eklendi.`);
}

// ─── Son 1 hafta: takas + açık vardiya teklifleri + modüle özel veri ──────────
async function insertLastWeekSwaps() {
  let count = 0;
  for (const loc of LOCATIONS) {
    const rows = await sql`SELECT id, personnel_id FROM shift_assignments
                            WHERE location_id = ${loc.id} AND week_start = ${LAST_FULL_WEEK}
                            ORDER BY id LIMIT 20`;
    const statuses = ["pending", "peer_accepted", "manager_approved", "manager_rejected"];
    for (let i = 0; i + 1 < Math.min(rows.length, 8); i += 2) {
      const a = rows[i], b = rows[i + 1];
      if (a.personnel_id === b.personnel_id) continue;
      const pa = PEOPLE_BY_ID.get(a.personnel_id), pb = PEOPLE_BY_ID.get(b.personnel_id);
      if (!pa || !pb) continue;
      await sql`INSERT INTO shift_swap_requests (org_id, requester_id, requester_name, target_id, target_name, requester_shift_id, target_shift_id, status, note, created_at)
                VALUES (${ORG}, ${pa.id}, ${pa.name}, ${pb.id}, ${pb.name}, ${a.id}, ${b.id}, ${statuses[count % statuses.length]}, ${"Mega test takas talebi"}, ${now - 86400})`;
      count++;
    }
  }
  console.log(`${count} takas talebi eklendi.`);
}

async function insertBiddingData() {
  const dept = FABRIKA.departments[0];
  const roster = dept.people;
  const shiftIds = [];
  for (let i = 0; i < 3; i++) {
    const sd = FABRIKA.shiftDefs[i % FABRIKA.shiftDefs.length];
    const date = isoDateNDaysAgo(randInt(1, 6));
    const status = i === 0 ? "claimed" : "open";
    const claimant = status === "claimed" ? roster[0] : null;
    const rows = await sql`INSERT INTO open_shifts (org_id, location_id, date, start_time, end_time, note, hero_bonus_multiplier, status, claimed_by, claimed_by_name, claimed_at, created_at)
              VALUES (${ORG}, ${FABRIKA.id}, ${date}, ${sd.start}, ${sd.end}, ${"Mega test açık vardiya"}, 5,
                      ${status}, ${claimant?.id ?? null}, ${claimant?.name ?? null}, ${claimant ? now - 43200 : null}, ${now - 86400})
              RETURNING id`;
    shiftIds.push({ id: rows[0].id, status });
  }
  let bidCount = 0;
  for (const os of shiftIds) {
    const bidders = roster.slice(1, 4);
    for (let i = 0; i < bidders.length; i++) {
      const bidStatus = os.status === "claimed" ? (i === 0 ? "accepted" : "rejected") : "pending";
      await sql`INSERT INTO shift_bids (open_shift_id, personnel_id, requested_bonus_points, note, status, created_at)
                VALUES (${os.id}, ${bidders[i].id}, ${randInt(3, 10)}, ${null}, ${bidStatus}, ${now - 43200})`;
      bidCount++;
    }
  }
  console.log(`${shiftIds.length} açık vardiya + ${bidCount} teklif (bidding) eklendi.`);
}

async function insertComplianceDocs() {
  const roster = FABRIKA.departments.flatMap((d) => d.people);
  const docs = [
    { p: roster[0], type: "İş Güvenliği Belgesi", offset: -20 },
    { p: roster[1], type: "Sağlık Raporu", offset: -5 },
    { p: roster[2], type: "Forklift Sertifikası", offset: 15 },
    { p: roster[3], type: "İş Güvenliği Belgesi", offset: 200 },
    { p: roster[4], type: "Sağlık Raporu", offset: 400 },
  ];
  for (const d of docs) {
    const expiry = isoDateNDaysAgo(-d.offset); // negatif offset = gelecek tarih
    await sql`INSERT INTO personnel_documents (org_id, personnel_id, doc_type, expiry_date, note)
              VALUES (${ORG}, ${d.p.id}, ${d.type}, ${expiry}, ${null})`;
  }
  console.log(`${docs.length} uyumluluk belgesi eklendi (fabrika).`);
}

async function insertTaskManagementData() {
  const perakende = LOCATIONS.find((l) => l.id === "loc-mega-perakende");
  const rows = await sql`SELECT id FROM shift_assignments WHERE location_id = ${perakende.id} AND week_start = ${LAST_FULL_WEEK} ORDER BY id LIMIT 8`;
  const tasks = ["Vitrin Düzeni Kontrolü", "Kasa Sayımı", "Stok Sayımı", "Reyon Temizliği"];
  let count = 0;
  for (const r of rows) {
    for (let i = 0; i < 2; i++) {
      const completed = i === 0;
      await sql`INSERT INTO shift_tasks (org_id, location_id, shift_assignment_id, task_description, is_completed, completed_at)
                VALUES (${ORG}, ${perakende.id}, ${r.id}, ${tasks[randInt(0, tasks.length - 1)]}, ${completed}, ${completed ? now - 3600 : null})`;
      count++;
    }
  }
  console.log(`${count} görev (task) eklendi (perakende).`);
}

async function insertTipPoolData() {
  const otel = LOCATIONS.find((l) => l.id === "loc-mega-otel");
  const periodEnd = dateForWeekDay(LAST_FULL_WEEK, 6);
  const rows = await sql`INSERT INTO tip_pools (org_id, location_id, period_start, period_end, total_amount, distributed_amount, status, created_by, created_at)
            VALUES (${ORG}, ${otel.id}, ${LAST_FULL_WEEK}, ${periodEnd}, 15000, 15000, 'distributed', 'u-mega-mgr-otel', ${now - 86400})
            RETURNING id`;
  const poolId = rows[0].id;
  const roster = otel.departments.flatMap((d) => d.people).slice(0, 10);
  const allocRows = roster.map((p) => {
    const minutes = randInt(1800, 2400);
    return [poolId, p.id, minutes, Math.round(minutes / 60 * 25)];
  });
  await batchInsert("tip_allocations", ["tip_pool_id", "personnel_id", "worked_minutes", "amount"], allocRows);
  console.log(`1 bahşiş havuzu + ${allocRows.length} dağıtım eklendi (otel).`);
}

async function insertSalesForecastData() {
  const restoran = LOCATIONS.find((l) => l.id === "loc-mega-restoran");
  const rows = [];
  for (let d = 45; d >= 1; d--) {
    const date = isoDateNDaysAgo(d);
    rows.push([ORG, restoran.id, date, randInt(8000, 25000), randInt(80, 250)]);
  }
  await batchInsert("location_sales_data", ["org_id", "location_id", "date", "revenue", "footfall"], rows);
  console.log(`${rows.length} günlük satış/yoğunluk verisi eklendi (restoran).`);
}

// ─── Ana akış ───────────────────────────────────────────────────────────────
async function main() {
  console.log(`Mega test seed başlıyor — ${TOTAL_PEOPLE} personel, ${LOCATIONS.length} şube, ${PAST_WEEKS} hafta geçmiş...`);

  await cleanup();
  await insertOrgLocationsDepartments();

  const kioskHash = await bcrypt.hash(KIOSK_PIN, 10);
  await insertPersonnel(kioskHash);
  const pwHash = await bcrypt.hash(PASSWORD, 10);
  await insertUsers(pwHash);

  generateAllAssignments();
  injectModuleTestFixtures();
  await insertShiftAssignments();

  const { scoreRows, personnelStats } = buildScoreHistoryAndStats();
  await insertScoreHistory(scoreRows);
  await batchUpdatePersonnelStats(personnelStats);
  console.log(`${personnelStats.length} personelin prev_score/fairness_z_score değeri güncellendi.`);

  await insertLeaveRequests();
  await insertOvertimeRecords();
  await insertBreakSessions();

  await insertLastWeekSwaps();
  await insertBiddingData();
  await insertComplianceDocs();
  await insertTaskManagementData();
  await insertTipPoolData();
  await insertSalesForecastData();
  await insertHandoverTestFixture();

  console.log("\n=== MEGA TEST SEED TAMAMLANDI ===");
  console.log(`Org: ${ORG} (${TOTAL_PEOPLE} personel / ${LOCATIONS.length} şube / ${PAST_WEEKS} hafta geçmiş)`);
  console.log("\nHesaplar (şifre hepsi: 1234):");
  console.log("  mega.admin              — admin");
  console.log("  mega.supervisor         — supervisor (5 şubeli dashboard: /supervisor)");
  for (const loc of LOCATIONS) {
    console.log(`  mega.mudur.${loc.sector.padEnd(11)} — manager (${loc.name}, ${loc.id})`);
  }
  console.log(`\nKiosk testi: /kiosk/${KAFE.id}  PIN: ${KIOSK_PIN}  (2 kişi bugün check-in bekliyor, henüz yapmadı)`);
  console.log("Not: her şubenin bu haftanın kalan günleri + GELECEK haftası kasıtlı olarak boş bırakıldı");
  console.log("     (Playwright testi 'Otomatik Oluştur' butonunu gerçek OR-Tools çağrısıyla test edebilsin diye).");
  console.log(`\nDevir-Teslim Defteri testi (loc-mega-fabrika, rules.handover_log_enabled AÇIK):`);
  console.log(`  mega.calisan.fabrika.montaj / 1234 — ${HANDOVER_TARGET_PERSON.name}, bugün s-sabah, okunmamış not bekliyor`);
  console.log(`Kaza Risk Radarı testi (rules.fatigue_radar_enabled AÇIK):`);
  console.log(`  ${FATIGUE_TEST_PERSON.name} (${FATIGUE_TEST_PERSON.id}) — son 3 gün ardışık gece vardiyası, "kritik" seviye garanti.`);
}

main().catch((e) => { console.error("SEED HATASI:", e); process.exit(1); });
