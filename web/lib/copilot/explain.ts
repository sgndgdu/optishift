/**
 * "Neden bu kişi bu vardiyada?" — hücre açıklaması (saf, haftanın snapshot'ından).
 * Motorun iç kararını değil, müdürün doğrulayabileceği gerçekleri söyler: korunma,
 * uygunluk, rol, adalet sırası, saat ve dinlenme, ihtiyaç, o gün boşta kalanlar.
 * Olumlu gerekçeler "ok", dikkat edilecekler "warn" tonunda döner.
 */

import { DAY_NAMES } from "@/lib/constants";
import type { WeekSnapshot } from "./snapshot";

export interface ExplainLine { tone: "ok" | "warn" | "info"; text: string }

export interface ExplainExtras {
  pinned?: boolean;
  /** Çalışma döngüsünde o günün durumu */
  cycleState?: "W" | "D" | "N" | "O" | null;
  /** Vardiya tanımının zorunlu rolleri */
  requiredRoles?: string[];
}

const fmt = (h: number) => `${Math.round(h * 10) / 10}`.replace(".", ",");

export function explainAssignment(snap: WeekSnapshot, personId: string, day: number, extras: ExplainExtras = {}): ExplainLine[] {
  const p = snap.people.find(x => x.id === personId);
  if (!p) return [];
  const shift = p.shifts.find(s => s.day === day);
  const out: ExplainLine[] = [];

  if (extras.pinned) out.push({ tone: "info", text: "Elle düzenlendi; yeniden oluşturmada korunuyor" });

  // Uygunluk
  if (p.onLeaveDays.includes(day)) out.push({ tone: "warn", text: "Bu gün izinli" });
  else if (p.unavailableDays.includes(day)) out.push({ tone: "warn", text: "Bu gün için \"gelemem\" demiş" });
  else if (p.preferredNotDays.includes(day)) out.push({ tone: "warn", text: "Bu günü tercih etmiyor (gerekirse gelir)" });
  else if (p.hasAvailability) out.push({ tone: "ok", text: "Bu gün için uygun olduğunu girmiş" });
  else out.push({ tone: "info", text: "Uygunluk girmemiş; tamamen uygun sayıldı" });

  // Çalışma döngüsü
  if (extras.cycleState === "O") out.push({ tone: "warn", text: "Çalışma döngüsüne göre dinlenme günü" });
  else if (extras.cycleState) out.push({ tone: "ok", text: "Çalışma döngüsünde çalışma günü" });

  // Rol
  const needed = (extras.requiredRoles ?? []).filter(r => p.roles.includes(r));
  if (needed.length) out.push({ tone: "ok", text: `Vardiyanın gerektirdiği rolü taşıyor: ${needed.join(", ")}` });

  // Adalet
  const pct = Math.round(p.loadRatio * 100);
  if (p.loadRatio < 0.9) out.push({ tone: "ok", text: `Son haftalarda ekibe göre daha az yük almış (ortalamanın %${pct}'i)` });
  else if (p.loadRatio > 1.2) out.push({ tone: "warn", text: `Son haftalarda ekip ortalamasından fazla yük almış (%${pct})` });
  else out.push({ tone: "info", text: "Yükü ekip ortalamasında" });

  // Saat ve dinlenme
  if (p.hours > p.maxHours) out.push({ tone: "warn", text: `Bu hafta ${fmt(p.hours)} saat, sınır ${fmt(p.maxHours)} saat` });
  else out.push({ tone: "ok", text: `Bu hafta ${fmt(p.hours)} saat çalışıyor, sınırı (${fmt(p.maxHours)}) aşmıyor` });
  const gap = p.restGaps.find(g => g.toDay === day);
  if (gap) {
    const tone = gap.hours < snap.rules.minRestHours ? "warn" : "ok";
    out.push({ tone, text: `Önceki vardiyasından ${fmt(gap.hours)} saat sonra başlıyor` });
  }

  // İhtiyaç
  if (shift) {
    const cov = snap.coverage.find(c => c.day === day && c.shiftId === shift.shiftId);
    if (cov?.demand != null && cov.demand > 0) {
      out.push({ tone: cov.assigned > cov.demand ? "warn" : "info", text: `${DAY_NAMES[day]} ${shift.shiftName}: ${cov.assigned}/${cov.demand} kişi` });
    }
  }

  // O gün boşta kalanlar (alternatif)
  const free = snap.people.filter(x => x.id !== personId && x.freeDays.includes(day));
  if (free.length) {
    const lighter = free.filter(x => x.loadRatio < p.loadRatio);
    const names = free.slice(0, 3).map(x => x.name).join(", ");
    out.push({
      tone: lighter.length ? "warn" : "info",
      text: lighter.length
        ? `O gün boşta ve daha az yüklü: ${lighter.slice(0, 3).map(x => x.name).join(", ")}`
        : `O gün boşta: ${names}${free.length > 3 ? ` +${free.length - 3}` : ""}`,
    });
  }
  return out;
}
