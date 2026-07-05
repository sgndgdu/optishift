/**
 * Fazla mesai — sunucu tarafı TEK YAZAR modülü.
 *
 * `personnel.ytd_overtime_hours` türetilmiş bir önbellektir: o yılın approved
 * overtime_records toplamından her an deterministik olarak yeniden hesaplanır.
 * Bu modül dışında hiçbir kod ytd_overtime_hours yazamaz (prev_score kuralının
 * mesai karşılığı — bkz. CLAUDE.md §3.H tek yazar kuralı).
 *
 * Yıl ataması week_start'ın yılına göredir: 29 Aralık'ta başlayan hafta eski
 * yıla sayılır. Yıl devrildiğinde recompute otomatik olarak sıfırdan başlar.
 *
 * Tüm sorgular Drizzle iledir — getDB() raw-SQL katmanının production'da sessiz
 * hata sabıkası var (bkz. CLAUDE.md 2026-07-03).
 */
import { db } from "@/lib/db";
import {
  locations,
  personnel,
  shiftAssignments,
  overtimeRecords,
} from "@/lib/db/schema";
import { and, eq, gte, lte, inArray } from "drizzle-orm";

function parseJSON<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw !== "string") return raw as T;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const nowSec = () => Math.floor(Date.now() / 1000);

/** "HH:MM"–"HH:MM" arası dakika; gece geçişinde +1440. */
function shiftMinutes(start: string, end: string): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  let e = toMin(end);
  const s = toMin(start);
  if (e <= s) e += 1440; // gece geçişi
  return e - s;
}

// ─── YTD recompute ────────────────────────────────────────────────────────────

/**
 * Verilen personelin yıl-içi onaylı mesai toplamını approved overtime_records
 * kayıtlarından deterministik hesaplar ve personnel önbelleğine yazar.
 * Dönüş: { personnel_id → ytd saat } — çağıran taze değeri doğrudan kullanabilir.
 */
export async function recomputeYtdOvertime(
  orgId: string,
  personnelIds: string[],
  year = new Date().getFullYear(),
): Promise<Record<string, number>> {
  if (personnelIds.length === 0) return {};

  const rows = await db
    .select({
      personnel_id: overtimeRecords.personnel_id,
      overtime_hours: overtimeRecords.overtime_hours,
    })
    .from(overtimeRecords)
    .where(and(
      eq(overtimeRecords.org_id, orgId),
      inArray(overtimeRecords.personnel_id, personnelIds),
      eq(overtimeRecords.status, "approved"),
      gte(overtimeRecords.week_start, `${year}-01-01`),
      lte(overtimeRecords.week_start, `${year}-12-31`),
    ));

  const totals: Record<string, number> = {};
  for (const pid of personnelIds) totals[pid] = 0;
  for (const r of rows) totals[r.personnel_id] += r.overtime_hours ?? 0;

  for (const pid of personnelIds) {
    totals[pid] = round1(totals[pid]);
    await db
      .update(personnel)
      .set({ ytd_overtime_hours: totals[pid] })
      .where(and(eq(personnel.id, pid), eq(personnel.org_id, orgId)));
  }
  return totals;
}

// ─── Serbest zaman bakiyesi ───────────────────────────────────────────────────

/** İş K. m.41: 1 saat fazla mesai = 1,5 saat serbest zaman. */
export const COMP_TIME_MULTIPLIER = 1.5;

/**
 * Kullanılmamış serbest zaman bakiyesi (saat): onaylı + telafi türü serbest zaman
 * + henüz kullandırılmamış kayıtların toplamı × 1,5. Türetilmiş değerdir — hiçbir
 * yerde sayaç olarak saklanmaz.
 */
