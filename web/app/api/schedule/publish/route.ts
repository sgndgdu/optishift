/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { requireAuth } from "@/lib/auth";
import { sendSMS, sendEmail, sendPushToPersonnel } from "@/lib/notifications";

const DB_PATH = path.join(process.cwd(), "optishift.db");

/** HH:MM string'ini günün dakikasına çevirir. */
function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Vardiya puanını hesaplar. Schedule sayfasındaki calcPoints ile aynı formül.
 * day: 0=Pzt … 6=Paz
 */
function calcShiftPoints(startTime: string, endTime: string, day: number): number {
  const startMin = toMin(startTime);
  let endMin     = toMin(endTime);
  if (endMin <= startMin) endMin += 24 * 60; // gece geçişi (örn. 16:00–00:00)
  const hours         = (endMin - startMin) / 60;
  const dayMultiplier = day === 5 || day === 6 ? 1.5 : 1;
  const lateBonus     = endMin > 22 * 60 ? 2 : 0;
  return Math.round(hours * dayMultiplier + lateBonus);
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = new Database(DB_PATH);
  try {
    const body = await req.json();
    const { location_id, week_start, scores: engineScores } = body;
    // engineScores: {personnel_id: OR-Tools total score (prev_score + this_week_engine_pts)} | undefined

    if (!location_id || !week_start) {
      return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });
    }

    // Verify location belongs to auth org
    const loc = db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
    if (!loc) {
      db.close();
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    // 1. Bu şubedeki aktif personelleri bul
    const personnel = db.prepare(`SELECT * FROM personnel WHERE assigned_location_ids LIKE ? AND status = 'active'`).all(`%"${location_id}"%`);
    
    let sentCount = 0;
    
    // 2. Her birine bildirim gönder
    for (const p of personnel as any[]) {
      // Sadece bu haftaya atanmış vardiyası olanları bul
      const assignments = db.prepare(`SELECT count(*) as cnt FROM shift_assignments WHERE personnel_id = ? AND week_start = ? AND location_id = ?`).get(p.id, week_start, location_id) as any;
      
      if (assignments.cnt > 0) {
        // In-app bildirim oluştur
        db.prepare(`
          INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
          VALUES (?, 'schedule', ?, ?, '/portal/calendar', 0, ?)
        `).run(
          p.id,
          "Vardiya Programın Yayınlandı 📅",
          `${week_start} haftası için vardiya programın hazır. Takvimini kontrol et!`,
          Math.floor(Date.now() / 1000)
        );
        // SMS ve E-posta gönder (Mock)
        if (p.phone) {
          await sendSMS(p.phone, `Merhaba ${p.name}, ${week_start} haftası vardiya programın yayınlandı. OptiShift paneline giriş yaparak saatlerini kontrol edebilirsin.`);
        }
        if (p.email) {
          await sendEmail(p.email, "Yeni Vardiya Programı Yayınlandı", `Merhaba ${p.name},\n\n${week_start} haftası için vardiya programın sisteme yüklendi.\nOptiShift üzerinden programını görüntüleyebilirsin.`);
        }
        await sendPushToPersonnel(p.id, auth.org_id, {
          title: "Vardiya Programın Yayınlandı 📅",
          body: `${week_start} haftası programın hazır. Kontrol et!`,
          url: "/portal/calendar",
        });
        sentCount++;
      }
    }

    // ── Adalet puanı güncelleme ──────────────────────────────────────────────
    // CLAUDE.md: prev_score = eski * 0.2 + bu_hafta_engine_puanı * 0.8
    // OR-Tools puanları varsa (base_points tabanlı): engine_total - prev_score = weekly_pts
    // Yoksa (manuel vardiya): calcShiftPoints ile saat bazlı tahmin et
    //
    // Aynı hafta ikinci kez yayınlanırsa puanlar TEKRAR işlenmez — yoksa her
    // "yayınla" tıklaması ağırlıklı ortalamayı yeniden uygulayıp puanları kaydırır.
    const alreadyScored = db.prepare(
      `SELECT 1 FROM score_history WHERE location_id = ? AND week_start = ? LIMIT 1`
    ).get(location_id, week_start);

    // Tercih edilmeyen gün telafi çarpanı (locations.rules)
    let prefNotMult = 1.5;
    try {
      const locRules = db.prepare(`SELECT rules FROM locations WHERE id = ?`).get(location_id) as any;
      const parsed = JSON.parse(locRules?.rules || "{}");
      if (typeof parsed.preferred_not_multiplier === "number") prefNotMult = parsed.preferred_not_multiplier;
    } catch { /* varsayılan 1.5 */ }

    for (const p of alreadyScored ? [] : (personnel as any[])) {
      const oldScore = (p as any).prev_score ?? 0;
      let weekPoints: number;

      if (engineScores && typeof engineScores === "object" && engineScores[p.id] !== undefined) {
        // OR-Tools engine total = prev_score + weekly_engine_pts; extract weekly
        weekPoints = Math.max(0, engineScores[p.id] - oldScore);
      } else {
        // Fallback: saat × gün çarpanı hesabı (manuel vardiyalar için)
        const weekShifts = db.prepare(`
          SELECT day, start_time, end_time
          FROM shift_assignments
          WHERE personnel_id = ? AND week_start = ? AND location_id = ?
            AND start_time IS NOT NULL AND end_time IS NOT NULL
        `).all(p.id, week_start, location_id) as any[];

        if (weekShifts.length === 0) continue;
        // Sarı (tercih edilmeyen) günlerde çalışana telafi çarpanı uygula
        const availRow = db.prepare(
          `SELECT * FROM availability WHERE personnel_id = ? AND week_start = ?`
        ).get(p.id, week_start) as any;
        weekPoints = weekShifts.reduce((sum: number, s: any) => {
          let pts = calcShiftPoints(s.start_time, s.end_time, s.day);
          if (availRow?.[`day_${s.day}`] === "preferred_not") {
            pts = Math.round(pts * prefNotMult);
          }
          return sum + pts;
        }, 0);
      }

      const newScore = Math.round((oldScore * 0.2 + weekPoints * 0.8) * 100) / 100;
      db.prepare(`UPDATE personnel SET prev_score = ? WHERE id = ?`).run(newScore, p.id);

      // Haftalık skor anlık görüntüsü — score_history tablosuna kaydet
      // (yukarıdaki alreadyScored koruması sayesinde hafta başına bir kez yazılır)
      db.prepare(`
        INSERT INTO score_history (org_id, location_id, personnel_id, personnel_name, week_start, score, hero_count, no_show_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING
      `).run(
        auth.org_id,
        location_id,
        (p as any).id,
        (p as any).name,
        week_start,
        newScore,
        (p as any).hero_count ?? 0,
        (p as any).no_show_count ?? 0,
      );
    }

    db.close();
    return NextResponse.json({ success: true, message: `${sentCount} personele bildirim gönderildi.` });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
