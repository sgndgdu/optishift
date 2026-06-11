/* eslint-disable */
/**
 * Test Seed: 3 Bar Şubesi
 * Çalıştır: node scripts/seed-bar-test.js  (web/ klasöründen)
 *
 * Tüm kullanıcılar için şifre: test1234
 *
 * Giriş hesapları:
 *   Admin      : admin@bargrubu.com  / test1234   → /supervisor/login
 *   Supervisor  : patron@bargrubu.com / test1234   → /supervisor/login
 *   Karaköy Müdür : mehmet.celik / test1234        → /login (manager portalı)
 *   Beyoğlu Müdür : ayse.ozturk / test1234         → /login
 *   Kadıköy Müdür : kemal.yildirim / test1234      → /login
 *   Tüm personel  : <ad.soyad>  / test1234         → /portal/login
 */

const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const path     = require('path');

const DB_PATH = path.join(__dirname, '..', 'optishift.db');
const db = new Database(DB_PATH);
const HASH = bcrypt.hashSync('test1234', 10);
const NOW  = Math.floor(Date.now() / 1000);

// ─── Sabitler ────────────────────────────────────────────────────────────────

const ORG_ID  = 'ORG-BAR';
const SUP_ID  = 'U-BAR-PATRON';
const ADM_ID  = 'U-BAR-ADMIN';

const LOCATIONS = [
  { id: 'LOC-BAR-1', name: 'Karaköy Şubesi' },
  { id: 'LOC-BAR-2', name: 'Beyoğlu Şubesi' },
  { id: 'LOC-BAR-3', name: 'Kadıköy Şubesi' },
];

const SHIFT_DEFS = JSON.stringify([
  { id: 's1', name: 'Öğle Vardiyası',  start: '11:00', end: '19:00', base_points: 4 },
  { id: 's2', name: 'Akşam Vardiyası', start: '15:00', end: '23:00', base_points: 7 },
  { id: 's3', name: 'Gece Kapanış',   start: '19:00', end: '03:00', base_points: 10 },
]);

const OPERATING_HOURS = JSON.stringify(
  Object.fromEntries([0,1,2,3,4,5,6].map(d => [d, { isOpen: true, open: '11:00', close: '03:00' }]))
);

const ZONE_QUOTAS = JSON.stringify({ Mutfak: 1, Bar: 1, Salon: 2 });
const RULES       = JSON.stringify({ max_weekly_hours: 45, min_rest_hours: 11, force_skills_match: false });

// Her lokasyona 3 departman
const DEPT_NAMES = ['Mutfak', 'Bar', 'Salon'];

// ─── Personel Tanımları ───────────────────────────────────────────────────────
// Her satır: [lokasyon_index, departman_adı, tam_ad, unvan, access_level, title_tr]

