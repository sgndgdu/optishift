/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Vardiya giriş/çıkışı kaldırıldı (kullanıcı kararı 2026-10-10). Burada kalan: puantaj kilidi ve devir notu.
 */

function assignmentMonth(weekStart: string, day: number): string {
  const dt = new Date(weekStart + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + Number(day ?? 0));
  return dt.toISOString().slice(0, 7);
}

// Bu vardiyanın ayı, şubede kilitli bir puantaj dönemine düşüyor mu?
export async function isPeriodLocked(db: any, orgId: string, locationId: string, weekStart: string, day: number): Promise<boolean> {
  const month = assignmentMonth(weekStart, day);
  const row = await db.prepare(
    `SELECT id FROM payroll_periods WHERE org_id = ? AND location_id = ? AND month = ?`
  ).get(orgId, locationId, month);
  return !!row;
}

export type HandoverOutcome = { ok: true } | { ok: false; status: number; error: string };

/**
 * Devir notu: ekip üyesi kendi vardiyasına sonraki vardiya için not bırakır (shift_assignments.handover_note).
 * Okuyan: GET /api/shifts/handover. Boş not, notu siler.
 */
export async function saveHandoverNote(
  db: any,
  orgId: string,
  params: { shiftId: number; note?: string; restrictPersonnelId?: string },
): Promise<HandoverOutcome> {
  const existing = await db.prepare(
    "SELECT sa.* FROM shift_assignments sa JOIN locations l ON l.id = sa.location_id WHERE sa.id = ? AND l.org_id = ?",
  ).get(params.shiftId, orgId) as any;
  if (!existing) return { ok: false, status: 404, error: "Vardiya bulunamadı" };
  if (params.restrictPersonnelId && existing.personnel_id !== params.restrictPersonnelId) {
    return { ok: false, status: 403, error: "Erişim reddedildi" };
  }
  const note = typeof params.note === "string" && params.note.trim() ? params.note.trim().slice(0, 500) : null;
  await db.prepare("UPDATE shift_assignments SET handover_note = ? WHERE id = ?").run(note, params.shiftId);
  return { ok: true };
}
