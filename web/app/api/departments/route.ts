import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { departments, locations, users, personnel } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { departmentScope, hasPerm, permError } from "@/lib/userAccess";
import { chefDepartmentIds, managerOutsideBranch } from "@/lib/access";
import { getDB } from "@/lib/db/client";

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
  // ?names=1: sadece ad (kişi kartında başka şubedeki departmanı seçmek için; şube müdürüne de açık)
  if (searchParams.get("names") === "1" && location_id && auth.role !== "employee") {
    if (!(await locationBelongsToOrg(location_id, auth.org_id))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    const list = await db.select({ id: departments.id, name: departments.name, parent_id: departments.parent_id }).from(departments).where(eq(departments.location_id, location_id)).orderBy(departments.id);
    return NextResponse.json(list);
  }
  if (managerOutsideBranch(auth, location_id)) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  if (!location_id) return NextResponse.json({ error: "location_id gerekli" }, { status: 400 });
  if (!(await locationBelongsToOrg(location_id, auth.org_id)))
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

  // Eklenme sırası (kimlik "D-<zaman>"): sıra her açılışta değişmesin (pub testi)
  const depts = await db.select().from(departments).where(eq(departments.location_id, location_id)).orderBy(departments.id);

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
  // Alt departman (lib/departments): bağlı olduğu departman aynı şubede ve kendisi alt departman olmamalı (tek kat)
  const parent_id: string | null = typeof body.parent_id === "string" && body.parent_id ? body.parent_id : null;
  if (parent_id) {
    const [parent] = await db.select({ location_id: departments.location_id, parent_id: departments.parent_id }).from(departments).where(eq(departments.id, parent_id)).limit(1);
    if (!parent || parent.location_id !== location_id) return NextResponse.json({ error: "Bağlı olduğu departman bu şubede bulunamadı" }, { status: 400 });
    if (parent.parent_id) return NextResponse.json({ error: "Alt departmanın altına departman eklenemez" }, { status: 400 });
  }
  if (managerOutsideBranch(auth, location_id)) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  if (!location_id || !name?.trim())
    return NextResponse.json({ error: "location_id ve name gerekli" }, { status: 400 });
  if (!(await locationBelongsToOrg(location_id, auth.org_id)))
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

  const id = `D-${Date.now()}`;
  await db.insert(departments).values({ id, location_id, name: name.trim(), parent_id });
  return NextResponse.json({ id, location_id, name: name.trim(), parent_id, manager: null, personnel_count: 0 });
}

// PATCH /api/departments?id=X — departman adı veya demand_matrix güncelle
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  const dept = await getDeptInOrg(id, auth.org_id);
  if (!dept) return NextResponse.json({ error: "Departman bulunamadı" }, { status: 404 });
  if (managerOutsideBranch(auth, dept.location_id)) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  // Departman şefi sadece kendi departmanının ve alt departmanlarının ihtiyaç tablosunu değiştirir (adını değil)
  const chefFamily = await chefDepartmentIds(getDB(), auth);
  const chefDept = departmentScope(auth);
  if (chefFamily && !chefFamily.includes(id)) return NextResponse.json({ error: "Sadece kendi departmanınızı düzenleyebilirsiniz" }, { status: 403 });

  const body = await req.json();
  if (chefDept) delete body.name;
  // Ad "Plan ayarları", ihtiyaç tablosu plan hazırlamanın parçası (lib/userAccess)
  if (body.name !== undefined && !hasPerm(auth, "plan_settings")) return NextResponse.json({ error: permError("plan_settings") }, { status: 403 });
  if (body.demand_matrix !== undefined && !hasPerm(auth, "prepare")) return NextResponse.json({ error: permError("prepare") }, { status: 403 });
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
  const dept = await getDeptInOrg(id, auth.org_id);
  if (!dept) return NextResponse.json({ error: "Departman bulunamadı" }, { status: 404 });
  if (managerOutsideBranch(auth, dept.location_id)) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

  // Alt departmanları üst düzeye çıkar (silinmez); silinen departmana bağlı personel/kullanıcı departmansız kalır
  await db.update(departments).set({ parent_id: null }).where(eq(departments.parent_id, id));
  await db.update(personnel).set({ department_id: null }).where(eq(personnel.department_id, id));
  await db.update(users).set({ department_id: null }).where(eq(users.department_id, id));
  await db.delete(departments).where(eq(departments.id, id));
  return NextResponse.json({ ok: true });
}
