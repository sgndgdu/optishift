import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { departments, users, personnel } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

// GET /api/departments?location_id=X  — departmanları şef ve personel sayısıyla döndür
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  if (!location_id) return NextResponse.json({ error: "location_id gerekli" }, { status: 400 });

  const depts = await db.select().from(departments).where(eq(departments.location_id, location_id));

  // Her departman için şef kullanıcısını ve personel sayısını çek
  const enriched = await Promise.all(
    depts.map(async (dept) => {
      const [manager] = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(and(eq(users.department_id, dept.id), eq(users.role, "manager")))
        .limit(1);

      const personnelList = await db
        .select({ id: personnel.id, status: personnel.status })
        .from(personnel)
        .where(eq(personnel.department_id, dept.id));

      const activeCount = personnelList.filter((p) => p.status === "active").length;

      return { ...dept, manager: manager ?? null, personnel_count: activeCount };
    })
  );

  return NextResponse.json(enriched);
}

// POST /api/departments — yeni departman oluştur
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { location_id, name } = body;
  if (!location_id || !name?.trim())
    return NextResponse.json({ error: "location_id ve name gerekli" }, { status: 400 });

  const id = `D-${Date.now()}`;
  await db.insert(departments).values({ id, location_id, name: name.trim() });
  return NextResponse.json({ id, location_id, name: name.trim(), manager: null, personnel_count: 0 });
}

// PATCH /api/departments?id=X — departman adını güncelle
export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name gerekli" }, { status: 400 });

  await db.update(departments).set({ name: name.trim() }).where(eq(departments.id, id));
  return NextResponse.json({ ok: true });
}

// DELETE /api/departments?id=X
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });

  await db.delete(departments).where(eq(departments.id, id));
  return NextResponse.json({ ok: true });
}
