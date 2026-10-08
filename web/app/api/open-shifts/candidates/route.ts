/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { managerOutsideBranch } from "@/lib/access";
import { rankCandidates, type SlotInput } from "@/lib/openShiftCandidates";
import { canAssignFrom, canBorrow, declinedIds } from "@/lib/loans";

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
    let declined: string[] = [];
    if (id) {
      const os = await db.prepare(`SELECT * FROM open_shifts WHERE id = ? AND org_id = ?`).get(id, auth.org_id) as any;
      if (!os) return NextResponse.json({ error: "Açık vardiya bulunamadı" }, { status: 404 });
      if (managerOutsideBranch(auth, os.location_id)) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      declined = declinedIds(os);
      slot = { location_id: os.location_id, date: os.date, start_time: os.start_time, end_time: os.end_time };
    } else {
      // "Gelemiyor" önizlemesi: yayınlanmış atamanın yerine kim geçebilir (atamaya dokunmaz)
      const asg = await db.prepare(`
        SELECT sa.*, l.org_id AS l_org, l.shift_definitions FROM shift_assignments sa
        JOIN locations l ON l.id = sa.location_id WHERE sa.id = ?
      `).get(assignmentId) as any;
      if (!asg || asg.l_org !== auth.org_id) return NextResponse.json({ error: "Vardiya bulunamadı" }, { status: 404 });
      if (managerOutsideBranch(auth, asg.location_id)) {
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
        requiredRoles: [], // Görevler kaldırıldı (2026-10-05)
      };
    }
    const { candidates, is_night } = await rankCandidates(db, slot);
    // Başka şubelerdeki adaylar sadece "Başka şubeden kişi" yetkisiyle (lib/loans). assignable: onaysız doğrudan atanabilir
    const borrow = canBorrow(auth);
    // Kendi şubesinden en fazla 10, ardından diğer şubelerden (rankCandidates en fazla 5 verir); tek kesimde
    // kalabalık şubede başka şube adayları hiç görünmüyordu
    const usable = candidates.filter(c => !declined.includes(c.personnel_id) && (!c.other_branch || borrow));
    const list = [...usable.filter(c => !c.other_branch).slice(0, 10), ...usable.filter(c => c.other_branch)]
      .map(c => ({ ...c, assignable: !c.other_branch || canAssignFrom(auth, c.home_location_id) }));
    return NextResponse.json({ candidates: list, is_night, cross_branch: borrow });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
