/**
 * Ege Metal A.Ş. — gerçekçi demo fabrika seed'i (prod Neon DB).
 *
 * Kurgu: otomotiv yan sanayi, 24/7 üç vardiya (Gece 7,5 saat — yasal),
 * 5 departman (Pres/Montaj/Kalite/Bakım/Depo), 3 üretim ekibi (A/B/C)
 * haftalık İLERİ rotasyon (sabah→akşam→gece), 48 personel.
 * Test tohumları: 1 gebe operatör (gece yasağı), 1 çırak (18 yaş altı),
 * 1 YTD 250 saatlik "mesai gönüllüsü", gece vardiyasında zorunlu ≥1 bakımcı.
 *
 * Çalıştırma: cd web && node seed_ege_metal.mjs
 * Idempotent: org-ege-metal'e ait tüm veriyi silip yeniden kurar.
 */
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";

// .env.local'dan DATABASE_URL oku
const env = readFileSync(new URL("./.env.local", import.meta.url), "utf-8");
const dbUrl = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (!dbUrl) throw new Error("DATABASE_URL bulunamadı (.env.local)");
const sql = neon(dbUrl);

const ORG = "org-ege-metal";
const LOC = "loc-ege-metal-torbali";
const now = Math.floor(Date.now() / 1000);

// Bu haftanın pazartesi'si (rotasyon referansı)
const _d = new Date();
const dayIdx = (_d.getDay() + 6) % 7;
_d.setDate(_d.getDate() - dayIdx);
const THIS_MONDAY = _d.toISOString().split("T")[0];

const SHIFT_DEFS = [
  { id: "s-sabah", name: "Sabah", start: "06:00", end: "14:00", base_points: 4 },
  { id: "s-aksam", name: "Akşam", start: "14:00", end: "22:00", base_points: 5 },
  {
    id: "s-gece", name: "Gece", start: "22:00", end: "05:30", base_points: 8, is_night: true,
    required_skills: [{ skill: "bakımcı", count: 1 }],
  },
];

const RULES = {
  max_weekly_hours: 45,
  min_rest_hours: 11,
  skills_match: "warn",
  no_night_to_morning: true,
  consecutive_night_weeks_enabled: true,
  clopening_enabled: true,
  clopening_min_rest_hours: 13,
  max_consecutive_days: 6,
  overtime_threshold_hours: 45,
  max_ytd_overtime_hours: 270,
  weekly_overtime_budget_hours: 60,
  overtime_fair_distribution: true,
  auto_open_shift_on_late: true,
  late_threshold_min: 30,
  availability_collection_enabled: false, // fabrika: vardiyaları müdür planlar
  simple_mode: false,
};

const ROTATION = {
  enabled: true,
  type: "3-shift",
  cycle_weeks: 3,
  reference_week: THIS_MONDAY,
  pattern: {
    "crew-em-a": ["s-sabah", "s-aksam", "s-gece"],
    "crew-em-b": ["s-aksam", "s-gece", "s-sabah"],
    "crew-em-c": ["s-gece", "s-sabah", "s-aksam"],
  },
};

// gün: 0=Pzt … 6=Paz
const wk = (mf, sat, sun) => ({ 0: mf, 1: mf, 2: mf, 3: mf, 4: mf, 5: sat, 6: sun });
const DEPTS = [
  { id: "dept-em-pres",   name: "Pres Hattı",     demand: { "s-sabah": wk(4, 3, 2), "s-aksam": wk(4, 3, 2), "s-gece": wk(4, 3, 2) } },
  { id: "dept-em-montaj", name: "Montaj Hattı",   demand: { "s-sabah": wk(5, 4, 3), "s-aksam": wk(5, 4, 3), "s-gece": wk(4, 3, 2) } },
  { id: "dept-em-kalite", name: "Kalite Kontrol", demand: { "s-sabah": wk(2, 1, 1), "s-aksam": wk(1, 1, 1), "s-gece": wk(0, 0, 0) } },
  { id: "dept-em-bakim",  name: "Bakım",          demand: { "s-sabah": wk(1, 1, 1), "s-aksam": wk(1, 1, 1), "s-gece": wk(1, 1, 1) } },
  { id: "dept-em-depo",   name: "Depo & Sevkiyat", demand: { "s-sabah": wk(2, 2, 1), "s-aksam": wk(1, 1, 0), "s-gece": wk(0, 0, 0) } },
];

const CREWS = [
  { id: "crew-em-a", name: "A Vardiyası", color: "#ef4444" },
  { id: "crew-em-b", name: "B Vardiyası", color: "#3b82f6" },
  { id: "crew-em-c", name: "C Vardiyası", color: "#10b981" },
];

