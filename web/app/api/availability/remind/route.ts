/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";


function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

// POST /api/availability/remind
// Finds active personnel in the org/location who haven't submitted availability
// for the current week, and creates a notification for each one.
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role !== "manager" && auth.role !== "admin" && auth.role !== "supervisor") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const body = await req.json().catch(() => ({}));
    const org_id = auth.org_id;
    const location_id = body.location_id ?? "";
    const week_start = body.week_start ?? getWeekStart();

    // Fetch active personnel — availability tablosunda org_id yok, personnel üzerinden filtrele
    let personnel: any[];
    if (location_id) {
      personnel = await db
        .prepare(`SELECT id FROM personnel WHERE org_id = ? AND primary_location_id = ? AND status = 'active'`)
        .all(org_id, location_id) as any[];
    } else {
      personnel = await db
        .prepare(`SELECT id FROM personnel WHERE org_id = ? AND status = 'active'`)
        .all(org_id) as any[];
    }

    if (personnel.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    const personnelIds = personnel.map((p: any) => p.id);

    // Find who already has availability for this week — org_id yoktur, personnel_id ile filtrele
    const placeholders = personnelIds.map(() => "?").join(",");
    const submitted = new Set<string>(
      (await db
        .prepare(`SELECT personnel_id FROM availability WHERE personnel_id IN (${placeholders}) AND week_start = ?`)
        .all(...personnelIds, week_start) as any[])
        .map((r: any) => r.personnel_id)
    );

    const missing = personnelIds.filter((id: string) => !submitted.has(id));

    if (missing.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    const weekLabel = new Date(week_start + "T00:00:00").toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "long",
    });

    const now = Math.floor(Date.now() / 1000);
    for (const id of missing) {
      await db.prepare(
        `INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
         VALUES (?, 'alert', ?, ?, '/portal/availability', false, ?)`
      ).run(
        id,
        "Müsaitlik Bildiriminizi Girin",
        `${weekLabel} haftası için müsaitlik bilginizi girmeniz bekleniyor.`,
        now,
      );
    }

    return NextResponse.json({ sent: missing.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
