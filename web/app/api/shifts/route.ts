/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { db as drizzleDb } from "@/lib/db";
import { scoreAdjustments } from "@/lib/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { recomputeLocationFairness } from "@/lib/scoring";
import { getWeekStart } from "@/lib/date";


// GET: Personelin vardiyalarını getir
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const personnel_id = searchParams.get("personnel_id");
  const week_start = searchParams.get("week_start");
  const location_id = searchParams.get("location_id");

  const db = getDB();
  try {
    let rows: any[] = [];
    if (personnel_id && week_start) {
      // Personel sadece kendi vardiyasını görebilir; manager org'undaki herkesi görebilir
      if (auth.role === "employee" && auth.personnel_id !== personnel_id) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = await db.prepare(`
        SELECT s.*, l.name as location_name
        FROM shift_assignments s
        LEFT JOIN locations l ON s.location_id = l.id
        WHERE s.personnel_id = ? AND s.week_start = ?
      `).all(personnel_id, week_start);
      // Employee: only published shifts
      if (auth.role === "employee") {
        rows = rows.filter((r: any) => !r.publication_status || r.publication_status === "published");
      }
    } else if (personnel_id) {
      if (auth.role === "employee" && auth.personnel_id !== personnel_id) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = await db.prepare(`
        SELECT s.*, l.name as location_name
        FROM shift_assignments s
        LEFT JOIN locations l ON s.location_id = l.id
        WHERE s.personnel_id = ?
      `).all(personnel_id);
      // Employee: only published shifts
      if (auth.role === "employee") {
        rows = rows.filter((r: any) => !r.publication_status || r.publication_status === "published");
      }
    } else if (location_id && week_start) {
      // Lokasyonun bu org'a ait olduğunu doğrula
      const loc = await db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
      if (!loc) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = await db.prepare(`
        SELECT s.*, l.name as location_name
        FROM shift_assignments s
        LEFT JOIN locations l ON s.location_id = l.id
        WHERE s.location_id = ? AND s.week_start = ?
      `).all(location_id, week_start);
      // Employee: only published shifts
      if (auth.role === "employee") {
        rows = rows.filter((r: any) => !r.publication_status || r.publication_status === "published");
      }
    } else {
      rows = [];
    }
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Vardiya ataması yap (Çakışma Kontrolü ile)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const body = await req.json();
    // body can be a single shift or an array of shifts
    const shifts = Array.isArray(body) ? body : (body.shifts ?? [body]);
    const forcePublish: boolean = !Array.isArray(body) && body.force === true;

    if (shifts.length === 0) {
      return NextResponse.json({ error: "Vardiya verisi boş" }, { status: 400 });
    }

    const now = Math.floor(Date.now() / 1000);
    const results: any[] = [];
    const errors: string[] = [];
    const compensations: { personnel_id: string; points: number }[] = [];
    // Telafi olayı yazılan lokasyonlar — dönüş öncesi kümülatif skorları tazelenir
    const compAffectedLocations = new Set<string>();
    // Force assignment detection: items collected during transaction, processed after
    const forceItems: { personnel_id: string; location_id: string; week_start: string; day: number; shift_id_db: number; start_time: string | null; end_time: string | null; prevForceStatus: string | null }[] = [];

    // Lokasyon kurallarını önbelleğe al (async)
    const rulesCache = new Map<string, any>();
    const getLocRules = async (locId: string): Promise<any> => {
      if (rulesCache.has(locId)) return rulesCache.get(locId)!;
      let rules: any = {};
      try {
        const row = await db.prepare("SELECT rules FROM locations WHERE id = ?").get(locId) as any;
        rules = JSON.parse(row?.rules || "{}");
      } catch { /* varsayılan */ }
      rulesCache.set(locId, rules);
      return rules;
    };
    const getCompPoints = async (locId: string): Promise<number> => {
      const r = await getLocRules(locId);
      return typeof r.change_compensation_points === "number" ? r.change_compensation_points : 2;
    };
    const getMinRestMin = async (locId: string): Promise<number> => {
      const r = await getLocRules(locId);
      return (typeof r.min_rest_hours === "number" ? r.min_rest_hours : 11) * 60;
    };

    const todayStr = new Date().toISOString().split("T")[0];

    await (async () => {
      for (const shift of shifts) {
        const { personnel_id, location_id, week_start, day, shift_id, start_time, end_time } = shift;
        
        if (!personnel_id || !location_id || !week_start || day === undefined) {
          errors.push("Eksik veri: personnel_id, location_id, week_start, day zorunlu");
          continue;
        }

        // 1. 11 SAAT DİNLENME KURALI KONTROLÜ (force=true ise uyar ama bloklamaz)
        if (start_time && end_time) {
          const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
          const newStart = toMin(start_time);
          const newEnd   = toMin(end_time);

          // Önceki gün vardiyası var mı?
          if (day > 0) {
            const prevShift = await db.prepare(`
              SELECT start_time, end_time FROM shift_assignments
              WHERE personnel_id = ? AND week_start = ? AND day = ?
              AND status != 'swapped' AND status != 'absent'
            `).get(personnel_id, week_start, day - 1) as any;
            if (prevShift?.end_time) {
              const prevEnd = toMin(prevShift.end_time);
              const prevEndAdj = prevEnd <= toMin(prevShift.start_time) ? prevEnd + 1440 : prevEnd;
              const gap = (newStart + 1440) - prevEndAdj;
              const minRest = await getMinRestMin(location_id);
              if (gap < minRest) {
                const msg = `${personnel_id} için dinlenme süresi ${minRest / 60} saatin altında (${Math.round(gap / 60 * 10) / 10} sa).`;
                if (!forcePublish) { errors.push(msg); continue; }
                else errors.push(msg);
              }
            }
          }

          // Sonraki gün vardiyası var mı?
          if (day < 6) {
            const nextShift = await db.prepare(`
              SELECT start_time, end_time FROM shift_assignments
              WHERE personnel_id = ? AND week_start = ? AND day = ?
              AND status != 'swapped' AND status != 'absent'
            `).get(personnel_id, week_start, day + 1) as any;
            if (nextShift?.start_time) {
              const nextStart = toMin(nextShift.start_time);
              const curEndAdj = newEnd <= newStart ? newEnd + 1440 : newEnd;
              const gap = (nextStart + 1440) - curEndAdj;
              const minRest = await getMinRestMin(location_id);
              if (gap < minRest) {
                const msg = `${personnel_id} için ertesi gün vardiyasıyla dinlenme süresi ${minRest / 60} saatin altında (${Math.round(gap / 60 * 10) / 10} sa).`;
                if (!forcePublish) { errors.push(msg); continue; }
                else errors.push(msg);
              }
            }
          }
        }

        // 2. ÇAKIŞMA KONTROLÜ (Aynı gün başka şubede mesaisi var mı?)
        const existing = await db.prepare(`
          SELECT * FROM shift_assignments
          WHERE personnel_id = ? AND week_start = ? AND day = ?
          AND status != 'swapped' AND status != 'absent'
        `).get(personnel_id, week_start, day) as any;

        const pubStatus = shift.publication_status ?? "published";

        if (existing) {
          // Kendi şubesi için zaten yazılmışsa sadece update edeceğiz (override).
          // Eğer BAŞKA şube yazmışsa engelle.
          if (existing.location_id !== location_id) {
            errors.push(`Personel (ID: ${personnel_id}) o gün başka bir şubede görevli.`);
            continue;
          } else {
            // Kendi şubesinde güncelleniyor
            // Yayın sonrası değişiklik tespiti: yayınlanmış vardiyanın saati değişiyorsa
            // personele telafi puanı yazılır (predictability pay analoğu — OPTI-023)
            const timeChanged =
              existing.publication_status === "published" &&
              (existing.start_time !== (start_time || null) || existing.end_time !== (end_time || null));

            await db.prepare(`
              UPDATE shift_assignments
              SET shift_id = ?, start_time = ?, end_time = ?, status = 'scheduled', publication_status = ?,
                  published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END
              WHERE id = ?
            `).run(shift_id || 'custom', start_time || null, end_time || null, pubStatus, pubStatus, now, existing.id);

            if (timeChanged && pubStatus === "published") {
              // Sadece bugün veya gelecekteki vardiyalar için telafi (geçmiş düzeltmeleri hariç)
              const shiftDate = new Date(`${week_start}T00:00:00`);
              shiftDate.setDate(shiftDate.getDate() + day);
              const compEnabled = ((await getLocRules(location_id))?.change_compensation_enabled !== false);
              if (shiftDate.toISOString().split("T")[0] >= todayStr && compEnabled) {
                const compPts = await getCompPoints(location_id);
                if (compPts > 0) {
                  // Telafi bir puan OLAYIDIR: score_adjustments'a yazılır, kümülatif
                  // skor recompute ile güncellenir — prev_score'a doğrudan += yok.
                  await drizzleDb.insert(scoreAdjustments).values({
                    org_id: auth.org_id,
                    location_id,
                    personnel_id,
                    type: "change_comp",
                    points: compPts,
                    week_start,
                    ref_id: String(existing.id),
                    note: `Yayın sonrası saat değişikliği: ${existing.start_time}–${existing.end_time} → ${start_time}–${end_time}`,
                    created_by: auth.id,
                  });
                  compAffectedLocations.add(location_id);
                  await db.prepare(`
                    INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
                    VALUES (?, 'alert', 'Vardiyan Güncellendi', ?, '/portal/calendar', false, ?)
                  `).run(
                    personnel_id,
                    `Yayınlanmış vardiyanın saati ${existing.start_time}–${existing.end_time} → ${start_time}–${end_time} olarak değişti. Son dakika değişikliği için +${compPts} telafi puanı hesabına eklendi.`,
                    now
                  );
                  compensations.push({ personnel_id, points: compPts });
                }
              }
            }

            results.push({ id: existing.id, updated: true });
            // Force check: collect for post-transaction processing
            forceItems.push({ personnel_id, location_id, week_start, day, shift_id_db: existing.id, start_time: start_time || null, end_time: end_time || null, prevForceStatus: existing.force_acceptance_status ?? null });
            continue;
          }
        }

        // Çakışma yoksa yeni kayıt oluştur
        const result = await db.prepare(`
          INSERT INTO shift_assignments (personnel_id, location_id, week_start, day, shift_id, start_time, end_time, status, publication_status, published_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)
        `).run(personnel_id, location_id, week_start, day, shift_id || 'custom', start_time || null, end_time || null, pubStatus, pubStatus === "published" ? now : null, now);

        const newId = Number(result.lastInsertRowid);
        results.push({ id: newId, inserted: true });
        // Force check: collect for post-transaction processing
        forceItems.push({ personnel_id, location_id, week_start, day, shift_id_db: newId, start_time: start_time || null, end_time: end_time || null, prevForceStatus: null });
      }
    })();

    // ── Force Assignment Detection ──────────────────────────────────────────

    const forceNotifications: { personnel_id: string; shift_id_db: number; multiplier: number; dateLabel: string }[] = [];

    for (const item of forceItems) {
      // Zaten pending/accepted/rejected → tekrar flaglama
      if (item.prevForceStatus) continue;

      // Müsaitlik kontrolü
      const dayKey = `day_${item.day}`;
      const avail = await db.prepare(`SELECT ${dayKey} FROM availability WHERE personnel_id = ? AND week_start = ?`)
        .get(item.personnel_id, item.week_start) as any;
      const isUnavailable = avail?.[dayKey] === "unavailable";

      // İzin kontrolü
      const shiftDate = new Date(`${item.week_start}T00:00:00`);
      shiftDate.setDate(shiftDate.getDate() + item.day);
      const shiftDateStr = shiftDate.toISOString().split("T")[0];
      const onLeave = await db.prepare(`
        SELECT id FROM leave_requests
        WHERE personnel_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ?
      `).get(item.personnel_id, shiftDateStr, shiftDateStr);

      if (!isUnavailable && !onLeave) continue;

      const rules = await getLocRules(item.location_id);
      const leaveOverrideBonusEnabled = rules?.leave_override_bonus_enabled !== false;
      const multiplier = leaveOverrideBonusEnabled && typeof rules.leave_override_bonus_multiplier === "number"
        ? rules.leave_override_bonus_multiplier
        : leaveOverrideBonusEnabled ? 1.5 : 1.0;

      await db.prepare(`
        UPDATE shift_assignments
        SET force_assigned = true, force_acceptance_status = 'pending', force_bonus_multiplier = ?
        WHERE id = ?
      `).run(multiplier, item.shift_id_db);

      const DAY_TR = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
      const dateLabel = `${DAY_TR[item.day]} ${shiftDate.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}`;
      forceNotifications.push({ personnel_id: item.personnel_id, shift_id_db: item.shift_id_db, multiplier, dateLabel });
    }

    for (const fn of forceNotifications) {
      const shiftRow = await db.prepare(`SELECT start_time, end_time FROM shift_assignments WHERE id = ?`).get(fn.shift_id_db) as any;
      const timeStr = shiftRow?.start_time && shiftRow?.end_time ? ` ${shiftRow.start_time}–${shiftRow.end_time}` : "";
      await db.prepare(`
        INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
        VALUES (?, 'force_assign', 'Zorunlu Atama Talebi', ?, '/portal/requests', false, ?)
      `).run(
        fn.personnel_id,
        `Müdürünüz sizi ${fn.dateLabel}${timeStr} vardiyasına atadı. İzinli olduğunuz için onaylamanız gerekiyor. Kabul ederseniz ×${fn.multiplier} bonus puan kazanırsınız.`,
        now,
      );
    }

    // Telafi olayları yazıldıysa kümülatif skorları (prev_score önbelleği) tazele
    for (const locId of compAffectedLocations) {
      await recomputeLocationFairness(auth.org_id, locId, getWeekStart());
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: "Bazı atamalarda çakışma oldu", details: errors, results, compensations }, { status: 409 });
    }

    return NextResponse.json({ success: true, results, compensations });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Bulk publish a draft week OR check-in/check-out a single shift
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const body = await req.json();
    const { action } = body;

    // ── Bulk publish: draft → published ─────────────────────────────
    if (action === "publish_week") {
      if (auth.role === "employee") {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      const { location_id, week_start } = body;
      if (!location_id || !week_start) {
        return NextResponse.json({ error: "location_id ve week_start zorunlu" }, { status: 400 });
      }
      const loc = await db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
      if (!loc) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      const info = await db.prepare(`
        UPDATE shift_assignments SET publication_status = 'published',
          published_at = COALESCE(published_at, ?)
        WHERE location_id = ? AND week_start = ? AND publication_status = 'draft'
      `).run(Math.floor(Date.now() / 1000), location_id, week_start);
      return NextResponse.json({ success: true, updated: info.changes });
    }

    // ── Taslak otomatik kayıt: haftanın draft satırlarını tam senkronla ──
    // OPTI-024: client cellMap'in güncel halini gönderir; draft satırlar
    // silinip yeniden yazılır (lokalde silinen hücre DB'den de silinir).
    // Yayınlanmış satırlara dokunulmaz — onların değişikliği "Yayınla" ile gider.
    if (action === "sync_draft_week") {
      if (auth.role === "employee") {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      const { location_id, week_start, shifts } = body;
      if (!location_id || !week_start || !Array.isArray(shifts)) {
        return NextResponse.json({ error: "location_id, week_start ve shifts zorunlu" }, { status: 400 });
      }
      const loc = await db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
      if (!loc) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      const now = Math.floor(Date.now() / 1000);
      let synced = 0;
      await (async () => {
        await db.prepare(`
          DELETE FROM shift_assignments
          WHERE location_id = ? AND week_start = ? AND publication_status = 'draft'
        `).run(location_id, week_start);
        const hasPublished = await db.prepare(`
          SELECT 1 FROM shift_assignments
          WHERE personnel_id = ? AND week_start = ? AND day = ? AND publication_status = 'published'
        `);
        const insert = await db.prepare(`
          INSERT INTO shift_assignments (personnel_id, location_id, week_start, day, shift_id, start_time, end_time, status, publication_status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 'draft', ?)
        `);
        for (const s of shifts) {
          if (!s?.personnel_id || s.day === undefined || !s.start_time || !s.end_time) continue;
          // Yayınlanmış satır varsa (bu veya başka şubede) draft kopya yazma
          if (await hasPublished.get(s.personnel_id, week_start, s.day)) continue;
          await insert.run(s.personnel_id, location_id, week_start, s.day, s.shift_id || "custom", s.start_time, s.end_time, now);
          synced++;
        }
      })();
      return NextResponse.json({ success: true, synced });
    }

    // ── Check-in ─────────────────────────────────────────────────────
    if (action === "check_in") {
      const { shift_id } = body;
      if (!shift_id) {
        return NextResponse.json({ error: "shift_id zorunlu" }, { status: 400 });
      }
      const existing = await db.prepare("SELECT * FROM shift_assignments WHERE id = ?").get(shift_id) as any;
      if (!existing) {
        return NextResponse.json({ error: "Vardiya bulunamadı" }, { status: 404 });
      }
      // Employee sadece kendi vardiyasını check-in yapabilir
      if (auth.role === "employee" && existing.personnel_id !== auth.personnel_id) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      const now = Math.floor(Date.now() / 1000);
      await db.prepare("UPDATE shift_assignments SET check_in_at = ?, status = 'active' WHERE id = ?").run(now, shift_id);
      return NextResponse.json({ success: true });
    }

    // ── Check-out ────────────────────────────────────────────────────
    if (action === "check_out") {
      const { shift_id } = body;
      if (!shift_id) {
        return NextResponse.json({ error: "shift_id zorunlu" }, { status: 400 });
      }
      const existing = await db.prepare("SELECT * FROM shift_assignments WHERE id = ?").get(shift_id) as any;
      if (!existing) {
        return NextResponse.json({ error: "Vardiya bulunamadı" }, { status: 404 });
      }
      if (auth.role === "employee" && existing.personnel_id !== auth.personnel_id) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      const now = Math.floor(Date.now() / 1000);
      await db.prepare("UPDATE shift_assignments SET check_out_at = ?, status = 'completed' WHERE id = ?").run(now, shift_id);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Geçersiz action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
