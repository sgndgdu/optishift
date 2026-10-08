/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { canManageLocation } from "@/lib/access";
import { findManualLoadFlags, manualLoadHistory, MANUAL_LOAD_WEEKS } from "@/lib/manualLoad";

/**
 * GET ?location_id=: son 8 yayınlanmış haftada motorun verdiği ile yayınlanan plan arasındaki kişi başı Adalet Puanı
 * farkı (elle yapılan değişikliklerin etkisi, lib/manualLoad). Adalet Puanı raporunda gösterilir.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const locationId = new URL(req.url).searchParams.get("location_id");
  const db = getDB();
  try {
    if (!locationId || !(await canManageLocation(db, auth, locationId))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    const history = await manualLoadHistory(db, auth.org_id, locationId, 8);
    const pids = [...new Set(history.flatMap(w => Object.keys(w.people)))];
    const names = pids.length
      ? new Map((await db.prepare(`SELECT id, name FROM personnel WHERE id IN (${pids.map(() => "?").join(",")})`).all(...pids) as any[]).map(p => [String(p.id), String(p.name)]))
      : new Map<string, string>();
    const people = pids.map(pid => {
      const weeks = history.map(w => w.people[pid]?.delta ?? null);
      const total = Math.round(weeks.reduce<number>((a, d) => a + (d ?? 0), 0) * 10) / 10;
      return { personnel_id: pid, name: names.get(pid) ?? "Ayrılmış kişi", weeks, total };
    }).filter(p => p.weeks.some(d => d !== null && d !== 0)).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    return NextResponse.json({
      weeks: history.map(w => ({ week_start: w.week_start, avg_shift_points: Math.round(w.avg_shift_points * 10) / 10 })),
      people,
      flags: findManualLoadFlags(history).map(f => ({ ...f, name: names.get(f.personnel_id) ?? "" })),
      flag_weeks: MANUAL_LOAD_WEEKS,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
