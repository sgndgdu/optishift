/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { managerOutsideBranch } from "@/lib/access";
import { getDB } from "@/lib/db/client";
import { deriveOvertimeForWeek } from "@/lib/overtime";

// İcap nöbetinde çağrılma kayıtları. Çağrılınca çalışılan saat çalışma süresidir:
// mesai (lib/overtime deriveOvertimeForWeek) ve aylık rapor bu tablodan okur.
// GET ?location_id=&week_start=  |  POST {assignment_id, start_time, end_time, note?}  |  DELETE ?id=

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

async function canManage(db: any, auth: any, locationId: string): Promise<boolean> {
  if (auth.role === "employee") return false;
  const loc = await db.prepare(`SELECT id FROM locations WHERE id = ? AND org_id = ?`).get(locationId, auth.org_id);
  if (!loc) return false;
  return !managerOutsideBranch(auth, locationId);
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const week_start = searchParams.get("week_start");
  if (!location_id || !week_start) return NextResponse.json({ error: "location_id ve week_start zorunlu" }, { status: 400 });
  const db = getDB();
  if (auth.role === "employee") {
    const rows = await db.prepare(`SELECT * FROM on_call_callouts WHERE personnel_id = ? AND location_id = ? AND week_start = ? ORDER BY day`)
      .all(auth.personnel_id, location_id, week_start);
    return NextResponse.json(rows);
  }
  if (!(await canManage(db, auth, location_id))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  const rows = await db.prepare(`SELECT * FROM on_call_callouts WHERE location_id = ? AND week_start = ? ORDER BY day, start_time`)
    .all(location_id, week_start);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));
  const { assignment_id, start_time, end_time, note } = body ?? {};
  if (!assignment_id || !HHMM.test(start_time ?? "") || !HHMM.test(end_time ?? "")) {
    return NextResponse.json({ error: "Nöbet, başlangıç ve bitiş saati (SS:DD) zorunlu" }, { status: 400 });
  }
  if (start_time === end_time) return NextResponse.json({ error: "Başlangıç ve bitiş aynı olamaz" }, { status: 400 });

  const db = getDB();
  const asg = await db.prepare(`SELECT * FROM shift_assignments WHERE id = ?`).get(assignment_id) as any;
  if (!asg || asg.kind !== "on_call") return NextResponse.json({ error: "İcap nöbeti bulunamadı" }, { status: 404 });
  if (!(await canManage(db, auth, asg.location_id))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  if (asg.publication_status !== "published") {
    return NextResponse.json({ error: "Çağrı kaydı sadece yayınlanmış plandaki nöbete girilebilir" }, { status: 400 });
  }

  const now = Math.floor(Date.now() / 1000);
  await db.prepare(`
    INSERT INTO on_call_callouts (org_id, location_id, personnel_id, assignment_id, week_start, day, start_time, end_time, note, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(auth.org_id, asg.location_id, asg.personnel_id, asg.id, asg.week_start, asg.day, start_time, end_time,
    typeof note === "string" && note.trim() ? note.trim().slice(0, 300) : null, auth.id, now);

  await db.prepare(`
    INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
    VALUES (?, 'info', 'İcap çağrısı kaydedildi', ?, '/portal/calendar', false, ?)
  `).run(asg.personnel_id, `İcap nöbetinde ${start_time}–${end_time} arası çalışman kaydedildi; çalışma süresine ve mesaine sayılır.`, now);

  // Çalışılan saat mesaiye girer: o haftanın mesaisini yayınlanan plan + çağrılarla yeniden türet
  await deriveOvertimeForWeek(auth.org_id, asg.location_id, asg.week_start).catch(e => console.error("[callouts] mesai", e));
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });
  const db = getDB();
  const row = await db.prepare(`SELECT * FROM on_call_callouts WHERE id = ? AND org_id = ?`).get(id, auth.org_id) as any;
  if (!row) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
  if (!(await canManage(db, auth, row.location_id))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  await db.prepare(`DELETE FROM on_call_callouts WHERE id = ?`).run(id);
  await deriveOvertimeForWeek(auth.org_id, row.location_id, row.week_start).catch(e => console.error("[callouts] mesai", e));
  return NextResponse.json({ success: true });
}
