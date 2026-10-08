/**
 * Tek seferlik geçiş (2026-10-08, kullanıcı isteği): ekip anketi (vardiya zorluğu), Adalet Puanı kural değişikliği
 * kaydı ve motorun hazırladığı planın kişi başı kopyası (elle yapılan değişikliklerin yük etkisi için).
 * Veri silinmez. Çalıştırma: cd web && node scripts/migrate_fairness_survey.mjs
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const dbUrl = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (!dbUrl) throw new Error("DATABASE_URL bulunamadı (.env.local)");
const sql = neon(dbUrl);
await sql`CREATE TABLE IF NOT EXISTS fairness_surveys (
  id serial PRIMARY KEY,
  org_id text NOT NULL,
  location_id text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  shifts text NOT NULL,
  day_points text NOT NULL,
  closes_at bigint NOT NULL,
  created_by text,
  created_by_name text,
  created_at bigint,
  closed_at bigint,
  applied text,
  applied_by_name text,
  applied_at bigint
)`;
await sql`CREATE INDEX IF NOT EXISTS fairness_surveys_loc_idx ON fairness_surveys (org_id, location_id, status)`;
await sql`CREATE TABLE IF NOT EXISTS fairness_survey_responses (
  id serial PRIMARY KEY,
  survey_id integer NOT NULL,
  org_id text NOT NULL,
  personnel_id text NOT NULL,
  answers text NOT NULL,
  created_at bigint,
  updated_at bigint,
  UNIQUE (survey_id, personnel_id)
)`;
await sql`CREATE TABLE IF NOT EXISTS fairness_rule_changes (
  id serial PRIMARY KEY,
  org_id text NOT NULL,
  location_id text NOT NULL,
  source text NOT NULL,
  summary text NOT NULL,
  changed_by text,
  changed_by_name text,
  created_at bigint
)`;
await sql`CREATE INDEX IF NOT EXISTS fairness_rule_changes_loc_idx ON fairness_rule_changes (org_id, location_id, created_at)`;
await sql`CREATE TABLE IF NOT EXISTS plan_generations (
  id serial PRIMARY KEY,
  org_id text NOT NULL,
  location_id text NOT NULL,
  week_start text NOT NULL,
  personnel_id text NOT NULL,
  assignments text NOT NULL,
  created_at bigint,
  UNIQUE (location_id, week_start, personnel_id)
)`;
console.log("hazır: fairness_surveys, fairness_survey_responses, fairness_rule_changes, plan_generations");
