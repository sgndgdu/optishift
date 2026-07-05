/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";
import { rescoreWeek } from "@/lib/scoring";

// POST /api/god/rescore — { location_id, week_start }
// Bir haftayı bildirim GÖNDERMEDEN yeniden puanlar (rescoreWeek idempotent).
// Veri onarımı sonrası puanları tazelemek için God Mode bakım aracı.
// Auth: proxy /api/god/* altında god token'ı zorunlu kılar.
export async function POST(req: NextRequest) {
  const db = getDB();
  try {
    const { location_id, week_start } = await req.json();
    if (!location_id || !week_start) {
      return NextResponse.json({ error: "location_id ve week_start zorunlu" }, { status: 400 });
    }

    const loc = await db.prepare(`SELECT id, org_id, name FROM locations WHERE id = ?`).get(location_id) as any;
    if (!loc) return NextResponse.json({ error: "Lokasyon bulunamadı" }, { status: 404 });

    await rescoreWeek(loc.org_id, location_id, week_start);

    // Audit log
    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;
    await db.prepare(
      `INSERT INTO admin_audit_log (action, target_org_id, payload, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5)`
    ).run(
      `rescore: ${loc.name} ${week_start}`,
      loc.org_id,
      JSON.stringify({ location_id, week_start }),
      ip,
      Math.floor(Date.now() / 1000)
    );

    return NextResponse.json({ ok: true, location: loc.name, week_start });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
