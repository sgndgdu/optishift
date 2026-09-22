/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { distributeTipPool } from "@/lib/tips";

async function tipPoolingEnabled(db: ReturnType<typeof getDB>, locationId: string): Promise<boolean> {
  const loc = await db.prepare(`SELECT rules FROM locations WHERE id = ?`).get(locationId) as any;
  if (!loc?.rules) return false;
  try {
    const rules = JSON.parse(loc.rules);
    return rules.tip_pooling_enabled === true;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const location_id = searchParams.get("location_id");
  const db = getDB();

  try {
    // Kendi kazandığı prim toplamı (personel portalı kartı)
    if (auth.role === "employee") {
      if (!location_id) return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });
      if (!(await tipPoolingEnabled(db, location_id))) return NextResponse.json({ error: "Bahşiş havuzu kapalı" }, { status: 403 });

      const rows = await db.prepare(
        `SELECT ta.amount, ta.worked_minutes, tp.period_start, tp.period_end
         FROM tip_allocations ta
         JOIN tip_pools tp ON tp.id = ta.tip_pool_id
         WHERE ta.personnel_id = ? AND tp.location_id = ? AND tp.org_id = ?
         ORDER BY tp.period_start DESC`
      ).all(auth.personnel_id, location_id, auth.org_id) as any[];

      return NextResponse.json({
        total_amount: rows.reduce((sum, r) => sum + r.amount, 0),
        allocations: rows,
      });
    }

    if (id) {
      const pool = await db.prepare(`SELECT * FROM tip_pools WHERE id = ? AND org_id = ?`).get(id, auth.org_id) as any;
      if (!pool) return NextResponse.json({ error: "Havuz bulunamadı" }, { status: 404 });
      const allocations = await db.prepare(
        `SELECT ta.*, p.name as personnel_name
         FROM tip_allocations ta
         LEFT JOIN personnel p ON p.id = ta.personnel_id
         WHERE ta.tip_pool_id = ? ORDER BY ta.amount DESC`
      ).all(id) as any[];
      return NextResponse.json({ ...pool, allocations });
    }

    if (!location_id) return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });
    const loc = await db.prepare(`SELECT id FROM locations WHERE id = ? AND org_id = ?`).get(location_id, auth.org_id);
    if (!loc) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

    const pools = await db.prepare(
      `SELECT * FROM tip_pools WHERE location_id = ? AND org_id = ? ORDER BY period_start DESC`
    ).all(location_id, auth.org_id);
    return NextResponse.json(pools);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { location_id, period_start, period_end, total_amount } = body;
  if (!location_id || !period_start || !period_end || total_amount == null) {
    return NextResponse.json({ error: "location_id, period_start, period_end ve total_amount zorunlu" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period_start) || !/^\d{4}-\d{2}-\d{2}$/.test(period_end)) {
    return NextResponse.json({ error: "period_start/period_end YYYY-MM-DD formatında olmalı" }, { status: 400 });
  }
  if (period_end < period_start) return NextResponse.json({ error: "period_end period_start'tan önce olamaz" }, { status: 400 });
  if (typeof total_amount !== "number" || total_amount <= 0) {
    return NextResponse.json({ error: "total_amount 0'dan büyük olmalı" }, { status: 400 });
  }

  const db = getDB();
  try {
    const loc = await db.prepare(`SELECT id FROM locations WHERE id = ? AND org_id = ?`).get(location_id, auth.org_id);
    if (!loc) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    if (!(await tipPoolingEnabled(db, location_id))) return NextResponse.json({ error: "Bahşiş havuzu bu şubede kapalı" }, { status: 403 });

    const result = await db.prepare(
      `INSERT INTO tip_pools (org_id, location_id, period_start, period_end, total_amount, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`
    ).get(auth.org_id, location_id, period_start, period_end, total_amount, auth.id, Math.floor(Date.now() / 1000)) as any;

    return NextResponse.json({ id: result.id, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { id, action } = body;
  if (!id || action !== "distribute") return NextResponse.json({ error: "id ve action:'distribute' zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    const pool = await db.prepare(`SELECT location_id FROM tip_pools WHERE id = ? AND org_id = ?`).get(id, auth.org_id) as any;
    if (!pool) return NextResponse.json({ error: "Havuz bulunamadı" }, { status: 404 });
    if (!(await tipPoolingEnabled(db, pool.location_id))) return NextResponse.json({ error: "Bahşiş havuzu bu şubede kapalı" }, { status: 403 });

    const result = await distributeTipPool(id, auth.org_id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

    return NextResponse.json({ success: true, allocations: result.allocations });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
