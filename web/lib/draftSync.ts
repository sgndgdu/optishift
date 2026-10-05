/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolveShiftDef, type ShiftDef } from "@/lib/fairness";

export type DraftShiftRow = {
  personnel_id: string;
  day: number;
  shift_id?: string | null;
  start_time: string;
  end_time: string;
  pinned?: boolean;
  kind?: "regular" | "on_call";
  /** Çok departmanlı kişinin bu vardiyadaki departmanı */
  department_id?: string | null;
};

export async function loadLocDefs(db: any, locId: string): Promise<ShiftDef[]> {
  try {
    const row = await db.prepare("SELECT shift_definitions FROM locations WHERE id = ?").get(locId) as any;
    const defs = typeof row?.shift_definitions === "string" ? JSON.parse(row.shift_definitions) : row?.shift_definitions;
    return Array.isArray(defs) ? defs : [];
  } catch { return []; }
}

// Verilen shift_id geçerliyse korur; "custom"/boş ise saate göre çözer; çözemezse "custom".
export function finalizeShiftId(
  shiftId: string | null | undefined,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  defs: ShiftDef[],
): string {
  const resolved = resolveShiftDef(shiftId === "custom" ? null : shiftId, startTime, endTime, defs);
  if (resolved) return resolved.id;
  return shiftId && shiftId !== "custom" ? shiftId : "custom";
}

/**
 * Şubenin bir haftalık taslağını verilen satırlarla değiştirir (yayınlanmış satırlara dokunmaz).
 * TEK KAYNAK: Vardiya Planı otomatik kaydı (PATCH /api/shifts sync_draft_week) ve otomatik pilot.
 * Erişim kontrolü çağıranın işidir. Yazılan satır sayısını döner.
 */
export async function syncDraftWeek(
  db: any, location_id: string, week_start: string, shifts: DraftShiftRow[],
  /** Departman şefi: sadece bu kişilerin taslağı silinip yazılır, diğer departmanlara dokunulmaz. */
  onlyPersonnelIds?: string[] | null,
): Promise<number> {
  const locDefs = await loadLocDefs(db, location_id);
  const now = Math.floor(Date.now() / 1000);
  if (onlyPersonnelIds) {
    const allowed = new Set(onlyPersonnelIds);
    shifts = shifts.filter(x => allowed.has(String(x?.personnel_id)));
    if (onlyPersonnelIds.length) {
      await db.prepare(`
        DELETE FROM shift_assignments
        WHERE location_id = ? AND week_start = ? AND publication_status = 'draft'
          AND personnel_id IN (${onlyPersonnelIds.map(() => "?").join(",")})
      `).run(location_id, week_start, ...onlyPersonnelIds);
    }
  } else {
    await db.prepare(`
      DELETE FROM shift_assignments
      WHERE location_id = ? AND week_start = ? AND publication_status = 'draft'
    `).run(location_id, week_start);
  }
  // Yayınlanmış satırı olan (bu ya da başka şubede) kişi-gün-tür için taslak kopya yazılmaz.
  // Tek sorguda okunur (eskiden satır başına iki sorgu vardı, 30 satırlık hafta 10 sn sürüyordu).
  const pids = [...new Set(shifts.map((x: any) => x?.personnel_id).filter(Boolean))] as string[];
  const publishedRows = pids.length
    ? await db.prepare(`
        SELECT personnel_id, day, COALESCE(kind, 'regular') AS kind FROM shift_assignments
        WHERE week_start = ? AND publication_status = 'published'
          AND personnel_id IN (${pids.map(() => "?").join(",")})
      `).all(week_start, ...pids) as any[]
    : [];
  const taken = new Set(publishedRows.map(r => `${r.personnel_id}|${r.day}|${r.kind}`));
  const values: unknown[] = [];
  const tuples: string[] = [];
  for (const s of shifts as any[]) {
    if (!s?.personnel_id || s.day === undefined || !s.start_time || !s.end_time) continue;
    const kind = s.kind === "on_call" ? "on_call" : "regular";
    const key = `${s.personnel_id}|${s.day}|${kind}`;
    if (taken.has(key)) continue; // yayınlanmış satır var ya da bu istekte zaten yazıldı
    taken.add(key);
    tuples.push("(?, ?, ?, ?, ?, ?, ?, 'scheduled', 'draft', ?, ?, ?, ?)");
    values.push(s.personnel_id, location_id, week_start, s.day, finalizeShiftId(s.shift_id, s.start_time, s.end_time, locDefs),
      s.start_time, s.end_time, s.pinned === true, kind, typeof s.department_id === "string" && s.department_id ? s.department_id : null, now);
  }
  // Tek toplu INSERT: silme ile yeniden yazma arasındaki pencere kısalır (okuyan ekran yarım plan görmez)
  if (tuples.length) {
    await db.prepare(`
      INSERT INTO shift_assignments (personnel_id, location_id, week_start, day, shift_id, start_time, end_time, status, publication_status, pinned, kind, department_id, created_at)
      VALUES ${tuples.join(", ")}
    `).run(...values);
  }
  return tuples.length;
}