const PEOPLE = [
  // ── Karaköy (LOC-BAR-1) ──
  [0, null,     'Mehmet Çelik',     'mehmet.celik',     'manager',  'Şube Müdürü'  ],
  [0, 'Mutfak', 'Ali Kara',         'ali.kara',         'employee', 'Mutfak Şefi'  ],
  [0, 'Mutfak', 'Fatma Yıldız',     'fatma.yildiz',     'employee', 'Aşçı'         ],
  [0, 'Mutfak', 'Hüseyin Demir',    'huseyin.demir',    'employee', 'Aşçı Yardımcısı'],
  [0, 'Bar',    'Zeynep Arslan',    'zeynep.arslan',    'employee', 'Baş Barmen'   ],
  [0, 'Bar',    'Can Özgür',        'can.ozgur',        'employee', 'Barmen'       ],
  [0, 'Bar',    'Selin Aydın',      'selin.aydin',      'employee', 'Barista'      ],
  [0, 'Salon',  'Mustafa Şen',      'mustafa.sen',      'employee', 'Salon Şefi'   ],
  [0, 'Salon',  'Elif Kılıç',       'elif.kilic',       'employee', 'Garson'       ],
  [0, 'Salon',  'Burak Tekin',      'burak.tekin',      'employee', 'Garson'       ],

  // ── Beyoğlu (LOC-BAR-2) ──
  [1, null,     'Ayşe Öztürk',      'ayse.ozturk',      'manager',  'Şube Müdürü'  ],
  [1, 'Mutfak', 'İbrahim Yılmaz',   'ibrahim.yilmaz',   'employee', 'Mutfak Şefi'  ],
  [1, 'Mutfak', 'Merve Koç',        'merve.koc',        'employee', 'Aşçı'         ],
  [1, 'Mutfak', 'Okan Baş',         'okan.bas',         'employee', 'Aşçı Yardımcısı'],
  [1, 'Bar',    'Deniz Doğan',      'deniz.dogan',      'employee', 'Baş Barmen'   ],
  [1, 'Bar',    'Pınar Şahin',      'pinar.sahin',      'employee', 'Barmen'       ],
  [1, 'Bar',    'Emre Çetin',       'emre.cetin',       'employee', 'Barista'      ],
  [1, 'Salon',  'Gökhan Acar',      'gokhan.acar',      'employee', 'Salon Şefi'   ],
  [1, 'Salon',  'Tuğçe Bulut',      'tugce.bulut',      'employee', 'Garson'       ],
  [1, 'Salon',  'Serkan Güneş',     'serkan.gunes',     'employee', 'Garson'       ],

  // ── Kadıköy (LOC-BAR-3) ──
  [2, null,     'Kemal Yıldırım',   'kemal.yildirim',   'manager',  'Şube Müdürü'  ],
  [2, 'Mutfak', 'Hatice Öz',        'hatice.oz',        'employee', 'Mutfak Şefi'  ],
  [2, 'Mutfak', 'Tolga Kurt',       'tolga.kurt',       'employee', 'Aşçı'         ],
  [2, 'Mutfak', 'Gamze Polat',      'gamze.polat',      'employee', 'Aşçı Yardımcısı'],
  [2, 'Bar',    'Volkan Şimşek',    'volkan.simsek',    'employee', 'Baş Barmen'   ],
  [2, 'Bar',    'Berna Güler',      'berna.guler',      'employee', 'Barmen'       ],
  [2, 'Bar',    'Uğur Tan',         'ugur.tan',         'employee', 'Barista'      ],
  [2, 'Salon',  'Cem Kaplan',       'cem.kaplan',       'employee', 'Salon Şefi'   ],
  [2, 'Salon',  'Aylin Aksoy',      'aylin.aksoy',      'employee', 'Garson'       ],
  [2, 'Salon',  'Murat Erdoğan',    'murat.erdogan',    'employee', 'Garson'       ],
];

// ─── Temizlik (idempotent) ────────────────────────────────────────────────────

function cleanExisting() {
  // Önce bağımlı tablolar
  const locIds = LOCATIONS.map(l => `'${l.id}'`).join(',');
  db.prepare(`DELETE FROM shift_assignments WHERE location_id IN (${locIds})`).run();
  db.prepare(`DELETE FROM break_sessions    WHERE location_id IN (${locIds})`).run();
  db.prepare(`DELETE FROM score_history     WHERE org_id = ?`).run(ORG_ID);
  db.prepare(`DELETE FROM open_shifts       WHERE org_id = ?`).run(ORG_ID);
  db.prepare(`DELETE FROM messages          WHERE org_id = ?`).run(ORG_ID);
  db.prepare(`DELETE FROM notifications     WHERE personnel_id IN (SELECT id FROM personnel WHERE org_id = ?)`).run(ORG_ID);
  db.prepare(`DELETE FROM availability      WHERE personnel_id IN (SELECT id FROM personnel WHERE org_id = ?)`).run(ORG_ID);
  db.prepare(`DELETE FROM leave_requests    WHERE personnel_id IN (SELECT id FROM personnel WHERE org_id = ?)`).run(ORG_ID);
  db.prepare(`DELETE FROM shift_swap_requests WHERE org_id = ?`).run(ORG_ID);
  db.prepare(`DELETE FROM shift_edit_requests WHERE org_id = ?`).run(ORG_ID);
  db.prepare(`DELETE FROM push_subscriptions WHERE org_id = ?`).run(ORG_ID);
  db.prepare(`DELETE FROM invite_tokens     WHERE org_id = ?`).run(ORG_ID);
  db.prepare(`DELETE FROM users             WHERE org_id = ?`).run(ORG_ID);
  db.prepare(`DELETE FROM personnel         WHERE org_id = ?`).run(ORG_ID);
  db.prepare(`DELETE FROM departments       WHERE location_id IN (${locIds})`).run();
  db.prepare(`DELETE FROM locations         WHERE org_id = ?`).run(ORG_ID);
  db.prepare(`DELETE FROM organizations     WHERE id = ?`).run(ORG_ID);
  console.log('  ✓ Önceki test verisi temizlendi');
}

// ─── Ana Seed ─────────────────────────────────────────────────────────────────

