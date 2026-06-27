import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";


export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const group_id = searchParams.get("group_id");
  const to_user_id = searchParams.get("to_user_id");
  const org_id = auth.org_id;
  const me = auth.id;

  if (!group_id && !to_user_id) {
    return new NextResponse("group_id or to_user_id required", { status: 400 });
  }

  // since_id: Last-Event-ID header takes priority (browser auto-sends on reconnect)
  const lastEventId = req.headers.get("last-event-id");
  let lastId = parseInt(lastEventId ?? searchParams.get("since_id") ?? "0", 10);
  if (isNaN(lastId)) lastId = 0;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send a heartbeat immediately so the client knows it's connected
      controller.enqueue(encoder.encode(": connected\n\n"));

      const db = getDB();

      const poll = async () => {
        try {
          let rows: Record<string, unknown>[];

          if (group_id) {
            rows = await db.prepare(
              `SELECT m.*, u.name as sender_name
               FROM messages m
               LEFT JOIN users u ON u.id = m.from_user_id
               WHERE m.org_id = ? AND m.group_id = ? AND m.id > ?
               ORDER BY m.id ASC`
            ).all(org_id, group_id, lastId) as Record<string, unknown>[];

            if (rows.length > 0) {
              // Mark group messages as read
              await db.prepare(
                `UPDATE messages SET is_read = true
                 WHERE org_id = ? AND group_id = ? AND from_user_id != ? AND is_read = false`
              ).run(org_id, group_id, me);
            }
          } else {
            rows = await db.prepare(
              `SELECT m.*, u.name as sender_name
               FROM messages m
               LEFT JOIN users u ON u.id = m.from_user_id
               WHERE m.org_id = ?
                 AND ((m.from_user_id = ? AND m.to_user_id = ?)
                   OR (m.from_user_id = ? AND m.to_user_id = ?))
                 AND m.id > ?
               ORDER BY m.id ASC`
            ).all(org_id, me, to_user_id, to_user_id, me, lastId) as Record<string, unknown>[];

            if (rows.length > 0) {
              // Mark incoming messages as read
              await db.prepare(
                `UPDATE messages SET is_read = true
                 WHERE org_id = ? AND from_user_id = ? AND to_user_id = ? AND is_read = false`
              ).run(org_id, to_user_id, me);
            }
          }

          for (const row of rows) {
            const id = row.id as number;
            const data = JSON.stringify(row);
            controller.enqueue(encoder.encode(`id: ${id}\ndata: ${data}\n\n`));
            if (id > lastId) lastId = id;
          }
        } catch {
          // DB error — skip this tick
        }
      };

      poll(); // immediate first poll
      const interval = setInterval(poll, 500);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try { db.close(); } catch { /* already closed */ }
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
