import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";


// GET: Personelin bildirimlerini getir
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const personnel_id = searchParams.get("personnel_id");

  if (!personnel_id) {
    return NextResponse.json({ error: "personnel_id zorunlu" }, { status: 400 });
  }

  // Employee yalnızca kendi bildirimlerini görebilir
  if (auth.role === "employee" && auth.personnel_id !== personnel_id) {
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.personnel_id, personnel_id))
    .orderBy(desc(notifications.created_at))
    .limit(50);

  return NextResponse.json(rows);
}

// POST: Yeni bildirim(ler) oluştur
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items = Array.isArray(body) ? body : [body];
    for (const item of items) {
      const { personnel_id, type, title, message, link } = item;
      if (!personnel_id || !type || !title || !message) continue;
      await db.insert(notifications).values({
        personnel_id,
        type,
        title,
        message,
        link: link ?? null,
        is_read: false,
      });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Notifications POST error:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// PUT: Bildirimi okundu olarak işaretle
export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const personnel_id = searchParams.get("personnel_id");

  if (!personnel_id) {
    return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });
  }

  if (id) {
    // Tek bir bildirimi okundu yap
    await db
      .update(notifications)
      .set({ is_read: true })
      .where(and(eq(notifications.id, parseInt(id)), eq(notifications.personnel_id, personnel_id)));
  } else {
    // Tümünü okundu yap
    await db
      .update(notifications)
      .set({ is_read: true })
      .where(eq(notifications.personnel_id, personnel_id));
  }

  return NextResponse.json({ success: true });
}

// DELETE: Bildirimi sil
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const personnel_id = searchParams.get("personnel_id");

  if (!id || !personnel_id) {
    return NextResponse.json({ error: "id ve personnel_id zorunlu" }, { status: 400 });
  }

  // Sadece kendi bildirimini silebilir
  if (auth.role === "employee" && auth.personnel_id !== personnel_id) {
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  }

  const dbConn = getDB();
  try {
    dbConn.prepare("DELETE FROM notifications WHERE id = ? AND personnel_id = ?").run(parseInt(id), personnel_id);
    dbConn.close();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    dbConn.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
