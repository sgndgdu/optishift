/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Check-in / check-out — TEK KAYNAK.
 *
 * app/api/shifts/route.ts PATCH (personel portalı, oturumlu) ve
 * app/api/kiosk/[locationId]/route.ts (ortak tablet, oturumsuz PIN girişi)
 * aynı mantığı çağırır — davranış iki yoldan da birebir aynıdır.
 */
import { distanceMeters } from "@/lib/geo";

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

export type CheckInOutcome =
  | { ok: true; check_in_distance_m: number | null; check_in_verified: boolean | null }
  | { ok: false; status: number; error: string };

export type CheckOutOutcome = { ok: true } | { ok: false; status: number; error: string };

/**
 * restrictPersonnelId verilirse, vardiya o personele ait değilse 403 döner
 * (personel portalında employee rolü ve kiosk her zaman bunu geçer; manager/admin PATCH'i geçmez).
 */
export async function performCheckIn(
  db: any,
  orgId: string,
  params: { shiftId: number; lat?: number; lon?: number; restrictPersonnelId?: string },
): Promise<CheckInOutcome> {
  const existing = await db.prepare("SELECT * FROM shift_assignments WHERE id = ?").get(params.shiftId) as any;
  if (!existing) return { ok: false, status: 404, error: "Vardiya bulunamadı" };
  if (params.restrictPersonnelId && existing.personnel_id !== params.restrictPersonnelId) {
    return { ok: false, status: 403, error: "Erişim reddedildi" };
  }
  if (await isPeriodLocked(db, orgId, existing.location_id, existing.week_start, existing.day)) {
    return { ok: false, status: 400, error: "Bu ayın puantaj dönemi kilitli, check-in yapılamaz" };
  }

  // GPS doğrulama: konum paylaşıldıysa ve şubenin koordinatları tanımlıysa mesafeyi hesapla.
  // rules.gps_checkin_required açıksa ve yarıçap dışındaysa check-in reddedilir; kapalıysa
  // sadece bilgi olarak kaydedilir (müdür panelinde görünür), check-in engellenmez.
  let checkInDistanceM: number | null = null;
  let checkInVerified: boolean | null = null;
  if (typeof params.lat === "number" && typeof params.lon === "number") {
    const loc = await db.prepare(
      `SELECT latitude, longitude, rules FROM locations WHERE id = ?`
    ).get(existing.location_id) as any;
    if (loc?.latitude != null && loc?.longitude != null) {
      checkInDistanceM = distanceMeters(params.lat, params.lon, loc.latitude, loc.longitude);
      let rules: any = {};
      try { rules = typeof loc.rules === "string" ? JSON.parse(loc.rules) : (loc.rules ?? {}); } catch { rules = {}; }
      const radius = typeof rules.checkin_radius_m === "number" ? rules.checkin_radius_m : 150;
      checkInVerified = checkInDistanceM <= radius;
      if (!checkInVerified && rules.gps_checkin_required === true) {
        return {
          ok: false, status: 400,
          error: `Şubeden çok uzaktasınız (${checkInDistanceM}m). Check-in için şubede olmanız gerekiyor.`,
        };
      }
    }
  }

  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    "UPDATE shift_assignments SET check_in_at = ?, status = 'active', check_in_distance_m = ?, check_in_verified = ? WHERE id = ?"
  ).run(now, checkInDistanceM, checkInVerified, params.shiftId);
  return { ok: true, check_in_distance_m: checkInDistanceM, check_in_verified: checkInVerified };
}

export async function performCheckOut(
  db: any,
  orgId: string,
  params: { shiftId: number; handoverNote?: string; restrictPersonnelId?: string },
): Promise<CheckOutOutcome> {
  const existing = await db.prepare("SELECT * FROM shift_assignments WHERE id = ?").get(params.shiftId) as any;
  if (!existing) return { ok: false, status: 404, error: "Vardiya bulunamadı" };
  if (params.restrictPersonnelId && existing.personnel_id !== params.restrictPersonnelId) {
    return { ok: false, status: 403, error: "Erişim reddedildi" };
  }
  if (await isPeriodLocked(db, orgId, existing.location_id, existing.week_start, existing.day)) {
    return { ok: false, status: 400, error: "Bu ayın puantaj dönemi kilitli, check-out yapılamaz" };
  }
  const now = Math.floor(Date.now() / 1000);
  const note = typeof params.handoverNote === "string" && params.handoverNote.trim()
    ? params.handoverNote.trim().slice(0, 500)
    : null;
  await db.prepare("UPDATE shift_assignments SET check_out_at = ?, status = 'completed', handover_note = ? WHERE id = ?").run(now, note, params.shiftId);
  return { ok: true };
}
