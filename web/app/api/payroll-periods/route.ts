/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// GET ?location_id=&month=YYYY-MM (month opsiyonel) → kilitli dönem(ler)
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const month = searchParams.get("month");
  if (!location_id) return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    const rows = month
      ? await db.prepare(`SELECT * FROM payroll_periods WHERE location_id = ? AND org_id = ? AND month = ?`).all(location_id, auth.org_id, month)
      : await db.prepare(`SELECT * FROM payroll_periods WHERE location_id = ? AND org_id = ? ORDER BY month DESC`).all(location_id, auth.org_id);
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST { location_id, month } — dönemi kilitler (manager/admin/supervisor)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { location_id, month } = body;
  if (!location_id || !/^\d{4}-\d{2}$/.test(month ?? "")) {
    return NextResponse.json({ error: "location_id ve month (YYYY-MM) zorunlu" }, { status: 400 });
  }

  const db = getDB();
  try {
    const loc = await db.prepare(`SELECT id FROM locations WHERE id = ? AND org_id = ?`).get(location_id, auth.org_id);
    if (!loc) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

    const existing = await db.prepare(
      `SELECT id FROM payroll_periods WHERE location_id = ? AND org_id = ? AND month = ?`
    ).get(location_id, auth.org_id, month);
    if (existing) return NextResponse.json({ error: "Bu dönem zaten kilitli" }, { status: 409 });

    const result = await db.prepare(`
      INSERT INTO payroll_periods (org_id, location_id, month, locked_by, locked_by_name, locked_at)
      VALUES (?, ?, ?, ?, ?, ?) RETURNING id
    `).get(auth.org_id, location_id, month, auth.personnel_id, auth.name ?? null, Math.floor(Date.now() / 1000)) as any;

    return NextResponse.json({ id: result.id, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE ?id= — dönem kilidini kaldırır (admin/supervisor only — manager açamaz)
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "admin" && auth.role !== "supervisor") {
    return NextResponse.json({ error: "Sadece admin/süpervizör kilidi kaldırabilir" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    const existing = await db.prepare(`SELECT id FROM payroll_periods WHERE id = ? AND org_id = ?`).get(id, auth.org_id);
    if (!existing) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    await db.prepare(`DELETE FROM payroll_periods WHERE id = ?`).run(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
