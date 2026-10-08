/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { managerOutsideBranch } from "@/lib/access";
import { businessToday, dayIndexOf, formatDateTR, weekStartOf } from "@/lib/date";
import { rescoreWeek } from "@/lib/scoring";
import { canBorrow } from "@/lib/loans";
import { publishOpenShift } from "@/lib/openShifts";
import { coverFor, datesBetween, findConflicts, type Cover } from "@/lib/leaveConflicts";
import { checkPersonChange } from "@/lib/assignmentCheck";

/** Talebi yükler ve bu kullanıcının karar verebileceğini doğrular (aynı işletme; müdür sadece kendi şubesi) */
async function loadRequest(db: any, auth: any, id: string) {
  const row = await db.prepare(`
    SELECT lr.*, p.org_id AS p_org, p.primary_location_id AS p_loc, p.name AS p_name
    FROM leave_requests lr JOIN personnel p ON p.id = lr.personnel_id
    WHERE lr.id = ?
  `).get(Number(id)) as any;
  if (!row || row.p_org !== auth.org_id) return null;
  if (managerOutsideBranch(auth, row.p_loc)) return null;
  return row;
}

// GET /api/leave-requests/review?id=X → izin günlerine düşen vardiyalar (onay kartında gösterilir)
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!["manager", "admin", "supervisor"].includes(auth.role)) {
    return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });
  const db = getDB();
  const request = await loadRequest(db, auth, id);
  if (!request) return NextResponse.json({ error: "Talep bulunamadı" }, { status: 404 });
  const conflicts = await findConflicts(db, request);
  const cover: Record<number, Cover> = {};
  for (const c of conflicts) cover[c.id] = await coverFor(db, request.personnel_id, c);
  return NextResponse.json({ conflicts: conflicts.map(c => ({ ...c, ...cover[c.id] })), team: await teamOnLeave(db, request) });
}

/**
 * Plan henüz yoksa da sorumlu öngörebilsin: kişinin departmanında (yoksa şubede) kaç kişi var,
 * aynı günlerde başka kimler izinli ya da izin bekliyor.
 */
async function teamOnLeave(db: any, request: any) {
  const me = await db.prepare(`SELECT department_id FROM personnel WHERE id = ?`).get(request.personnel_id) as any;
  const dept = me?.department_id ?? null;
  const scopeSql = dept
    ? `(p.department_id = ? OR p.assigned_department_ids LIKE ?)`
    : `(p.primary_location_id = ? OR p.assigned_location_ids LIKE ?)`;
  const scopeArgs = dept ? [dept, `%"${dept}"%`] : [request.p_loc, `%"${request.p_loc}"%`];
  const size = await db.prepare(`
    SELECT COUNT(*)::int AS n FROM personnel p
    WHERE p.org_id = ? AND p.status = 'active' AND p.schedulable IS NOT FALSE AND ${scopeSql}`).get(request.p_org, ...scopeArgs) as any;
  const others = await db.prepare(`
    SELECT p.name, lr.start_date, lr.end_date, lr.status FROM leave_requests lr JOIN personnel p ON p.id = lr.personnel_id
    WHERE p.org_id = ? AND lr.personnel_id <> ? AND lr.status IN ('approved', 'pending')
      AND lr.start_date <= ? AND lr.end_date >= ? AND ${scopeSql}
    ORDER BY lr.start_date`).all(request.p_org, request.personnel_id, request.end_date, request.start_date, ...scopeArgs) as any[];
  const deptName = dept ? ((await db.prepare(`SELECT name FROM departments WHERE id = ?`).get(dept)) as any)?.name ?? null : null;
  return {
    scope: deptName, size: Number(size?.n ?? 0),
    others: others.map(o => ({ name: o.name, start_date: o.start_date, end_date: o.end_date, pending: o.status === "pending" })),
  };
}

