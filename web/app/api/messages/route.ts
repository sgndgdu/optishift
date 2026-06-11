/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { requireAuth } from "@/lib/auth";

const DB_PATH = path.join(process.cwd(), "optishift.db");

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = OFF");
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id TEXT NOT NULL,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT,
      group_id TEXT,
      content TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at INTEGER
    )
  `);
  return db;
}

// GET: Konuşma geçmişini getir
// ?from_user_id=...&to_user_id=... (1-to-1)
// ?group_id=...               (grup kanalı)
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const to_user_id = searchParams.get("to_user_id");
  const group_id   = searchParams.get("group_id");
  const org_id     = auth.org_id;
  const me         = auth.id; // always use auth token — ignore from_user_id query param

  const db = getDb();
  try {
    let rows: any[];
    if (group_id) {
      rows = db.prepare(`
        SELECT m.*, u.name as from_name, u.role as from_role
        FROM messages m
        LEFT JOIN users u ON m.from_user_id = u.id
        WHERE m.org_id = ? AND m.group_id = ?
        ORDER BY m.created_at ASC
        LIMIT 200
      `).all(org_id, group_id);

      // Mark group messages from others as read
      db.prepare(`
        UPDATE messages SET is_read = 1
        WHERE org_id = ? AND group_id = ? AND from_user_id != ? AND is_read = 0
      `).run(org_id, group_id, me);
    } else if (to_user_id) {
      rows = db.prepare(`
        SELECT m.*, u.name as from_name, u.role as from_role
        FROM messages m
        LEFT JOIN users u ON m.from_user_id = u.id
        WHERE m.org_id = ?
          AND ((m.from_user_id = ? AND m.to_user_id = ?)
            OR (m.from_user_id = ? AND m.to_user_id = ?))
        ORDER BY m.created_at ASC
        LIMIT 200
      `).all(org_id, me, to_user_id, to_user_id, me);

      // Mark incoming messages as read
      db.prepare(`
        UPDATE messages SET is_read = 1
        WHERE org_id = ? AND from_user_id = ? AND to_user_id = ? AND is_read = 0
      `).run(org_id, to_user_id, me);
    } else {
      return NextResponse.json({ error: "group_id veya to_user_id zorunlu" }, { status: 400 });
    }
    db.close();
    return NextResponse.json(rows);
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Yeni mesaj gönder
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDb();
  try {
    const body = await req.json();
    const { to_user_id, group_id, content } = body;
    // org_id ve from_user_id token'dan alınır; body'deki değerlere güvenilmez
    const org_id = auth.org_id;
    const from_user_id = auth.id;

    if (!content?.trim()) {
      return NextResponse.json({ error: "Mesaj içeriği boş olamaz" }, { status: 400 });
    }
    if (!to_user_id && !group_id) {
      return NextResponse.json({ error: "to_user_id veya group_id zorunlu" }, { status: 400 });
    }

    const now = Math.floor(Date.now() / 1000);
    const result = db.prepare(`
      INSERT INTO messages (org_id, from_user_id, to_user_id, group_id, content, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(org_id, from_user_id, to_user_id ?? null, group_id ?? null, content.trim(), now);

    db.close();
    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/messages/contacts — müdür listesini getir (supervisor için)
// Ayrı bir route olarak değil, ?contacts=true query ile
