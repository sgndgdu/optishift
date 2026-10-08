/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * İzin günlerine düşen vardiyalar ve her biri için yedek adaylar: TEK KAYNAK.
 * Onaylar'daki izin kartı (/api/leave-requests/review) ve Ana Sayfa hazır çözümleri (lib/suggestions) kullanır.
 */
import { addDays, weekStartOf } from "@/lib/date";
import { resolveShiftDef } from "@/lib/fairness";
import { rankCandidates } from "@/lib/openShiftCandidates";

export type Conflict = {
  id: number; date: string; week_start: string; day: number; location_id: string;
  start_time: string; end_time: string; shift_name: string | null; published: boolean;
  department_id: string | null; shift_id: string | null;
};

/** Onay kartında her vardiya için: o vardiyada kalan kişi sayısı ve yerine konabilecek uygun herkes (kural bozanlar sonda) */
export type Cover = { others: number; candidates: { personnel_id: string; name: string; note: string; ok: boolean }[] };

/** İzin tarihleri arasındaki günler (YYYY-MM-DD), saat diliminden bağımsız */
export function datesBetween(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  for (let d = startDate; d <= endDate && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** İzin günlerine düşen normal vardiyalar (taslak ve yayınlanmış) */
export async function findConflicts(db: any, request: any): Promise<Conflict[]> {
  const dates = datesBetween(request.start_date, request.end_date);
  if (dates.length === 0) return [];
  const weeks = [...new Set(dates.map(weekStartOf))];
  const rows = await db.prepare(`
    SELECT sa.id, sa.week_start, sa.day, sa.location_id, sa.shift_id, sa.start_time, sa.end_time, sa.publication_status,
           COALESCE(sa.department_id, p.department_id) AS department_id, l.shift_definitions
    FROM shift_assignments sa JOIN locations l ON l.id = sa.location_id JOIN personnel p ON p.id = sa.personnel_id
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
        department_id: r.department_id ?? null, shift_id: r.shift_id ?? null,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Sorumlu izni onaylamadan önce görsün: o vardiyada başka kaç kişi kalıyor, yerine kim gelebilir.
 * Adaylar açık vardiya adaylarıyla aynı kuralla (lib/openShiftCandidates): o gün boş, izinli değil, aynı departmanda
 * çalışabilen; kural bozanlar (dinlenme, haftalık sınır) "ok: false" ile en sona.
 */
export async function coverFor(db: any, personnelId: string, c: Conflict): Promise<Cover> {
  const same = await db.prepare(`
    SELECT COUNT(*)::int AS n FROM shift_assignments sa JOIN personnel p ON p.id = sa.personnel_id
    WHERE sa.location_id = ? AND sa.week_start = ? AND sa.day = ? AND sa.personnel_id <> ?
      AND COALESCE(sa.kind, 'regular') = 'regular' AND sa.start_time = ? AND sa.end_time = ?
      AND (?::text IS NULL OR COALESCE(sa.department_id, p.department_id) = ?::text)
  `).get(c.location_id, c.week_start, c.day, personnelId, c.start_time, c.end_time, c.department_id, c.department_id) as any;
  const { candidates } = await rankCandidates(db, {
    location_id: c.location_id, date: c.date, start_time: c.start_time, end_time: c.end_time,
    excludePersonnelId: personnelId, departmentId: c.department_id,
  }).catch(() => ({ candidates: [] as any[] }));
  const local = candidates.filter((x: any) => !x.other_branch);
  // Uygun olan herkes (sayı sınırı yok); kural bozanlar en sonda
  const ordered = [...local.filter((x: any) => !x.blocking), ...local.filter((x: any) => x.blocking)];
  return {
    others: Number(same?.n ?? 0),
    candidates: ordered.map((x: any) => ({
      personnel_id: x.personnel_id, name: x.name, ok: !x.blocking,
      note: x.blocking ? x.warnings[0] ?? "" : x.warnings[0] ?? x.reasons.find((r: string) => r.startsWith("Bu hafta")) ?? "",
    })),
  };
}

