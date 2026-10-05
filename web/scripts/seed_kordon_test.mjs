/**
 * Kordon Grup: kullanıcının elle uçtan uca kontrol edeceği karmaşık test işletmesi (2026-10-05).
 * Canlı (prod Neon) veritabanına yazar. Idempotent: org-kordon-test'e ait her şeyi silip yeniden kurar.
 *
 * - 3 şube: Alsancak Restoran (alt departmanlı), Karşıyaka Restoran, Kordon Butik Otel (gece vardiyalı)
 * - Her türden hesap: hesap sahibi, bölge sorumlusu (2 restoran), 3 şube sorumlusu, 3 departman sorumlusu
 *   (biri sadece hazırlar, onaya gönderir), ekip üyeleri. HERKES daha önce giriş yapmış (geçici şifre yok).
 * - Birden çok departmanda çalışan kişiler (joker), iki restoranda çalışan kişiler (biri 2 haftada bir rotasyonlu)
 * - 6 hafta yayınlanmış geçmiş + bu hafta yayınlı; gelecek hafta: Alsancak boş (Planı Oluştur denensin),
 *   Karşıyaka taslak, Otel yayınlı. Uygunluk, izin, takas, açık vardiya ve bildirimler.
 *
 * Çalıştırma: cd web && node scripts/seed_kordon_test.mjs   (şifre hepsi: kordon123)
 */
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const dbUrl = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (!dbUrl) throw new Error("DATABASE_URL bulunamadı (.env.local)");
const sql = neon(dbUrl);

const ORG = "org-kordon-test";
const PASSWORD = "kordon123";
const PAST_WEEKS = 6;
const now = Math.floor(Date.now() / 1000);

// ─── Tarih yardımcıları (Europe/Istanbul ile aynı gün varsayımı, lib/date.ts mantığı) ──────────
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function weekStartOffset(offsetWeeks) {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7);
  return iso(d);
}
function dateForWeekDay(weekStart, day) {
  const [y, m, d] = weekStart.split("-").map(Number);
  return iso(new Date(y, m - 1, d + day));
}
const dateToTs = (s) => { const [y, m, d] = s.split("-").map(Number); return Math.floor(new Date(y, m - 1, d).getTime() / 1000); };
const isoDaysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const THIS_MONDAY = weekStartOffset(0);
const NEXT_MONDAY = weekStartOffset(1);
const TODAY_DAY = (new Date().getDay() + 6) % 7;
const wk = (mf, sat, sun) => ({ 0: mf, 1: mf, 2: mf, 3: mf, 4: mf, 5: sat, 6: sun });
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; // tekrarlanabilir
const randInt = (a, b) => Math.floor(rand() * (b - a + 1)) + a;

// ─── Şubeler (vardiyalar ve kurallar işletme türü varsayılanlarıyla aynı: lib/templates hospitality) ─
const RESTAURANT_SHIFTS = [
  { id: "s-ogle", name: "Öğle Servisi", start: "10:00", end: "17:00", base_points: 4 },
  { id: "s-ara", name: "Ara (Yoğun Saat)", start: "12:00", end: "20:00", base_points: 5 },
  { id: "s-aksam", name: "Akşam Servisi", start: "16:00", end: "00:00", base_points: 7 },
];
const HOTEL_SHIFTS = [
  { id: "s-sabah", name: "Sabah", start: "07:00", end: "15:00", base_points: 4 },
  { id: "s-aksam", name: "Akşam", start: "15:00", end: "23:00", base_points: 5 },
  { id: "s-gece", name: "Gece", start: "23:00", end: "07:00", base_points: 8, is_night: true },
];
const hours = (open, close) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, { isOpen: true, open, close }]));
const BASE_RULES = {
  max_weekly_hours: 45, min_rest_hours: 11, max_consecutive_days: 6, clopening_enabled: true, clopening_min_rest_hours: 12,
  clopening_penalty_weight: 30, hard_shift_points: 4, hard_shift_weekend: true, hard_shift_preferred_not: true,
  hero_bonus_points: 6, force_bonus_points: 5, change_compensation_points: 2, fairness_window_weeks: 4,
  auto_open_shift_on_late: true, late_threshold_min: 20, fatigue_radar_enabled: false, open_shifts_enabled: true,
  swap_requests_enabled: true, availability_collection_enabled: true, chat_enabled: true, industry: "hospitality",
};

