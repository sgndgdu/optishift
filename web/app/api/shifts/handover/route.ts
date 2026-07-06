/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// GET — bugünkü vardiyamdan ÖNCE biten vardiyaların devir notları.
// Personel başkasının takvimini göremez; bu endpoint yalnızca paylaşılmak üzere
// yazılmış devir notlarını (yazar adı + saat aralığıyla) döner.
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.personnel_id) return NextResponse.json({ notes: [] });

  const db = getDB();
  try {
    // Bu haftanın pazartesi'si ve bugünün gün indeksi
    const nowD = new Date();
    const dayIdx = (nowD.getDay() + 6) % 7;
    const monday = new Date(nowD);
    monday.setDate(nowD.getDate() - dayIdx);
    const week_start = monday.toISOString().split("T")[0];

    // Benim bugünkü vardiyam (yayınlanmış)
    const mine = await db.prepare(`
      SELECT * FROM shift_assignments
      WHERE personnel_id = ? AND week_start = ? AND day = ? AND publication_status = 'published'
      LIMIT 1
    `).get(auth.personnel_id, week_start, dayIdx) as any;
    if (!mine || !mine.start_time) return NextResponse.json({ notes: [] });

    const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const myStart = toMin(mine.start_time);

    // Aynı lokasyonda bugün benden önce biten + dün gece yarısını aşıp bu sabaha
    // devreden vardiyaların notları (kendi notum hariç)
    const prevDay = dayIdx - 1;
    const rows = await db.prepare(`
      SELECT sa.day, sa.start_time, sa.end_time, sa.handover_note, p.name AS author
      FROM shift_assignments sa
      JOIN personnel p ON p.id = sa.personnel_id
      WHERE sa.location_id = ? AND sa.week_start = ? AND sa.day IN (?, ?)
        AND sa.handover_note IS NOT NULL AND sa.personnel_id != ?
    `).all(mine.location_id, week_start, dayIdx, prevDay < 0 ? dayIdx : prevDay, auth.personnel_id) as any[];

    const notes = rows.filter(r => {
      if (!r.start_time || !r.end_time) return false;
      const s = toMin(r.start_time);
      let e = toMin(r.end_time);
      const overnight = e <= s;
      if (Number(r.day) === dayIdx) {
        if (overnight) return false;           // bugün başlayıp yarına sarkan → bana değil, yarına
        return e <= myStart;                    // bugün benden önce bitti
      }
      // dünün vardiyası: yalnızca gece yarısını aşıp bu sabah bitenler ilgili
      if (!overnight) return false;
      e -= 1440; // bu güne sarkan bitiş dakikası
      return e <= myStart + 60;                 // benim başlangıcıma kadar (1 saat tolerans)
    }).map(r => ({
      author: r.author,
      shift: `${r.start_time}–${r.end_time}`,
      note: r.handover_note,
    }));

    return NextResponse.json({ notes });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
