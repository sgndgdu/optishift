/**
 * Plan Asistanı: sorunlar (checks.ts, yayın penceresiyle aynı liste) + bilgi maddeleri.
 * Sıra: acil, uyarı, bilgi; en sonda haftanın özeti.
 */

import { DAY_NAMES } from "@/lib/constants";
import type { WeekSnapshot } from "./snapshot";
import { findProblems, fmtHours, nameList, type Insight, type WeekBudgets } from "./checks";

export { fmtHours, dayList, nameList, findProblems } from "./checks";
export type { InsightTarget } from "./checks";
export type { Insight, InsightSeverity, WeekBudgets } from "./checks";

const ORDER = { critical: 0, warning: 1, info: 2 } as const;

export function buildInsights(snap: WeekSnapshot, budgets: WeekBudgets = {}): Insight[] {
  const list: Insight[] = [...findProblems(snap, budgets)];

  // Uygunluk: plan kurulmadan önce de gerekli olduğu için boş haftada da gösterilir;
  // yayınlanmış haftada artık planı etkilemez, gösterilmez
  const noAvail = snap.people.filter(p => !p.hasAvailability);
  if (snap.rules.availabilityCollection && noAvail.length > 0 && snap.status !== "published") {
    list.push({
      id: "no-availability", severity: "info", action: "remind-availability",
      title: `${noAvail.length} kişi uygunluk girmedi`,
      lines: ["Otomatik planlamada tamamen uygun sayılırlar, plan engellenmez."],
    });
  }

  if (snap.status === "empty") {
    list.push({
      id: "empty", severity: "info", title: "Bu hafta için henüz plan yok",
      lines: ["Planı Oluştur ile otomatik plan hazırlayabilirsiniz."],
    });
    return list.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  }

  const working = snap.people.filter(p => p.shifts.length > 0);
  const over = snap.coverage.filter(c => c.demand !== null && c.demand > 0 && c.assigned > c.demand);
  if (over.length > 0) {
    list.push({
      id: "overstaffed", severity: "info",
      title: `${over.length} vardiyada ihtiyaçtan fazla kişi var`,
      lines: over.map(c => `${DAY_NAMES[c.day]} ${c.shiftName}: ${c.assigned}/${c.demand}`),
    });
  }

  const idle = snap.people.filter(p => p.shifts.length === 0 && p.leaveDays.length < 7);
  if (idle.length > 0) {
    list.push({
      id: "idle", severity: "info",
      title: `${idle.length} kişi bu hafta hiç vardiya almadı`,
      lines: [nameList(idle.map(p => p.name), 8)],
    });
  }

  if (!snap.hasDemand) {
    list.push({
      id: "no-demand", severity: "info", action: "open-demand",
      title: "Personel İhtiyacı tablosu boş",
      lines: ["Hangi gün kaç kişi gerektiğini girerseniz eksik ve fazla vardiyaları da gösterebilirim."],
    });
  }

  const problems = list.filter(i => i.severity !== "info").length;
  list.push({
    id: "summary", severity: "info",
    title: problems === 0 ? "Planda sorun görünmüyor" : "Haftanın özeti",
    lines: [`${working.length} kişi, ${snap.totalShifts} vardiya, toplam ${fmtHours(snap.totalHours)}. Kişi başı ortalama ${fmtHours(snap.avgHours)}.`],
  });
  return list.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
