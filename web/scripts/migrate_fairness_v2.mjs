/**
 * Tek seferlik geçiş (2026-10-10): Adalet Puanı yeni yapı (lib/fairness, kullanıcı onayı).
 * 1. shift_assignments.comp_leave_days sütunu (denkleştirme izni, lib/compLeave). Boş sütun, veri silinmez.
 * 2. Her şubenin kuralları yüzde alanlarına çevrilir; ESKİ alanlar silinmez (geri dönüş için durur):
 *    - Haftanın günleri: şubenin bugün uygulanan gün puanı (eski varsayılan dahil) 8 saat üzerinden yüzdeye (4 → %50)
 *    - Resmi tatil %100, tercih etmem %50 (kullanıcı kararı), özel günler yüzdeye
 *    - Boş vardiyayı alan %50, izin gününde çağrılan %100; aç/kapa durumları korunur
 *    - Başka şube eski düz puanı saat sayılır (dakikaya), denkleştirme izni kapalı başlar
 * 3. Vardiya tanımlarına difficulty_pct: eski zorluk 7 ve üstü %50 (zor), altı %0 (sıradan)
 * 4. Her şubenin kural değişikliği kaydına tek satır yazılır (ekip görür).
 * Yeni alan zaten varsa dokunulmaz (tekrar çalıştırılabilir).
 * Çalıştırma: cd web && node scripts/migrate_fairness_v2.mjs        (deneme: sadece yazdırır)
 *             cd web && node scripts/migrate_fairness_v2.mjs --apply
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const APPLY = process.argv.includes("--apply");
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const dbUrl = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (!dbUrl) throw new Error("DATABASE_URL bulunamadı (.env.local)");
const sql = neon(dbUrl);

const toPct = p => Math.round((Number(p) / 8) * 100 / 5) * 5;
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : d);
const parse = (raw, fb) => { if (raw == null || raw === "") return fb; if (typeof raw !== "string") return raw; try { return JSON.parse(raw); } catch { return fb; } };

if (APPLY) {
  await sql`ALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS comp_leave_days double precision`;
  console.log("shift_assignments.comp_leave_days hazır");
}

const locs = await sql`SELECT id, org_id, name, rules, shift_definitions FROM locations ORDER BY org_id, name`;
const now = Math.floor(Date.now() / 1000);
let changed = 0;
for (const loc of locs) {
  const r = parse(loc.rules, {}) ?? {};
  const defs = parse(loc.shift_definitions, []) ?? [];
  const next = { ...r };
  const notes = [];

  if (!Array.isArray(r.hard_day_pct)) {
    // Eski hesabın bugün uyguladığı değer (lib/fairness eski resolveHardDayRules)
    let pts;
    if (Array.isArray(r.hard_day_points) && r.hard_day_points.length === 7) pts = r.hard_day_points.map(v => num(v, 0));
    else { const legacy = num(r.hard_shift_points, 4); const w = r.hard_shift_weekend !== false ? legacy : 0; pts = [0, 0, 0, 0, 0, w, w]; }
    next.hard_day_pct = pts.map(toPct);
    notes.push(`günler ${JSON.stringify(pts)} → %${JSON.stringify(next.hard_day_pct)}`);
  }
  if (typeof r.holiday_pct !== "number") { next.holiday_pct = 100; notes.push(`bayram ${r.holiday_points ?? 0} → %100`); }
  if (typeof r.pref_not_pct !== "number") { next.pref_not_pct = 50; notes.push(`tercih etmem → %50`); }
  if (Array.isArray(r.special_date_points) && r.special_date_points.some(s => s && typeof s.pct !== "number")) {
    next.special_date_points = r.special_date_points.map(s => (s && typeof s.pct !== "number" ? { ...s, pct: toPct(num(s.points, 0)) } : s));
    notes.push(`özel günler yüzdeye`);
  }
  if (typeof r.hero_bonus_pct !== "number") { next.hero_bonus_pct = 50; notes.push(`boş vardiya ${r.hero_bonus_points ?? 6} → %50${r.hero_bonus_enabled === false ? " (kapalı)" : ""}`); }
  if (typeof r.force_bonus_pct !== "number") { next.force_bonus_pct = 100; notes.push(`izin günü ${r.force_bonus_points ?? 5} → %100${r.force_bonus_enabled === false ? " (kapalı)" : ""}`); }
  if (typeof r.away_travel_minutes !== "number" && typeof r.away_shift_points === "number") { next.away_travel_minutes = r.away_shift_points * 60; notes.push(`başka şube ${r.away_shift_points} → ${next.away_travel_minutes} dk`); }
  if (typeof r.force_comp_leave_enabled !== "boolean") next.force_comp_leave_enabled = false;

  let defsChanged = false;
  const nextDefs = Array.isArray(defs) ? defs.map(d => {
    if (!d || typeof d.difficulty_pct === "number") return d;
    defsChanged = true;
    const pct = Number(d.base_points ?? 5) >= 7 ? 50 : 0;
    notes.push(`${d.name}: zorluk ${d.base_points ?? 5} → %${pct}`);
    return { ...d, difficulty_pct: pct };
  }) : defs;

  if (notes.length === 0 && JSON.stringify(next) === JSON.stringify(r)) continue;
  changed++;
  console.log(`${loc.org_id} · ${loc.name}: ${notes.join(" · ")}`);
  if (APPLY) {
    await sql`UPDATE locations SET rules = ${JSON.stringify(next)}, shift_definitions = ${JSON.stringify(nextDefs)} WHERE id = ${loc.id}`;
    if (notes.length) {
      await sql`INSERT INTO fairness_rule_changes (org_id, location_id, source, summary, changed_by, changed_by_name, created_at)
        VALUES (${loc.org_id}, ${loc.id}, 'settings', ${"Adalet Puanı yeni yapıya geçti: 1 puan sıradan vardiyada 1 saat, zorluk ve zor günler yüzde olarak eklenir. Bayram %100, tercih etmem %50, boş vardiyayı alan %50, izin gününde çağrılan %100."}, ${null}, ${"OptiShift"}, ${now})`;
    }
  }
  void defsChanged;
}
console.log(`${changed} şube ${APPLY ? "güncellendi" : "güncellenecek (deneme)"}`);
