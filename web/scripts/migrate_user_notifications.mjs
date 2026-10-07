/**
 * Tek seferlik geçiş (2026-10-07, kullanıcı onayı): bildirimler ve telefon bildirimi abonelikleri hesaba
 * (users.id) da bağlanabilsin. Çalışan kaydı olmayan sorumlu ve hesap sahibi de bildirim alır.
 * Veri silinmez: yeni boş alan + personnel_id artık zorunlu değil. Çalıştırma: cd web && node scripts/migrate_user_notifications.mjs
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const dbUrl = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (!dbUrl) throw new Error("DATABASE_URL bulunamadı (.env.local)");
const sql = neon(dbUrl);
await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id text`;
await sql`ALTER TABLE notifications ALTER COLUMN personnel_id DROP NOT NULL`;
await sql`CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id)`;
await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_id text`;
await sql`ALTER TABLE push_subscriptions ALTER COLUMN personnel_id DROP NOT NULL`;
const [n] = await sql`SELECT COUNT(*)::int AS n FROM notifications`;
const [p] = await sql`SELECT COUNT(*)::int AS n FROM push_subscriptions`;
console.log("hazır: notifications", n.n, "satır, push_subscriptions", p.n, "satır (dokunulmadı)");
