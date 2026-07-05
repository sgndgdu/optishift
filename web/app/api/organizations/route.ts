/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// Org-scoped organizasyon endpoint'i: herkes KENDİ org'unu okur/günceller.
// Platform geneli işlemler /api/admin/organizations'ta kalır.

// GET /api/organizations — oturumdaki kullanıcının organizasyonu
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const org = await db.prepare(
      `SELECT id, name, plan, connected_erp, erp_mapped_fields FROM organizations WHERE id = ?`
    ).get(auth.org_id) as any;
    if (!org) return NextResponse.json({ error: "Organizasyon bulunamadı" }, { status: 404 });
    if (typeof org.erp_mapped_fields === "string") {
      try { org.erp_mapped_fields = JSON.parse(org.erp_mapped_fields); } catch { org.erp_mapped_fields = null; }
    }
    return NextResponse.json(org);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/organizations — ERP bağlantısı / alan eşleştirme (admin + supervisor)
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "admin" && auth.role !== "supervisor") {
    return NextResponse.json({ error: "ERP bağlantısını yalnızca yönetici veya süpervizör değiştirebilir" }, { status: 403 });
  }

  const db = getDB();
  try {
    const body = await req.json();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.connected_erp !== undefined) { updates.push("connected_erp = ?"); values.push(body.connected_erp || null); }
    if (body.erp_mapped_fields !== undefined) { updates.push("erp_mapped_fields = ?"); values.push(JSON.stringify(body.erp_mapped_fields)); }

    if (updates.length === 0) return NextResponse.json({ error: "Güncellenecek alan yok" }, { status: 400 });

    values.push(auth.org_id);
    await db.prepare(`UPDATE organizations SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
