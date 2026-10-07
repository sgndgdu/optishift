/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Kendiliğinden yedek: TEK KAYNAK. Biri vardiyasına gelemeyince (ekip üyesinin "Gelemeyeceğim" ilanı ya da
 * sorumlunun "Gelemiyor" işareti, ikisinde de open_shifts.released_by dolu) ve vardiya 24 saat içinde başlıyorsa,
 * kurala uyan en uygun kişi vardiyaya kendiliğinden yazılır; sorumluya sadece sonuç bildirimi gider.
 * Daha uzaktaki vardiyalar önce ekibe duyurulur, günlük görev (cron/autopilot, 08:00) ertesi güne kadar
 * olanları tekrar dener.
 *
 * Kimse rızası olmadan yazılmaz: sadece o gün için uygunluk girip "uygunum" demiş, uyarısı olmayan, aynı şubeden
 * ve aynı departmandan kişi seçilir. Şube ayarı `rules.auto_cover_enabled` (varsayılan açık) ile kapatılır.
 */
import { addDays, businessToday, businessWallTime, formatDateTR } from "@/lib/date";
import { rankCandidates } from "@/lib/openShiftCandidates";
import { claimOpenShift } from "@/lib/openShifts";
import { notifyBranchManagers } from "@/lib/managerNotifications";

export const AUTO_COVER_HOURS = 24;

const parseRules = (r: any) => { try { return typeof r === "string" ? JSON.parse(r) : (r ?? {}); } catch { return {}; } };

export async function autoCoverEnabled(db: any, locationId: string): Promise<boolean> {
  const loc = await db.prepare(`SELECT rules FROM locations WHERE id = ?`).get(locationId) as any;
  return parseRules(loc?.rules).auto_cover_enabled !== false;
}

export type AutoCoverResult = { assigned: true; name: string } | { assigned: false; reason: string };

/** Tek bir ilanı dener. Uygunsa atar ve sorumlulara sonucu bildirir. */
export async function tryAutoCover(db: any, osId: number, now: Date = new Date(), maxHours = AUTO_COVER_HOURS): Promise<AutoCoverResult> {
  const os = await db.prepare(`SELECT * FROM open_shifts WHERE id = ?`).get(osId) as any;
  if (!os || os.status !== "open" || os.claimed_by) return { assigned: false, reason: "ilan açık değil" };
  if (!os.released_by) return { assigned: false, reason: "gelemeyen biri yok" };
  const start = businessWallTime(os.date, os.start_time).getTime();
  if (start <= now.getTime()) return { assigned: false, reason: "vardiya başladı" };
  if (start - now.getTime() > maxHours * 3600_000) return { assigned: false, reason: "vardiya henüz uzak" };
  if (!(await autoCoverEnabled(db, os.location_id))) return { assigned: false, reason: "şubede kapalı" };

  let departmentId: string | null = null;
  const absent = await db.prepare(`SELECT name, department_id FROM personnel WHERE id = ?`).get(os.released_by) as any;
  departmentId = absent?.department_id ?? null;
  if (os.source_assignment_id) {
    const sa = await db.prepare(`SELECT department_id FROM shift_assignments WHERE id = ?`).get(os.source_assignment_id) as any;
    departmentId = sa?.department_id ?? departmentId;
  }
  const { candidates } = await rankCandidates(db, {
    location_id: os.location_id, date: os.date, start_time: os.start_time, end_time: os.end_time,
    excludePersonnelId: os.released_by, departmentId,
  });
  const picks = candidates.filter(c => !c.other_branch && !c.blocking && c.warnings.length === 0 && c.said_available);
  for (const pick of picks.slice(0, 3)) {
    const out = await claimOpenShift(db, os.org_id, os.id, pick.personnel_id, pick.name, { assignedByManager: true, autoCover: true });
    if (!out.ok) {
      if (out.status === 409 && /başkası|açık değil|geçti/.test(out.error)) return { assigned: false, reason: out.error };
      continue;
    }
    await db.prepare(`UPDATE open_shifts SET note = ? WHERE id = ?`)
      .run(`${os.note ? os.note + " · " : ""}Kendiliğinden yedek: ${pick.name}`.slice(0, 500), os.id).catch(() => {});
    const why = pick.reasons.find(r => !r.startsWith("Gerekli görev")) ?? "";
    await notifyBranchManagers(db, os.org_id, os.location_id, "plan_settings", {
      type: "open_shift",
      title: "Yedek kendiliğinden bulundu",
      message: `${absent?.name ?? "Bir ekip üyesi"}, ${formatDateTR(os.date)} ${os.start_time}-${os.end_time} vardiyasına gelemiyor. ` +
        `Vardiya ${pick.name} adına yazıldı (o gün için uygun olduğunu girmişti${why ? `; ${why.charAt(0).toLocaleLowerCase("tr-TR")}${why.slice(1).replace(/\.$/, "")}` : ""}). ` +
        `Sizin bir şey yapmanız gerekmiyor. İsterseniz Vardiya Planı'ndan değiştirebilirsiniz.`,
      link: "/schedule",
    }).catch(() => 0);
    return { assigned: true, name: pick.name };
  }
  return { assigned: false, reason: "uygun kimse yok" };
}

/**
 * Günlük görev (08:00): bugün ve yarınki, kimsenin almadığı "gelemiyor" ilanlarını dener. Görev günde bir kez
 * çalıştığı için yarının bütün vardiyaları dahil edilir (en fazla ~40 saat sonrası); ertesi sabah geç kalınırdı.
 */
export async function runAutoCover(db: any): Promise<{ checked: number; assigned: number }> {
  const today = businessToday();
  const rows = await db.prepare(`
    SELECT id FROM open_shifts WHERE status = 'open' AND claimed_by IS NULL AND released_by IS NOT NULL
      AND date >= ? AND date <= ? ORDER BY date, start_time LIMIT 200
  `).all(today, addDays(today, 1)) as { id: number }[];
  let assigned = 0;
  for (const r of rows) {
    const res = await tryAutoCover(db, r.id, new Date(), 48).catch(() => ({ assigned: false as const, reason: "hata" }));
    if (res.assigned) assigned++;
  }
  return { checked: rows.length, assigned };
}
