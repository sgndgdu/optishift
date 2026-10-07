/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";
import { runAutopilotForLocation, type AutopilotResult } from "@/lib/autopilot";
import { sendMonthlyGainReports } from "@/lib/monthlyGain";
import { sendMorningBriefs } from "@/lib/morningBrief";

// Motor şube başına ~10 sn (soğuksa +25 sn) sürer: şubeler sırayla, süre bütçesi içinde işlenir.
// Bütçeye sığmayan şube işaretlenmez, sonraki çalışmada telafi edilir (lib/autopilot autopilotDecision).
// İki çalıştırıcı: Vercel günlük 08:00 (her şey) + GitHub Actions saatlik `?only=autopilot` (şubenin seçtiği saat,
// .github/workflows/autopilot-hourly.yml). Aynı anda gelirlerse şube sahiplenmeyle bir kez hazırlanır.
export const maxDuration = 300;
const BUDGET_MS = 160_000; // yedek, sabah özeti ve aylık özet için ~80 sn ayrıldı

async function runAll(locations: any[], started: number): Promise<AutopilotResult[]> {
  const results: AutopilotResult[] = [];
  for (const loc of locations) {
    if (Date.now() - started > BUDGET_MS) { results.push({ location_id: loc.id, status: "deferred" }); continue; }
    try {
      results.push(await runAutopilotForLocation(loc));
    } catch (err) {
      results.push({ location_id: loc.id, status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const started = Date.now();
  const db = getDB();
  const hourly = req.nextUrl.searchParams.get("only") === "autopilot";
  if (hourly) {
    const locations = await db.prepare(`SELECT id, org_id, name FROM locations`).all() as any[];
    const results = await runAll(locations, started);
    return NextResponse.json({ locationsChecked: locations.length, drafted: results.filter(r => r.status === "drafted").length, results });
  }
  // Ay başı (ilk 3 gün): geçen ayın kazanç özeti sorumlulara (lib/monthlyGain). Ayrı zamanlanmış görev yok:
  // ücretsiz pakette günde bir görev sınırı var, otomatik pilotla aynı günlük çalışmada yapılır.
  // 08:00: sabah özeti (lib/morningBrief)
  const briefs = await sendMorningBriefs(db, 40_000).catch(e => { console.error("[cron] sabah özeti", e); return { sent: 0, checked: 0 }; });
  const monthly = await sendMonthlyGainReports(db, 40_000).catch(e => { console.error("[cron] aylık özet", e); return { sent: 0, checked: 0 }; });
  const locations = await db.prepare(`SELECT id, org_id, name FROM locations`).all() as any[];
  // Motoru önceden uyandır (Render ücretsiz katman uyur)
  const engineUrl = process.env.ENGINE_URL;
  if (engineUrl) await fetch(`${engineUrl}/health`, { signal: AbortSignal.timeout(40_000) }).catch(() => {});

  const results = await runAll(locations, started);
  const drafted = results.filter(r => r.status === "drafted").length;
  return NextResponse.json({ locationsChecked: locations.length, drafted, monthlyReports: monthly.sent, morningBriefs: briefs.sent, results });
}
