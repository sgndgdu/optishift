/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { managerOutsideBranch } from "@/lib/access";
import { claimOpenShift, publishOpenShift } from "@/lib/openShifts";
import { businessToday, dayIndexOf, formatDateTR, weekStartOf } from "@/lib/date";
import { checkPersonChange } from "@/lib/assignmentCheck";


function getDb() {
  return getDB();
}

// GET:
// ?location_id=...           → müdür: tüm açık vardiyalar
// ?location_id=...&status=open → personel: yalnız açık olanlar
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  // Çalışan portalı (?mine=1): çalıştığı TÜM şubelerin açık ilanları + davet edildiği başka şube ilanı (?invite=<id>)
  if (searchParams.get("mine") === "1" && auth.personnel_id) {
    const db0 = getDB();
    try {
      const me = await db0.prepare("SELECT assigned_location_ids, primary_location_id FROM personnel WHERE id = ? AND org_id = ?").get(auth.personnel_id, auth.org_id) as any;
      let locs: string[] = [];
      try { locs = JSON.parse(me?.assigned_location_ids || "[]"); } catch { locs = []; }
      if (me?.primary_location_id && !locs.includes(me.primary_location_id)) locs.push(me.primary_location_id);
      const today = businessToday();
      const rows: any[] = locs.length ? await db0.prepare(`
        SELECT os.*, l.name AS location_name FROM open_shifts os JOIN locations l ON l.id = os.location_id
        WHERE os.org_id = ? AND os.status = 'open' AND os.date >= ? AND os.location_id IN (${locs.map(() => "?").join(",")})
        ORDER BY os.date ASC, os.start_time ASC`).all(auth.org_id, today, ...locs) as any[] : [];
      const invite = Number(searchParams.get("invite"));
      if (invite && !rows.some(r => Number(r.id) === invite)) {
        const inv = await db0.prepare(`
          SELECT os.*, l.name AS location_name FROM open_shifts os JOIN locations l ON l.id = os.location_id
          WHERE os.id = ? AND os.org_id = ? AND os.status = 'open' AND os.date >= ?`).get(invite, auth.org_id, today) as any;
        if (inv) rows.unshift({ ...inv, invited: true });
      }
      // Üstlenemeyeceği ilan baştan belli olsun (kullanıcı kararı 2026-10-05): o gün vardiyası varsa ya da alırsa
      // dinlenme/haftalık sınır bozulursa "problems" döner, portal düğmeyi kapatır. Kontrol üstlenmeyle aynı (lib/assignmentCheck).
      const withProblems = await Promise.all(rows.map(async r => {
        if (r.released_by === auth.personnel_id) return r;
        const date = String(r.date);
        const ws = weekStartOf(date), day = dayIndexOf(date);
        const sameDay = await db0.prepare(`
          SELECT sa.start_time, sa.end_time, l.name AS loc FROM shift_assignments sa LEFT JOIN locations l ON l.id = sa.location_id
          WHERE sa.personnel_id = ? AND sa.week_start = ? AND sa.day = ? AND COALESCE(sa.kind, 'regular') = 'regular' LIMIT 1`).get(auth.personnel_id, ws, day) as any;
        if (sameDay) return { ...r, problems: [`O gün zaten vardiyanız var (${sameDay.start_time}–${sameDay.end_time}${sameDay.loc && r.location_name !== sameDay.loc ? `, ${sameDay.loc}` : ""})`] };
        const problems = await checkPersonChange(db0, auth.personnel_id!, r.location_id, {
          add: [{ week_start: ws, day, start_time: r.start_time, end_time: r.end_time }],
        }).catch(() => []);
        return problems.length ? { ...r, problems } : r;
      }));
      return NextResponse.json(withProblems.map(r => ({ ...r, other_branch: r.location_id !== me?.primary_location_id })));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }
  const location_id = searchParams.get("location_id");
  if (managerOutsideBranch(auth, location_id)) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  const status = searchParams.get("status");
  const org_id = auth.org_id; // token'dan al

  if (!location_id) {
    return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });
  }

  const db = getDB();
  try {
    let rows: any[];
    if (status === "open") {
      // Tarihi geçmiş ilan üstlenilemez: listede de görünmez
      rows = await db.prepare(`
        SELECT open_shifts.* FROM open_shifts
        WHERE org_id = ? AND location_id = ? AND status = 'open' AND date >= ?
        ORDER BY date ASC, start_time ASC
      `).all(org_id, location_id, businessToday());
    } else if (status) {
      rows = await db.prepare(`
        SELECT open_shifts.* FROM open_shifts
        WHERE org_id = ? AND location_id = ? AND status = ?
        ORDER BY date ASC, start_time ASC
      `).all(org_id, location_id, status);
    } else {
      rows = await db.prepare(`
        SELECT open_shifts.* FROM open_shifts
        WHERE org_id = ? AND location_id = ?
        ORDER BY date ASC, start_time ASC
      `).all(org_id, location_id);
    }
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Yeni açık vardiya ilanı (müdür).
// Alternatif mod — convert_assignment_id: mevcut (gelinmeyen/raporlu) bir vardiya
// atamasını tek adımda açık vardiyaya dönüştürür: atama silinir, ilan oluşur,
// kişiye ve ekibe bildirim gider. reason: 'no_show' → no_show_count artar.
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const body = await req.json();
    let { location_id, date, start_time, end_time, note } = body;
    const { hero_bonus_multiplier, convert_assignment_id, reason } = body;
    // Bildirim hedefi: "all" (şubenin tüm personeli, varsayılan), "top" (en uygun 3 aday,
    // lib/openShiftCandidates), "none" (müdür doğrudan atayacak)
    const notify: "all" | "top" | "none" = body.notify === "top" || body.notify === "none" ? body.notify : "all";
    let absentPersonnelId: string | null = null;
    let sourceAssignmentId: number | null = null;
    const org_id = auth.org_id;

    // Personel sadece "pazar yerine bırak" modunu ve sadece KENDİ atamasını kullanabilir —
    // yeni sıfırdan ilan oluşturamaz, başkasının vardiyasını açığa çıkaramaz, no_show işaretleyemez.
    if (auth.role === "employee") {
      if (!convert_assignment_id) {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      if (reason === "no_show") {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
    }

    // Açık vardiya sistemi bu lokasyonda kapatılmışsa (rules.open_shifts_enabled) hiçbir ilan oluşturulamaz
    async function openShiftsEnabledFor(locId: string): Promise<boolean> {
      const loc = await db.prepare(`SELECT rules FROM locations WHERE id = ?`).get(locId) as any;
      if (!loc?.rules) return true;
      try { return JSON.parse(loc.rules)?.open_shifts_enabled !== false; } catch { return true; }
    }

    if (!convert_assignment_id && location_id && !(await openShiftsEnabledFor(location_id))) {
      return NextResponse.json({ error: "Bu şubede açık vardiya sistemi kapalı." }, { status: 422 });
    }

    if (convert_assignment_id) {
      const asg = await db.prepare(`
        SELECT sa.*, p.name AS p_name, p.org_id AS p_org
        FROM shift_assignments sa
        JOIN personnel p ON p.id = sa.personnel_id
        WHERE sa.id = ?
      `).get(convert_assignment_id) as any;
      if (!asg || asg.p_org !== org_id) {
        return NextResponse.json({ error: "Vardiya ataması bulunamadı" }, { status: 404 });
      }
      if (asg.kind === "on_call") {
        return NextResponse.json({ error: "Nöbet ilana çıkarılamaz. Nöbeti Vardiya Planı'ndan başka birine verin." }, { status: 400 });
      }
      if (auth.role === "employee") {
        if (asg.personnel_id !== auth.personnel_id) {
          return NextResponse.json({ error: "Sadece kendi vardiyanızı bırakabilirsiniz" }, { status: 403 });
        }
        if (asg.publication_status !== "published") {
          return NextResponse.json({ error: "Sadece yayınlanmış vardiyalar ilana çıkarılabilir" }, { status: 400 });
        }
      }
      const dt = new Date(asg.week_start + "T00:00:00Z");
      dt.setUTCDate(dt.getUTCDate() + Number(asg.day ?? 0));
      location_id = asg.location_id;
      date = dt.toISOString().split("T")[0];
      start_time = asg.start_time;
      end_time = asg.end_time;
      note = note ?? (reason === "no_show"
        ? `${asg.p_name} vardiyaya gelmedi, vardiya ilana çevrildi`
        : `${asg.p_name} gelemiyor, vardiya ilana çevrildi`);

      if (!(await openShiftsEnabledFor(location_id))) {
        return NextResponse.json({ error: "Bu şubede açık vardiya sistemi kapalı." }, { status: 422 });
      }

      absentPersonnelId = asg.personnel_id;
      if (auth.role === "employee") {
        // Personelin devir ilanı: vardiya biri üstlenene kadar onda kalır (claimOpenShift atamayı devreder).
        // Aynı atama için ikinci açık ilan açılmaz.
        const existing = await db.prepare(
          `SELECT id FROM open_shifts WHERE source_assignment_id = ? AND status = 'open'`
        ).get(convert_assignment_id) as any;
        if (existing) {
          return NextResponse.json({ error: "Bu vardiya zaten ilanda." }, { status: 409 });
        }
        // Takası süren vardiya ayrıca ilana çıkmaz (iki akış aynı vardiyayı iki kişiye verebilirdi)
        const pendingSwap = await db.prepare(
          `SELECT id FROM shift_swap_requests WHERE (requester_shift_id = ? OR target_shift_id = ?) AND status IN ('pending', 'peer_accepted') LIMIT 1`
        ).get(convert_assignment_id, convert_assignment_id) as any;
        if (pendingSwap) {
          return NextResponse.json({ error: "Bu vardiya için bekleyen bir vardiya değiştirme talebiniz var. Önce onu geri çekin." }, { status: 409 });
        }
        sourceAssignmentId = Number(convert_assignment_id);
        note = body.note ?? `${asg.p_name} bu vardiyayı başka birine vermek istiyor`;
      } else {
        // Müdür kararı (Gelemiyor / gelmedi): atama hemen kalkar, vardiya ilan havuzuna düşer
        await db.prepare(`DELETE FROM shift_assignments WHERE id = ?`).run(convert_assignment_id);
        if (reason === "no_show") {
          await db.prepare(`UPDATE personnel SET no_show_count = COALESCE(no_show_count, 0) + 1 WHERE id = ?`).run(asg.personnel_id);
        }
        await db.prepare(`
          INSERT INTO notifications (personnel_id, type, title, message, created_at)
          VALUES (?, 'shift_change', ?, ?, ?)
        `).run(
          asg.personnel_id,
          "Vardiyanız ilana çıkarıldı",
          reason === "no_show"
            ? `${formatDateTR(date)} ${start_time}–${end_time} vardiyanıza gelmediğiniz için vardiya ilana çıkarıldı. Bir yanlışlık olduğunu düşünüyorsanız sorumlunuzla konuşun.`
            : `${formatDateTR(date)} ${start_time}–${end_time} vardiyanız sorumlunuz tarafından ilana çıkarıldı. Bu vardiya artık sizin planınızda değil.`,
          Math.floor(Date.now() / 1000)
        );
      }
    }

    if (!location_id || !date || !start_time || !end_time) {
      return NextResponse.json({ error: "Zorunlu alanlar eksik" }, { status: 400 });
    }

    const published = await publishOpenShift(db, {
      org_id, location_id, date, start_time, end_time, note: note ?? null,
      heroPoints: typeof hero_bonus_multiplier === "number" ? hero_bonus_multiplier : undefined,
      releasedBy: absentPersonnelId, sourceAssignmentId, notify,
    });
    return NextResponse.json({ success: true, id: published.id, notified: published.notified });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH:
// Personel üstlenir: { id, claimed_by, claimed_by_name }  (claimed_by = personnel_id)
// Müdür iptal eder:  { id, status: 'cancelled' }
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const body = await req.json();
    const { id, claimed_by, claimed_by_name, status, assigned_by_manager, force } = body;

    if (!id) {
      return NextResponse.json({ error: "id zorunlu" }, { status: 400 });
    }

    // Verify open shift belongs to this org
    const os = await db.prepare(`SELECT * FROM open_shifts WHERE id = ? AND org_id = ?`).get(id, auth.org_id) as any;
    if (os && managerOutsideBranch(auth, os.location_id)) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    if (!os) {
      return NextResponse.json({ error: "Vardiya bulunamadı" }, { status: 404 });
    }

    if (body.withdraw) {
      // Personel kendi devir ilanını geri çeker (vardiya zaten hâlâ onda)
      if (auth.role !== "employee" || os.released_by !== auth.personnel_id || !os.source_assignment_id) {
        return NextResponse.json({ error: "Bu ilanı geri çekemezsiniz" }, { status: 403 });
      }
      if (os.status !== "open") {
        return NextResponse.json({ error: "İlan artık açık değil" }, { status: 409 });
      }
      await db.prepare(`UPDATE open_shifts SET status = 'cancelled' WHERE id = ? AND status = 'open'`).run(id);
      return NextResponse.json({ success: true });
    }

    // Şube müdürü başka şubenin çalışanını doğrudan atayamaz (kullanıcı kararı): ilan ona duyurulur, kendisi üstlenir
    if (claimed_by && assigned_by_manager && auth.role === "manager") {
      const target = await db.prepare("SELECT assigned_location_ids FROM personnel WHERE id = ? AND org_id = ?").get(claimed_by, auth.org_id) as any;
      if (!String(target?.assigned_location_ids ?? "").includes(`"${auth.location_id}"`)) {
        return NextResponse.json({ error: "Başka şubenin çalışanını sadece hesap sahibi ya da bölge sorumlusu atar. İlan bu kişiye duyuruldu, kendisi alabilir." }, { status: 403 });
      }
    }
    if (claimed_by) {
      // Personel sadece kendisi adına üstlenebilir; "müdür ataması" bayrağını da kullanamaz
      if (auth.role === "employee" && (claimed_by !== auth.personnel_id || assigned_by_manager)) {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      const outcome = await claimOpenShift(db, auth.org_id, id, claimed_by, claimed_by_name ?? null, { assignedByManager: !!assigned_by_manager, force: force === true });
      if (!outcome.ok) return NextResponse.json({ error: outcome.error, violations: outcome.violations, can_force: outcome.can_force }, { status: outcome.status });
    } else if (status) {
      if (auth.role === "employee") {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      await db.prepare(`UPDATE open_shifts SET status = ? WHERE id = ?`).run(status, id);
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Vardiyayı sil (müdür)
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    // Verify ownership before deleting
    const existing = await db.prepare(`SELECT id, location_id FROM open_shifts WHERE id = ? AND org_id = ?`).get(id, auth.org_id) as { location_id: string } | undefined;
    if (existing && managerOutsideBranch(auth, existing.location_id)) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    if (!existing) {
      return NextResponse.json({ error: "Vardiya bulunamadı" }, { status: 404 });
    }
    await db.prepare(`DELETE FROM open_shifts WHERE id = ?`).run(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
