/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Boşalan bir vardiya için yedek adaylar (açık vardiya ekranı ve "Gelemiyor" penceresi).
 * Elenir: o gün başka vardiyası olan, sabit izin günü, "gelemem" dediği gün, onaylı izinde,
 * gece kısıtlıysa gece vardiyası. Sıra: uyarısı az olan → vardiyanın gerektirdiği rolü taşıyan →
 * Adalet Puanı düşük (en az yük taşıyan). Her adayın gerekçesi (reasons) ve uyarıları döner.
 */

import { loadReliability } from "@/lib/reliabilityData";
import { effectiveWeeklyLimit } from "@/lib/legal";
import { RELIABILITY_WEEKS, isUnreliable, reliabilityNote, type Reliability } from "@/lib/reliability";

export interface SlotInput {
  location_id: string;
  date: string;        // YYYY-MM-DD
  start_time: string;  // HH:MM
  end_time: string;
  excludePersonnelId?: string;
  /** Vardiya tanımının zorunlu rolleri (required_skills) */
  requiredRoles?: string[];
  /** Vardiyanın departmanı: verilirse sadece bu departmanda çalışabilenler (ana ya da joker) aday olur */
  departmentId?: string | null;
}

export interface Candidate {
  personnel_id: string;
  name: string;
  prev_score: number;
  warnings: string[];
  reasons: string[];
  role_match: boolean;
  /** Başka şubenin çalışanı (ödünç): ana şubesinin adı. Kendi şubesindekiler önce sıralanır. */
  other_branch?: string;
  /** Üstlenirse çalışma kuralı bozulur (dinlenme ya da haftalık sınır): üstlenme sunucuda reddedilir */
  blocking?: boolean;
}

const toMin = (t?: string | null) => {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
};

