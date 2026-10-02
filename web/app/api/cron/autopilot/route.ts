/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";
import { runAutopilotForLocation, type AutopilotResult } from "@/lib/autopilot";

// Motor şube başına ~10 sn (soğuksa +25 sn) sürer: şubeler sırayla, süre bütçesi içinde işlenir.
// Bütçeye sığmayan şube işaretlenmez, ertesi günkü çalışmada telafi edilir (lib/autopilot autopilotDecision).
export const maxDuration = 300;
const BUDGET_MS = 240_000;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const started = Date.now();
  const db = getDB();
  const locations = await db.prepare(`SELECT id, org_id, name FROM locations`).all() as any[];
  // Motoru önceden uyandır (Render ücretsiz katman uyur)
  const engineUrl = process.env.ENGINE_URL;
  if (engineUrl) await fetch(`${engineUrl}/health`, { signal: AbortSignal.timeout(40_000) }).catch(() => {});

  const results: AutopilotResult[] = [];
  for (const loc of locations) {
    if (Date.now() - started > BUDGET_MS) { results.push({ location_id: loc.id, status: "deferred" }); continue; }
    try {
      results.push(await runAutopilotForLocation(loc));
    } catch (err) {
      results.push({ location_id: loc.id, status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }
  const drafted = results.filter(r => r.status === "drafted").length;
  return NextResponse.json({ locationsChecked: locations.length, drafted, results });
}