// Departman: { id, name, parent?, demand? (en alttakilerde), people: [[ad, soyad, opts]] }
// opts: extra (ek departman id'leri), branches (diğer şubeler + o şubedeki departman), rotation, part, night
const LOCATIONS = [
  {
    id: "loc-kordon-alsancak", name: "Kordon Alsancak", variant: "restaurant", shifts: RESTAURANT_SHIFTS, hours: hours("10:00", "23:59"),
    rules: { tip_pooling_enabled: true },
    departments: [
      { id: "kd-als-salon", name: "Salon" },
      { id: "kd-als-teras", name: "Teras", parent: "kd-als-salon", demand: { "s-ogle": wk(1, 2, 2), "s-ara": wk(1, 1, 1), "s-aksam": wk(1, 2, 2) },
        people: [["Deniz", "Aydın"], ["Ece", "Korkmaz"], ["Mert", "Uslu", { extra: ["kd-als-icsalon"] }], ["Selin", "Ateş", { part: true }], ["Can", "Ertürk"], ["Duygu", "Sönmez"]] },
      { id: "kd-als-icsalon", name: "İç Salon", parent: "kd-als-salon", demand: { "s-ogle": wk(1, 1, 1), "s-ara": wk(1, 1, 1), "s-aksam": wk(2, 2, 2) },
        people: [["Burak", "Şen"], ["Zeynep", "Kılıç"], ["Onur", "Taş"], ["Pınar", "Yalçın", { extra: ["kd-als-teras", "kd-als-bar"] }], ["Ozan", "Kurtuluş"]] },
      { id: "kd-als-mutfak", name: "Mutfak" },
      { id: "kd-als-sicak", name: "Sıcak Mutfak", parent: "kd-als-mutfak", demand: { "s-ogle": wk(1, 1, 1), "s-ara": wk(1, 1, 1), "s-aksam": wk(1, 2, 2) },
        people: [["Hakan", "Usta", { chef: "kd-als-mutfak" }], ["Cem", "Doğan"], ["Fırat", "Er"], ["Gökhan", "Bal", { extra: ["kd-als-soguk"] }], ["Serkan", "Aktaş"], ["Hilal", "Ekinci"]] },
      { id: "kd-als-soguk", name: "Soğuk Mutfak", parent: "kd-als-mutfak", demand: { "s-ogle": wk(1, 1, 1), "s-ara": wk(0, 1, 1), "s-aksam": wk(1, 1, 1) },
        people: [["Leyla", "Çınar"], ["Tolga", "Sezer"], ["Nur", "Akın", { part: true }], ["Batuhan", "Yazıcı"]] },
      { id: "kd-als-bar", name: "Bar", demand: { "s-ogle": wk(0, 1, 1), "s-ara": wk(1, 1, 1), "s-aksam": wk(1, 2, 2) },
        people: [["Kaan", "Yıldız"], ["Derya", "Polat", { extra: ["kd-als-kasa"] }], ["Emre", "Turan", { branches: { "loc-kordon-karsiyaka": "kd-ksk-bar" } }], ["Irmak", "Soylu"], ["Cansu", "Oral"]] },
      { id: "kd-als-kasa", name: "Kasa", demand: { "s-ogle": wk(1, 1, 1), "s-ara": wk(0, 0, 0), "s-aksam": wk(1, 1, 1) },
        people: [["Sevgi", "Arslan"], ["Yusuf", "Kaya"], ["Melis", "Güneş", { branches: { "loc-kordon-karsiyaka": "kd-ksk-kasa" }, rotation: 2 }], ["Ahmet", "Bozdağ"]] },
    ],
  },
  {
    id: "loc-kordon-karsiyaka", name: "Kordon Karşıyaka", variant: "restaurant", shifts: RESTAURANT_SHIFTS, hours: hours("10:00", "23:59"),
    rules: {},
    departments: [
      { id: "kd-ksk-salon", name: "Salon", demand: { "s-ogle": wk(2, 2, 2), "s-ara": wk(1, 1, 1), "s-aksam": wk(2, 3, 3) },
        people: [["Ayşe", "Demir", { chef: "kd-ksk-salon", chefPrepareOnly: true }], ["Can", "Öztürk"], ["Elif", "Koç"], ["Furkan", "Aksoy"], ["Gamze", "Erdem", { extra: ["kd-ksk-bar"] }], ["İlker", "Bulut", { part: true }], ["Ebru", "Kocaman"], ["Tuncay", "Ersoy"]] },
      { id: "kd-ksk-mutfak", name: "Mutfak", demand: { "s-ogle": wk(1, 1, 1), "s-ara": wk(1, 1, 1), "s-aksam": wk(2, 2, 2) },
        people: [["Kemal", "Aslan"], ["Lale", "Toprak"], ["Murat", "Acar"], ["Nesrin", "Uçar", { extra: ["kd-ksk-salon"] }], ["Orhan", "Güler"], ["Şule", "Başaran"], ["Erkan", "Tatlı"]] },
      { id: "kd-ksk-bar", name: "Bar", demand: { "s-ogle": wk(0, 1, 1), "s-ara": wk(1, 1, 1), "s-aksam": wk(1, 1, 1) },
        people: [["Rıza", "Tekin"], ["Seda", "Bozkurt"], ["Koray", "Altun"], ["Beril", "Sarıkaya"]] },
      { id: "kd-ksk-kasa", name: "Kasa", demand: { "s-ogle": wk(1, 1, 1), "s-ara": wk(0, 0, 0), "s-aksam": wk(1, 1, 1) },
        people: [["Tuba", "Keskin"], ["Umut", "Duman", { extra: ["kd-ksk-salon"] }], ["Gizem", "Ay"]] },
    ],
  },
  {
    id: "loc-kordon-otel", name: "Kordon Butik Otel", variant: "hotel", shifts: HOTEL_SHIFTS, hours: hours("00:00", "23:59"),
    rules: { night_legal_warning_enabled: true },
    departments: [
      { id: "kd-otel-resepsiyon", name: "Resepsiyon", demand: { "s-sabah": wk(1, 1, 1), "s-aksam": wk(1, 1, 1), "s-gece": wk(1, 1, 1) },
        people: [["Bora", "Yavuz"], ["Ceren", "Vural"], ["Doruk", "Tunç", { night: false }], ["Esra", "Karaca", { extra: ["kd-otel-kahvalti"] }], ["Ferhat", "Işık"], ["Nazlı", "Ekin"], ["Hasan", "Coşkun"]] },
      { id: "kd-otel-kat", name: "Kat Hizmetleri", demand: { "s-sabah": wk(2, 3, 3), "s-aksam": wk(1, 1, 1), "s-gece": wk(0, 0, 0) },
        people: [["Gül", "Sarı", { chef: "kd-otel-kat" }], ["Hülya", "Kurt"], ["İpek", "Şimşek"], ["Kadir", "Koç"], ["Meryem", "Aydın", { night: "pregnant" }], ["Oya", "Çelik", { part: true }], ["Fadime", "Öz"], ["Arda", "Tan"]] },
      { id: "kd-otel-kahvalti", name: "Kahvaltı Salonu", demand: { "s-sabah": wk(2, 2, 2), "s-aksam": wk(0, 0, 0), "s-gece": wk(0, 0, 0) },
        people: [["Recep", "Polat"], ["Sibel", "Yılmaz"], ["Tarık", "Er", { extra: ["kd-otel-kat"] }], ["Damla", "Gür"]] },
      { id: "kd-otel-guvenlik", name: "Güvenlik", demand: { "s-sabah": wk(1, 1, 1), "s-aksam": wk(1, 1, 1), "s-gece": wk(1, 1, 1) },
        people: [["Volkan", "Demir"], ["Yasin", "Kaplan"], ["Zafer", "Uysal"], ["Barış", "Erdoğan"], ["Levent", "Ulu"], ["Cihan", "Dere"]] },
    ],
  },
];
const LOC_BY_ID = new Map(LOCATIONS.map(l => [l.id, l]));
const DEPT_LOC = new Map(LOCATIONS.flatMap(l => l.departments.map(d => [d.id, l.id])));
const DEPT_BY_ID = new Map(LOCATIONS.flatMap(l => l.departments.map(d => [d.id, d])));

