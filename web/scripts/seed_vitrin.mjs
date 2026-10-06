/**
 * Vitrin: tanıtım videoları ve ekran görüntüleri için temiz, gerçekçi örnek işletme (2026-10-06, kullanıcı onayıyla).
 * Canlı (prod Neon) veritabanına yazar. Idempotent: org-vitrin'e ait her şeyi silip yeniden kurar. Müşteri verisiyle bağı yok.
 *
 * - Tek şube "Moda Şube" (kafe): Bar, Salon, Kasa, Mutfak. Vardiyalar tanıtımdaki çizimle aynı (Açılış, Ara, Kapanış).
 * - 4 hafta yayınlanmış geçmiş + bu hafta yayınlı; gelecek hafta BOŞ (videoda Planı Oluştur'a basılır).
 * - Herkes gelecek haftanın uygunluğunu girmiş; bekleyen izin, vardiya değiştirme, açık vardiya.
 *
 * Çalıştırma: cd web && node scripts/seed_vitrin.mjs   (şifre hepsi: vitrin123)
 * Hesaplar: vitrin.sahip (hesap sahibi), vitrin.sorumlu (şube sorumlusu), v.elif.kaya (ekip üyesi, telefon videosu)
 */
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const dbUrl = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (!dbUrl) throw new Error("DATABASE_URL bulunamadı (.env.local)");
const sql = neon(dbUrl);

const ORG = "org-vitrin";
const PASSWORD = "vitrin123";
const PAST_WEEKS = 4;
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

