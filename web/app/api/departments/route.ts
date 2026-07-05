import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { departments, locations, users, personnel } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

// Departmanın bağlı olduğu lokasyonun bu org'a ait olduğunu doğrular
async function locationBelongsToOrg(location_id: string, org_id: string) {
  const [loc] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, location_id), eq(locations.org_id, org_id)))
    .limit(1);
  return !!loc;
}

async function getDeptInOrg(id: string, org_id: string) {
  const [row] = await db
    .select({ id: departments.id, location_id: departments.location_id })
    .from(departments)
    .innerJoin(locations, eq(departments.location_id, locations.id))
    .where(and(eq(departments.id, id), eq(locations.org_id, org_id)))
    .limit(1);
  return row ?? null;
}

// GET /api/departments?location_id=X  — departmanları şef ve personel sayısıyla döndür
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  if (!location_id) return NextResponse.json({ error: "location_id gerekli" }, { status: 400 });
  if (!(await locationBelongsToOrg(location_id, auth.org_id)))
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

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
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const body = await req.json();
  const { location_id, name } = body;
  if (!location_id || !name?.trim())
    return NextResponse.json({ error: "location_id ve name gerekli" }, { status: 400 });
  if (!(await locationBelongsToOrg(location_id, auth.org_id)))
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

  const id = `D-${Date.now()}`;
  await db.insert(departments).values({ id, location_id, name: name.trim() });
  return NextResponse.json({ id, location_id, name: name.trim(), manager: null, personnel_count: 0 });
}

// PATCH /api/departments?id=X — departman adı veya demand_matrix güncelle
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  if (!(await getDeptInOrg(id, auth.org_id)))
    return NextResponse.json({ error: "Departman bulunamadı" }, { status: 404 });

  const body = await req.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};
  if (body.name?.trim()) updateData.name = body.name.trim();
  if (body.demand_matrix !== undefined) updateData.demand_matrix = JSON.stringify(body.demand_matrix);

  if (Object.keys(updateData).length === 0)
    return NextResponse.json({ error: "Güncellenecek alan yok" }, { status: 400 });

  await db.update(departments).set(updateData).where(eq(departments.id, id));
  return NextResponse.json({ ok: true });
}

// DELETE /api/departments?id=X — departmanı sil, personel/kullanıcı bağlarını temizle
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  if (!(await getDeptInOrg(id, auth.org_id)))
    return NextResponse.json({ error: "Departman bulunamadı" }, { status: 404 });

  // Silinen departmana bağlı personel/kullanıcı departmansız kalır (kayıt silinmez)
  await db.update(personnel).set({ department_id: null }).where(eq(personnel.department_id, id));
  await db.update(users).set({ department_id: null }).where(eq(users.department_id, id));
  await db.delete(departments).where(eq(departments.id, id));
  return NextResponse.json({ ok: true });
}