// ── 48 personel ──────────────────────────────────────────────────────────────
const FIRST = ["Ali", "Mehmet", "Ayşe", "Fatma", "Mustafa", "Emine", "Ahmet", "Hatice", "Hüseyin", "Zeynep", "İbrahim", "Elif", "Hasan", "Meryem", "Osman", "Şerife", "Yusuf", "Sultan", "Ramazan", "Hanife", "Halil", "Merve", "Süleyman", "Esra", "İsmail", "Fadime", "Ömer", "Özlem", "Murat", "Yasemin", "Abdullah", "Emel", "Recep", "Havva", "Salih", "Zehra", "Kadir", "Songül", "Kemal", "Dilek", "Ferhat", "Gül", "Serkan", "Nurcan", "Volkan", "Sevim", "Barış", "Tuğba"];
const LAST = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Yıldırım", "Öztürk", "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin", "Kara", "Koç", "Kurt", "Özkan", "Şimşek", "Polat", "Korkmaz", "Erdoğan", "Aksoy", "Güneş", "Bulut", "Taş", "Işık", "Turan", "Toprak", "Sarı", "Ateş", "Uçar", "Acar", "Güler", "Tekin", "Bozkurt", "Keskin", "Duman", "Yavuz", "Sezer", "Vural", "Tunç", "Bal", "Erdem", "Uysal", "Bilgin", "Karaca"];
const nameAt = (i) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + 3) % LAST.length]}`;

/** kişi üretici */
let pIdx = 0;
function person({ dept, crew, skills, title, wage, extra = {} }) {
  const i = pIdx++;
  return {
    id: `P-EM-${String(i + 1).padStart(2, "0")}`,
    name: nameAt(i),
    employee_id: `EM-${1000 + i}`,
    department_id: dept,
    crew_id: crew,
    roles: skills,
    title,
    hourly_wage: wage,
    night_restriction: null,
    ytd_overtime_hours: 0,
    ...extra,
  };
}

const PEOPLE = [];
// Pres 15 (5'er, 3 ekip) — 2'si forklift de kullanır; 1 mesai gönüllüsü (YTD 250)
for (const crew of ["crew-em-a", "crew-em-b", "crew-em-c"]) {
  for (let k = 0; k < 5; k++) {
    PEOPLE.push(person({
      dept: "dept-em-pres", crew,
      skills: k === 0 ? ["pres-operatörü", "forklift"] : ["pres-operatörü"],
      title: k === 0 ? "Kıdemli Pres Operatörü" : "Pres Operatörü",
      wage: k === 0 ? 135 : 110,
      extra: crew === "crew-em-a" && k === 1 ? { ytd_overtime_hours: 250 } : {},
    }));
  }
}
// Montaj 18 (6'şar) — 1 gebe (B ekibi), 1 çırak 18 yaş altı (A ekibi)
for (const crew of ["crew-em-a", "crew-em-b", "crew-em-c"]) {
  for (let k = 0; k < 6; k++) {
    const extra = {};
    let title = "Montaj Operatörü";
    if (crew === "crew-em-b" && k === 2) { extra.night_restriction = "pregnant"; }
    if (crew === "crew-em-a" && k === 5) { extra.night_restriction = "under18"; title = "Çırak (MESEM)"; }
    PEOPLE.push(person({ dept: "dept-em-montaj", crew, skills: ["montaj"], title, wage: 100, extra }));
  }
}
// Bakım 6 (2'şer) — gece zorunlu yetkinliğin kaynağı
for (const crew of ["crew-em-a", "crew-em-b", "crew-em-c"]) {
  for (let k = 0; k < 2; k++) {
    PEOPLE.push(person({ dept: "dept-em-bakim", crew, skills: ["bakımcı"], title: k === 0 ? "Bakım Ustası" : "Bakım Teknisyeni", wage: 150 }));
  }
}
// Kalite 5 (ekipsiz, gündüz ağırlıklı)
for (let k = 0; k < 5; k++) {
  PEOPLE.push(person({ dept: "dept-em-kalite", crew: null, skills: ["kalite-kontrol"], title: "Kalite Kontrol Uzmanı", wage: 125 }));
}
// Depo 4 (ekipsiz)
for (let k = 0; k < 4; k++) {
  PEOPLE.push(person({ dept: "dept-em-depo", crew: null, skills: ["forklift", "depo"], title: "Depo Görevlisi", wage: 95 }));
}

async function main() {
  console.log(`Ege Metal seed başlıyor — ${PEOPLE.length} personel, hafta: ${THIS_MONDAY}`);

  // ── Temizlik (idempotent) ──────────────────────────────────────────────────
  const pids = (await sql`SELECT id FROM personnel WHERE org_id = ${ORG}`).map(r => r.id);
  if (pids.length > 0) {
    await sql`DELETE FROM notifications WHERE personnel_id = ANY(${pids})`;
    await sql`DELETE FROM availability WHERE personnel_id = ANY(${pids})`;
    await sql`DELETE FROM shift_assignments WHERE personnel_id = ANY(${pids})`;
    await sql`DELETE FROM score_history WHERE personnel_id = ANY(${pids})`;
    for (const t of ["score_adjustments", "leave_requests", "shift_edit_requests"]) {
      try { await sql(`DELETE FROM ${t} WHERE personnel_id = ANY($1)`, [pids]); } catch {}
    }
  }
  for (const t of ["overtime_records", "open_shifts", "shift_swap_requests", "messages", "crews"]) {
    try { await sql(`DELETE FROM ${t} WHERE org_id = $1`, [ORG]); } catch {}
  }
  await sql`DELETE FROM users WHERE org_id = ${ORG}`;
  await sql`DELETE FROM personnel WHERE org_id = ${ORG}`;
  await sql`DELETE FROM departments WHERE location_id = ${LOC}`;
  await sql`DELETE FROM locations WHERE org_id = ${ORG}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG}`;
  console.log("Eski Ege Metal verisi temizlendi.");

  // ── Organizasyon + Lokasyon ────────────────────────────────────────────────
  await sql`INSERT INTO organizations (id, name, plan, subscription_status, created_at, last_activity_at)
            VALUES (${ORG}, ${"Ege Metal A.Ş."}, 'pro', 'active', ${now}, ${now})`;
  await sql`INSERT INTO locations (id, org_id, name, shift_definitions, rules, rotation_template, zone_quotas)
            VALUES (${LOC}, ${ORG}, ${"Torbalı Fabrikası"},
                    ${JSON.stringify(SHIFT_DEFS)}, ${JSON.stringify(RULES)},
                    ${JSON.stringify(ROTATION)}, ${"{}"})`;

  // ── Departmanlar (talep matrisleriyle) + Ekipler ───────────────────────────
  for (const d of DEPTS) {
    await sql`INSERT INTO departments (id, location_id, name, demand_matrix)
              VALUES (${d.id}, ${LOC}, ${d.name}, ${JSON.stringify(d.demand)})`;
  }
  for (const c of CREWS) {
    await sql`INSERT INTO crews (id, org_id, location_id, name, color, created_at)
              VALUES (${c.id}, ${ORG}, ${LOC}, ${c.name}, ${c.color}, ${now})`;
  }

  // ── Personel ───────────────────────────────────────────────────────────────
  for (const p of PEOPLE) {
    await sql`INSERT INTO personnel (
        id, org_id, primary_location_id, assigned_location_ids, department_id,
        user_access_level, name, employee_id, title, employment_type, status,
        roles, role_levels, max_weekly_hours, overtime_approved, crew_id,
        ytd_overtime_hours, hourly_wage, night_restriction, prev_score
      ) VALUES (
        ${p.id}, ${ORG}, ${LOC}, ${JSON.stringify([LOC])}, ${p.department_id},
        'employee', ${p.name}, ${p.employee_id}, ${p.title}, 'full_time', 'active',
        ${JSON.stringify(p.roles)}, ${"{}"}, 45, true, ${p.crew_id},
        ${p.ytd_overtime_hours}, ${p.hourly_wage}, ${p.night_restriction}, 0
      )`;
  }
  console.log(`${PEOPLE.length} personel eklendi.`);

  // ── Kullanıcılar ───────────────────────────────────────────────────────────
  const hash = await bcrypt.hash("1234", 10);
  await sql`INSERT INTO users (id, username, email, password_hash, role, org_id, location_id, name, display_title, approval_status)
            VALUES ('u-em-admin', 'egemetal.admin', 'admin@egemetal.demo', ${hash}, 'admin', ${ORG}, ${LOC}, ${"Kemal Aydın"}, ${"Fabrika Müdürü"}, 'active')`;
  await sql`INSERT INTO users (id, username, email, password_hash, role, org_id, location_id, name, display_title, approval_status)
            VALUES ('u-em-mudur', 'egemetal.mudur', 'mudur@egemetal.demo', ${hash}, 'manager', ${ORG}, ${LOC}, ${"Vardiya Amiri Serdar Koç"}, ${"Şube Müdürü"}, 'active')`;
  const firstP = PEOPLE[0];
  await sql`INSERT INTO users (id, personnel_id, username, email, password_hash, role, org_id, location_id, name, approval_status)
            VALUES ('u-em-personel', ${firstP.id}, 'egemetal.personel', 'personel@egemetal.demo', ${hash}, 'employee', ${ORG}, ${LOC}, ${firstP.name}, 'active')`;

  console.log("Kullanıcılar: egemetal.admin / egemetal.mudur / egemetal.personel (şifre: 1234)");
  console.log("Seed tamamlandı ✔");
}

main().catch(e => { console.error("SEED HATASI:", e); process.exit(1); });
