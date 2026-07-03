/**
 * Adalet skoru — sunucu tarafı TEK YAZAR modülü.
 *
 * `personnel.prev_score` türetilmiş bir önbellektir: score_history (haftalık yük)
 * + score_adjustments (vardiya dışı puan olayları) üzerinden her an deterministik
 * olarak yeniden hesaplanır. Bu modül dışında hiçbir kod prev_score yazamaz.
 *
 * Tüm sorgular Drizzle iledir — getDB() raw-SQL katmanının production'da sessiz
 * hata sabıkası var (bkz. CLAUDE.md 2026-07-03).
 */
import { db } from "@/lib/db";
import {
  locations,
  personnel,
  shiftAssignments,
  openShifts,
  availability,
  scoreHistory,
  scoreAdjustments,
} from "@/lib/db/schema";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import {
  calcWeeklyBurden,
  calcCumulativeRolling,
  calcFairnessZ,
  type ShiftDef,
  type Rules,
  type AssignmentInput,
  type AvailabilityInput,
  type BurdenBreakdown,
} from "@/lib/fairness";

function parseJSON<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw !== "string") return raw as T;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/** Availability hücresi düz string ("preferred_not") veya JSON ({"status":...}) olabilir — normalize et. */
function normalizeAvailCell(v: unknown): string {
  if (typeof v !== "string") return "available";
  if (v.startsWith("{")) {
    try { return (JSON.parse(v) as { status?: string }).status ?? "available"; } catch { return "available"; }
  }
  return v;
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** week_start'tan `windowWeeks` hafta geriye giden ISO Pazartesi tarihi. */
function windowStart(weekStart: string, windowWeeks: number): string {
  return addDays(weekStart, -7 * (windowWeeks - 1));
}

// ─── Adjustments ──────────────────────────────────────────────────────────────

/** Pencere içindeki adjustment toplamları: { personnel_id → { week_start → Σ points } } */
export async function getAdjustmentsByWeek(
  locationId: string,
  fromWeek: string,
  toWeek: string,
): Promise<Record<string, Record<string, number>>> {
  const rows = await db
    .select({
      personnel_id: scoreAdjustments.personnel_id,
      week_start: scoreAdjustments.week_start,
      points: scoreAdjustments.points,
    })
    .from(scoreAdjustments)
    .where(and(
      eq(scoreAdjustments.location_id, locationId),
      gte(scoreAdjustments.week_start, fromWeek),
      lte(scoreAdjustments.week_start, toWeek),
    ));

  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    (out[r.personnel_id] ??= {})[r.week_start] =
      ((out[r.personnel_id][r.week_start] ?? 0) + r.points);
  }
  return out;
}

// ─── Kümülatif recompute ──────────────────────────────────────────────────────

/**
 * Lokasyondaki tüm aktif personelin kümülatif skorunu ve z-skorunu, score_history
 * + score_adjustments üzerinden yeniden hesaplar ve personnel önbelleğine yazar.
 * `asOfWeek`: pencerenin en yeni haftası (genelde bu hafta veya yayınlanan hafta).
 */
export async function recomputeLocationFairness(
  orgId: string,
  locationId: string,
  asOfWeek: string,
): Promise<Record<string, { cumulative: number; z: number }>> {
  const loc = await db
    .select({ rules: locations.rules })
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.org_id, orgId)));
  const rules = parseJSON<Rules>(loc[0]?.rules, {});
  const decay = rules.fairness_decay_factor ?? 0.85;
  const windowWeeks = rules.fairness_window_weeks ?? 8;
  const fromWeek = windowStart(asOfWeek, windowWeeks);

  // Lokasyona atanmış aktif personel (assigned_location_ids JSON array'i primary'yi de içerir)
  const people = await db
    .select({ id: personnel.id, assigned: personnel.assigned_location_ids, primary: personnel.primary_location_id })
    .from(personnel)
    .where(and(eq(personnel.org_id, orgId), eq(personnel.status, "active")));
  const locPeople = people.filter(p =>
    p.primary === locationId || parseJSON<string[]>(p.assigned, []).includes(locationId)
  );
  if (locPeople.length === 0) return {};
  const pids = locPeople.map(p => p.id);

  const histRows = await db
    .select({
      personnel_id: scoreHistory.personnel_id,
      week_start: scoreHistory.week_start,
      burden_score: scoreHistory.burden_score,
    })
    .from(scoreHistory)
    .where(and(
      eq(scoreHistory.location_id, locationId),
      inArray(scoreHistory.personnel_id, pids),
      gte(scoreHistory.week_start, fromWeek),
      lte(scoreHistory.week_start, asOfWeek),
    ))
    .orderBy(scoreHistory.week_start);

  const adjByPid = await getAdjustmentsByWeek(locationId, fromWeek, asOfWeek);

  const histByPid: Record<string, { week_start: string; burden_score: number }[]> = {};
  for (const h of histRows) {
    (histByPid[h.personnel_id] ??= []).push({
      week_start: h.week_start,
      burden_score: h.burden_score ?? 0,
    });
  }

  const cumulativeByPid: Record<string, number> = {};
  for (const pid of pids) {
    const hist = histByPid[pid] ?? [];
    // asOfWeek'e ait satır "bu hafta"dır (i=0); geri kalanı tarihsel pencere
    const current = hist.find(h => h.week_start === asOfWeek);
    const past = hist.filter(h => h.week_start !== asOfWeek);
    cumulativeByPid[pid] = calcCumulativeRolling(
      past,
      current?.burden_score ?? 0,
      decay,
      windowWeeks,
      adjByPid[pid],
      asOfWeek,
    );
  }

  const zScores = calcFairnessZ(cumulativeByPid);

  const result: Record<string, { cumulative: number; z: number }> = {};
  for (const pid of pids) {
    const cumulative = cumulativeByPid[pid] ?? 0;
    const z = zScores[pid] ?? 0;
    result[pid] = { cumulative, z };
    await db
      .update(personnel)
      .set({ prev_score: cumulative, fairness_z_score: z })
      .where(eq(personnel.id, pid));
  }
  return result;
}

