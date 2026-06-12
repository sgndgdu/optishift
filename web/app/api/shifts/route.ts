/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { requireAuth } from "@/lib/auth";

const DB_PATH = path.join(process.cwd(), "optishift.db");

// GET: Personelin vardiyalarını getir
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const personnel_id = searchParams.get("personnel_id");
  const week_start = searchParams.get("week_start");
  const location_id = searchParams.get("location_id");

  const db = new Database(DB_PATH);
  try {
    let rows: any[] = [];
    if (personnel_id && week_start) {
      // Personel sadece kendi vardiyasını görebilir; manager org'undaki herkesi görebilir
      if (auth.role === "employee" && auth.personnel_id !== personnel_id) {
        db.close();
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = db.prepare(`
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
        db.close();
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = db.prepare(`
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
      const loc = db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
      if (!loc) {
        db.close();
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = db.prepare(`
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
    db.close();
    return NextResponse.json(rows);
  } catch (err: any) {
    db.close();
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

  const db = new Database(DB_PATH);
  try {
    const body = await req.json();
    // body can be a single shift or an array of shifts
    const shifts = Array.isArray(body) ? body : [body];

    if (shifts.length === 0) {
      return NextResponse.json({ error: "Vardiya verisi boş" }, { status: 400 });
    }

    const now = Math.floor(Date.now() / 1000);
    const results: any[] = [];
    const errors: string[] = [];
    const compensations: { personnel_id: string; points: number }[] = [];

    // Lokasyon bazlı telafi puanı kuralı (rules.change_compensation_points, varsayılan 2)
    const compPointsCache = new Map<string, number>();
    const getCompPoints = (locId: string): number => {
      if (compPointsCache.has(locId)) return compPointsCache.get(locId)!;
      let pts = 2;
      try {
        const row = db.prepare("SELECT rules FROM locations WHERE id = ?").get(locId) as any;
        const parsed = JSON.parse(row?.rules || "{}");
        if (typeof parsed.change_compensation_points === "number") pts = parsed.change_compensation_points;
      } catch { /* varsayılan 2 */ }
      compPointsCache.set(locId, pts);
      return pts;
    };

    const todayStr = new Date().toISOString().split("T")[0];

    db.transaction(() => {
      for (const shift of shifts) {
        const { personnel_id, location_id, week_start, day, shift_id, start_time, end_time } = shift;
        
        if (!personnel_id || !location_id || !week_start || day === undefined) {
          errors.push("Eksik veri: personnel_id, location_id, week_start, day zorunlu");
          continue;
        }

        // 1. 11 SAAT DİNLENME KURALI KONTROLÜ
        if (start_time && end_time) {
          const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
          const newStart = toMin(start_time);
          const newEnd   = toMin(end_time);

          // Önceki gün vardiyası var mı?
          if (day > 0) {
            const prevShift = db.prepare(`
              SELECT start_time, end_time FROM shift_assignments
              WHERE personnel_id = ? AND week_start = ? AND day = ?
              AND status != 'swapped' AND status != 'absent'
            `).get(personnel_id, week_start, day - 1) as any;
            if (prevShift?.end_time) {
              const prevEnd = toMin(prevShift.end_time);
              // Gece geçişi: bitiş saati başlangıçtan küçükse ertesi güne geçmiş demektir
              const prevEndAdj = prevEnd <= toMin(prevShift.start_time) ? prevEnd + 1440 : prevEnd;
              const gap = (newStart + 1440) - prevEndAdj; // ertesi gün başlangıcı
              if (gap < 11 * 60) {
                errors.push(`${personnel_id} için dinlenme süresi 11 saatin altında (${Math.round(gap / 60 * 10) / 10} sa).`);
                continue;
              }
            }
          }

          // Sonraki gün vardiyası var mı?
          if (day < 6) {
            const nextShift = db.prepare(`
              SELECT start_time, end_time FROM shift_assignments
              WHERE personnel_id = ? AND week_start = ? AND day = ?
              AND status != 'swapped' AND status != 'absent'
            `).get(personnel_id, week_start, day + 1) as any;
            if (nextShift?.start_time) {
              const nextStart = toMin(nextShift.start_time);
              const curEndAdj = newEnd <= newStart ? newEnd + 1440 : newEnd;
              const gap = (nextStart + 1440) - curEndAdj;
              if (gap < 11 * 60) {
                errors.push(`${personnel_id} için ertesi gün vardiyasıyla dinlenme süresi 11 saatin altında (${Math.round(gap / 60 * 10) / 10} sa).`);
                continue;
              }
            }
          }
        }

        // 2. ÇAKIŞMA KONTROLÜ (Aynı gün başka şubede mesaisi var mı?)
        const existing = db.prepare(`
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

            db.prepare(`
              UPDATE shift_assignments
              SET shift_id = ?, start_time = ?, end_time = ?, status = 'scheduled', publication_status = ?,
                  published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END
              WHERE id = ?
            `).run(shift_id || 'custom', start_time || null, end_time || null, pubStatus, pubStatus, now, existing.id);

            if (timeChanged && pubStatus === "published") {
              // Sadece bugün veya gelecekteki vardiyalar için telafi (geçmiş düzeltmeleri hariç)
              const shiftDate = new Date(`${week_start}T00:00:00`);
              shiftDate.setDate(shiftDate.getDate() + day);
              if (shiftDate.toISOString().split("T")[0] >= todayStr) {
                const compPts = getCompPoints(location_id);
                if (compPts > 0) {
                  // Hero bonusu emsali: prev_score ağırlıklı ortalama olduğu için ×0.8 ile eklenir
                  db.prepare(`UPDATE personnel SET prev_score = ROUND(COALESCE(prev_score, 0) + ?, 2) WHERE id = ?`)
                    .run(Math.round(compPts * 0.8 * 100) / 100, personnel_id);
                  db.prepare(`
                    INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
                    VALUES (?, 'alert', 'Vardiyan Güncellendi', ?, '/portal/calendar', 0, ?)
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
            continue;
          }
        }

        // Çakışma yoksa yeni kayıt oluştur
        const result = db.prepare(`
          INSERT INTO shift_assignments (personnel_id, location_id, week_start, day, shift_id, start_time, end_time, status, publication_status, published_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)
        `).run(personnel_id, location_id, week_start, day, shift_id || 'custom', start_time || null, end_time || null, pubStatus, pubStatus === "published" ? now : null, now);
        
        results.push({ id: result.lastInsertRowid, inserted: true });
      }
    })();

    db.close();

    if (errors.length > 0) {
      return NextResponse.json({ error: "Bazı atamalarda çakışma oldu", details: errors, results, compensations }, { status: 409 });
    }

    return NextResponse.json({ success: true, results, compensations });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Bulk publish a draft week OR check-in/check-out a single shift
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = new Database(DB_PATH);
  try {
    const body = await req.json();
    const { action } = body;

    // ── Bulk publish: draft → published ─────────────────────────────
    if (action === "publish_week") {
      if (auth.role === "employee") {
        db.close();
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      const { location_id, week_start } = body;
      if (!location_id || !week_start) {
        db.close();
        return NextResponse.json({ error: "location_id ve week_start zorunlu" }, { status: 400 });
      }
      const loc = db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
      if (!loc) {
        db.close();
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      const info = db.prepare(`
        UPDATE shift_assignments SET publication_status = 'published',
          published_at = COALESCE(published_at, ?)
        WHERE location_id = ? AND week_start = ? AND publication_status = 'draft'
      `).run(Math.floor(Date.now() / 1000), location_id, week_start);
      db.close();
      return NextResponse.json({ success: true, updated: info.changes });
    }

    // ── Check-in ─────────────────────────────────────────────────────
    if (action === "check_in") {
      const { shift_id } = body;
      if (!shift_id) {
        db.close();
        return NextResponse.json({ error: "shift_id zorunlu" }, { status: 400 });
      }
      const existing = db.prepare("SELECT * FROM shift_assignments WHERE id = ?").get(shift_id) as any;
      if (!existing) {
        db.close();
        return NextResponse.json({ error: "Vardiya bulunamadı" }, { status: 404 });
      }
      // Employee sadece kendi vardiyasını check-in yapabilir
      if (auth.role === "employee" && existing.personnel_id !== auth.personnel_id) {
        db.close();
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      const now = Math.floor(Date.now() / 1000);
      db.prepare("UPDATE shift_assignments SET check_in_at = ?, status = 'active' WHERE id = ?").run(now, shift_id);
      db.close();
      return NextResponse.json({ success: true });
    }

    // ── Check-out ────────────────────────────────────────────────────
    if (action === "check_out") {
      const { shift_id } = body;
      if (!shift_id) {
        db.close();
        return NextResponse.json({ error: "shift_id zorunlu" }, { status: 400 });
      }
      const existing = db.prepare("SELECT * FROM shift_assignments WHERE id = ?").get(shift_id) as any;
      if (!existing) {
        db.close();
        return NextResponse.json({ error: "Vardiya bulunamadı" }, { status: 404 });
      }
      if (auth.role === "employee" && existing.personnel_id !== auth.personnel_id) {
        db.close();
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      const now = Math.floor(Date.now() / 1000);
      db.prepare("UPDATE shift_assignments SET check_out_at = ?, status = 'completed' WHERE id = ?").run(now, shift_id);
      db.close();
      return NextResponse.json({ success: true });
    }

    db.close();
    return NextResponse.json({ error: "Geçersiz action" }, { status: 400 });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
