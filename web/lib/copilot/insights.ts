/**
 * Plan Asistanı: haftanın durumundan kurallı içgörüler (saf).
 *
 * Her kural aynı türdeki bulguları tek maddede toplar ("3 kişi 45 saati aşıyor"),
 * böylece liste kısa kalır. Sıra: önce yasal/kesin sorunlar, sonra yük ve adalet,
 * en sonda bilgi.
 */

import { DAY_NAMES, DAY_SHORT } from "@/lib/constants";
import type { PersonWeek, WeekSnapshot } from "./snapshot";

export type InsightSeverity = "critical" | "warning" | "info";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  /** Madde altındaki satırlar (kişi ya da gün bazında). */
  lines: string[];
}

const ORDER: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2 };

export const fmtHours = (h: number) => `${h.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} saat`;
export const dayList = (days: number[]) => days.map(d => DAY_SHORT[d]).join(", ");

/** "Ali, Veli ve Ayşe" / "Ali, Veli, Ayşe ve 2 kişi daha" */
export function nameList(names: string[], max = 3): string {
  if (names.length <= 1) return names.join("");
  if (names.length <= max) return `${names.slice(0, -1).join(", ")} ve ${names.at(-1)}`;
  return `${names.slice(0, max).join(", ")} ve ${names.length - max} kişi daha`;
}

function group(
  id: string, severity: InsightSeverity, people: PersonWeek[],
  title: (n: number) => string, line: (p: PersonWeek) => string,
): Insight | null {
  if (people.length === 0) return null;
  return { id, severity, title: title(people.length), lines: people.map(line) };
}

export function buildInsights(snap: WeekSnapshot): Insight[] {
  if (snap.status === "empty") {
    return [{
      id: "empty", severity: "info", title: "Bu hafta için henüz plan yok",
      lines: ["Haftayı Oluştur ile otomatik plan hazırlayabilirsiniz."],
    }];
  }

  const { rules } = snap;
  const out: (Insight | null)[] = [];
  const working = snap.people.filter(p => p.shifts.length > 0);

  // ── Kesin sorunlar ──────────────────────────────────────────────────────
  out.push(group("on-leave", "critical", working.filter(p => p.onLeaveDays.length > 0),
    n => `${n} kişi izinli olduğu gün vardiyada`,
    p => `${p.name}: ${dayList(p.onLeaveDays)}`));

  out.push(group("unavailable", "critical", working.filter(p => p.unavailableDays.length > 0),
    n => `${n} kişi "uygun değilim" dediği gün vardiyada`,
    p => `${p.name}: ${dayList(p.unavailableDays)}`));

  out.push(group("over-hours", "critical", working.filter(p => p.hours > rules.maxWeeklyHours),
    n => `${n} kişi haftalık ${rules.maxWeeklyHours} saat sınırını aşıyor`,
    p => `${p.name}: ${fmtHours(p.hours)}`));

  out.push(group("short-rest", "critical",
    working.filter(p => p.minRestHours !== null && p.minRestHours < rules.minRestHours),
    n => `${n} kişinin iki vardiyası arasında ${rules.minRestHours} saatten az dinlenme var`,
    p => `${p.name}: en kısa dinlenme ${fmtHours(p.minRestHours!)}`));

  const skillGaps = snap.coverage.filter(c => c.missingSkills.length > 0);
  if (skillGaps.length > 0) {
    out.push({
      id: "skill-gap", severity: "critical",
      title: `${skillGaps.length} vardiyada zorunlu rol eksik`,
      lines: skillGaps.map(c => `${DAY_NAMES[c.day]} ${c.shiftName}: ${c.missingSkills
        .map(m => `${m.need} ${m.skill} gerekli, ${m.have} var`).join("; ")}`),
    });
  }

  const short = snap.coverage.filter(c => c.demand !== null && c.assigned < c.demand);
  if (short.length > 0) {
    const missing = short.reduce((s, c) => s + (c.demand! - c.assigned), 0);
    out.push({
      id: "understaffed", severity: "critical",
      title: `${short.length} vardiyada toplam ${missing} kişi eksik`,
      lines: short.map(c => `${DAY_NAMES[c.day]} ${c.shiftName}: ${c.assigned}/${c.demand}`),
    });
  }

  // ── Yük ve dinlenme ─────────────────────────────────────────────────────
  out.push(group("streak", "warning", working.filter(p => p.longestStreak > rules.maxConsecutiveDays),
    n => `${n} kişi üst üste ${rules.maxConsecutiveDays} günden fazla çalışıyor`,
    p => `${p.name}: ${p.longestStreak} gün üst üste`));

  out.push(group("nights", "warning", working.filter(p => p.nights >= 4),
    n => `${n} kişi bu hafta 4 ya da daha fazla gece çalışıyor`,
    p => `${p.name}: ${p.nights} gece`));

  out.push(group("preferred-not", "warning", working.filter(p => p.preferredNotDays.length > 0),
    n => `${n} kişi "tercih etmem" dediği gün vardiyada`,
    p => `${p.name}: ${dayList(p.preferredNotDays)}`));

  // Adalet: zaten çok yüklü olan, ortalamadan fazla zor vardiya almış; az yüklüler daha az almış
  const heavy = working.filter(p => p.loadRatio > 1.2 && p.hardShifts >= 2 && p.hardShifts >= snap.avgHard + 1);
  const light = snap.people.filter(p => p.loadRatio < 0.8 && p.hardShifts < snap.avgHard);
  if (heavy.length > 0 && light.length > 0) {
    out.push({
      id: "fairness", severity: "warning",
      title: "Zor vardiyalar zaten yüklü kişilere gitmiş",
      lines: [
        ...heavy.map(p => `${p.name}: Adalet Puanı yüksek, bu hafta ${p.hardShifts} zor vardiya`),
        `Daha az yüklü olanlar: ${nameList(light.map(p => `${p.name} (${p.hardShifts})`), 4)}`,
      ],
    });
  }

  const over = snap.coverage.filter(c => c.demand !== null && c.demand > 0 && c.assigned > c.demand);
  if (over.length > 0) {
    out.push({
      id: "overstaffed", severity: "info",
      title: `${over.length} vardiyada ihtiyaçtan fazla kişi var`,
      lines: over.map(c => `${DAY_NAMES[c.day]} ${c.shiftName}: ${c.assigned}/${c.demand}`),
    });
  }

  const idle = snap.people.filter(p => p.shifts.length === 0 && p.leaveDays.length < 7);
  if (idle.length > 0) {
    out.push({
      id: "idle", severity: "info",
      title: `${idle.length} kişi bu hafta hiç vardiya almadı`,
      lines: [nameList(idle.map(p => p.name), 8)],
    });
  }

  if (!snap.hasDemand) {
    out.push({
      id: "no-demand", severity: "info",
      title: "Personel İhtiyacı tablosu boş",
      lines: ["Hangi gün kaç kişi gerektiğini girerseniz eksik ve fazla vardiyaları da gösterebilirim."],
    });
  }

  const list = out.filter((x): x is Insight => x !== null);
  const problems = list.filter(i => i.severity !== "info").length;
  list.push({
    id: "summary", severity: "info",
    title: problems === 0 ? "Planda sorun görünmüyor" : "Haftanın özeti",
    lines: [`${working.length} kişi, ${snap.totalShifts} vardiya, toplam ${fmtHours(snap.totalHours)}. Kişi başı ortalama ${fmtHours(snap.avgHours)}.`],
  });
  return list.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
