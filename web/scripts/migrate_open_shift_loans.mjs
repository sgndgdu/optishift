/**
 * Tek seferlik geçiş (2026-10-08, kullanıcı isteği "eksikleri gider"): başka şubeden ödünç alınan vardiya
 * kişinin kendi şubesinin sorumlusu onaylayınca kesinleşir. open_shifts'e üç boş alan eklenir, veri silinmez.
 * Çalıştırma: cd web && node scripts/migrate_open_shift_loans.mjs
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const dbUrl = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (!dbUrl) throw new Error("DATABASE_URL bulunamadı (.env.local)");
const sql = neon(dbUrl);
await sql`ALTER TABLE open_shifts ADD COLUMN IF NOT EXISTS created_by text`;
await sql`ALTER TABLE open_shifts ADD COLUMN IF NOT EXISTS loan_home_location_id text`;
await sql`ALTER TABLE open_shifts ADD COLUMN IF NOT EXISTS loan_declined text`;
const [n] = await sql`SELECT COUNT(*)::int AS n FROM open_shifts`;
console.log("hazır: open_shifts", n.n, "satır (dokunulmadı)");