// ─── Kişiler ────────────────────────────────────────────────────────────────────
const ascii = (s) => s.toLocaleLowerCase("tr-TR").replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u").replace(/[^a-z]/g, "");
const PEOPLE = [];
let n = 0;
for (const loc of LOCATIONS) {
  for (const dept of loc.departments) {
    for (const [first, last, opts = {}] of dept.people ?? []) {
      n++;
      const extra = opts.extra ?? [];
      const otherBranches = Object.entries(opts.branches ?? {});
      PEOPLE.push({
        id: `P-KORDON-${pad(n)}`, name: `${first} ${last}`, username: `k.${ascii(first)}.${ascii(last)}`, // diğer test işletmeleriyle çakışmasın
        loc: loc.id, dept: dept.id, extra,
        locations: [loc.id, ...otherBranches.map(([l]) => l)],
        departments: [dept.id, ...extra, ...otherBranches.map(([, d]) => d)],
        rotation: opts.rotation ? { every_weeks: opts.rotation, order: [loc.id, ...otherBranches.map(([l]) => l)], anchor: weekStartOffset(0) } : null,
        part: !!opts.part, night: typeof opts.night === "string" ? opts.night : null,
        chef: opts.chef ?? null, chefPrepareOnly: !!opts.chefPrepareOnly,
        wage: randInt(95, 140), hire: isoDaysFromNow(-randInt(60, 1500)),
      });
    }
  }
}
const PERSON = new Map(PEOPLE.map(p => [p.id, p]));

// ─── Temizlik ───────────────────────────────────────────────────────────────────
// Temizlikte olmayan bir tablo (eski şema) kurulumu durdurmasın
const safe = (q) => q.catch((e) => { if (!/does not exist/.test(String(e?.message))) throw e; });

