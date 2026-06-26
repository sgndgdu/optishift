/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";

export async function GET() {
  try {
    const db = getDB();
    const now = Math.floor(Date.now() / 1000);
    const ts24h = now - 86400;
    const ts7d  = now - 7 * 86400;

    const [totalOrgs, proOrgs, freeOrgs, totalUsers, activePersonnel, shiftsThisWeek,
      logins24h, orToolsCalls24h, avgLatency, atRiskOrgs] = await Promise.all([
      // Toplam org
      db.prepare(`SELECT COUNT(*) as c FROM organizations`).get() as Promise<any>,
      // Pro org
      db.prepare(`SELECT COUNT(*) as c FROM organizations WHERE plan IN ('pro','enterprise')`).get() as Promise<any>,
      // Free org
      db.prepare(`SELECT COUNT(*) as c FROM organizations WHERE plan = 'free' OR plan IS NULL`).get() as Promise<any>,
      // Toplam kullanıcı
      db.prepare(`SELECT COUNT(*) as c FROM users`).get() as Promise<any>,
      // Aktif personel
      db.prepare(`SELECT COUNT(*) as c FROM personnel WHERE status = 'active'`).get() as Promise<any>,
      // Bu hafta shift
      db.prepare(`SELECT COUNT(*) as c FROM shift_assignments WHERE created_at >= $1`).get(ts7d) as Promise<any>,
      // Son 24h login
      db.prepare(`SELECT COUNT(*) as c FROM platform_events WHERE type = 'login' AND created_at >= $1`).get(ts24h) as Promise<any>,
      // Son 24h OR-Tools
      db.prepare(`SELECT COUNT(*) as c FROM platform_events WHERE type = 'or_tools_call' AND created_at >= $1`).get(ts24h) as Promise<any>,
      // Ortalama OR-Tools latency
      db.prepare(`SELECT AVG(CAST(meta->>'latency_ms' AS FLOAT)) as avg FROM platform_events WHERE type = 'or_tools_call' AND created_at >= $1`).get(ts24h) as Promise<any>,
      // At-risk orgs (last_activity_at > 14 gün veya hiç yok)
      db.prepare(`SELECT COUNT(*) as c FROM organizations WHERE last_activity_at < $1 OR last_activity_at IS NULL`).get(ts7d * 2) as Promise<any>,
    ]);

    return NextResponse.json({
      total_orgs: Number((totalOrgs as any)?.c ?? 0),
      pro_orgs: Number((proOrgs as any)?.c ?? 0),
      free_orgs: Number((freeOrgs as any)?.c ?? 0),
      total_users: Number((totalUsers as any)?.c ?? 0),
      active_personnel: Number((activePersonnel as any)?.c ?? 0),
      shifts_this_week: Number((shiftsThisWeek as any)?.c ?? 0),
      logins_24h: Number((logins24h as any)?.c ?? 0),
      or_tools_calls_24h: Number((orToolsCalls24h as any)?.c ?? 0),
      avg_or_tools_latency: Math.round(Number((avgLatency as any)?.avg ?? 0)),
      at_risk_orgs: Number((atRiskOrgs as any)?.c ?? 0),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
