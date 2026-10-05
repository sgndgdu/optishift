/**
 * Şubeler arası rotasyon: TEK KAYNAK (kullanıcı kararı 2026-10-04).
 * personnel.branch_rotation = { every_weeks, order: [şube id...], anchor: başlangıç haftasının Pazartesi'si }.
 * anchor haftasından itibaren her `every_weeks` haftada bir sıradaki şubeye geçilir. Rotasyonu olan kişi o hafta
 * SADECE sırası gelen şubenin planına girer; rotasyonu yoksa atandığı her şubede planlanabilir (paylaşılan personel).
 */
export interface BranchRotation { every_weeks: number; order: string[]; anchor: string }

export function parseBranchRotation(raw: unknown): BranchRotation | null {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return null; } }
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<BranchRotation>;
  const order = Array.isArray(r.order) ? r.order.filter((x): x is string => typeof x === "string" && !!x) : [];
  const every = Number(r.every_weeks);
  if (order.length < 2 || !(every >= 1) || typeof r.anchor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.anchor)) return null;
  return { every_weeks: Math.min(52, Math.round(every)), order, anchor: r.anchor };
}

/** O hafta (Pazartesi) kişinin rotasyondaki şubesi; rotasyon yoksa null. Başlangıçtan önceki haftalar da döngüye göre hesaplanır. */
export function rotationBranchForWeek(rot: BranchRotation | null, weekStart: string): string | null {
  if (!rot) return null;
  const weeks = Math.round((Date.parse(weekStart + "T00:00:00Z") - Date.parse(rot.anchor + "T00:00:00Z")) / (7 * 86400000));
  const block = Math.floor(weeks / rot.every_weeks);
  const idx = ((block % rot.order.length) + rot.order.length) % rot.order.length;
  return rot.order[idx];
}

/** Kişi bu hafta bu şubenin planına girebilir mi? (rotasyon yoksa evet) */
export function plannedInBranch(raw: unknown, branchId: string, weekStart: string): boolean {
  const target = rotationBranchForWeek(parseBranchRotation(raw), weekStart);
  return target === null || target === branchId;
}

/**
 * Kişinin BU şubedeki departmanı: ana departmanı bu şubeye aitse o, değilse assigned_department_ids içinden bu şubeye
 * ait olan (paylaşılan personel her şubede o şubenin bir departmanında çalışır); yoksa null.
 */
export function departmentInBranch(p: { department_id?: string | null; assigned_department_ids?: unknown }, branchDeptIds: Set<string>): string | null {
  if (p.department_id && branchDeptIds.has(p.department_id)) return p.department_id;
  let extra: unknown = p.assigned_department_ids;
  if (typeof extra === "string") { try { extra = JSON.parse(extra); } catch { extra = []; } }
  return Array.isArray(extra) ? (extra.find(d => typeof d === "string" && branchDeptIds.has(d)) ?? null) : null;
}

/**
 * Kişinin BU şubedeki tüm departmanları, ana departman başta (departmentInBranch). Birden çok departmanı
 * olan kişi ("joker") planda bunların hepsinin ihtiyacına yazılabilir; her vardiyası tek departmana sayılır.
 */
export function departmentsInBranch(p: { department_id?: string | null; assigned_department_ids?: unknown }, branchDeptIds: Set<string>): string[] {
  const primary = departmentInBranch(p, branchDeptIds);
  let extra: unknown = p.assigned_department_ids;
  if (typeof extra === "string") { try { extra = JSON.parse(extra); } catch { extra = []; } }
  const rest = Array.isArray(extra) ? extra.filter((d): d is string => typeof d === "string" && branchDeptIds.has(d)) : [];
  return [...new Set([...(primary ? [primary] : []), ...rest])];
}