async function cleanup() {
  const pids = (await sql`SELECT id FROM personnel WHERE org_id = ${ORG}`).map(r => r.id);
  const locIds = LOCATIONS.map(l => l.id);
  if (pids.length) {
    await safe(sql`DELETE FROM shift_tasks WHERE shift_assignment_id IN (SELECT id FROM shift_assignments WHERE personnel_id = ANY(${pids}))`);
    await safe(sql`DELETE FROM shift_swap_requests WHERE org_id = ${ORG}`);
    await safe(sql`DELETE FROM shift_edit_requests WHERE personnel_id = ANY(${pids})`);
    await safe(sql`DELETE FROM score_adjustments WHERE personnel_id = ANY(${pids})`);
    await safe(sql`DELETE FROM score_history WHERE personnel_id = ANY(${pids})`);
    await safe(sql`DELETE FROM break_sessions WHERE personnel_id = ANY(${pids})`);
    await safe(sql`DELETE FROM overtime_records WHERE personnel_id = ANY(${pids})`);
    await safe(sql`DELETE FROM leave_requests WHERE personnel_id = ANY(${pids})`);
    await safe(sql`DELETE FROM notifications WHERE personnel_id = ANY(${pids})`);
    await safe(sql`DELETE FROM availability WHERE personnel_id = ANY(${pids})`);
    await safe(sql`DELETE FROM tip_allocations WHERE personnel_id = ANY(${pids})`);
    await safe(sql`DELETE FROM shift_assignments WHERE personnel_id = ANY(${pids})`);
    await safe(sql`DELETE FROM shift_handovers WHERE author_personnel_id = ANY(${pids}) OR read_by_personnel_id = ANY(${pids})`);
    await safe(sql`DELETE FROM personnel_conflicts WHERE personnel_id_a = ANY(${pids}) OR personnel_id_b = ANY(${pids})`);
    await safe(sql`DELETE FROM personnel_documents WHERE personnel_id = ANY(${pids})`);
  }
  await safe(sql`DELETE FROM shift_assignments WHERE location_id = ANY(${locIds})`);
  await safe(sql`DELETE FROM shift_bids WHERE open_shift_id IN (SELECT id FROM open_shifts WHERE org_id = ${ORG})`);
  await safe(sql`DELETE FROM open_shifts WHERE org_id = ${ORG}`);
  await safe(sql`DELETE FROM tip_pools WHERE org_id = ${ORG}`);
  await safe(sql`DELETE FROM plan_submissions WHERE location_id = ANY(${locIds})`);
  await safe(sql`DELETE FROM invite_tokens WHERE org_id = ${ORG}`);
  await safe(sql`DELETE FROM users WHERE org_id = ${ORG}`);
  await safe(sql`DELETE FROM personnel WHERE org_id = ${ORG}`);
  await safe(sql`DELETE FROM departments WHERE location_id = ANY(${locIds})`);
  await safe(sql`DELETE FROM locations WHERE org_id = ${ORG}`);
  await safe(sql`DELETE FROM organizations WHERE id = ${ORG}`);
  console.log("Eski Kordon verisi temizlendi.");
}

// ─── Org, şube, departman ───────────────────────────────────────────────────────
async function insertStructure() {
  await sql`INSERT INTO organizations (id, name, plan, subscription_status, created_at, last_activity_at)
            VALUES (${ORG}, ${"Kordon Grup"}, 'pro', 'active', ${now - 90 * 86400}, ${now})`;
  for (const loc of LOCATIONS) {
    const rules = { ...BASE_RULES, industry_variant: loc.variant, ...loc.rules };
    await sql`INSERT INTO locations (id, org_id, name, operating_hours, shift_definitions, rules, zone_quotas, demand_matrix)
              VALUES (${loc.id}, ${ORG}, ${loc.name}, ${JSON.stringify(loc.hours)}, ${JSON.stringify(loc.shifts)}, ${JSON.stringify(rules)}, ${"{}"}, ${"{}"})`;
    for (const d of loc.departments) {
      await sql`INSERT INTO departments (id, location_id, name, demand_matrix, parent_id)
                VALUES (${d.id}, ${loc.id}, ${d.name}, ${JSON.stringify(d.demand ?? {})}, ${d.parent ?? null})`;
    }
  }
  console.log(`${LOCATIONS.length} şube, ${DEPT_BY_ID.size} departman.`);
}

async function insertPeopleAndUsers(pwHash) {
  for (const p of PEOPLE) {
    await sql`INSERT INTO personnel (id, org_id, primary_location_id, assigned_location_ids, department_id, assigned_department_ids,
        user_access_level, name, employee_id, hire_date, title, employment_type, status, roles, role_levels, preferred_shift_ids,
        preferred_days, preferred_roles, max_weekly_hours, min_weekly_hours, overtime_approved, hourly_wage, night_restriction,
        branch_rotation, schedulable, prev_score, fairness_z_score, hero_count, no_show_count, late_count, annual_leave_days_total, created_at, updated_at)
      VALUES (${p.id}, ${ORG}, ${p.loc}, ${JSON.stringify(p.locations)}, ${p.dept}, ${JSON.stringify(p.departments)},
        ${p.chef ? "manager" : "employee"}, ${p.name}, ${"KRD-" + p.id.slice(-2)}, ${p.hire}, ${null}, ${p.part ? "part_time" : "full_time"}, 'active',
        ${"[]"}, ${"{}"}, ${"[]"}, ${"[]"}, ${"[]"}, ${p.part ? 28 : 45}, 0, ${!p.part}, ${p.wage}, ${p.night},
        ${p.rotation ? JSON.stringify(p.rotation) : null}, true, 0, 50, 0, 0, 0, 14, ${now}, ${now})`;
    const access = p.chef ? JSON.stringify({ perms: p.chefPrepareOnly ? ["prepare", "team"] : ["prepare", "publish", "team"], department_id: p.chef }) : null;
    await sql`INSERT INTO users (id, personnel_id, username, email, password_hash, role, org_id, location_id, department_id, name,
        display_title, approval_status, is_temp_password, permissions, last_login_at)
      VALUES (${"u-" + p.id.toLowerCase()}, ${p.id}, ${p.username}, ${`${p.username}@kordon.test`}, ${pwHash}, ${p.chef ? "manager" : "employee"}, ${ORG},
        ${p.loc}, ${p.chef ?? p.dept}, ${p.name}, ${p.chef ? "Departman sorumlusu" : null}, 'active', false, ${access}, ${now - randInt(1, 72) * 3600})`;
  }
  // Hesap sahibi, bölge sorumlusu (iki restoran), şube sorumluları (vardiyaya girmez)
  const ALL = ["prepare", "publish", "approvals", "team", "plan_settings", "budget", "cross_branch", "delegate"];
  const mgr = async (id, username, name, role, locationId, title, perms, managed) => {
    await sql`INSERT INTO users (id, username, email, password_hash, role, org_id, location_id, name, display_title, approval_status,
        is_temp_password, permissions, managed_location_ids, last_login_at)
      VALUES (${id}, ${username}, ${`${username}@kordon.test`}, ${pwHash}, ${role}, ${ORG}, ${locationId}, ${name}, ${title}, 'active',
        false, ${perms ? JSON.stringify({ perms }) : null}, ${managed ? JSON.stringify(managed) : null}, ${now - randInt(1, 48) * 3600})`;
  };
  await mgr("u-kordon-sahip", "kordon.sahip", "Selim Kordon", "admin", "loc-kordon-alsancak", null, null, null);
  await mgr("u-kordon-bolge", "kordon.bolge", "Aslı Ergin", "supervisor", null, "Bölge sorumlusu", ALL, ["loc-kordon-alsancak", "loc-kordon-karsiyaka"]);
  await mgr("u-kordon-als", "alsancak.sorumlu", "Taner Oral", "manager", "loc-kordon-alsancak", "Şube sorumlusu", ALL.filter(x => x !== "budget"), null);
  await mgr("u-kordon-ksk", "karsiyaka.sorumlu", "Nilay Sert", "manager", "loc-kordon-karsiyaka", "Şube sorumlusu", ["prepare", "publish", "approvals", "team", "plan_settings", "delegate"], null);
  await mgr("u-kordon-otel", "otel.sorumlu", "Cenk Ural", "manager", "loc-kordon-otel", "Şube sorumlusu", ALL, null);
  console.log(`${PEOPLE.length} çalışan (hepsinin hesabı açık, giriş yapmış) + 5 yönetim hesabı.`);
}