// PATCH /api/leave-requests/review?id=X → {"status":"approved"|"rejected", "conflict_action"?: "open"|"remove"}
// Onayda izin günlerine düşen vardiyalar plandan çıkar: "open" yayınlanmış ve geçmemiş olanları açık
// vardiya ilanına çevirir, "remove" sadece çıkarır. Taslak vardiyalar her durumda sadece silinir.
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!["manager", "admin", "supervisor"].includes(auth.role)) {
    return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
  }

  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

    const body = await req.json();
    const { status, reviewed_by } = body;
    const conflictAction: "open" | "remove" = body.conflict_action === "open" ? "open" : "remove";
    // { vardiyaId: personelId }: sorumlu izinli kişinin yerine birini seçtiyse vardiya ona geçer (ilana/silmeye düşmez)
    const replacements: Record<string, string> = body.replacements && typeof body.replacements === "object" ? body.replacements : {};
    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "status: approved veya rejected olmalı" }, { status: 400 });
    }

    const db = getDB();
    const request = await loadRequest(db, auth, id);
    if (!request) return NextResponse.json({ error: "Talep bulunamadı" }, { status: 404 });
    if (request.status !== "pending") {
      return NextResponse.json({ error: "Bu talep zaten karara bağlanmış" }, { status: 409 });
    }

    const now = Math.floor(Date.now() / 1000);
    await db.prepare(`UPDATE leave_requests SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`)
      .run(status, reviewed_by ?? auth.personnel_id ?? null, now, request.id);

    const isApproved = status === "approved";
    const range = request.start_date === request.end_date
      ? formatDateTR(request.start_date)
      : `${formatDateTR(request.start_date, { weekday: false })} – ${formatDateTR(request.end_date, { weekday: false })}`;
    await db.prepare(`
      INSERT INTO notifications (personnel_id, type, title, message, is_read, created_at)
      VALUES (?, ?, ?, ?, false, ?)
    `).run(
      request.personnel_id,
      isApproved ? "leave_approved" : "leave_rejected",
      isApproved ? "İzin talebiniz onaylandı" : "İzin talebiniz reddedildi",
      `${range} tarihli izin talebiniz ${isApproved ? "onaylandı" : "reddedildi"}.`,
      now,
    );

    let removed = 0, opened = 0, replaced = 0;
    const skipped: string[] = [];
    if (isApproved) {
      const today = businessToday();
      const conflicts = await findConflicts(db, request);
      const touchedWeeks = new Set<string>();
      for (const c of conflicts) {
        const sub = replacements[String(c.id)];
        if (sub && sub !== request.personnel_id) {
          // Yerine gelen aynı işletmede, o gün boş ve kurallara uyuyor olmalı (açık vardiya üstlenmeyle aynı kontrol)
          const who = await db.prepare(`SELECT id, name FROM personnel WHERE id = ? AND org_id = ? AND status = 'active'`).get(sub, auth.org_id) as any;
          const problems = who ? await checkPersonChange(db, sub, c.location_id, {
            add: [{ week_start: c.week_start, day: c.day, start_time: c.start_time, end_time: c.end_time }],
          }) : ["bulunamadı"];
          if (who && problems.length === 0) {
            await db.prepare(`UPDATE shift_assignments SET personnel_id = ?, status = 'scheduled' WHERE id = ?`).run(sub, c.id);
            replaced++;
            if (c.published) {
              touchedWeeks.add(`${c.location_id}|${c.week_start}`);
              await db.prepare(`
                INSERT INTO notifications (personnel_id, type, title, message, is_read, link, created_at)
                VALUES (?, 'schedule', ?, ?, false, '/portal/calendar', ?)
              `).run(sub, "Size yeni bir vardiya verildi", `${formatDateTR(c.date)} ${c.start_time}–${c.end_time} vardiyası ${request.p_name} izinli olduğu için size verildi.`, now);
            }
            continue;
          }
          skipped.push(`${formatDateTR(c.date)}: ${who?.name ?? "seçilen kişi"} alamadı (${problems[0]})`);
        }
        await db.prepare(`DELETE FROM shift_assignments WHERE id = ?`).run(c.id);
        removed++;
        if (c.published) touchedWeeks.add(`${c.location_id}|${c.week_start}`);
        if (conflictAction === "open" && c.published && c.date >= today && c.start_time && c.end_time) {
          await publishOpenShift(db, {
            org_id: auth.org_id, location_id: c.location_id, date: c.date,
            start_time: c.start_time, end_time: c.end_time,
            note: `${request.p_name} izinli, vardiya ilana çevrildi`,
            releasedBy: request.personnel_id,
            createdBy: auth.id, crossBranch: canBorrow(auth),
          });
          opened++;
        }
      }
      // Yayınlanmış haftanın puanları izinle kalkan vardiya olmadan yeniden hesaplanır
      for (const key of touchedWeeks) {
        const [locId, ws] = key.split("|");
        await rescoreWeek(auth.org_id, locId, ws);
      }

      // Uygunluk: izin günleri "Gelemem" (motor bu günlere yazmaz)
      for (const date of datesBetween(request.start_date, request.end_date)) {
        const ws = weekStartOf(date);
        const dayCol = `day_${dayIndexOf(date)}`;
        const existing = await db.prepare(
          `SELECT id FROM availability WHERE personnel_id = ? AND week_start = ?`
        ).get(request.personnel_id, ws) as { id: number } | undefined;
        if (existing) {
          await db.prepare(`UPDATE availability SET ${dayCol} = 'unavailable' WHERE personnel_id = ? AND week_start = ?`)
            .run(request.personnel_id, ws);
        } else {
          const cols = ["day_0", "day_1", "day_2", "day_3", "day_4", "day_5", "day_6"];
          const vals = cols.map(c => (c === dayCol ? "'unavailable'" : "'available'")).join(", ");
          await db.prepare(`INSERT INTO availability (personnel_id, week_start, ${cols.join(", ")}) VALUES (?, ?, ${vals})`)
            .run(request.personnel_id, ws);
        }
      }
    }

    return NextResponse.json({ success: true, status, removed, opened, replaced, skipped });
  } catch (err) {
    console.error("Leave request review error:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
