/* eslint-disable @typescript-eslint/no-explicit-any */
import { getPlan, limitMessage } from "@/lib/plans";
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { canManageLocation, managerOutsideBranch } from "@/lib/access";
import { applyRuleLocks, isOwnerRole } from "@/lib/ruleLocks";


export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  const db = getDB();
  try {
    let rows;
    // Manager sadece kendi şubesini görebilir
    if (auth.role === "manager" && auth.location_id) {
      rows = await db.prepare("SELECT * FROM locations WHERE id = ? AND org_id = ?").all(auth.location_id, auth.org_id);
    } else if (id) {
      rows = await db.prepare("SELECT * FROM locations WHERE id = ? AND org_id = ?").all(id, auth.org_id);
    } else {
      rows = await db.prepare("SELECT * FROM locations WHERE org_id = ?").all(auth.org_id);
    }
    // Bölge müdürü sadece atandığı şubeleri görür; personel sadece kendi şubesini
    rows = (rows as { id: string }[]).filter(l =>
      auth.role === "employee" ? l.id === auth.location_id : !managerOutsideBranch(auth, l.id));
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // Şube açmak sadece işletme sahibinin işi (bölge müdürü yalnız atandığı şubeleri yönetir)
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Şube açmak için işletme sahibi olmalısınız." }, { status: 403 });
  }

  const db = getDB();
  try {
    const body = await req.json();
    const { name } = body;
    if (!name?.trim()) {
      return NextResponse.json({ error: "name zorunlu" }, { status: 400 });
    }

    // Paket sınırı (lib/plans): şube sayısı
    const org = await db.prepare("SELECT plan FROM organizations WHERE id = ?").get(auth.org_id) as any;
    const maxLocations = getPlan(org?.plan).maxLocations;
    if (maxLocations !== null) {
      const locCount = ((await db.prepare("SELECT COUNT(*) as cnt FROM locations WHERE org_id = ?").get(auth.org_id)) as any).cnt;
      if (locCount >= maxLocations) {
        return NextResponse.json(
          { error: limitMessage("locations"), upgrade: true },
          { status: 402 }
        );
      }
    }

    const id = `L-${Date.now()}`;
    // org_id token'dan alınır
    await db.prepare(`INSERT INTO locations (id, org_id, name) VALUES (?, ?, ?)`).run(id, auth.org_id, name.trim());
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    // Personel şube ayarı değiştiremez; müdür sadece kendi şubesini, patron/supervisor işletmenin tüm şubelerini
    if (!(await canManageLocation(db, auth, id))) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }
    const body = await req.json();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.shift_definitions !== undefined) {
      updates.push("shift_definitions = ?");
      values.push(typeof body.shift_definitions === "string" ? body.shift_definitions : JSON.stringify(body.shift_definitions));
    }
    if (body.operating_hours !== undefined) {
      updates.push("operating_hours = ?");
      values.push(typeof body.operating_hours === "string" ? body.operating_hours : JSON.stringify(body.operating_hours));
    }
    if (body.name !== undefined) {
      updates.push("name = ?");
      values.push(body.name);
    }
    if (body.zone_quotas !== undefined) {
      updates.push("zone_quotas = ?");
      values.push(typeof body.zone_quotas === "string" ? body.zone_quotas : JSON.stringify(body.zone_quotas));
    }
    if (body.rules !== undefined) {
      let rules = typeof body.rules === "string" ? JSON.parse(body.rules) : body.rules;
      // Müdür kilitli alanları (bütçe, çalışma kuralları, ek özellikler) değiştiremez: mevcut değer korunur
      if (!isOwnerRole(auth.role)) {
        const row = await db.prepare("SELECT rules FROM locations WHERE id = ?").get(id) as { rules?: string } | undefined;
        let current: Record<string, unknown> = {};
        try { current = row?.rules ? JSON.parse(row.rules) : {}; } catch { current = {}; }
        rules = applyRuleLocks(current, rules ?? {});
      }
      updates.push("rules = ?");
      values.push(JSON.stringify(rules));
    }
    if (body.demand_matrix !== undefined) {
      updates.push("demand_matrix = ?");
      values.push(typeof body.demand_matrix === "string" ? body.demand_matrix : JSON.stringify(body.demand_matrix));
    }
    if (body.demand_templates !== undefined) {
      updates.push("demand_templates = ?");
      values.push(typeof body.demand_templates === "string" ? body.demand_templates : JSON.stringify(body.demand_templates));
    }
    if (body.leave_policy !== undefined) {
      updates.push("leave_policy = ?");
      values.push(typeof body.leave_policy === "string" ? body.leave_policy : JSON.stringify(body.leave_policy));
    }
    if (body.rotation_template !== undefined) {
      updates.push("rotation_template = ?");
      values.push(typeof body.rotation_template === "string" ? body.rotation_template : JSON.stringify(body.rotation_template));
    }
    if (body.task_templates !== undefined) {
      updates.push("task_templates = ?");
      values.push(typeof body.task_templates === "string" ? body.task_templates : JSON.stringify(body.task_templates));
    }
    if (body.latitude !== undefined) {
      updates.push("latitude = ?");
      values.push(body.latitude === null ? null : Number(body.latitude));
    }
    if (body.longitude !== undefined) {
      updates.push("longitude = ?");
      values.push(body.longitude === null ? null : Number(body.longitude));
    }

    if (updates.length === 0) return NextResponse.json({ error: "Güncellenecek alan yok" }, { status: 400 });

    values.push(id);
    await db.prepare(`UPDATE locations SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