// ─── Vardiya geçmişi ─────────────────────────────────────────────────────────────
const ROWS = []; // shift_assignments
const FILL = { need: 0, got: 0 }; // ihtiyacın ne kadarı doldu (kontrol çıktısı)
function shiftHours(sd) {
  const [sh, sm] = sd.start.split(":").map(Number); const [eh, em] = sd.end.split(":").map(Number);
  let m = eh * 60 + em - (sh * 60 + sm); if (m <= 0) m += 1440; return m / 60;
}
/**
 * Motorun kesin kurallarıyla aynı (engine/optishift_engine.py, lib/assignmentCheck): kişinin haftalık saati TÜM şubelerde
 * toplanır ve sınırı (tam zamanlı 45, yarı zamanlı 28) geçmez, iki vardiya arası en az 11 saat, en fazla 6 gün üst üste.
 * Eskiden vardiya SAYISI şube başına ayrı tutuluyordu: iki şubeli kişi 60+ saate, raporlar "sınırı aştı"ya çıkıyordu.
 */
const MIN_REST_H = BASE_RULES.min_rest_hours ?? 11;
const MAX_CONSEC = BASE_RULES.max_consecutive_days ?? 6;
function spanOf(weekStart, day, start, end) {
  const s0 = dateToTs(dateForWeekDay(weekStart, day)) + Number(start.slice(0, 2)) * 3600 + Number(start.slice(3)) * 60;
  return [s0, s0 + shiftHours({ start, end }) * 3600];
}
function canTake(p, weekStart, day, sd) {
  const mine = ROWS.filter(r => r.personnel_id === p.id);
  const weekH = mine.filter(r => r.week_start === weekStart).reduce((t, r) => t + shiftHours({ start: r.start_time, end: r.end_time }), 0);
  if (weekH + shiftHours(sd) > (p.part ? 28 : 45) + 1e-9) return false;
  const [a, b] = spanOf(weekStart, day, sd.start, sd.end);
  for (const r of mine) {
    const [x, y] = spanOf(r.week_start, r.day, r.start_time, r.end_time);
    if (Math.abs(x - a) > 3 * 86400) continue;
    const gap = x >= a ? x - b : a - y;
    if (gap < MIN_REST_H * 3600) return false;
  }
  // Üst üste gün: bu günle birlikte en fazla MAX_CONSEC
  const workDays = new Set(mine.map(r => Math.floor(dateToTs(dateForWeekDay(r.week_start, r.day)) / 86400)));
  const today = Math.floor(dateToTs(dateForWeekDay(weekStart, day)) / 86400);
  let run = 1;
  for (let d = today - 1; workDays.has(d); d--) run++;
  for (let d = today + 1; workDays.has(d); d++) run++;
  return run <= MAX_CONSEC;
}
/** Bir şubenin bir haftası: en alttaki her departmanın ihtiyacı kendi ekibi + o departmana yardım edebilen jokerlerle dolar. */
function planWeek(loc, weekStart, days, mode) {
  const leaf = loc.departments.filter(d => d.demand);
  const busy = new Set();      // kişi|gün (tüm şubeler)
  for (const r of ROWS) if (r.week_start === weekStart) busy.add(`${r.personnel_id}|${r.day}`);
  for (const day of days) {
    for (const d of leaf) {
      for (const sd of loc.shifts) {
        const need = d.demand[sd.id]?.[day] ?? 0;
        // Ana ekip önce; eksik kalırsa bu departmana ek departmanı olan joker
        const own = PEOPLE.filter(p => p.locations.includes(loc.id) && p.departments.includes(d.id) && (p.dept === d.id || (p.loc !== loc.id && p.departments.includes(d.id))));
        const helpers = PEOPLE.filter(p => p.loc === loc.id && p.extra.includes(d.id));
        const pool = [...own.sort(() => rand() - 0.5), ...helpers.sort(() => rand() - 0.5)];
        let got = 0;
        FILL.need += need;
        for (const p of pool) {
          if (got >= need) break;
          if (busy.has(`${p.id}|${day}`)) continue;
          if (sd.is_night && p.night) continue;
          if (!canTake(p, weekStart, day, sd)) continue;
          if (p.rotation) {
            const k = Math.floor((dateToTs(weekStart) - dateToTs(p.rotation.anchor)) / (7 * 86400 * p.rotation.every_weeks));
            const target = p.rotation.order[((k % p.rotation.order.length) + p.rotation.order.length) % p.rotation.order.length];
            if (target !== loc.id) continue;
          }
          busy.add(`${p.id}|${day}`); got++; FILL.got++;
          const dateStr = dateForWeekDay(weekStart, day);
          const startTs = dateToTs(dateStr) + Number(sd.start.slice(0, 2)) * 3600 + Number(sd.start.slice(3)) * 60;
          const endTs = startTs + shiftHours(sd) * 3600;
          const hard = day >= 5;
          const points = Math.round((shiftHours(sd) * (sd.base_points / 5) + (hard ? BASE_RULES.hard_shift_points : 0)) * 10) / 10;
          // Bugün: başlamış vardiyaya giriş yapılmış (biri hariç, "geç kalan" görünsün), bitmiş olan tamamlanmış
          const started = mode === "published" && startTs <= now && rand() < 0.85;
          const ended = started && endTs <= now;
          const past = mode === "past" || ended;
          const late = (past || started) && rand() < 0.1 ? randInt(5, 25) : 0;
          ROWS.push({
            personnel_id: p.id, location_id: loc.id, week_start: weekStart, day, shift_id: sd.id, start_time: sd.start, end_time: sd.end,
            points, status: past ? "completed" : started ? "active" : "scheduled", publication_status: mode === "draft" ? "draft" : "published",
            published_at: mode === "draft" ? null : dateToTs(weekStart) - 4 * 86400,
            check_in_at: past || started ? startTs + late * 60 : null, check_out_at: past ? endTs : null,
            // Başka departmanda çalışan joker ya da başka şubedeki departmanında çalışan kişi
            department_id: d.id !== p.dept ? d.id : null, created_at: now,
          });
        }
      }
    }
  }
}
function generateShifts() {
  for (let w = PAST_WEEKS; w >= 1; w--) for (const loc of LOCATIONS) planWeek(loc, weekStartOffset(-w), [0, 1, 2, 3, 4, 5, 6], "past");
  // Bu hafta: geçmiş günler tamamlandı, bugün ve sonrası yayınlı
  for (const loc of LOCATIONS) {
    planWeek(loc, THIS_MONDAY, Array.from({ length: TODAY_DAY }, (_, i) => i), "past");
    planWeek(loc, THIS_MONDAY, Array.from({ length: 7 - TODAY_DAY }, (_, i) => TODAY_DAY + i), "published");
  }
  // Gelecek hafta: Karşıyaka taslak, Otel yayınlı, Alsancak BOŞ (Planı Oluştur denensin)
  planWeek(LOC_BY_ID.get("loc-kordon-karsiyaka"), NEXT_MONDAY, [0, 1, 2, 3, 4, 5, 6], "draft");
  planWeek(LOC_BY_ID.get("loc-kordon-otel"), NEXT_MONDAY, [0, 1, 2, 3, 4, 5, 6], "published");
}
async function insertShifts() {
  const cols = ["personnel_id", "location_id", "week_start", "day", "shift_id", "start_time", "end_time", "points", "status", "publication_status", "published_at", "check_in_at", "check_out_at", "department_id", "created_at"];
  for (let i = 0; i < ROWS.length; i += 250) {
    const chunk = ROWS.slice(i, i + 250);
    const ph = chunk.map((_, ri) => `(${cols.map((__, ci) => `$${ri * cols.length + ci + 1}`).join(",")})`).join(",");
    await sql(`INSERT INTO shift_assignments (${cols.join(",")}) VALUES ${ph}`, chunk.flatMap(r => cols.map(c => r[c])));
  }
  console.log(`${ROWS.length} vardiya (joker ve şubeler arası: ${ROWS.filter(r => r.department_id).length}).`);
}