db.transaction(() => {

  cleanExisting();

  // 1. Organization
  db.prepare(`
    INSERT INTO organizations (id, name, plan, subscription_status)
    VALUES (?, ?, 'pro', 'active')
  `).run(ORG_ID, 'Gece Yarısı Bar & Bistro Grubu');
  console.log('  ✓ Organizasyon oluşturuldu');

  // 2. Admin kullanıcı (supervisor portal)
  db.prepare(`
    INSERT INTO users (id, personnel_id, username, email, password_hash, role, org_id, location_id, name, created_at)
    VALUES (?, NULL, 'admin', 'admin@bargrubu.com', ?, 'admin', ?, NULL, 'Admin Kullanıcı', ?)
  `).run(ADM_ID, HASH, ORG_ID, NOW);

  // 3. Patron / Supervisor kullanıcı
  db.prepare(`
    INSERT INTO users (id, personnel_id, username, email, password_hash, role, org_id, location_id, name, created_at)
    VALUES (?, NULL, 'patron', 'patron@bargrubu.com', ?, 'supervisor', ?, NULL, 'Patron', ?)
  `).run(SUP_ID, HASH, ORG_ID, NOW);
  console.log('  ✓ Admin + Patron kullanıcısı oluşturuldu');

  // 4. Lokasyonlar
  for (const loc of LOCATIONS) {
    db.prepare(`
      INSERT INTO locations (id, org_id, name, operating_hours, shift_definitions, zone_quotas, rules)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(loc.id, ORG_ID, loc.name, OPERATING_HOURS, SHIFT_DEFS, ZONE_QUOTAS, RULES);
  }
  console.log('  ✓ 3 Lokasyon oluşturuldu');

  // 5. Departmanlar — lokasyon başına 3 adet
  const deptMap = {}; // key: "LOC-BAR-1_Mutfak" → dept_id
  for (const loc of LOCATIONS) {
    for (const dname of DEPT_NAMES) {
      const deptId = `DEPT-${loc.id}-${dname.toUpperCase().replace(/İ/g,'I')}`;
      db.prepare(`INSERT INTO departments (id, location_id, name) VALUES (?, ?, ?)`)
        .run(deptId, loc.id, dname);
      deptMap[`${loc.id}_${dname}`] = deptId;
    }
  }
  console.log('  ✓ 9 Departman oluşturuldu (3 şube × 3 dept)');

  // 6. Personel + Kullanıcılar
  const usedUsernames = new Set(
    db.prepare('SELECT username FROM users').all().map(r => r.username)
  );

  function uniqueUsername(base) {
    if (!usedUsernames.has(base)) { usedUsernames.add(base); return base; }
    let n = 2;
    while (usedUsernames.has(`${base}${n}`)) n++;
    const u = `${base}${n}`;
    usedUsernames.add(u);
    return u;
  }

  let pCount = 0;
  for (let i = 0; i < PEOPLE.length; i++) {
    const [locIdx, deptName, fullName, rawUsername, accessLevel, title] = PEOPLE[i];
    const username = uniqueUsername(rawUsername);
    const loc   = LOCATIONS[locIdx];
    const deptId = deptName ? deptMap[`${loc.id}_${deptName}`] : null;

    const pId = `P-BAR-${String(i + 1).padStart(3, '0')}`;
    const uId = `U-BAR-${String(i + 1).padStart(3, '0')}`;
    const empId = `EMP-B${String(10001 + i)}`;
    const email = `${username}@bargrubu.com`;

    // Persona'nın rolleri (skills): lokasyon departman adları
    const roles = deptName ? [deptName] : ['Mutfak', 'Bar', 'Salon'];

    // Biraz farklı müsaitlik + puan — gerçekçi veri
    const prevScore = Math.floor(Math.random() * 40) + 10;
    const heroCount = Math.floor(Math.random() * 3);

    db.prepare(`
      INSERT INTO personnel (
        id, org_id, primary_location_id, assigned_location_ids,
        department_id, user_access_level, name, employee_id,
        phone, email, hire_date, title, employment_type, status,
        roles, role_levels, preferred_shift_ids, preferred_days, preferred_roles,
        max_weekly_hours, overtime_approved, prev_score, hero_count,
        no_show_count, late_count, annual_leave_days_total, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, 'active',
        ?, '{}', '[]', '[]', ?,
        45, 0, ?, ?,
        0, 0, 14, ?, ?
      )
    `).run(
      pId, ORG_ID, loc.id, JSON.stringify([loc.id]),
      deptId, accessLevel, fullName, empId,
      `0555 ${String(100 + i).padStart(3,'0')} ${String(1000 + i).padStart(4,'0')}`,
      email,
      `202${Math.floor(i / 10) + 2}-0${(i % 9) + 1}-15`,
      title, i === 0 || i === 10 || i === 20 ? 'full_time' : 'full_time',
      JSON.stringify(roles),
      JSON.stringify(deptName ? [deptName] : ['Mutfak', 'Bar', 'Salon']),
      prevScore, heroCount,
      NOW, NOW
    );

    db.prepare(`
      INSERT INTO users (id, personnel_id, username, email, password_hash, role, org_id, location_id, department_id, name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uId, pId, username, email, HASH, accessLevel, ORG_ID, loc.id, deptId, fullName, NOW);

    pCount++;
  }
  console.log(`  ✓ ${pCount} Personel + Kullanıcı oluşturuldu`);

  // 7. Müsaitlik — bu hafta (2026-06-01) tüm personele müsait kayıt
  const WEEK_START = '2026-06-01';
  const pRows = db.prepare('SELECT id FROM personnel WHERE org_id = ?').all(ORG_ID);
  for (const p of pRows) {
    // Rastgele 1-2 gün "preferred_not" veya "unavailable"
    const avail = { 0:'available',1:'available',2:'available',3:'available',4:'available',5:'available',6:'available' };
    const randDay1 = Math.floor(Math.random() * 7);
    const randDay2 = (randDay1 + 3) % 7;
    avail[randDay1] = 'preferred_not';
    avail[randDay2] = 'unavailable';

    db.prepare(`
      INSERT INTO availability (
        personnel_id, week_start,
        day_0, day_1, day_2, day_3, day_4, day_5, day_6,
        submitted_at, is_locked
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      p.id, WEEK_START,
      avail[0], avail[1], avail[2], avail[3], avail[4], avail[5], avail[6],
      NOW
    );
  }
  console.log(`  ✓ ${pRows.length} Personel için bu haftaki müsaitlik eklendi`);

  // 8. Gelecek hafta müsaitlik (2026-06-08) — henüz gönderilmemiş, yani boş

})();

// ─── Özet ─────────────────────────────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅  TEST VERİTABANI HAZIR');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('🏢  Organizasyon : Gece Yarısı Bar & Bistro Grubu (pro plan)');
console.log('🍸  Şubeler      : Karaköy | Beyoğlu | Kadıköy');
console.log('🏠  Departmanlar : Mutfak, Bar, Salon (her şubede)\n');

console.log('─── GİRİŞ BİLGİLERİ ──────────────────────────────────────');
console.log('Tüm şifreler: test1234\n');
console.log('SÜPERVIZÖR PORTALI  →  http://localhost:3000/supervisor/login');
console.log('  admin   | admin@bargrubu.com  (Admin)');
console.log('  patron  | patron@bargrubu.com (Supervisor)\n');
console.log('MÜDÜR PORTALI  →  http://localhost:3000/login');
console.log('  mehmet.celik    (Karaköy Müdürü)');
console.log('  ayse.ozturk     (Beyoğlu Müdürü)');
console.log('  kemal.yildirim  (Kadıköy Müdürü)\n');
console.log('PERSONEL PORTALI  →  http://localhost:3000/portal/login');
console.log('  Karaköy : ali.kara | fatma.yildiz | huseyin.demir');
console.log('            zeynep.arslan | can.ozgur | selin.aydin');
console.log('            mustafa.sen | elif.kilic | burak.tekin');
console.log('  Beyoğlu : ibrahim.yilmaz | merve.koc | okan.bas');
console.log('            deniz.dogan | pinar.sahin | emre.cetin');
console.log('            gokhan.acar | tugce.bulut | serkan.gunes');
console.log('  Kadıköy : hatice.oz | tolga.kurt | gamze.polat');
console.log('            volkan.simsek | berna.guler | ugur.tan');
console.log('            cem.kaplan | aylin.aksoy | murat.erdogan');
console.log('\n─── VARDIYA TANIMLARI (her şubede aynı) ──────────────────');
console.log('  s1 → Öğle Vardiyası   11:00–19:00  (4 puan)');
console.log('  s2 → Akşam Vardiyası  15:00–23:00  (7 puan)');
console.log('  s3 → Gece Kapanış     19:00–03:00  (10 puan)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

db.close();
