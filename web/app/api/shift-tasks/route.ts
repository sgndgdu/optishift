/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const shift_assignment_id = searchParams.get("shift_assignment_id");
  const location_id = searchParams.get("location_id");
  const week_start = searchParams.get("week_start");

  const db = getDB();
  try {
    if (shift_assignment_id) {
      const sa = await db.prepare(
        `SELECT personnel_id, location_id FROM shift_assignments WHERE id = ?`
      ).get(shift_assignment_id) as any;
      if (!sa) return NextResponse.json({ error: "Vardiya bulunamadı" }, { status: 404 });
      if (auth.role === "employee" && sa.personnel_id !== auth.personnel_id) {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      const rows = await db.prepare(
        `SELECT * FROM shift_tasks WHERE shift_assignment_id = ? AND org_id = ? ORDER BY id ASC`
      ).all(shift_assignment_id, auth.org_id);
      return NextResponse.json(rows);
    }

    if (location_id && week_start) {
      if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      const rows = await db.prepare(
        `SELECT st.*, sa.personnel_id, sa.day, sa.week_start
         FROM shift_tasks st
         JOIN shift_assignments sa ON sa.id = st.shift_assignment_id
         WHERE st.location_id = ? AND st.org_id = ? AND sa.week_start = ?
         ORDER BY sa.day ASC, st.id ASC`
      ).all(location_id, auth.org_id, week_start);
      return NextResponse.json(rows);
    }

    return NextResponse.json({ error: "shift_assignment_id veya (location_id + week_start) zorunlu" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const { id, is_completed } = body;
  if (!id || typeof is_completed !== "boolean") {
    return NextResponse.json({ error: "id ve is_completed (boolean) zorunlu" }, { status: 400 });
  }

  const db = getDB();
  try {
    const task = await db.prepare(
      `SELECT st.id, st.org_id, sa.personnel_id
       FROM shift_tasks st
       JOIN shift_assignments sa ON sa.id = st.shift_assignment_id
       WHERE st.id = ?`
    ).get(id) as any;
    if (!task || task.org_id !== auth.org_id) return NextResponse.json({ error: "Görev bulunamadı" }, { status: 404 });
    if (auth.role === "employee" && task.personnel_id !== auth.personnel_id) {
      return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
    }

    await db.prepare(
      `UPDATE shift_tasks SET is_completed = ?, completed_at = ? WHERE id = ?`
    ).run(is_completed, is_completed ? Math.floor(Date.now() / 1000) : null, id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
