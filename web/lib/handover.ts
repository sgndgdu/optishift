/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Devir-Teslim Defteri — TEK KAYNAK.
 *
 * app/api/shifts/route.ts PATCH (personel portalı, oturumlu) ve
 * app/api/kiosk/[locationId]/route.ts (ortak tablet, oturumsuz PIN girişi)
 * check-in'den ÖNCE bunu çağırır — davranış iki yoldan da birebir aynıdır.
 *
 * Tek okuyucu yeterli: hedef vardiyaya gelen İLK kişi "Teslim Aldım" deyip
 * acknowledgeHandover çağırınca not o vardiya için tüketilmiş sayılır,
 * read_by_personnel_id set edildiği an sonraki kişileri hiç etkilemez.
 */

export interface PendingHandover {
  id: number;
  note: string;
  author_name: string;
  created_at: number;
}

// Daha eski notlar "unutulmuş" sayılır, kimseyi süresiz bloklamasın.
const STALE_WINDOW_SECONDS = 3 * 24 * 3600;

/**
 * Check-in yapılacak vardiyanın bağlamını (şube, vardiya tanımı, personelin
 * departmanı) shift_assignments row id'sinden çözer. Hem portal (shift_id =
 * shift_assignments.id) hem kiosk (zaten elindeki shift row'u) aynı şekli kullanır.
 */
export async function resolveHandoverContext(
  db: any,
  shiftAssignmentId: number,
): Promise<{ personnelId: string; locationId: string; shiftDefId: string; departmentId: string | null } | null> {
  const row = await db.prepare(`
    SELECT sa.personnel_id, sa.location_id, sa.shift_id AS shift_def_id, p.department_id
    FROM shift_assignments sa
    JOIN personnel p ON p.id = sa.personnel_id
    WHERE sa.id = ?
  `).get(shiftAssignmentId) as any;
  if (!row) return null;
  return {
    personnelId: row.personnel_id,
    locationId: row.location_id,
    shiftDefId: row.shift_def_id,
    departmentId: row.department_id ?? null,
  };
}

/**
 * Bu bağlama (şube + hedef vardiya tanımı + departman) bırakılmış, henüz
 * okunmamış en güncel notu döner. department_id NULL olan notlar tüm şubeyi
 * hedefler (departmansız şubeler dahil); belirli bir departmana yazılmış not
 * sadece o departmandaki personeli bloklar.
 */
export async function getPendingHandover(
  db: any,
  params: { locationId: string; departmentId: string | null; shiftDefId: string },
): Promise<PendingHandover | null> {
  const cutoff = Math.floor(Date.now() / 1000) - STALE_WINDOW_SECONDS;
  const row = await db.prepare(`
    SELECT h.id, h.note, h.created_at, p.name AS author_name
    FROM shift_handovers h
    JOIN personnel p ON p.id = h.author_personnel_id
    WHERE h.location_id = ?
      AND h.target_shift_def_id = ?
      AND (h.department_id IS NULL OR h.department_id = ?)
      AND h.read_by_personnel_id IS NULL
      AND h.created_at >= ?
    ORDER BY h.created_at DESC
    LIMIT 1
  `).get(params.locationId, params.shiftDefId, params.departmentId, cutoff) as any;
  if (!row) return null;
  return { id: row.id, note: row.note, author_name: row.author_name, created_at: Number(row.created_at) };
}

/**
 * Bir vardiya tanımından sonra kronolojik olarak SIRADAKİ vardiya tanımının
 * id'sini döner (başlangıç saatine göre sıralanır, gün sonunda döngü yaparak
 * ertesi günün ilk vardiyasına sarar — Gece → Sabah gibi). Not yazan kişi
 * "hangi vardiyaya" diye seçmez, sistem otomatik belirler.
 */
export function resolveNextShiftDefId(
  currentShiftId: string,
  shiftDefs: { id: string; start: string }[],
): string | null {
  if (shiftDefs.length === 0) return null;
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const sorted = [...shiftDefs].sort((a, b) => toMin(a.start) - toMin(b.start));
  const idx = sorted.findIndex(d => d.id === currentShiftId);
  if (idx === -1) return sorted[0]?.id ?? null; // bilinmeyen/özel vardiya — ilk tanıma düş
  return sorted[(idx + 1) % sorted.length].id;
}

export type AcknowledgeOutcome = { ok: true } | { ok: false; status: number; error: string };

/**
 * Notu okundu işaretler. Zaten başkası tarafından okunmuşsa idempotent olarak
 * ok:true döner (yarış durumunda ikinci kişiyi hatayla karşılamaz — not zaten
 * tüketilmiş, check-in'e devam edebilir).
 */
export async function acknowledgeHandover(
  db: any,
  params: { id: number; personnelId: string },
): Promise<AcknowledgeOutcome> {
  const existing = await db.prepare(`SELECT id, read_by_personnel_id FROM shift_handovers WHERE id = ?`).get(params.id) as any;
  if (!existing) return { ok: false, status: 404, error: "Devir-teslim notu bulunamadı" };
  if (existing.read_by_personnel_id) return { ok: true };
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    `UPDATE shift_handovers SET read_by_personnel_id = ?, read_at = ? WHERE id = ? AND read_by_personnel_id IS NULL`
  ).run(params.personnelId, now, params.id);
  return { ok: true };
}

/**
 * Check-in çağrılarının ortak ön-kontrolü: bekleyen bir not varsa ve istemci
 * onu acknowledgeHandoverId ile onaylamadıysa check-in'i başlatmadan notu
 * döner. Onaylandıysa (veya bekleyen not yoksa) null döner — çağıran taraf
 * performCheckIn'e geçebilir.
 */
export async function checkHandoverGate(
  db: any,
  params: { shiftAssignmentId: number; acknowledgeHandoverId?: number | null },
): Promise<PendingHandover | null> {
  const ctx = await resolveHandoverContext(db, params.shiftAssignmentId);
  if (!ctx) return null; // shift_assignments bulunamadı — asıl 404'ü performCheckIn versin

  const locRow = await db.prepare(`SELECT rules FROM locations WHERE id = ?`).get(ctx.locationId) as any;
  let handoverLogEnabled = false;
  try { handoverLogEnabled = JSON.parse(locRow?.rules || "{}")?.handover_log_enabled === true; } catch { /* kapalı say */ }
  if (!handoverLogEnabled) return null;

  const pending = await getPendingHandover(db, { locationId: ctx.locationId, departmentId: ctx.departmentId, shiftDefId: ctx.shiftDefId });
  if (!pending) return null;

  if (params.acknowledgeHandoverId === pending.id) {
    await acknowledgeHandover(db, { id: pending.id, personnelId: ctx.personnelId });
    return null; // onaylandı, check-in'e devam
  }

  return pending; // hâlâ bekliyor — çağıran taraf check-in'i durdurup notu göstermeli
}
