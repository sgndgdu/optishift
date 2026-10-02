/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { managerOutsideBranch } from "@/lib/access";
import { addDays, businessToday, dayIndexOf, formatDateTR, weekStartOf } from "@/lib/date";
import { resolveShiftDef } from "@/lib/fairness";
import { rescoreWeek } from "@/lib/scoring";
import { publishOpenShift } from "@/lib/openShifts";

type Conflict = {
  id: number; date: string; week_start: string; day: number; location_id: string;
  start_time: string; end_time: string; shift_name: string | null; published: boolean;
};

/** İzin tarihleri arasındaki günler (YYYY-MM-DD), saat diliminden bağımsız */
function datesBetween(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  for (let d = startDate; d <= endDate && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

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

/** İzin günlerine düşen normal vardiyalar (taslak ve yayınlanmış) */
async function findConflicts(db: any, request: any): Promise<Conflict[]> {
  const dates = datesBetween(request.start_date, request.end_date);
  if (dates.length === 0) return [];
  const weeks = [...new Set(dates.map(weekStartOf))];
  const rows = await db.prepare(`
    SELECT sa.id, sa.week_start, sa.day, sa.location_id, sa.shift_id, sa.start_time, sa.end_time, sa.publication_status,
           l.shift_definitions
    FROM shift_assignments sa JOIN locations l ON l.id = sa.location_id
    WHERE sa.personnel_id = ? AND sa.week_start IN (${weeks.map(() => "?").join(",")})
      AND COALESCE(sa.kind, 'regular') = 'regular'
  `).all(request.personnel_id, ...weeks) as any[];
  const dateSet = new Set(dates);
  return rows
    .map(r => ({ ...r, date: addDays(r.week_start, Number(r.day)) }))
    .filter(r => dateSet.has(r.date))
    .map(r => {
      let defs: any[] = [];
      try { defs = typeof r.shift_definitions === "string" ? JSON.parse(r.shift_definitions) : (r.shift_definitions ?? []); } catch { /* boş */ }
      const def = resolveShiftDef(r.shift_id, r.start_time, r.end_time, Array.isArray(defs) ? defs : []);
      return {
        id: r.id, date: r.date, week_start: r.week_start, day: Number(r.day), location_id: r.location_id,
        start_time: r.start_time, end_time: r.end_time, shift_name: def?.name ?? null,
        published: r.publication_status !== "draft",
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
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
  return NextResponse.json({ conflicts: await findConflicts(db, request) });
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
      isApproved ? "İzin Talebiniz Onaylandı" : "İzin Talebiniz Reddedildi",
      `${range} tarihli izin talebiniz ${isApproved ? "onaylandı" : "reddedildi"}.`,
      now,
    );

    let removed = 0, opened = 0;
    if (isApproved) {
      const today = businessToday();
      const conflicts = await findConflicts(db, request);
      const touchedWeeks = new Set<string>();
      for (const c of conflicts) {
        await db.prepare(`DELETE FROM shift_assignments WHERE id = ?`).run(c.id);
        removed++;
        if (c.published) touchedWeeks.add(`${c.location_id}|${c.week_start}`);
        if (conflictAction === "open" && c.published && c.date >= today && c.start_time && c.end_time) {
          await publishOpenShift(db, {
            org_id: auth.org_id, location_id: c.location_id, date: c.date,
            start_time: c.start_time, end_time: c.end_time,
            note: `${request.p_name} izinli, vardiya ilana çevrildi`,
            releasedBy: request.personnel_id,
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

    return NextResponse.json({ success: true, status, removed, opened });
  } catch (err) {
    console.error("Leave request review error:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
