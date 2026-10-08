/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";


// GET /api/admin/organizations — oturumdaki işletme ([org] dizisi; eski ekranlar ?id= gönderir, yok sayılır)
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role !== "admin" && auth.role !== "supervisor") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    // Herkes sadece kendi işletmesini görür. Eskiden "admin" platform yöneticisi sayılıyordu ve ?id= ile her işletmeyi
    // okuyabiliyordu; artık her işletme sahibi admin (platform yönetimi God Mode'da).
    const org = await db.prepare(`SELECT * FROM organizations WHERE id = ?`).get(auth.org_id) as any;
    return NextResponse.json(org ? [org] : []);
  } catch (err: any) {
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

  const db = getDB();
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

    const body = await req.json();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.connected_erp !== undefined) { updates.push("connected_erp = ?"); values.push(body.connected_erp); }
    if (body.erp_mapped_fields !== undefined) { updates.push("erp_mapped_fields = ?"); values.push(JSON.stringify(body.erp_mapped_fields)); }
    // Paket buradan değişmez (ödeme ya da God Mode değiştirir); eskiden her sahip kendini Pro yapabiliyordu

    if (updates.length === 0) return NextResponse.json({ error: "Güncellenecek alan yok" }, { status: 400 });
    if (id !== auth.org_id) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    values.push(auth.org_id);
    await db.prepare(`UPDATE organizations SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return NextResponse.json({ success: true });
  } catch (err: any) {
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

  const db = getDB();
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

    // Sadece kendi işletmesi (eskiden her işletmenin personeli pasife alınabiliyordu)
    if (id !== auth.org_id) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    await db.prepare("UPDATE personnel SET status='inactive' WHERE org_id=?").run(auth.org_id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
