/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";


export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const week_start  = searchParams.get("week_start");

  const db = getDB();
  try {
    let rows: any[];
    if (location_id && week_start) {
      const weekEnd = new Date(week_start + "T00:00:00");
      weekEnd.setDate(weekEnd.getDate() + 6);
      const weekEndStr = weekEnd.toISOString().split("T")[0];
      // Tek günlük ve aralıklı etkinlikler: haftayla örtüşen her şeyi al
      rows = await db.prepare(
        `SELECT * FROM location_events
         WHERE org_id = ? AND location_id = ?
           AND date <= ?
           AND (end_date IS NULL AND date >= ? OR end_date IS NOT NULL AND end_date >= ?)
         ORDER BY date ASC`
      ).all(auth.org_id, location_id, weekEndStr, week_start, week_start) as any[];
    } else if (location_id) {
      rows = await db.prepare(
        `SELECT * FROM location_events WHERE org_id = ? AND location_id = ? ORDER BY date ASC`
      ).all(auth.org_id, location_id) as any[];
    } else {
      rows = await db.prepare(
        `SELECT * FROM location_events WHERE org_id = ? ORDER BY date ASC`
      ).all(auth.org_id) as any[];
    }
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "admin" && auth.role !== "manager" && auth.role !== "supervisor") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const body = await req.json();
    const { location_id, date, end_date, title, type, scope, note } = body;
    if (!location_id || !date || !title?.trim()) {
      return NextResponse.json({ error: "location_id, date ve title zorunlu" }, { status: 400 });
    }

    // Org izolasyonu — lokasyonun bu org'a ait olduğunu doğrula
    const loc = await db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
    if (!loc) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    const result = await db.prepare(
      `INSERT INTO location_events (org_id, location_id, date, end_date, title, type, scope, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(auth.org_id, location_id, date, end_date || null, title.trim(), type || "diger", scope || "day", note || null, auth.id);

    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "admin" && auth.role !== "manager" && auth.role !== "supervisor") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    await db.prepare("DELETE FROM location_events WHERE id = ? AND org_id = ?").run(id, auth.org_id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
