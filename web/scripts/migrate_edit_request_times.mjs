/**
 * Tek seferlik geçiş (2026-10-10): saat düzeltme talebine istenen başlangıç ve bitiş saati.
 * Ekip üyesi "geç çıktım / saatim farklıydı" der, sorumlu onaylayınca vardiya bu saate çekilir.
 * Sadece iki boş sütun eklenir, veri silinmez.
 * Çalıştırma: cd web && node scripts/migrate_edit_request_times.mjs
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const dbUrl = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (!dbUrl) throw new Error("DATABASE_URL bulunamadı (.env.local)");
const sql = neon(dbUrl);

await sql`ALTER TABLE shift_edit_requests ADD COLUMN IF NOT EXISTS requested_start text`;
await sql`ALTER TABLE shift_edit_requests ADD COLUMN IF NOT EXISTS requested_end text`;
console.log("shift_edit_requests: requested_start, requested_end hazır");
