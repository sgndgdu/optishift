/**
 * Bütün şubelerin son N yayınlanmış haftasını yeni Adalet Puanı kuralıyla yeniden puanlar (lib/scoring rescoreWeek).
 * Bildirim göndermez, idempotent. Formül değişikliğinden sonra kullanılır (2026-10-10).
 * Çalıştırma: cd web && npx tsx --env-file=.env.local scripts/rescore_window.ts [hafta sayısı, varsayılan 4]
 */
import { neon } from "@neondatabase/serverless";
import { rescoreWeek } from "@/lib/scoring";
import { businessToday, weekStartOf, addDays } from "@/lib/date";

async function main() {
  const weeks = Number(process.argv[2] ?? 4);
  const sql = neon(process.env.DATABASE_URL!);
  const current = weekStartOf(businessToday());
  const from = addDays(current, -7 * weeks);

  const rows = await sql`
    SELECT DISTINCT sa.location_id, sa.week_start, l.org_id, l.name
    FROM shift_assignments sa JOIN locations l ON l.id = sa.location_id
    WHERE sa.publication_status = 'published' AND sa.week_start >= ${from}
    ORDER BY sa.week_start, l.name`;
  for (const r of rows) {
    await rescoreWeek(r.org_id as string, r.location_id as string, r.week_start as string);
    console.log(`${r.week_start} · ${r.name}`);
  }
  console.log(`${rows.length} şube-hafta yeniden puanlandı`);
}

main().catch(e => { console.error(e); process.exit(1); });