export async function getCompTimeBalanceHours(
  orgId: string,
  personnelId: string,
): Promise<number> {
  const rows = await db
    .select({ overtime_hours: overtimeRecords.overtime_hours, comp_time_used_at: overtimeRecords.comp_time_used_at })
    .from(overtimeRecords)
    .where(and(
      eq(overtimeRecords.org_id, orgId),
      eq(overtimeRecords.personnel_id, personnelId),
      eq(overtimeRecords.status, "approved"),
      eq(overtimeRecords.compensation_type, "time_off"),
    ));
  const total = rows
    .filter(r => !r.comp_time_used_at)
    .reduce((s, r) => s + (r.overtime_hours ?? 0) * COMP_TIME_MULTIPLIER, 0);
  return round1(total);
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

export type OvertimeUpsertResult = "inserted" | "updated" | "deleted" | "skipped_decided" | "skipped_zero";

/**
 * (lokasyon, personel, hafta) başına EN FAZLA BİR kayıt kuralını uygular.
 * - Karara bağlanmış (approved/rejected) kayıt varsa dokunmaz — müdür kararı korunur.
 * - Pending kayıt varsa saatleri günceller (fazladan pending kopyaları temizler).
 * - overtimeHours ≤ 0 ise pending kaydı siler / hiç açmaz.
 */
export async function upsertPendingOvertime(args: {
  orgId: string;
  locationId: string;
  personnelId: string;
  personnelName?: string | null;
  weekStart: string;
  scheduledHours: number;
  overtimeHours: number;
  note?: string | null;
}): Promise<OvertimeUpsertResult> {
  const existing = await db
    .select({ id: overtimeRecords.id, status: overtimeRecords.status, overtime_hours: overtimeRecords.overtime_hours })
    .from(overtimeRecords)
    .where(and(
      eq(overtimeRecords.org_id, args.orgId),
      eq(overtimeRecords.location_id, args.locationId),
      eq(overtimeRecords.personnel_id, args.personnelId),
      eq(overtimeRecords.week_start, args.weekStart),
    ));

  const decided = existing.find(r => r.status !== "pending");
  const pendings = existing.filter(r => r.status === "pending");

  if (decided) {
    // Müdür karar vermiş — otomatik türetme onu ezmez; artık pending kopyaları temizle.
    if (pendings.length > 0) {
      await db.delete(overtimeRecords).where(inArray(overtimeRecords.id, pendings.map(p => p.id)));
    }
    return "skipped_decided";
  }

  if (args.overtimeHours <= 0) {
    if (pendings.length > 0) {
      await db.delete(overtimeRecords).where(inArray(overtimeRecords.id, pendings.map(p => p.id)));
      return "deleted";
    }
    return "skipped_zero";
  }

  if (pendings.length > 0) {
    const [keep, ...extras] = pendings;
    if (extras.length > 0) {
      await db.delete(overtimeRecords).where(inArray(overtimeRecords.id, extras.map(p => p.id)));
    }
    const newHours = round1(args.overtimeHours);
    const hoursChanged = round1(keep.overtime_hours ?? 0) !== newHours;
    await db
      .update(overtimeRecords)
      .set({
        scheduled_hours: round1(args.scheduledHours),
        overtime_hours: newHours,
        note: args.note ?? null,
        // Saat değiştiyse eski personel onayı yeni saate uygulanamaz — sıfırla
        ...(hoursChanged ? { employee_status: "pending", employee_responded_at: null } : {}),
      })
      .where(eq(overtimeRecords.id, keep.id));
    return "updated";
  }

  await db.insert(overtimeRecords).values({
    org_id: args.orgId,
    location_id: args.locationId,
    personnel_id: args.personnelId,
    personnel_name: args.personnelName ?? null,
    week_start: args.weekStart,
    scheduled_hours: round1(args.scheduledHours),
    overtime_hours: round1(args.overtimeHours),
    status: "pending",
    note: args.note ?? null,
    created_at: nowSec(),
  });
  return "inserted";
}

// ─── Yayın anında derive ──────────────────────────────────────────────────────

/**
 * Yayınlanan haftanın GERÇEK saatlerinden mesaiyi türetir: kişi başı yayınlanmış
 * atama dakikaları toplanır, rules.overtime_threshold_hours (varsayılan 45) üstü
 * pending overtime_records olarak upsert edilir. Motor çıktısı değil, yayınlanan
 * plan otoritedir (rescoreWeek felsefesi — re-publish idempotent).
 *
 * Yayında artık mesaisi kalmayan kişilerin pending kayıtları silinir;
 * karara bağlanmış kayıtlara dokunulmaz.
 *
 * Dönüş: bu yayında mesaisi doğan/güncellenen kişiler — çağıran (publish route)
 * personele onay bildirimi göndermek için kullanır.
 */
export interface DerivedOvertime {
  personnelId: string;
  overtimeHours: number;
  result: OvertimeUpsertResult;
}

export async function deriveOvertimeForWeek(
  orgId: string,
  locationId: string,
  weekStart: string,
): Promise<DerivedOvertime[]> {
  const loc = await db
    .select({ rules: locations.rules })
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.org_id, orgId)));
  if (!loc[0]) return [];
  const rules = parseJSON<Record<string, unknown>>(loc[0].rules, {});
  const threshold = typeof rules.overtime_threshold_hours === "number"
    ? rules.overtime_threshold_hours
    : 45;

  const saRows = await db
    .select({
      personnel_id: shiftAssignments.personnel_id,
      start_time: shiftAssignments.start_time,
      end_time: shiftAssignments.end_time,
    })
    .from(shiftAssignments)
    .where(and(
      eq(shiftAssignments.location_id, locationId),
      eq(shiftAssignments.week_start, weekStart),
      eq(shiftAssignments.publication_status, "published"),
    ));

  const minutesByPid: Record<string, number> = {};
  for (const r of saRows) {
    if (!r.start_time || !r.end_time) continue;
    minutesByPid[r.personnel_id] = (minutesByPid[r.personnel_id] ?? 0) + shiftMinutes(r.start_time, r.end_time);
  }

  const pids = Object.keys(minutesByPid);
  const pRows = pids.length
    ? await db
        .select({ id: personnel.id, name: personnel.name })
        .from(personnel)
        .where(inArray(personnel.id, pids))
    : [];
  const nameById = Object.fromEntries(pRows.map(p => [p.id, p.name]));

  const derived: DerivedOvertime[] = [];
  for (const pid of pids) {
    const scheduled = minutesByPid[pid] / 60;
    const overtimeHours = round1(Math.max(0, scheduled - threshold));
    const result = await upsertPendingOvertime({
      orgId,
      locationId,
      personnelId: pid,
      personnelName: nameById[pid],
      weekStart,
      scheduledHours: scheduled,
      overtimeHours,
      note: "Yayınlanan plandan otomatik hesaplandı",
    });
    if (overtimeHours > 0 && (result === "inserted" || result === "updated")) {
      derived.push({ personnelId: pid, overtimeHours, result });
    }
  }

  // Bu hafta yayında hiç atanmamış kişilerin bayat pending kayıtlarını temizle
  const stale = await db
    .select({ id: overtimeRecords.id, personnel_id: overtimeRecords.personnel_id })
    .from(overtimeRecords)
    .where(and(
      eq(overtimeRecords.org_id, orgId),
      eq(overtimeRecords.location_id, locationId),
      eq(overtimeRecords.week_start, weekStart),
      eq(overtimeRecords.status, "pending"),
    ));
  const staleIds = stale.filter(r => !minutesByPid[r.personnel_id]).map(r => r.id);
  if (staleIds.length > 0) {
    await db.delete(overtimeRecords).where(inArray(overtimeRecords.id, staleIds));
  }

  return derived;
}
