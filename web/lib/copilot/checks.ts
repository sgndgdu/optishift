/**
 * Haftanın kural kontrolleri: TEK KAYNAK.
 *
 * Yayınla'ya basınca çıkan ihlal penceresi ve Plan Asistanı aynı listeyi gösterir;
 * bir kural sadece burada yazılır. Her kural aynı türdeki bulguları tek maddede
 * toplar ("3 kişi haftalık sınırı aşıyor"), satırlar kişi ya da gün bazındadır.
 */

import { DAY_NAMES, DAY_SHORT } from "@/lib/constants";
import type { WeekSnapshot } from "./snapshot";
import { DAILY_DRIVING_EXTENDED_HOURS, DAILY_DRIVING_MAX_HOURS, DAILY_MAX_NET_HOURS, WEEKLY_DRIVING_MAX_HOURS, WEEKLY_REST_HOURS, netWorkHours } from "@/lib/legal";

export type InsightSeverity = "critical" | "warning" | "info";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  /** Madde altındaki satırlar (kişi ya da gün bazında). */
  lines: string[];
  /** Sayfanın bağlayacağı eylem. */
  action?: "remind-availability" | "open-demand";
}

export interface WeekBudgets {
  /** Haftalık işçilik maliyeti (₺) ve bütçesi; bütçe 0 ise kontrol yok. */
  labor?: { total: number; budget: number };
  /** Kişi başı fazla mesai eşiği ve haftalık toplam fazla mesai bütçesi (saat); bütçe 0 ise kontrol yok. */
  overtime?: { thresholdHours: number; budgetHours: number };
  /** Güvenilirliği düşük personel → kısa not (lib/reliability; giriş verisi yoksa boş) */
  unreliable?: Record<string, string>;
}

export const fmtHours = (h: number) => `${h.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} saat`;
export const dayList = (days: number[]) => days.map(d => DAY_SHORT[d]).join(", ");
const gap = (g: { fromDay: number; toDay: number }) => `${DAY_SHORT[g.fromDay]}→${DAY_SHORT[g.toDay]}`;

/** "Ali, Veli ve Ayşe" / "Ali, Veli, Ayşe ve 2 kişi daha" */
export function nameList(names: string[], max = 3): string {
  if (names.length <= 1) return names.join("");
  if (names.length <= max) return `${names.slice(0, -1).join(", ")} ve ${names.at(-1)}`;
  return `${names.slice(0, max).join(", ")} ve ${names.length - max} kişi daha`;
}

const NIGHT_RESTRICTION: Record<string, string> = {
  pregnant: "gebe", nursing: "emziren", under18: "18 yaş altı", medical: "sağlık raporu",
};