export async function rankCandidates(db: any, slot: SlotInput): Promise<{ candidates: Candidate[]; is_night: boolean }> {
  const dt = new Date(slot.date + "T00:00:00Z");
  const dayIdx = (dt.getUTCDay() + 6) % 7; // 0 = Pazartesi
  const monday = new Date(dt);
  monday.setUTCDate(dt.getUTCDate() - dayIdx);
  const week_start = monday.toISOString().split("T")[0];

  const osStart = toMin(slot.start_time) ?? 0;
  let osEnd = toMin(slot.end_time) ?? 0;
  if (osEnd <= osStart) osEnd += 1440;
  const osDurationH = (osEnd - osStart) / 60;
  const osIsNight = osStart >= 22 * 60 || osEnd > 24 * 60;

  // Plana giren herkes aday (vardiya yapan yönetici dahil, personnel.schedulable). Şubeler arası (2026-10-04):
  // işletmenin diğer şubelerindeki çalışanlar da "ödünç" aday olur; kendi şubesindekiler önce gelir.
  const locRow = await db.prepare(`SELECT org_id, rules FROM locations WHERE id = ?`).get(slot.location_id) as any;
  const people = await db.prepare(`
    SELECT p.id, p.name, p.prev_score, p.max_weekly_hours, p.night_restriction, p.weekly_off_day, p.user_access_level, p.roles,
           p.assigned_location_ids, p.department_id, p.assigned_department_ids, l.name AS home_name
    FROM personnel p LEFT JOIN locations l ON l.id = p.primary_location_id
    WHERE p.org_id = ? AND p.status = 'active' AND p.schedulable IS NOT FALSE
  `).all(locRow?.org_id ?? "") as any[];
  const isLocal = (p: any) => String(p.assigned_location_ids ?? "").includes(`"${slot.location_id}"`);
  const inDept = (p: any) => {
    if (!slot.departmentId) return true;
    if (p.department_id === slot.departmentId) return true;
    return String(p.assigned_department_ids ?? "").includes(`"${slot.departmentId}"`);
  };
  const eligible = people.filter(p => p.id !== slot.excludePersonnelId && inDept(p));
  let ruleMax = 45;
  try {
    const r = typeof locRow?.rules === "string" ? JSON.parse(locRow.rules || "{}") : (locRow?.rules ?? {});
    if (typeof r.max_weekly_hours === "number") ruleMax = r.max_weekly_hours;
  } catch { /* varsayılan */ }

  // O haftanın normal vardiyaları TÜM şubelerde (gün çakışması, saat toplamı, dinlenme şubeler arası)
  const asgs = await db.prepare(`
    SELECT sa.personnel_id, sa.day, sa.start_time, sa.end_time FROM shift_assignments sa
    JOIN personnel p ON p.id = sa.personnel_id
    WHERE p.org_id = ? AND sa.week_start = ? AND COALESCE(sa.kind, 'regular') = 'regular'
  `).all(locRow?.org_id ?? "", week_start) as any[];
  const byPerson: Record<string, any[]> = {};
  for (const a of asgs) (byPerson[a.personnel_id] ??= []).push(a);

  const ids = eligible.map(p => p.id);
  const availByPerson: Record<string, any> = {};
  const onLeave = new Set<string>();
  if (ids.length > 0) {
    const ph = ids.map(() => "?").join(",");
    const availRows = await db.prepare(
      `SELECT * FROM availability WHERE personnel_id IN (${ph}) AND week_start = ?`
    ).all(...ids, week_start) as any[];
    for (const av of availRows) availByPerson[av.personnel_id] = av;
    const leaves = await db.prepare(
      `SELECT personnel_id FROM leave_requests
       WHERE status = 'approved' AND personnel_id IN (${ph}) AND start_date <= ? AND end_date >= ?`
    ).all(...ids, slot.date, slot.date) as any[];
    for (const l of leaves) onLeave.add(l.personnel_id);
  }
  const dayStatus = (pid: string) => {
    const raw = availByPerson[pid]?.[`day_${dayIdx}`];
    if (!raw) return "available";
    if (typeof raw === "string" && raw.startsWith("{")) {
      try { return JSON.parse(raw)?.status ?? "available"; } catch { return "available"; }
    }
    return raw;
  };
  const rolesOf = (p: any): string[] => {
    if (Array.isArray(p.roles)) return p.roles;
    try { const r = JSON.parse(p.roles ?? "[]"); return Array.isArray(r) ? r : []; } catch { return []; }
  };
  const required = (slot.requiredRoles ?? []).filter(Boolean);
  // Güvenilirlik (giriş kayıtlarından; şube giriş kullanmıyorsa boş)
  const reliability: Record<string, Reliability> = await loadReliability(db, slot.location_id).catch(() => ({}));

  const candidates: Candidate[] = [];
  for (const p of eligible) {
    const mine = byPerson[p.id] ?? [];
    if (mine.some(a => Number(a.day) === dayIdx)) continue;
    if (p.weekly_off_day !== null && p.weekly_off_day !== undefined && Number(p.weekly_off_day) === dayIdx) continue;
    if (dayStatus(p.id) === "unavailable") continue;
    if (onLeave.has(p.id)) continue;
    if (osIsNight && p.night_restriction) continue;

    const warnings: string[] = [];
    const reasons: string[] = [];
    let blocking = false;
    if (dayStatus(p.id) === "preferred_not") warnings.push("Bu günü \"tercih etmem\" dedi: mümkünse çalışmak istemiyor");
    else if (availByPerson[p.id]) reasons.push("Bu gün için uygun olduğunu girmiş");

    let weekMin = 0;
    for (const a of mine) {
      const s = toMin(a.start_time); let e = toMin(a.end_time);
      if (s === null || e === null) continue;
      if (e <= s) e += 1440;
      weekMin += e - s;
    }
    const maxH = effectiveWeeklyLimit(p.max_weekly_hours, ruleMax);
    const newTotalH = Math.round((weekMin / 60 + osDurationH) * 10) / 10;
    if (newTotalH > maxH) { warnings.push(`Haftalık ${newTotalH} saate çıkar (sınır ${maxH} saat)`); blocking = true; }
    else reasons.push(`Bu hafta ${Math.round(weekMin / 6) / 10} saat çalışıyor, sınırı aşmaz`);

    const prevA = mine.find(a => Number(a.day) === dayIdx - 1);
    if (prevA) {
      const pe = toMin(prevA.end_time); const ps = toMin(prevA.start_time);
      if (pe !== null && ps !== null) {
        const prevEnd = pe <= ps ? pe + 1440 : pe;
        const gap = (osStart + 1440) - prevEnd;
        if (gap < 11 * 60) { warnings.push(`Önceki günle arasında ${Math.round(gap / 6) / 10} saat dinlenme kalır (en az 11 saat olmalı)`); blocking = true; }
      }
    }
    const nextA = mine.find(a => Number(a.day) === dayIdx + 1);
    if (nextA) {
      const ns = toMin(nextA.start_time);
      if (ns !== null) {
        const gap = (ns + 1440) - osEnd;
        if (gap < 11 * 60) { warnings.push(`Ertesi günle arasında ${Math.round(gap / 6) / 10} saat dinlenme kalır (en az 11 saat olmalı)`); blocking = true; }
      }
    }

    const rel = reliability[p.id];
    const relNote = reliabilityNote(rel);
    if (relNote && isUnreliable(rel)) warnings.push(relNote);
    else if (rel && !relNote) reasons.push(`Son ${RELIABILITY_WEEKS} haftada ${rel.shifts} vardiyanın hiçbirini kaçırmadı`);

    const myRoles = rolesOf(p);
    const matched = required.filter(r => myRoles.includes(r));
    if (matched.length) reasons.unshift(`Gerekli görev: ${matched.join(", ")}`);

    const local = isLocal(p);
    if (!local) reasons.unshift(`${p.home_name ?? "Başka şube"} şubesinden (ödünç)`);
    candidates.push({ personnel_id: p.id, name: p.name, prev_score: p.prev_score ?? 0, warnings, reasons, role_match: matched.length > 0, blocking,
      ...(local ? {} : { other_branch: p.home_name ?? "Başka şube" }) });
  }

  candidates.sort((a, b) =>
    (Number(!!a.other_branch) - Number(!!b.other_branch)) ||
    (a.warnings.length - b.warnings.length) ||
    (Number(b.role_match) - Number(a.role_match)) ||
    (a.prev_score - b.prev_score));
  // Adalet sırası gerekçesi: uyarısızlar arasında en az yük taşıyanlar
  candidates.filter(c => c.warnings.length === 0 && !c.other_branch).slice(0, 3).forEach((c, i) => c.reasons.push(`Adalet Puanı'na göre ${i + 1}. sırada (en az çalışan önce)`));

  // Diğer şubelerden en fazla 5 uyarısız aday (liste uzamasın)
  const local = candidates.filter(c => !c.other_branch);
  const away = candidates.filter(c => c.other_branch && c.warnings.length === 0).slice(0, 5);
  return { candidates: [...local, ...away], is_night: osIsNight };
}
