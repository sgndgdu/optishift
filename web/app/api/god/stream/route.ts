/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";
import { getDB } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lastEventId = req.headers.get("last-event-id");
  let lastId = parseInt(lastEventId ?? searchParams.get("since_id") ?? "0", 10);
  if (isNaN(lastId)) lastId = 0;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));

      const db = getDB();

      const poll = async () => {
        try {
          const rows = (await db.prepare(
            `SELECT * FROM platform_events WHERE id > $1 ORDER BY id ASC LIMIT 30`
          ).all(lastId)) as any[];

          for (const row of rows) {
            const id = row.id as number;
            const data = JSON.stringify({
              ...row,
              meta: row.meta ? JSON.parse(row.meta) : null,
            });
            controller.enqueue(encoder.encode(`id: ${id}\ndata: ${data}\n\n`));
            if (id > lastId) lastId = id;
          }
        } catch {
          // DB hatası — bu tick atla
        }
      };

      poll();
      const interval = setInterval(poll, 3000);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try { db.close(); } catch { /* noop */ }
        try { controller.close(); } catch { /* noop */ }
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