// ─── Haftalık rescore ─────────────────────────────────────────────────────────

/**
 * Bir haftanın yük puanlarını mevcut atamalardan deterministik olarak yeniden
 * hesaplar: score_history satırlarını DELETE+INSERT eder (re-publish idempotent),
 * ardından lokasyon kümülatiflerini tazeler. Kahraman (open_shifts claim) ve
 * kabul edilmiş zorunlu atama çarpanları burada uygulanır.
 */
export async function rescoreWeek(
  orgId: string,
  locationId: string,
  weekStart: string,
): Promise<void> {
  const loc = await db
    .select({ shift_definitions: locations.shift_definitions, rules: locations.rules })
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.org_id, orgId)));
  if (!loc[0]) return;
  const shiftDefs = parseJSON<ShiftDef[]>(loc[0].shift_definitions, []);
  const rules = parseJSON<Rules>(loc[0].rules, {});

  const { assignments, availRows } = await loadWeekInputs(locationId, weekStart);
  const breakdowns = calcWeeklyBurden(assignments, shiftDefs, availRows, rules);

  // Personel adları + sayaçları (score_history snapshot kolonları için)
  const pids = breakdowns.map(b => b.personnel_id);
  const pRows = pids.length
    ? await db
        .select({ id: personnel.id, name: personnel.name, hero_count: personnel.hero_count, no_show_count: personnel.no_show_count })
        .from(personnel)
        .where(inArray(personnel.id, pids))
    : [];
  const pById = Object.fromEntries(pRows.map(p => [p.id, p]));

  // Deterministik replace: bu haftanın satırlarını sil, taze yaz (D5)
  await db
    .delete(scoreHistory)
    .where(and(eq(scoreHistory.location_id, locationId), eq(scoreHistory.week_start, weekStart)));

  for (const bd of breakdowns) {
    await db.insert(scoreHistory).values({
      org_id: orgId,
      location_id: locationId,
      personnel_id: bd.personnel_id,
      personnel_name: pById[bd.personnel_id]?.name ?? bd.personnel_id,
      week_start: weekStart,
      score: bd.burden_score, // eski alan — geriye dönük uyumluluk
      total_hours: bd.total_hours,
      raw_score: bd.raw_score,
      burden_score: bd.burden_score,
      weekend_shifts: bd.weekend_shifts,
      night_shifts: bd.night_shifts,
      pref_not_shifts: bd.pref_not_shifts,
      clopening_count: bd.clopening_count,
      cumulative_burden: 0, // aşağıdaki recompute günceller (aşağıya bkz.)
      fairness_z_score: 0,
      hero_count: pById[bd.personnel_id]?.hero_count ?? 0,
      no_show_count: pById[bd.personnel_id]?.no_show_count ?? 0,
    });
  }

  // Kümülatifleri tazele ve bu haftanın satırlarına snapshot'la
  const recomputed = await recomputeLocationFairness(orgId, locationId, weekStart);
  for (const bd of breakdowns) {
    const r = recomputed[bd.personnel_id];
    if (!r) continue;
    await db
      .update(scoreHistory)
      .set({ cumulative_burden: r.cumulative, fairness_z_score: r.z })
      .where(and(
        eq(scoreHistory.location_id, locationId),
        eq(scoreHistory.week_start, weekStart),
        eq(scoreHistory.personnel_id, bd.personnel_id),
      ));
  }
}

