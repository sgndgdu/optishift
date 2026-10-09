/**
 * Tek seferlik geçiş (2026-10-09): mesajlaşmada kişi başı okundu ve "sohbeti temizle" bilgisi (chat_state).
 * Eskiden grupta biri okuyunca mesaj herkes için okundu sayılıyordu, sohbeti temizleyen grubun mesajlarını
 * herkes için siliyordu. conv_key: "g:<grup>" ya da "u:<karşı kişi>". Veri silinmez.
 * Çalıştırma: cd web && node scripts/migrate_chat_state.mjs
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const dbUrl = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (!dbUrl) throw new Error("DATABASE_URL bulunamadı (.env.local)");
const sql = neon(dbUrl);
await sql`CREATE TABLE IF NOT EXISTS chat_state (
  user_id text NOT NULL,
  conv_key text NOT NULL,
  last_read_id integer NOT NULL DEFAULT 0,
  cleared_id integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, conv_key)
)`;
await sql`CREATE INDEX IF NOT EXISTS messages_org_group_idx ON messages (org_id, group_id, id)`;
console.log("hazır: chat_state");