// Adalet puanı geçmişi: son PAST_WEEKS haftanın yayınlanmış puanı, kümülatif düz toplam (lib/fairness modeli)
async function insertScores() {
  const rows = []; const cum = new Map();
  for (let w = PAST_WEEKS; w >= 1; w--) {
    const ws = weekStartOffset(-w);
    for (const loc of LOCATIONS) {
      const by = new Map();
      for (const r of ROWS.filter(x => x.week_start === ws && x.location_id === loc.id)) {
        const a = by.get(r.personnel_id) ?? { pts: 0, hrs: 0, we: 0, night: 0 };
        a.pts += r.points; a.hrs += shiftHours(loc.shifts.find(s => s.id === r.shift_id)); if (r.day >= 5) a.we++; if (r.shift_id === "s-gece") a.night++;
        by.set(r.personnel_id, a);
      }
      const list = [...by.entries()].sort((a, b) => a[1].pts - b[1].pts);
      list.forEach(([pid, a], i) => {
        const c = Math.round(((cum.get(pid) ?? 0) + a.pts) * 10) / 10; cum.set(pid, c);
        const pct = list.length > 1 ? Math.round((1 - i / (list.length - 1)) * 1000) / 10 : 50;
        rows.push([ORG, loc.id, pid, PERSON.get(pid).name, ws, a.pts, a.hrs, a.pts, a.pts, a.we, a.night, 0, 0, c, pct, 0, 0, dateToTs(ws)]);
      });
    }
  }
  const cols = ["org_id", "location_id", "personnel_id", "personnel_name", "week_start", "score", "total_hours", "raw_score", "burden_score", "weekend_shifts", "night_shifts", "pref_not_shifts", "clopening_count", "cumulative_burden", "fairness_z_score", "hero_count", "no_show_count", "created_at"];
  for (let i = 0; i < rows.length; i += 250) {
    const chunk = rows.slice(i, i + 250);
    const ph = chunk.map((_, ri) => `(${cols.map((__, ci) => `$${ri * cols.length + ci + 1}`).join(",")})`).join(",");
    await sql(`INSERT INTO score_history (${cols.join(",")}) VALUES ${ph}`, chunk.flat());
  }
  // Önbellek: son fairness_window_weeks (4) haftanın toplamı
  const windowStart = weekStartOffset(-BASE_RULES.fairness_window_weeks);
  for (const p of PEOPLE) {
    const s = ROWS.filter(r => r.personnel_id === p.id && r.week_start >= windowStart && r.week_start < THIS_MONDAY).reduce((a, r) => a + r.points, 0);
    await sql`UPDATE personnel SET prev_score = ${Math.round(s * 10) / 10} WHERE id = ${p.id}`;
  }
  console.log(`${rows.length} adalet puanı satırı.`);
}

