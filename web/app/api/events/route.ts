/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { requireAuth } from "@/lib/auth";

const DB_PATH = path.join(process.cwd(), "optishift.db");

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const week_start  = searchParams.get("week_start");

  const db = new Database(DB_PATH);
  try {
    let rows: any[];
    if (location_id && week_start) {
      const weekEnd = new Date(week_start + "T00:00:00");
      weekEnd.setDate(weekEnd.getDate() + 6);
      const weekEndStr = weekEnd.toISOString().split("T")[0];
      rows = db.prepare(
        `SELECT * FROM location_events WHERE org_id = ? AND location_id = ? AND date >= ? AND date <= ? ORDER BY date ASC`
      ).all(auth.org_id, location_id, week_start, weekEndStr) as any[];
    } else if (location_id) {
      rows = db.prepare(
        `SELECT * FROM location_events WHERE org_id = ? AND location_id = ? ORDER BY date ASC`
      ).all(auth.org_id, location_id) as any[];
    } else {
      rows = db.prepare(
        `SELECT * FROM location_events WHERE org_id = ? ORDER BY date ASC`
      ).all(auth.org_id) as any[];
    }
    db.close();
    return NextResponse.json(rows);
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "admin" && auth.role !== "manager" && auth.role !== "supervisor") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = new Database(DB_PATH);
  try {
    const body = await req.json();
    const { location_id, date, title, type, note } = body;
    if (!location_id || !date || !title?.trim()) {
      db.close();
      return NextResponse.json({ error: "location_id, date ve title zorunlu" }, { status: 400 });
    }

    // Org izolasyonu — lokasyonun bu org'a ait olduğunu doğrula
    const loc = db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
    if (!loc) {
      db.close();
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    db.prepare(
      `INSERT INTO location_events (org_id, location_id, date, title, type, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(auth.org_id, location_id, date, title.trim(), type || "diger", note || null, auth.id);

    const row = db.prepare("SELECT last_insert_rowid() as id").get() as { id: number };
    db.close();
    return NextResponse.json({ success: true, id: row.id });
  } catch (err: any) {
    db.close();
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

  const db = new Database(DB_PATH);
  try {
    db.prepare("DELETE FROM location_events WHERE id = ? AND org_id = ?").run(id, auth.org_id);
    db.close();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
