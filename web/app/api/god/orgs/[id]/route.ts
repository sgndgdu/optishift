/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDB();
    const now = Math.floor(Date.now() / 1000);
    const ts7d = now - 7 * 86400;

    const org = (await db.prepare(`SELECT * FROM organizations WHERE id = $1`).get(id)) as any;
    if (!org) return NextResponse.json({ error: "Org bulunamadı" }, { status: 404 });

    // Lokasyonlar
    const locations = (await db.prepare(
      `SELECT l.id, l.name, COUNT(p.id) as personnel_count
       FROM locations l
       LEFT JOIN personnel p ON p.primary_location_id = l.id AND p.status = 'active'
       WHERE l.org_id = $1
       GROUP BY l.id, l.name`
    ).all(id)) as any[];

    // Son 7 gün günlük shift sayısı
    const dailyShifts = (await db.prepare(
      `SELECT DATE(to_timestamp(sa.created_at)) as date, COUNT(*) as count
       FROM shift_assignments sa
       JOIN personnel p ON p.id = sa.personnel_id
       WHERE p.org_id = $1 AND sa.created_at >= $2
       GROUP BY DATE(to_timestamp(sa.created_at))
       ORDER BY date ASC`
    ).all(id, ts7d)) as any[];

    // Admin/manager kullanıcılar
    const adminUsers = (await db.prepare(
      `SELECT id, name, username, email, role, approval_status, last_login_at FROM users WHERE org_id = $1 ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'supervisor' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, created_at ASC`
    ).all(id)) as any[];

    // Son 20 platform event
    const events = (await db.prepare(
      `SELECT * FROM platform_events WHERE org_id = $1 ORDER BY created_at DESC LIMIT 20`
    ).all(id)) as any[];

    return NextResponse.json({
      org: {
        ...org,
        feature_flags: org.feature_flags ? JSON.parse(org.feature_flags) : {},
      },
      locations,
      daily_shifts: dailyShifts,
      admin_users: adminUsers,
      events,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDB();
    const body = await req.json();
    const now = Math.floor(Date.now() / 1000);

    const org = (await db.prepare(`SELECT * FROM organizations WHERE id = $1`).get(id)) as any;
    if (!org) return NextResponse.json({ error: "Org bulunamadı" }, { status: 404 });

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;
    const changes: string[] = [];

    if (body.plan !== undefined) {
      updates.push(`plan = $${paramIdx++}`);
      values.push(body.plan);
      changes.push(`plan: ${org.plan} → ${body.plan}`);
    }
    if (body.trial_ends_at !== undefined) {
      updates.push(`trial_ends_at = $${paramIdx++}`);
      values.push(body.trial_ends_at);
      changes.push(`trial_ends_at güncellendi`);
    }
    if (body.suspend !== undefined) {
      if (body.suspend) {
        updates.push(`suspended_at = $${paramIdx++}`);
        values.push(now);
        updates.push(`suspended_reason = $${paramIdx++}`);
        values.push(body.suspend_reason ?? "God Mode ile askıya alındı");
        changes.push(`askıya alındı: ${body.suspend_reason ?? ""}`);
      } else {
        updates.push(`suspended_at = NULL`);
        updates.push(`suspended_reason = NULL`);
        changes.push(`askı kaldırıldı`);
      }
    }
    if (body.feature_flags !== undefined) {
      updates.push(`feature_flags = $${paramIdx++}`);
      values.push(JSON.stringify(body.feature_flags));
      changes.push(`feature_flags güncellendi`);
    }
    if (body.notes !== undefined) {
      updates.push(`notes = $${paramIdx++}`);
      values.push(body.notes);
      changes.push(`notlar güncellendi`);
    }
    if (body.max_personnel !== undefined) {
      updates.push(`max_personnel = $${paramIdx++}`);
      values.push(body.max_personnel);
      changes.push(`max_personnel: ${body.max_personnel}`);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "Güncellenecek alan yok" }, { status: 400 });
    }

    values.push(id);
    await db.prepare(
      `UPDATE organizations SET ${updates.join(", ")} WHERE id = $${paramIdx}`
    ).run(...values);

    // Audit log
    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;
    await db.prepare(
      `INSERT INTO admin_audit_log (action, target_org_id, payload, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5)`
    ).run(
      `org_updated: ${changes.join("; ")}`,
      id,
      JSON.stringify(body),
      ip,
      now
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
