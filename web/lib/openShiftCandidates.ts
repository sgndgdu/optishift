/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Boşalan bir vardiya için yedek adaylar (açık vardiya ekranı ve "Gelemiyor" penceresi).
 * Elenir: o gün başka vardiyası olan, sabit izin günü, "gelemem" dediği gün, onaylı izinde,
 * gece kısıtlıysa gece vardiyası. Sıra: uyarısı az olan → vardiyanın gerektirdiği rolü taşıyan →
 * Adalet Puanı düşük (en az yük taşıyan). Her adayın gerekçesi (reasons) ve uyarıları döner.
 */

import { isNightTime } from "@/lib/legal";
import { assignmentWorkMinutes, effectiveWeeklyLimit, netWorkMinutes } from "@/lib/legal";
import { trNum } from "@/lib/format";
import { comparableScore, scoreVsAverageText } from "@/lib/fairness";

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
  /** Kişinin haftalık süresine oranlanmış puan (sıralama ve karşılaştırma) */
  cmp_score: number;
  warnings: string[];
  reasons: string[];
  role_match: boolean;
  /** Başka şubenin çalışanı (ödünç): ana şubesinin adı. Kendi şubesindekiler önce sıralanır. */
  other_branch?: string;
  /** Başka şubenin çalışanının ana şubesi */
  home_location_id?: string;
  /** Bu haftaki çalışma süresi (saat, bu vardiya hariç) */
  week_hours?: number;
  /** Adalet Puanı'nın ekibe göre anlamı: "ortalamanın %12 altı" (aday listesindeki herkesin ortalamasına göre) */
  fair_text?: string;
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
  // Çalışma süresi mola düşülerek (lib/legal); vardiya tanımı aşağıda locRow ile gelir
  let osDurationH = netWorkMinutes(osEnd - osStart) / 60;
  const osIsNight = isNightTime(slot.start_time, slot.end_time);

  // Plana giren herkes aday (vardiya yapan yönetici dahil, personnel.schedulable). Şubeler arası (2026-10-04):
  // işletmenin diğer şubelerindeki çalışanlar da "ödünç" aday olur; kendi şubesindekiler önce gelir.
  const locRow = await db.prepare(`SELECT org_id, rules, shift_definitions FROM locations WHERE id = ?`).get(slot.location_id) as any;
  let locDefs: any[] = [];
  try { const d = typeof locRow?.shift_definitions === "string" ? JSON.parse(locRow.shift_definitions) : locRow?.shift_definitions; locDefs = Array.isArray(d) ? d : []; } catch { /* yasal asgari */ }
  osDurationH = assignmentWorkMinutes(locDefs, { start_time: slot.start_time, end_time: slot.end_time }) / 60 || osDurationH;
  const people = await db.prepare(`
    SELECT p.id, p.name, p.prev_score, p.max_weekly_hours, p.night_restriction, p.weekly_off_day, p.user_access_level, p.roles,
           p.assigned_location_ids, p.primary_location_id, p.department_id, p.assigned_department_ids, l.name AS home_name
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
  let minRest = 11; // şubenin "En az dinlenme süresi" ayarı (lib/assignmentCheck ile aynı)
  try {
    const r = typeof locRow?.rules === "string" ? JSON.parse(locRow.rules || "{}") : (locRow?.rules ?? {});
    if (typeof r.max_weekly_hours === "number") ruleMax = r.max_weekly_hours;
    if (typeof r.min_rest_hours === "number") minRest = r.min_rest_hours;
  } catch { /* varsayılan */ }

  // O haftanın normal vardiyaları TÜM şubelerde (gün çakışması, saat toplamı, dinlenme şubeler arası)
  const asgs = await db.prepare(`
    SELECT sa.personnel_id, sa.shift_id, sa.day, sa.start_time, sa.end_time FROM shift_assignments sa
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
    for (const a of mine) weekMin += assignmentWorkMinutes(locDefs, a);
    const maxH = effectiveWeeklyLimit(p.max_weekly_hours, ruleMax);
    const newTotalH = Math.round((weekMin / 60 + osDurationH) * 10) / 10;
    if (newTotalH > maxH) { warnings.push(`Haftalık ${newTotalH} saate çıkar (sınır ${maxH})`); blocking = true; }
    else reasons.push(`Bu hafta ${trNum(Math.round(weekMin / 6) / 10)} saat çalışıyor, sınırı aşmaz`);

    const prevA = mine.find(a => Number(a.day) === dayIdx - 1);
    if (prevA) {
      const pe = toMin(prevA.end_time); const ps = toMin(prevA.start_time);
      if (pe !== null && ps !== null) {
        const prevEnd = pe <= ps ? pe + 1440 : pe;
        const gap = (osStart + 1440) - prevEnd;
        if (gap < minRest * 60) { warnings.push(`Önceki günle arada ${trNum(Math.round(gap / 6) / 10)} saat kalır, en az ${trNum(minRest)} olmalı`); blocking = true; }
      }
    }
    const nextA = mine.find(a => Number(a.day) === dayIdx + 1);
    if (nextA) {
      const ns = toMin(nextA.start_time);
      if (ns !== null) {
        const gap = (ns + 1440) - osEnd;
        if (gap < minRest * 60) { warnings.push(`Ertesi günle arada ${trNum(Math.round(gap / 6) / 10)} saat kalır, en az ${trNum(minRest)} olmalı`); blocking = true; }
      }
    }

    // Gelmeme / geç kalma burada yazılmaz (kullanıcı kararı 2026-10-10): tek yeri Raporlar

    const myRoles = rolesOf(p);
    const matched = required.filter(r => myRoles.includes(r));
    if (matched.length) reasons.unshift(`Gerekli görev: ${matched.join(", ")}`);

    const local = isLocal(p);
    if (!local) reasons.unshift(`${p.home_name ?? "Başka şube"} şubesinden (ödünç)`);
    candidates.push({ personnel_id: p.id, name: p.name, prev_score: p.prev_score ?? 0, cmp_score: comparableScore(p.prev_score ?? 0, p.max_weekly_hours, ruleMax), warnings, reasons, role_match: matched.length > 0, blocking,
      week_hours: Math.round(weekMin / 6) / 10,
      ...(local ? {} : { other_branch: p.home_name ?? "Başka şube", home_location_id: p.primary_location_id ?? undefined }) });
  }

  candidates.sort((a, b) =>
    (Number(!!a.other_branch) - Number(!!b.other_branch)) ||
    (a.warnings.length - b.warnings.length) ||
    (Number(b.role_match) - Number(a.role_match)) ||
    (a.cmp_score - b.cmp_score));
  // Puanın anlamı: listedekilerin ortalamasına göre, kişinin haftalık süresine oranlanmış (lib/fairness comparableScore)
  const avgScore = candidates.length ? candidates.reduce((t, c) => t + c.cmp_score, 0) / candidates.length : 0;
  for (const c of candidates) c.fair_text = scoreVsAverageText(c.cmp_score, avgScore);
  // Adalet sırası gerekçesi: uyarısızlar arasında en az yük taşıyanlar
  candidates.filter(c => c.warnings.length === 0 && !c.other_branch).slice(0, 3).forEach((c, i) => c.reasons.push(`Adalet Puanı'na göre ${i + 1}. sırada (en az çalışan önce)`));

  // Uygun olan herkes (sayı sınırı yok, kullanıcı kararı 2026-10-08); kendi şubesi önce (sıralama yukarıda)
  return { candidates, is_night: osIsNight };
}
