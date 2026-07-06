/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";
import { sendAvailabilityReminders } from "@/lib/availabilityReminders";

// Cron altyapısı olmadan önce müsaitlik hatırlatması sadece müdür dashboard'u
// yüklendiğinde (opportunistic) tetikleniyordu — müdür o gün panele hiç
// girmezse hatırlatma hiç gitmiyordu. Bu route tüm aktif lokasyonları gezip
// aynı iş mantığını (lib/availabilityReminders) her biri için dener; vadesi
// gelmemiş veya zaten gönderilmiş lokasyonlar kendi içinde no-op döner.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }
  }

  const db = getDB();
  // locations tablosunda aktif/pasif kavramı yok — tüm lokasyonlar denenir,
  // sendAvailabilityReminders zaten kapalıysa/vadesi gelmediyse no-op döner.
  const locations = await db
    .prepare(`SELECT id, org_id FROM locations`)
    .all() as any[];

  const results: { location_id: string; result: unknown }[] = [];
  for (const loc of locations) {
    try {
      const result = await sendAvailabilityReminders({
        orgId: loc.org_id,
        locationId: loc.id,
        auto: true,
      });
      results.push({ location_id: loc.id, result });
    } catch (err) {
      results.push({ location_id: loc.id, result: { error: err instanceof Error ? err.message : String(err) } });
    }
  }

  const totalSent = results.reduce((sum, r) => sum + (typeof (r.result as any)?.sent === "number" ? (r.result as any).sent : 0), 0);
  return NextResponse.json({ locationsChecked: locations.length, totalSent, results });
}
