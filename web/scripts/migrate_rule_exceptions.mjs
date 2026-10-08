/**
 * Tek seferlik geçiş (2026-10-08, kullanıcı isteği): çalışma kuralını esneten işlem hesap sahibinin onayına gider
 * (rule_exceptions), işletme geneli ayarlar için organizations.settings (ödünçte veren şubenin onayı açık/kapalı).
 * Veri silinmez. Çalıştırma: cd web && node scripts/migrate_rule_exceptions.mjs
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const dbUrl = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (!dbUrl) throw new Error("DATABASE_URL bulunamadı (.env.local)");
const sql = neon(dbUrl);
await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings text`;
await sql`CREATE TABLE IF NOT EXISTS rule_exceptions (
  id serial PRIMARY KEY,
  org_id text NOT NULL,
  location_id text,
  kind text NOT NULL,
  ref_key text NOT NULL,
  payload text,
  summary text NOT NULL,
  violations text,
  requested_by text,
  requested_by_name text,
  status text NOT NULL DEFAULT 'pending',
  created_at bigint,
  decided_by text,
  decided_at bigint
)`;
await sql`CREATE INDEX IF NOT EXISTS rule_exceptions_org_status_idx ON rule_exceptions (org_id, status)`;
console.log("hazır: organizations.settings ve rule_exceptions");
