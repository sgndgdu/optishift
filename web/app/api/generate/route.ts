import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { businessNow } from "@/lib/date";
import { generatePlan } from "@/lib/generatePlan";
import { canManageLocation, chefDepartmentIds } from "@/lib/access";
import { getDB } from "@/lib/db/client";
import { notifyChefsOfPlan } from "@/lib/chefPlanNotice";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const branchId: string | undefined = body.locationId ?? body.location_id;
  if (!branchId) {
    return NextResponse.json(
      { error: "locationId (veya location_id) zorunlu" },
      { status: 400 }
    );
  }

  const week_start: string = (() => {
    if (body.week_start && /^\d{4}-\d{2}-\d{2}$/.test(body.week_start))
      return body.week_start;
    return businessNow().weekStart;
  })();

  if (!(await canManageLocation(getDB(), auth, branchId))) {
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  }
  // Departman şefi sadece kendi departmanını ve alt departmanlarını planlar (istemcinin gönderdiği değer yok sayılır)
  const family = await chefDepartmentIds(getDB(), auth);
  const r = await generatePlan(auth.org_id, branchId, week_start, { ...body, only_department_ids: family ?? undefined });
  // Şube geneli plan oluşturulduysa (senaryo değil), planını göndermemiş departman sorumlularına haber ver
  if (r.status === 200 && !family && !body.scenario) {
    await notifyChefsOfPlan(getDB(), { orgId: auth.org_id, locationId: branchId, weekStart: week_start, byUserId: auth.id, byName: auth.name })
      .catch(err => console.error("[generate] sorumlu bildirimi", err));
  }
  return NextResponse.json(r.body, { status: r.status });
}
