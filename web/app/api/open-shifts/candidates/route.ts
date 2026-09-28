/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { rankCandidates, type SlotInput } from "@/lib/openShiftCandidates";

// GET ?id=<open_shift_id> | ?assignment_id=<boşalacak atama> — uygun aday listesi (müdür).
// Hesap lib/openShiftCandidates.ts'te (izin, rol ve gerekçeler dahil).
// Filtre: o gün başka vardiyası olan, "kesinlikle gelemem" işaretleyen, gece
// kısıtlısı (gece vardiyasıysa) elenir. Kalanlar adalet puanına göre (en az
// yük taşıyan önce) sıralanır; saat limiti ve dinlenme sıkıntıları uyarı olur.
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const assignmentId = searchParams.get("assignment_id");
  if (!id && !assignmentId) return NextResponse.json({ error: "id ya da assignment_id zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    let slot: SlotInput;
    if (id) {
      const os = await db.prepare(`SELECT * FROM open_shifts WHERE id = ? AND org_id = ?`).get(id, auth.org_id) as any;
      if (!os) return NextResponse.json({ error: "Açık vardiya bulunamadı" }, { status: 404 });
      slot = { location_id: os.location_id, date: os.date, start_time: os.start_time, end_time: os.end_time };
    } else {
      // "Gelemiyor" önizlemesi: yayınlanmış atamanın yerine kim geçebilir (atamaya dokunmaz)
      const asg = await db.prepare(`
        SELECT sa.*, l.org_id AS l_org, l.shift_definitions FROM shift_assignments sa
        JOIN locations l ON l.id = sa.location_id WHERE sa.id = ?
      `).get(assignmentId) as any;
      if (!asg || asg.l_org !== auth.org_id) return NextResponse.json({ error: "Vardiya bulunamadı" }, { status: 404 });
      if (auth.role === "manager" && auth.location_id && auth.location_id !== asg.location_id) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      const dt = new Date(asg.week_start + "T00:00:00Z");
      dt.setUTCDate(dt.getUTCDate() + Number(asg.day ?? 0));
      let defs: any[] = [];
      try { defs = typeof asg.shift_definitions === "string" ? JSON.parse(asg.shift_definitions) : (asg.shift_definitions ?? []); } catch { defs = []; }
      const def = defs.find(d => String(d.id) === String(asg.shift_id));
      slot = {
        location_id: asg.location_id, date: dt.toISOString().slice(0, 10),
        start_time: asg.start_time, end_time: asg.end_time, excludePersonnelId: asg.personnel_id,
        requiredRoles: Array.isArray(def?.required_skills) ? def.required_skills.map((r: any) => r.skill) : [],
      };
    }
    const { candidates, is_night } = await rankCandidates(db, slot);
    return NextResponse.json({ candidates: candidates.slice(0, 10), is_night });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