// ─── Şube (kafe; vardiyalar tanıtım çizimiyle aynı) ────────────────────────────
const KAFE_SHIFTS = [
  { id: "s-acilis", name: "Açılış", start: "07:00", end: "15:00", base_points: 4 },
  { id: "s-ara", name: "Ara", start: "11:00", end: "19:00", base_points: 5 },
  { id: "s-kapanis", name: "Kapanış", start: "15:00", end: "23:00", base_points: 7 },
];
const hours = (open, close) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, { isOpen: true, open, close }]));
const BASE_RULES = {
  max_weekly_hours: 45, min_rest_hours: 11, max_consecutive_days: 6, clopening_enabled: true, clopening_min_rest_hours: 12,
  clopening_penalty_weight: 30, hard_shift_points: 4, hard_shift_weekend: true, hard_shift_preferred_not: true,
  hero_bonus_points: 6, force_bonus_points: 5, change_compensation_points: 2, fairness_window_weeks: 4,
  auto_open_shift_on_late: true, late_threshold_min: 20, fatigue_radar_enabled: false, open_shifts_enabled: true,
  swap_requests_enabled: true, availability_collection_enabled: true, chat_enabled: true, industry: "hospitality",
};
const LOCATIONS = [
  {
    id: "loc-vitrin-moda", name: "Moda Şube", variant: "cafe", shifts: KAFE_SHIFTS, hours: hours("07:00", "23:00"), rules: {},
    departments: [
      { id: "vd-bar", name: "Bar", demand: { "s-acilis": wk(1, 1, 1), "s-ara": wk(1, 1, 1), "s-kapanis": wk(1, 1, 1) },
        people: [["Elif", "Kaya"], ["Can", "Ertürk"], ["Irmak", "Soylu"], ["Kaan", "Yıldız", { part: true }], ["Ozan", "Kurt"], ["Pelin", "Acar"]] },
      { id: "vd-salon", name: "Salon", demand: { "s-acilis": wk(1, 1, 1), "s-ara": wk(1, 1, 2), "s-kapanis": wk(1, 2, 2) },
        people: [["Burak", "Tan"], ["Deniz", "Özkan"], ["Ece", "Korkmaz"], ["Onur", "Taş"], ["Zeynep", "Kılıç", { extra: ["vd-kasa"] }], ["Pınar", "Yalçın"], ["Bora", "Aksu"]] },
      { id: "vd-kasa", name: "Kasa", demand: { "s-acilis": wk(1, 1, 1), "s-ara": wk(0, 0, 0), "s-kapanis": wk(1, 1, 1) },
        people: [["Selin", "Aydın"], ["Yusuf", "Aksoy"], ["Melis", "Güneş", { part: true }], ["Gamze", "Erdem"]] },
      { id: "vd-mutfak", name: "Mutfak", demand: { "s-acilis": wk(1, 1, 1), "s-ara": wk(0, 1, 1), "s-kapanis": wk(1, 1, 1) },
        people: [["Mert", "Yılmaz"], ["Leyla", "Çınar"], ["Tolga", "Sezer"], ["Cem", "Doğan"]] },
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
        id: `P-VITRIN-${pad(n)}`, name: `${first} ${last}`, username: `v.${ascii(first)}.${ascii(last)}`, // diğer test işletmeleriyle çakışmasın
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
  // Elle testte oluşan veriler (mesaj, passkey, push, öneri, ekip vb.)
  if (pids.length) {
    await safe(sql`DELETE FROM shift_bids WHERE personnel_id = ANY(${pids})`);
    await safe(sql`DELETE FROM shift_proposals WHERE personnel_id = ANY(${pids})`);
    await safe(sql`DELETE FROM push_subscriptions WHERE personnel_id = ANY(${pids})`);
  }
  await safe(sql`DELETE FROM messages WHERE org_id = ${ORG} OR from_user_id IN (SELECT id FROM users WHERE org_id = ${ORG})`);
  await safe(sql`DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE org_id = ${ORG})`);
  await safe(sql`DELETE FROM webauthn_credentials WHERE user_id IN (SELECT id FROM users WHERE org_id = ${ORG})`);
  await safe(sql`DELETE FROM shift_tasks WHERE org_id = ${ORG} OR location_id = ANY(${locIds})`);
  await safe(sql`DELETE FROM shift_handovers WHERE org_id = ${ORG}`);
  await safe(sql`DELETE FROM personnel_conflicts WHERE org_id = ${ORG}`);
  await safe(sql`DELETE FROM personnel_documents WHERE org_id = ${ORG}`);
  await safe(sql`DELETE FROM break_sessions WHERE location_id = ANY(${locIds})`);
  await safe(sql`DELETE FROM overtime_records WHERE location_id = ANY(${locIds})`);
  await safe(sql`DELETE FROM crews WHERE org_id = ${ORG} OR location_id = ANY(${locIds})`);
  await safe(sql`DELETE FROM location_events WHERE location_id = ANY(${locIds})`);
  await safe(sql`DELETE FROM location_sales_data WHERE org_id = ${ORG} OR location_id = ANY(${locIds})`);
  await safe(sql`DELETE FROM payroll_periods WHERE org_id = ${ORG} OR location_id = ANY(${locIds})`);
  await safe(sql`DELETE FROM users WHERE org_id = ${ORG}`);
  await safe(sql`DELETE FROM personnel WHERE org_id = ${ORG}`);
  await safe(sql`DELETE FROM departments WHERE location_id = ANY(${locIds})`);
  await safe(sql`DELETE FROM locations WHERE org_id = ${ORG}`);
  await safe(sql`DELETE FROM organizations WHERE id = ${ORG}`);
  console.log("Eski vitrin verisi temizlendi.");
}

// ─── Org, şube, departman ───────────────────────────────────────────────────────
async function insertStructure() {
  await sql`INSERT INTO organizations (id, name, plan, subscription_status, created_at, last_activity_at)
            VALUES (${ORG}, ${"Moda Kahve"}, 'pro', 'active', ${now - 90 * 86400}, ${now})`;
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
        ${p.chef ? "manager" : "employee"}, ${p.name}, ${"MDA-" + p.id.slice(-2)}, ${p.hire}, ${null}, ${p.part ? "part_time" : "full_time"}, 'active',
        ${"[]"}, ${"{}"}, ${"[]"}, ${"[]"}, ${"[]"}, ${p.part ? 28 : 45}, 0, ${!p.part}, ${p.wage}, ${p.night},
        ${p.rotation ? JSON.stringify(p.rotation) : null}, true, 0, 50, 0, 0, 0, 14, ${now}, ${now})`;
    const access = p.chef ? JSON.stringify({ perms: p.chefPrepareOnly ? ["prepare", "team"] : ["prepare", "publish", "team"], department_id: p.chef }) : null;
    await sql`INSERT INTO users (id, personnel_id, username, email, password_hash, role, org_id, location_id, department_id, name,
        display_title, approval_status, is_temp_password, permissions, last_login_at)
      VALUES (${"u-" + p.id.toLowerCase()}, ${p.id}, ${p.username}, ${`${p.username}@vitrin.test`}, ${pwHash}, ${p.chef ? "manager" : "employee"}, ${ORG},
        ${p.loc}, ${p.chef ?? p.dept}, ${p.name}, ${p.chef ? "Departman sorumlusu" : null}, 'active', false, ${access}, ${now - randInt(1, 72) * 3600})`;
  }
  // Hesap sahibi, bölge sorumlusu (iki restoran), şube sorumluları (vardiyaya girmez)
  const ALL = ["prepare", "publish", "approvals", "team", "plan_settings", "budget", "cross_branch", "delegate"];
  const mgr = async (id, username, name, role, locationId, title, perms, managed) => {
    await sql`INSERT INTO users (id, username, email, password_hash, role, org_id, location_id, name, display_title, approval_status,
        is_temp_password, permissions, managed_location_ids, last_login_at)
      VALUES (${id}, ${username}, ${`${username}@vitrin.test`}, ${pwHash}, ${role}, ${ORG}, ${locationId}, ${name}, ${title}, 'active',
        false, ${perms ? JSON.stringify({ perms }) : null}, ${managed ? JSON.stringify(managed) : null}, ${now - randInt(1, 48) * 3600})`;
  };
  await mgr("u-vitrin-sahip", "vitrin.sahip", "Aslı Ergin", "admin", "loc-vitrin-moda", null, null, null);
  await mgr("u-vitrin-sorumlu", "vitrin.sorumlu", "Taner Oral", "manager", "loc-vitrin-moda", "Şube sorumlusu", ALL, null);
  console.log(`${PEOPLE.length} çalışan (hepsinin hesabı açık, giriş yapmış) + 2 yönetim hesabı.`);
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
        // Vitrin: uygulamanın yaptığı gibi o ana kadar en az puan almış kişi önce (Adalet Puanı raporu dengeli görünsün)
        const load = (p) => ROWS.reduce((t, r) => t + (r.personnel_id === p.id ? r.points / (p.part ? 0.62 : 1) : 0), 0) + rand() * 3;
        const byLoad = (arr) => arr.map((p) => [load(p), p]).sort((a, b) => a[0] - b[0]).map(([, p]) => p);
        const pool = [...byLoad(own), ...byLoad(helpers)];
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
  // Gelecek hafta BOŞ: videoda Planı Oluştur
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
  // Gelecek hafta uygunluk: herkes girmiş, bazı Gelemem / Tercih etmem
  for (const p of PEOPLE) {
    const days = Array.from({ length: 7 }, () => (rand() < 0.07 ? "unavailable" : "available"));
    await sql`INSERT INTO availability (personnel_id, week_start, day_0, day_1, day_2, day_3, day_4, day_5, day_6, submitted_at)
              VALUES (${p.id}, ${NEXT_MONDAY}, ${days[0]}, ${days[1]}, ${days[2]}, ${days[3]}, ${days[4]}, ${days[5]}, ${days[6]}, ${now - randInt(2, 40) * 3600})`;
  }
  const by = (u) => PEOPLE.find(p => p.username === u);
  const leaves = [
    [by("v.selin.aydin"), "Yıllık İzin", dateForWeekDay(NEXT_MONDAY, 3), dateForWeekDay(NEXT_MONDAY, 4), 2, "pending", "Kardeşimin düğünü var"],
    [by("v.onur.tas"), "Mazeret İzni", dateForWeekDay(NEXT_MONDAY, 1), dateForWeekDay(NEXT_MONDAY, 1), 1, "pending", "Okulda sınavım var"],
    [by("v.leyla.cinar"), "Yıllık İzin", isoDaysFromNow(-20), isoDaysFromNow(-18), 3, "approved", null],
  ];
  for (const [p, type, s, e, days, status, note] of leaves) {
    await sql`INSERT INTO leave_requests (personnel_id, type, start_date, end_date, days, note, status, reviewed_by, reviewed_at, created_at)
              VALUES (${p.id}, ${type}, ${s}, ${e}, ${days}, ${note}, ${status},
                      ${status === "approved" ? "u-vitrin-sorumlu" : null}, ${status === "approved" ? now - 20 * 86400 : null}, ${now - randInt(2, 20) * 3600})`;
  }
  // Vardiya değiştirme: iki kişi anlaştı, sorumlu onayı bekliyor. Bilerek kurala uymayan bir istek (tanıtımda uyarı görünsün):
  // A, kapanış yaptığı günün ertesi sabahı B'nin açılışını alıyor (aradaki dinlenme 8 saat).
  const wk = await sql`SELECT id, personnel_id, day, shift_id FROM shift_assignments WHERE location_id = ${"loc-vitrin-moda"} AND week_start = ${THIS_MONDAY}
                       AND publication_status = 'published' AND day > ${TODAY_DAY}`;
  const has = (pid, day) => wk.some((r) => r.personnel_id === pid && r.day === day);
  let pair = null;
  for (const k of wk.filter((r) => r.shift_id === "s-kapanis")) {
    const pa = PERSON.get(k.personnel_id);
    for (const o of wk.filter((r) => r.shift_id === "s-acilis" && r.day === k.day + 1 && r.personnel_id !== k.personnel_id && !has(k.personnel_id, k.day + 1))) {
      const pb = PERSON.get(o.personnel_id);
      if (!pb.departments.some((x) => pa.departments.includes(x))) continue;
      // A'nın vereceği vardiya: B'nin boş olduğu, A'nın başka bir günü
      const give = wk.find((r) => r.personnel_id === k.personnel_id && r.id !== k.id && r.day !== k.day + 1 && !has(o.personnel_id, r.day));
      if (give) { pair = { pa, pb, give, take: o }; break; }
    }
    if (pair) break;
  }
  if (pair) {
    await sql`INSERT INTO shift_swap_requests (org_id, requester_id, requester_name, target_id, target_name, requester_shift_id, target_shift_id, status, note, created_at)
              VALUES (${ORG}, ${pair.pa.id}, ${pair.pa.name}, ${pair.pb.id}, ${pair.pb.name}, ${pair.give.id}, ${pair.take.id}, 'peer_accepted', ${"Akşam dersim var, değişebilir miyiz?"}, ${now - 7200})`;
  } else console.log("UYARI: kurala uymayan vardiya değiştirme örneği kurulamadı");
  const d = Math.min(6, TODAY_DAY + 2);
  await sql`INSERT INTO open_shifts (org_id, location_id, date, start_time, end_time, note, hero_bonus_multiplier, status, created_at)
            VALUES (${ORG}, ${"loc-vitrin-moda"}, ${dateForWeekDay(THIS_MONDAY, d)}, ${"15:00"}, ${"23:00"}, ${"Hafta sonu yoğunluğu için ek barista"}, 6, 'open', ${now - 3 * 3600})`;
  console.log(`${PEOPLE.length} uygunluk, ${leaves.length} izin, 1 vardiya değiştirme, 1 açık vardiya.`);
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
  console.log("Vitrin işletmesi kuruluyor...");
  await cleanup();
  await insertStructure();
  await insertPeopleAndUsers(await bcrypt.hash(PASSWORD, 10));
  generateShifts();
  if (!verifyShifts()) throw new Error("Plan kurallara uymuyor, kurulum durdu");
  await insertShifts();
  await insertScores();
  await insertRequests();
  console.log("\n=== VİTRİN HAZIR === (şifre hepsi: vitrin123): vitrin.sahip, vitrin.sorumlu, v.elif.kaya");
}

main().catch(e => { console.error("SEED HATASI:", e); process.exit(1); });
