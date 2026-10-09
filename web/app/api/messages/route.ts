/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { canAccessChatGroup } from "@/lib/access";
import { chatGroupMembers, chatState, clearConversation, convKey, markRead, MANAGERS_GROUP } from "@/lib/chat";
import { sendPushToUser } from "@/lib/notifications";


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

  const db = getDB();
  try {
    let rows: any[];
    // Grup: sadece kapsamdaki şubenin grubu (lib/access)
    if (group_id && !(await canAccessChatGroup(db, auth, group_id))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    // Kişinin temizlediği mesajlar gösterilmez, okundu kişi başı (lib/chat)
    const key = convKey(group_id, to_user_id);
    const { cleared_id } = group_id || to_user_id ? await chatState(db, me, key) : { cleared_id: 0 };
    if (group_id) {
      // Son 200 mesaj (eskiden en eski 200 geliyordu, uzun grupta yeni mesajlar hiç görünmüyordu)
      rows = (await db.prepare(`
        SELECT m.*, u.name as from_name, u.role as from_role
        FROM messages m
        LEFT JOIN users u ON m.from_user_id = u.id
        WHERE m.org_id = ? AND m.group_id = ? AND m.id > ?
        ORDER BY m.id DESC
        LIMIT 200
      `).all(org_id, group_id, cleared_id) as any[]).reverse();
      if (rows.length) await markRead(db, me, key, Number(rows[rows.length - 1].id));
    } else if (to_user_id) {
      rows = (await db.prepare(`
        SELECT m.*, u.name as from_name, u.role as from_role
        FROM messages m
        LEFT JOIN users u ON m.from_user_id = u.id
        WHERE m.org_id = ?
          AND ((m.from_user_id = ? AND m.to_user_id = ?)
            OR (m.from_user_id = ? AND m.to_user_id = ?))
          AND m.id > ?
        ORDER BY m.id DESC
        LIMIT 200
      `).all(org_id, me, to_user_id, to_user_id, me, cleared_id) as any[]).reverse();

      // Mark incoming messages as read
      await db.prepare(`
        UPDATE messages SET is_read = true
        WHERE org_id = ? AND from_user_id = ? AND to_user_id = ? AND is_read = false
      `).run(org_id, to_user_id, me);
    } else {
      return NextResponse.json({ error: "group_id veya to_user_id zorunlu" }, { status: 400 });
    }
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Yeni mesaj gönder
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
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
    // Alıcı aynı işletmede, grup kapsamda olmalı
    if (group_id && !(await canAccessChatGroup(db, auth, group_id))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    if (to_user_id && !(await db.prepare("SELECT 1 FROM users WHERE id = ? AND org_id = ?").get(to_user_id, org_id))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

    if (content.trim().length > 2000) return NextResponse.json({ error: "Mesaj çok uzun" }, { status: 400 });

    const now = Math.floor(Date.now() / 1000);
    const result = await db.prepare(`
      INSERT INTO messages (org_id, from_user_id, to_user_id, group_id, content, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, false, ?)
    `).run(org_id, from_user_id, to_user_id ?? null, group_id ?? null, content.trim(), now);
    // Kendi mesajı okunmuş sayılır; alıcılara telefon bildirimi (zile yazılmaz, mesajlar kendi sayacında)
    await markRead(db, from_user_id, convKey(group_id, to_user_id), Number(result.lastInsertRowid) || 0).catch(() => {});
    const preview = content.trim().length > 120 ? `${content.trim().slice(0, 117)}…` : content.trim();
    const recipients = group_id ? (await chatGroupMembers(db, org_id, group_id)).filter(id => id !== from_user_id) : [to_user_id];
    const groupName = group_id === MANAGERS_GROUP ? "Sorumlular" : group_id
      ? ((await db.prepare("SELECT name FROM locations WHERE id = ?").get(group_id.slice(4)) as { name?: string } | undefined)?.name ?? "Grup") : null;
    const roles = recipients.length ? await db.prepare(`SELECT id, role FROM users WHERE id IN (${recipients.map(() => "?").join(",")})`).all(...recipients) as { id: string; role: string }[] : [];
    await Promise.allSettled(roles.map(r => sendPushToUser(r.id, org_id, {
      title: groupName ? `${groupName} · ${auth.name ?? "Mesaj"}` : (auth.name ?? "Yeni mesaj"),
      body: preview,
      url: r.role === "employee" ? "/portal/chat" : "/chat",
    })));
    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Sohbeti temizle. Sadece temizleyen kişinin ekranından kalkar, karşı tarafın ve grubun mesajları durur
// (eskiden grubun herhangi bir üyesi bütün grup mesajlarını herkes için siliyordu).
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const to_user_id = searchParams.get("to_user_id");
  const group_id   = searchParams.get("group_id");
  const org_id     = auth.org_id;
  const me         = auth.id;

  const db = getDB();
  try {
    if (!group_id && !to_user_id) return NextResponse.json({ error: "group_id veya to_user_id zorunlu" }, { status: 400 });
    if (group_id && !(await canAccessChatGroup(db, auth, group_id))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    const last = group_id
      ? await db.prepare("SELECT MAX(id) AS id FROM messages WHERE org_id = ? AND group_id = ?").get(org_id, group_id) as { id?: number }
      : await db.prepare(`SELECT MAX(id) AS id FROM messages WHERE org_id = ? AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))`).get(org_id, me, to_user_id, to_user_id, me) as { id?: number };
    await clearConversation(db, me, convKey(group_id, to_user_id), Number(last?.id ?? 0));
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