/**
 * Haftanın atama + müsaitlik girdilerini canonical formata yükler.
 * Excel export gibi read-only tüketiciler için de kullanılır.
 */
export async function loadWeekInputs(
  locationId: string,
  weekStart: string,
): Promise<{ assignments: AssignmentInput[]; availRows: AvailabilityInput[] }> {
  const weekEnd = addDays(weekStart, 6);

  const saRows = await db
    .select({
      id: shiftAssignments.id,
      personnel_id: shiftAssignments.personnel_id,
      day: shiftAssignments.day,
      shift_id: shiftAssignments.shift_id,
      start_time: shiftAssignments.start_time,
      end_time: shiftAssignments.end_time,
      force_assigned: shiftAssignments.force_assigned,
      force_acceptance_status: shiftAssignments.force_acceptance_status,
      force_bonus_multiplier: shiftAssignments.force_bonus_multiplier,
    })
    .from(shiftAssignments)
    .where(and(eq(shiftAssignments.location_id, locationId), eq(shiftAssignments.week_start, weekStart)));

  // Kahraman eşlemesi: claim edilmiş open_shifts, tarihi haftanın içinde olanlar.
  // Anahtar: personel|gün|başlangıç — publish'teki eski (kırık) sa.id eşlemesinin yerine.
  const osRows = await db
    .select({
      date: openShifts.date,
      start_time: openShifts.start_time,
      claimed_by: openShifts.claimed_by,
      hero_bonus_multiplier: openShifts.hero_bonus_multiplier,
    })
    .from(openShifts)
    .where(and(
      eq(openShifts.location_id, locationId),
      eq(openShifts.status, "claimed"),
      gte(openShifts.date, weekStart),
      lte(openShifts.date, weekEnd),
    ));
  const heroByKey: Record<string, number> = {};
  for (const os of osRows) {
    if (!os.claimed_by) continue;
    const dayIdx = Math.round((Date.parse(os.date) - Date.parse(weekStart)) / 86400000);
    heroByKey[`${os.claimed_by}|${dayIdx}|${os.start_time}`] = os.hero_bonus_multiplier ?? 1.5;
  }

  const assignments: AssignmentInput[] = saRows
    .filter(r => r.start_time && r.end_time)
    .map(r => {
      const heroMult = heroByKey[`${r.personnel_id}|${r.day}|${r.start_time}`];
      const forceMult =
        r.force_assigned && r.force_acceptance_status === "accepted" && r.force_bonus_multiplier
          ? r.force_bonus_multiplier
          : undefined;
      return {
        personnel_id: r.personnel_id,
        day: r.day,
        shift_id: r.shift_id,
        start_time: r.start_time!,
        end_time: r.end_time!,
        is_hero: heroMult !== undefined,
        hero_multiplier: heroMult,
        force_multiplier: forceMult,
      };
    });

  const pids = [...new Set(assignments.map(a => a.personnel_id))];
  const avRows = pids.length
    ? await db
        .select()
        .from(availability)
        .where(and(inArray(availability.personnel_id, pids), eq(availability.week_start, weekStart)))
    : [];
  const availRows: AvailabilityInput[] = avRows.map(a => ({
    personnel_id: a.personnel_id,
    day_0: normalizeAvailCell(a.day_0),
    day_1: normalizeAvailCell(a.day_1),
    day_2: normalizeAvailCell(a.day_2),
    day_3: normalizeAvailCell(a.day_3),
    day_4: normalizeAvailCell(a.day_4),
    day_5: normalizeAvailCell(a.day_5),
    day_6: normalizeAvailCell(a.day_6),
  }));

  return { assignments, availRows };
}

/** Read-only: bir haftanın kişi bazlı yük dökümü (Excel export vb. için). */
export async function computeWeekBreakdowns(
  orgId: string,
  locationId: string,
  weekStart: string,
): Promise<BurdenBreakdown[]> {
  const loc = await db
    .select({ shift_definitions: locations.shift_definitions, rules: locations.rules })
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.org_id, orgId)));
  if (!loc[0]) return [];
  const shiftDefs = parseJSON<ShiftDef[]>(loc[0].shift_definitions, []);
  const rules = parseJSON<Rules>(loc[0].rules, {});
  const { assignments, availRows } = await loadWeekInputs(locationId, weekStart);
  return calcWeeklyBurden(assignments, shiftDefs, availRows, rules);
}