/** Yayınlamadan önce bakılması gereken sorunlar (acil + uyarı). Boş plan için boş liste. */
export function findProblems(snap: WeekSnapshot, budgets: WeekBudgets = {}): Insight[] {
  if (snap.status === "empty") return [];
  const { rules } = snap;
  const working = snap.people.filter(p => p.shifts.length > 0);
  const out: Insight[] = [];
  const add = (id: string, severity: InsightSeverity, title: string, lines: string[]) => {
    if (lines.length > 0) out.push({ id, severity, title, lines });
  };
  const per = <T,>(pick: (p: (typeof working)[number]) => T[] | null, line: (name: string, items: T[]) => string) =>
    working.flatMap(p => { const items = pick(p); return items && items.length ? [line(p.name, items)] : []; });

  // ── Acil: yasal ya da kesin sorunlar ─────────────────────────────────────
  const onLeave = per(p => p.onLeaveDays, (n, d) => `${n}: ${dayList(d)}`);
  add("on-leave", "critical", `${onLeave.length} kişi izinli olduğu gün vardiyada`, onLeave);

  const unavailable = per(p => p.unavailableDays, (n, d) => `${n}: ${dayList(d)}`);
  add("unavailable", "critical", `${unavailable.length} kişi "Gelemem" dediği gün vardiyada`, unavailable);

  const over = working.filter(p => p.hours > p.maxHours);
  add("over-hours", "critical", `${over.length} kişi haftalık çalışma sınırını aşıyor`,
    over.map(p => `${p.name}: ${fmtHours(p.hours)}, sınır ${fmtHours(p.maxHours)}${p.maxHours === 66 ? " (denkleştirmede tek hafta tavanı)" : ""}`));

  const shortRest = per(p => p.restGaps.filter(g => g.hours < rules.minRestHours),
    (n, gs) => `${n}: ${gs.map(g => `${gap(g)} ${fmtHours(g.hours)}`).join(", ")}`);
  add("short-rest", "critical", `${shortRest.length} kişinin iki vardiyası arasında ${rules.minRestHours} saatten az dinlenme var`, shortRest);

  // İş K. m.46: 7 günde en az 24 saat kesintisiz hafta tatili
  const noWeeklyRest = working.filter(p => p.longestRestHours < WEEKLY_REST_HOURS);
  add("weekly-rest", "critical", `${noWeeklyRest.length} kişiye haftada 24 saat kesintisiz dinlenme kalmıyor`,
    noWeeklyRest.map(p => `${p.name}: en uzun dinlenme ${fmtHours(p.longestRestHours)} (İş Kanunu m.46 hafta tatili)`));

  // İş K. m.63: günlük çalışma 11 saati aşamaz (m.68 asgari mola düşülerek)
  const longDays = per(p => p.shifts.filter(x => netWorkHours(x.hours) > DAILY_MAX_NET_HOURS),
    (n, xs) => `${n}: ${xs.map(x => `${DAY_NAMES[x.day]} ${fmtHours(x.hours)}`).join(", ")}`);
  add("daily-11", "critical", `${longDays.length} kişinin vardiyası molası düşüldükten sonra 11 saati aşıyor`, longDays);

  // Sürüş süresi (AETR): günde 9 saat (haftada 2 kez 10), haftada 56 saat
  const driving = working.flatMap(p => {
    const lines: string[] = [];
    const over10 = p.shifts.filter(x => x.driving > DAILY_DRIVING_EXTENDED_HOURS);
    if (over10.length) lines.push(`${p.name}: ${over10.map(x => `${DAY_NAMES[x.day]} ${fmtHours(x.driving)}`).join(", ")} direksiyon (günlük sınır 10 saat)`);
    const extended = p.shifts.filter(x => x.driving > DAILY_DRIVING_MAX_HOURS && x.driving <= DAILY_DRIVING_EXTENDED_HOURS);
    if (extended.length > 2) lines.push(`${p.name}: ${extended.length} gün 9 saatten uzun sürüş (haftada en fazla 2)`);
    const weekly = Math.round(p.shifts.reduce((t, x) => t + x.driving, 0) * 10) / 10;
    if (weekly > WEEKLY_DRIVING_MAX_HOURS) lines.push(`${p.name}: haftada ${fmtHours(weekly)} direksiyon (sınır 56 saat)`);
    return lines;
  });
  add("driving", "critical", "Sürüş süresi sınırı aşılıyor (AETR)", driving);

  const restricted = working.filter(p => p.nights > 0 && p.nightRestriction);
  add("night-restriction", "critical", `${restricted.length} kişi gece çalışma engeline rağmen gece vardiyasında`,
    restricted.map(p => `${p.name}: ${NIGHT_RESTRICTION[p.nightRestriction!] ?? p.nightRestriction}. İş Kanunu m.73 gereği gece çalıştırılamaz`));

  const nightWeeks = working.filter(p => p.nights > 0 && p.workedNightLastWeek && !p.nightRestriction);
  add("night-weeks", "critical", `${nightWeeks.length} kişi arka arkaya ikinci hafta gece çalışıyor`,
    nightWeeks.map(p => `${p.name}: geçen hafta da gece çalıştı (Postalar Yönetmeliği m.8)`));

  const skillGaps = snap.coverage.filter(c => c.missingSkills.length > 0);
  add("skill-gap", "critical", `${skillGaps.length} vardiyada zorunlu rol eksik`,
    skillGaps.map(c => `${DAY_NAMES[c.day]} ${c.shiftName}: ${c.missingSkills.map(m => `${m.need} ${m.skill} gerekli, ${m.have} var`).join("; ")}`));

  const short = snap.coverage.filter(c => c.demand !== null && c.assigned < c.demand);
  add("understaffed", "critical",
    `${short.length} vardiyada toplam ${short.reduce((s, c) => s + (c.demand! - c.assigned), 0)} kişi eksik`,
    short.map(c => `${DAY_NAMES[c.day]} ${c.shiftName}: ${c.assigned}/${c.demand}`));

  if (rules.nightLegalWarning) {
    const long = [...new Set(working.flatMap(p => p.shifts.filter(s => s.night && s.hours > 7.5).map(s => s.hours)))];
    add("long-night", "critical", "Gece vardiyası yasal 7,5 saat sınırını aşıyor",
      long.map(h => `${fmtHours(h)} süren gece vardiyası var (Postalar Yönetmeliği)`));
  }

  if (budgets.labor && budgets.labor.budget > 0 && budgets.labor.total > budgets.labor.budget) {
    add("labor-budget", "critical", "Haftalık işçilik maliyeti bütçeyi aşıyor",
      [`₺${budgets.labor.total.toLocaleString("tr-TR")} planlandı, bütçe ₺${budgets.labor.budget.toLocaleString("tr-TR")}`]);
  }
  if (budgets.overtime && budgets.overtime.budgetHours > 0) {
    const totalOT = working.reduce((s, p) => s + Math.max(0, p.hours - budgets.overtime!.thresholdHours), 0);
    if (totalOT > budgets.overtime.budgetHours) {
      add("overtime-budget", "critical", "Haftalık fazla mesai bütçesi aşılıyor",
        [`Toplam ${fmtHours(Math.round(totalOT * 10) / 10)} fazla mesai, bütçe ${fmtHours(budgets.overtime.budgetHours)}`]);
    }
  }

  // ── Uyarı: kapsama, yük, yorgunluk, tercih, adalet ───────────────────────
  // İhtiyaç tablosu boşken "eksik kişi" hesaplanamaz; hafta boyu hiç kimse yazılmamış vardiya yine de görünsün
  if (!snap.hasDemand) {
    const byShift = new Map<string, { name: string; total: number }>();
    for (const c of snap.coverage) {
      const row = byShift.get(c.shiftId) ?? { name: c.shiftName, total: 0 };
      row.total += c.assigned;
      byShift.set(c.shiftId, row);
    }
    const unused = [...byShift.values()].filter(r => r.total === 0);
    add("shift-unused", "warning", `${unused.length} vardiyaya hafta boyunca kimse yazılmamış`, [
      ...unused.map(r => `${r.name}: 7 günün hiçbirinde kimse yok`),
      ...(unused.length ? ["Her vardiyaya kaç kişi gerektiğini ihtiyaç tablosuna girerseniz plan buna göre kurulur"] : []),
    ]);
  }


  const clopening = per(p => p.restGaps.filter(g => g.hours >= rules.minRestHours && g.hours < rules.clopeningMinRestHours),
    (n, gs) => `${n}: ${gs.map(g => `${gap(g)} ${fmtHours(g.hours)}`).join(", ")}${gs.length >= 2 ? ". Yorgunluk riski yüksek" : ""}`);
  add("clopening", "warning", `${clopening.length} kişide kapanıştan açılışa geçiş var (${rules.clopeningMinRestHours} saat dinlenme önerilir)`, clopening);

  const streak = working.filter(p => p.longestStreak > rules.maxConsecutiveDays);
  add("streak", "warning", `${streak.length} kişi üst üste ${rules.maxConsecutiveDays} günden fazla çalışıyor`,
    streak.map(p => `${p.name}: ${p.longestStreak} gün üst üste`));

  // Kaza Risk Radarı'yla aynı eşik: üst üste 3 gece kritik sayılır
  const nightStreak = working.filter(p => p.nightStreak >= 3);
  add("night-streak", "warning", `${nightStreak.length} kişi üst üste 3 ya da daha fazla gece çalışıyor`,
    nightStreak.map(p => `${p.name}: üst üste ${p.nightStreak} gece`));

  // Güvenilirlik: son haftalarda gelmeyen/geç kalan kişinin vardiyaları (yedek düşünülebilir)
  if (budgets.unreliable) {
    const risky = working.filter(p => budgets.unreliable![p.id]).map(p =>
      `${p.name} (${budgets.unreliable![p.id].replace(/^Son/, "son")}): ${p.shifts.map(x => `${DAY_SHORT[x.day]} ${x.shiftName}`).join(", ")}`);
    add("reliability", "warning", `${risky.length} kişinin vardiyalarında gelmeme riski var`, risky);
  }

  const prefNot = per(p => p.preferredNotDays, (n, d) => `${n}: ${dayList(d)}`);
  add("preferred-not", "warning", `${prefNot.length} kişi "Esnek" işaretlediği gün vardiyada`, prefNot);

  // Adalet: zaten çok yüklü olan ortalamadan belirgin fazla zor vardiya almış, az yüklüler daha az almış
  const heavy = working.filter(p => p.loadRatio > 1.2 && p.hardShifts >= 2 && p.hardShifts >= snap.avgHard + 1);
  const light = snap.people.filter(p => p.loadRatio < 0.8 && p.hardShifts < snap.avgHard);
  if (heavy.length > 0 && light.length > 0) {
    add("fairness", "warning", "Zor vardiyalar zaten yüklü kişilere gitmiş", [
      ...heavy.map(p => `${p.name}: Adalet Puanı yüksek, bu hafta ${p.hardShifts} zor vardiya`),
      `Daha az yüklü olanlar: ${nameList(light.map(p => `${p.name} (${p.hardShifts})`), 4)}`,
    ]);
  }

  return out;
}
