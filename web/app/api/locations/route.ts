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
  const id = searchParams.get("id");

  const db = new Database(DB_PATH);
  try {
    let rows;
    // Manager sadece kendi şubesini görebilir
    if (auth.role === "manager" && auth.location_id) {
      rows = db.prepare("SELECT * FROM locations WHERE id = ? AND org_id = ?").all(auth.location_id, auth.org_id);
    } else if (id) {
      rows = db.prepare("SELECT * FROM locations WHERE id = ? AND org_id = ?").all(id, auth.org_id);
    } else {
      rows = db.prepare("SELECT * FROM locations WHERE org_id = ?").all(auth.org_id);
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

  if (auth.role !== "admin" && auth.role !== "supervisor") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = new Database(DB_PATH);
  try {
    const body = await req.json();
    const { name } = body;
    if (!name?.trim()) {
      return NextResponse.json({ error: "name zorunlu" }, { status: 400 });
    }

    // Plan limit kontrolü: free plan en fazla 1 lokasyon
    const org = db.prepare("SELECT plan FROM organizations WHERE id = ?").get(auth.org_id) as any;
    if (!org || org.plan === "free" || !org.plan) {
      const locCount = (db.prepare("SELECT COUNT(*) as cnt FROM locations WHERE org_id = ?").get(auth.org_id) as any).cnt;
      if (locCount >= 1) {
        db.close();
        return NextResponse.json(
          { error: "Free plan limiti: 1 şube. Daha fazla şube için Pro'ya geçin.", upgrade: true },
          { status: 402 }
        );
      }
    }

    const id = `L-${Date.now()}`;
    // org_id token'dan alınır
    db.prepare(`INSERT INTO locations (id, org_id, name) VALUES (?, ?, ?)`).run(id, auth.org_id, name.trim());
    db.close();
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

  const db = new Database(DB_PATH);
  try {
    // Lokasyonun bu org'a ait olduğunu doğrula
    const existing = db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(id, auth.org_id);
    if (!existing) {
      db.close();
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }
    const body = await req.json();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.shift_definitions !== undefined) {
      updates.push("shift_definitions = ?");
      values.push(typeof body.shift_definitions === "string" ? body.shift_definitions : JSON.stringify(body.shift_definitions));
    }
    if (body.operating_hours !== undefined) {
      updates.push("operating_hours = ?");
      values.push(typeof body.operating_hours === "string" ? body.operating_hours : JSON.stringify(body.operating_hours));
    }
    if (body.name !== undefined) {
      updates.push("name = ?");
      values.push(body.name);
    }
    if (body.zone_quotas !== undefined) {
      updates.push("zone_quotas = ?");
      values.push(typeof body.zone_quotas === "string" ? body.zone_quotas : JSON.stringify(body.zone_quotas));
    }
    if (body.rules !== undefined) {
      updates.push("rules = ?");
      values.push(typeof body.rules === "string" ? body.rules : JSON.stringify(body.rules));
    }
    if (body.demand_matrix !== undefined) {
      updates.push("demand_matrix = ?");
      values.push(typeof body.demand_matrix === "string" ? body.demand_matrix : JSON.stringify(body.demand_matrix));
    }
    if (body.leave_policy !== undefined) {
      updates.push("leave_policy = ?");
      values.push(typeof body.leave_policy === "string" ? body.leave_policy : JSON.stringify(body.leave_policy));
    }
    if (body.latitude !== undefined) {
      updates.push("latitude = ?");
      values.push(body.latitude === null ? null : Number(body.latitude));
    }
    if (body.longitude !== undefined) {
      updates.push("longitude = ?");
      values.push(body.longitude === null ? null : Number(body.longitude));
    }

    if (updates.length === 0) return NextResponse.json({ error: "Güncellenecek alan yok" }, { status: 400 });

    values.push(id);
    db.prepare(`UPDATE locations SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    db.close();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