// ─── Uygunluk, izin, takas, açık vardiya, bildirim ─────────────────────────────
async function insertRequests() {
  // Gelecek hafta uygunluk: çoğu girdi, bazıları Gelemem / Tercih etmem
  let av = 0;
  for (const p of PEOPLE) {
    if (rand() < 0.2) continue; // girmeyenler de olsun
    const days = Array.from({ length: 7 }, () => (rand() < 0.1 ? "unavailable" : rand() < 0.12 ? "preferred_not" : "available"));
    await sql`INSERT INTO availability (personnel_id, week_start, day_0, day_1, day_2, day_3, day_4, day_5, day_6, submitted_at)
              VALUES (${p.id}, ${NEXT_MONDAY}, ${days[0]}, ${days[1]}, ${days[2]}, ${days[3]}, ${days[4]}, ${days[5]}, ${days[6]}, ${now - randInt(2, 40) * 3600})`;
    av++;
  }
  // İzinler: geçmişte onaylı, gelecekte bekleyen
  const leaves = [
    [PEOPLE[1], "Yıllık İzin", isoDaysFromNow(9), isoDaysFromNow(11), 3, "pending"],
    [PEOPLE[8], "Mazeret İzni", isoDaysFromNow(8), isoDaysFromNow(8), 1, "pending"],
    [PEOPLE[20], "Yıllık İzin", isoDaysFromNow(10), isoDaysFromNow(14), 5, "pending"],
    [PEOPLE[30], "Hastalık / Rapor", isoDaysFromNow(-12), isoDaysFromNow(-11), 2, "approved"],
    [PEOPLE[5], "Yıllık İzin", isoDaysFromNow(-25), isoDaysFromNow(-21), 5, "approved"],
  ];
  for (const [p, type, s, e, days, status] of leaves) {
    await sql`INSERT INTO leave_requests (personnel_id, type, start_date, end_date, days, note, status, reviewed_by, reviewed_at, created_at)
              VALUES (${p.id}, ${type}, ${s}, ${e}, ${days}, ${status === "pending" ? "Aile ziyareti" : null}, ${status},
                      ${status === "approved" ? "u-kordon-sahip" : null}, ${status === "approved" ? now - 20 * 86400 : null}, ${now - randInt(1, 5) * 86400})`;
  }
  // Takas: bu haftanın yayınlı vardiyalarından, aynı şubede iki kişi; biri sorumlu onayı bekliyor
  for (const locId of ["loc-kordon-alsancak", "loc-kordon-karsiyaka"]) {
    const rows = await sql`SELECT id, personnel_id, day FROM shift_assignments WHERE location_id = ${locId} AND week_start = ${THIS_MONDAY}
                           AND publication_status = 'published' AND day > ${TODAY_DAY} ORDER BY id LIMIT 30`;
    const a = rows[0]; const b = rows.find(r => r.personnel_id !== a?.personnel_id && r.day !== a?.day);
    if (!a || !b) continue;
    const pa = PERSON.get(a.personnel_id), pb = PERSON.get(b.personnel_id);
    await sql`INSERT INTO shift_swap_requests (org_id, requester_id, requester_name, target_id, target_name, requester_shift_id, target_shift_id, status, note, created_at)
              VALUES (${ORG}, ${pa.id}, ${pa.name}, ${pb.id}, ${pb.name}, ${a.id}, ${b.id}, ${locId.endsWith("alsancak") ? "peer_accepted" : "pending"}, ${"Okul işim çıktı, değişebilir miyiz?"}, ${now - 7200})`;
  }
  // Açık vardiya: Alsancak'ta bu hafta, ilan açık
  const d = Math.min(6, TODAY_DAY + 2);
  await sql`INSERT INTO open_shifts (org_id, location_id, date, start_time, end_time, note, hero_bonus_multiplier, status, created_at)
            VALUES (${ORG}, ${"loc-kordon-alsancak"}, ${dateForWeekDay(THIS_MONDAY, d)}, ${"16:00"}, ${"00:00"}, ${"Teras için ek garson lazım"}, 6, 'open', ${now - 3 * 3600})`;
  // Bildirimler: birkaç kişiye yayın bildirimi
  for (const p of PEOPLE.slice(0, 12)) {
    await sql`INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
              VALUES (${p.id}, 'schedule', ${"Vardiya Programı Yayınlandı"}, ${"Bu haftanın programı hazır. Takvimini kontrol et."}, '/portal/calendar', false, ${now - 86400})`;
  }
  console.log(`${av} uygunluk, ${leaves.length} izin, 2 takas, 1 açık vardiya, 12 bildirim.`);
}

