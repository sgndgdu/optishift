/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";

function calcHealthScore(org: any, locationCount: number, personnelCount: number, shifts7d: number, lastLoginDaysAgo: number | null): number {
  let score = 0;

  // Aktif personel var mı? (max 25p)
  if (personnelCount > 0) score += 25;

  // Son 7 günde vardiya var mı? (max 25p)
  if (shifts7d > 0) score += 25;

  // Son giriş ne zaman? (max 25p)
  if (lastLoginDaysAgo !== null) {
    if (lastLoginDaysAgo < 7) score += 25;
    else if (lastLoginDaysAgo < 14) score += 13;
  }

  // Plan bonusu (max 15p)
  if (org.plan === "pro" || org.plan === "enterprise") score += 15;

  // Lokasyon bonusu (bağlı şube var mı?)
  if (locationCount > 0 && score < 100) score += Math.min(10, locationCount * 2);

  return Math.min(100, score);
}

function calcChurnRisk(healthScore: number, lastActivityDaysAgo: number | null): "high" | "medium" | "low" {
  if (healthScore < 35 || (lastActivityDaysAgo !== null && lastActivityDaysAgo > 14)) return "high";
  if (healthScore < 60 || (lastActivityDaysAgo !== null && lastActivityDaysAgo > 7)) return "medium";
  return "low";
}

export async function GET() {
  try {
    const db = getDB();
    const now = Math.floor(Date.now() / 1000);
    const ts7d = now - 7 * 86400;

    const orgs = (await db.prepare(`SELECT * FROM organizations ORDER BY created_at DESC NULLS LAST`).all()) as any[];

    const results = await Promise.all(
      orgs.map(async (org) => {
        const [locRow, userRow, personnelRow, shiftsRow, orToolsRow] = await Promise.all([
          db.prepare(`SELECT COUNT(*) as c FROM locations WHERE org_id = $1`).get(org.id) as Promise<any>,
          db.prepare(`SELECT COUNT(*) as c FROM users WHERE org_id = $1`).get(org.id) as Promise<any>,
          db.prepare(`SELECT COUNT(*) as c FROM personnel WHERE org_id = $1 AND status = 'active'`).get(org.id) as Promise<any>,
          db.prepare(`SELECT COUNT(*) as c FROM shift_assignments sa JOIN personnel p ON p.id = sa.personnel_id WHERE p.org_id = $1 AND sa.created_at >= $2`).get(org.id, ts7d) as Promise<any>,
          db.prepare(`SELECT COUNT(*) as c FROM platform_events WHERE org_id = $1 AND type = 'or_tools_call' AND created_at >= $2`).get(org.id, ts7d) as Promise<any>,
        ]);

        const locationCount = Number((locRow as any)?.c ?? 0);
        const userCount = Number((userRow as any)?.c ?? 0);
        const personnelCount = Number((personnelRow as any)?.c ?? 0);
        const shifts7d = Number((shiftsRow as any)?.c ?? 0);
        const orToolsCalls7d = Number((orToolsRow as any)?.c ?? 0);

        const lastActivityDaysAgo = org.last_activity_at
          ? Math.floor((now - org.last_activity_at) / 86400)
          : null;

        // Son login hesapla (tüm kullanıcılar için en son login)
        const lastLoginRow = (await db.prepare(
          `SELECT MAX(last_login_at) as last FROM users WHERE org_id = $1`
        ).get(org.id)) as any;
        const lastLoginDaysAgo = lastLoginRow?.last
          ? Math.floor((now - lastLoginRow.last) / 86400)
          : null;

        const healthScore = calcHealthScore(org, locationCount, personnelCount, shifts7d, lastLoginDaysAgo);
        const churnRisk = calcChurnRisk(healthScore, lastActivityDaysAgo);

        return {
          id: org.id,
          name: org.name,
          plan: org.plan ?? "free",
          suspended_at: org.suspended_at ?? null,
          notes: org.notes ?? null,
          feature_flags: org.feature_flags ? JSON.parse(org.feature_flags) : {},
          created_at: org.created_at ?? null,
          last_activity_at: org.last_activity_at ?? null,
          location_count: locationCount,
          user_count: userCount,
          personnel_count: personnelCount,
          shifts_7d: shifts7d,
          or_tools_calls_7d: orToolsCalls7d,
          health_score: healthScore,
          churn_risk: churnRisk,
        };
      })
    );

    return NextResponse.json(results);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
