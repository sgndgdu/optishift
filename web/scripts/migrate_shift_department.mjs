/**
 * Tek seferlik geçiş (2026-10-05): shift_assignments.department_id. Çok departmanlı kişinin
 * vardiyasının hangi departman için olduğunu tutar. Çalıştırma: cd web && node scripts/migrate_shift_department.mjs
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const dbUrl = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (!dbUrl) throw new Error("DATABASE_URL bulunamadı (.env.local)");
const sql = neon(dbUrl);
await sql`ALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS department_id text`;
console.log("shift_assignments.department_id hazır");