/** Kurulan planın kural kontrolü: haftalık sınır, dinlenme, eksik kalan ihtiyaç */
function verifyShifts() {
  let over = 0, rest = 0, maxH = 0;
  const byPW = new Map();
  for (const r of ROWS) { const k = `${r.personnel_id}|${r.week_start}`; byPW.set(k, (byPW.get(k) ?? 0) + shiftHours({ start: r.start_time, end: r.end_time })); }
  for (const [k, h] of byPW) { const p = PEOPLE.find(x => x.id === k.split("|")[0]); maxH = Math.max(maxH, h); if (h > (p.part ? 28 : 45) + 1e-9) over++; }
  const byP = new Map();
  for (const r of ROWS) (byP.get(r.personnel_id) ?? byP.set(r.personnel_id, []).get(r.personnel_id)).push(spanOf(r.week_start, r.day, r.start_time, r.end_time));
  for (const spans of byP.values()) { spans.sort((a, b) => a[0] - b[0]); for (let i = 1; i < spans.length; i++) if (spans[i][0] - spans[i - 1][1] < MIN_REST_H * 3600) rest++; }
  console.log(`Kural kontrolü: sınırı aşan kişi-hafta ${over}, 11 saatten kısa dinlenme ${rest}, en uzun hafta ${maxH} sa, dolan ihtiyaç %${Math.round(FILL.got / Math.max(1, FILL.need) * 100)}.`);
  return over === 0 && rest === 0;
}

async function main() {
  if (process.env.DRY === "1") { generateShifts(); verifyShifts(); console.log(`${ROWS.length} vardiya (kuru çalıştırma, veritabanına yazılmadı).`); return; }
  console.log("Kordon Grup kuruluyor...");
  await cleanup();
  await insertStructure();
  await insertPeopleAndUsers(await bcrypt.hash(PASSWORD, 10));
  generateShifts();
  if (!verifyShifts()) throw new Error("Plan kurallara uymuyor, kurulum durdu");
  await insertShifts();
  await insertScores();
  await insertRequests();
  console.log("\n=== KORDON GRUP HAZIR === (şifre hepsi: kordon123)");
  console.log("  kordon.sahip        hesap sahibi");
  console.log("  kordon.bolge        bölge sorumlusu (Alsancak + Karşıyaka)");
  console.log("  alsancak.sorumlu    şube sorumlusu (bütçe hariç)");
  console.log("  karsiyaka.sorumlu   şube sorumlusu (bütçe ve şubeler arası yok)");
  console.log("  otel.sorumlu        şube sorumlusu (tam yetki)");
  for (const p of PEOPLE.filter(x => x.chef)) console.log(`  ${p.username.padEnd(19)} ${DEPT_BY_ID.get(p.chef).name} sorumlusu${p.chefPrepareOnly ? " (sadece hazırlar, onaya gönderir)" : ""}`);
  for (const p of PEOPLE.filter(x => x.extra.length)) console.log(`  ${p.username.padEnd(19)} joker: ${[p.dept, ...p.extra].map(id => DEPT_BY_ID.get(id).name).join(" + ")}`);
  for (const p of PEOPLE.filter(x => x.locations.length > 1)) console.log(`  ${p.username.padEnd(19)} iki şube${p.rotation ? " (2 haftada bir rotasyon)" : ""}`);
}

main().catch(e => { console.error("SEED HATASI:", e); process.exit(1); });
