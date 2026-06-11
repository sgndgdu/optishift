/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { requireAuth } from "@/lib/auth";

const DB_PATH = path.join(process.cwd(), "optishift.db");

// GET /api/admin/organizations — tüm organizasyonları listele veya ?id= ile tek org
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // Supervisor kendi org'unu görebilir; admin tümünü
  if (auth.role !== "admin" && auth.role !== "supervisor") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = new Database(DB_PATH);
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    // Supervisor sadece kendi org'una erişebilir
    if (auth.role === "supervisor") {
      const org = db.prepare(`SELECT * FROM organizations WHERE id = ?`).get(auth.org_id) as any;
      db.close();
      return NextResponse.json(org ? [org] : []);
    }

    if (id) {
      const org = db.prepare(`SELECT * FROM organizations WHERE id = ?`).get(id) as any;
      db.close();
      return NextResponse.json(org ? [org] : []);
    }

    const orgs = db.prepare(`SELECT * FROM organizations ORDER BY rowid DESC`).all() as any[];
    const result = orgs.map((org) => {
      const locations = db.prepare(`SELECT id, name FROM locations WHERE org_id = ?`).all(org.id);
      const userCount = (db.prepare(`SELECT count(*) as cnt FROM users WHERE org_id = ?`).get(org.id) as any).cnt;
      const personnelCount = (db.prepare(`SELECT count(*) as cnt FROM personnel WHERE org_id = ? AND status='active'`).get(org.id) as any).cnt;
      return { ...org, locations, userCount, personnelCount };
    });

    db.close();
    return NextResponse.json(result);
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/admin/organizations?id= — ERP ve plan bilgisi güncelle
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Sadece admin erişebilir" }, { status: 403 });
  }

  const db = new Database(DB_PATH);
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

    const body = await req.json();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.connected_erp !== undefined) { updates.push("connected_erp = ?"); values.push(body.connected_erp); }
    if (body.erp_mapped_fields !== undefined) { updates.push("erp_mapped_fields = ?"); values.push(JSON.stringify(body.erp_mapped_fields)); }
    if (body.plan !== undefined) { updates.push("plan = ?"); values.push(body.plan); }

    if (updates.length === 0) return NextResponse.json({ error: "Güncellenecek alan yok" }, { status: 400 });
    values.push(id);
    db.prepare(`UPDATE organizations SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    db.close();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/admin/organizations?id=ORG-xxx — organizasyonu sil/devre dışı bırak
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Sadece admin erişebilir" }, { status: 403 });
  }

  const db = new Database(DB_PATH);
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

    // Mark all personnel as inactive
    db.prepare("UPDATE personnel SET status='inactive' WHERE org_id=?").run(id);
    db.close();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
