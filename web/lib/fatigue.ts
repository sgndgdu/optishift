/**
 * Yorgunluk ve Kaza Risk Radarı — tek kaynak (saf, DB'ye dokunmaz).
 *
 * app/api/fatigue-radar/route.ts (dashboard kartı) ve schedule sayfasının
 * canlı risk ikonu bu fonksiyonu çağırır. Eşikler bilinçli olarak sabit —
 * Ayarlar'dan konfigüre edilebilir değil (kapsamı gereksiz büyütmemek için).
 */
import { isClopeningGap } from "@/lib/fairness";

export interface FatigueDayEntry {
  date: string;       // YYYY-MM-DD
  is_night: boolean;
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
}

export type FatigueRiskLevel = "none" | "warning" | "danger";

export interface FatigueRiskResult {
  riskLevel: FatigueRiskLevel;
  consecutiveNightStreak: number;
  clopeningCountInWindow: number;
  reasons: string[];
}

const NIGHT_STREAK_DANGER = 3;
const NIGHT_STREAK_WARNING = 2;
const CLOPENING_DANGER_COUNT = 2;
const OVERTIME_DANGER_MARGIN_HOURS = 10;
const CLOPENING_MIN_REST_HOURS = 13; // isClopeningGap'in kendi varsayılanıyla aynı

function daysApart(dateA: string, dateB: string): number {
  const a = new Date(dateA + "T00:00:00Z").getTime();
  const b = new Date(dateB + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Bir personelin kronolojik vardiya geçmişinden (yayınlanmış, son ~10 gün)
 * yorgunluk/kaza riski türetir. entries sıralı olmak ZORUNDA değil — fonksiyon
 * kendi sıralar. Takvimde ARADAN GÜN ATLANMIŞSA (izin/off günü) zincir/clopening
 * sayaçları kırılır — sadece gerçekten art arda günler sayılır.
 */
export function computeFatigueRisk(
  entries: FatigueDayEntry[],
  weeklyOvertimeHours: number,
  overtimeThresholdHours: number,
): FatigueRiskResult {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  // Ardışık gece sayacı — en son günden geriye doğru say, zincir kopunca dur.
  let consecutiveNightStreak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (!sorted[i].is_night) break;
    if (i < sorted.length - 1 && daysApart(sorted[i].date, sorted[i + 1].date) !== 1) break;
    consecutiveNightStreak++;
  }

  // Clopening: ardışık günler arasında (araya gün atlanmamış) yasal minimumun
  // üstünde ama clopening eşiğinin altında dinlenme.
  let clopeningCountInWindow = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (daysApart(sorted[i - 1].date, sorted[i].date) !== 1) continue;
    if (isClopeningGap(sorted[i - 1].end_time, sorted[i].start_time, { clopening_min_rest_hours: CLOPENING_MIN_REST_HOURS })) {
      clopeningCountInWindow++;
    }
  }

  const reasons: string[] = [];
  let riskLevel: FatigueRiskLevel = "none";
  const escalate = (level: FatigueRiskLevel) => {
    if (level === "danger") riskLevel = "danger";
    else if (level === "warning" && riskLevel === "none") riskLevel = "warning";
  };

  if (consecutiveNightStreak >= NIGHT_STREAK_DANGER) {
    escalate("danger");
    reasons.push(`Üst üste ${consecutiveNightStreak} gece vardiyası`);
  } else if (consecutiveNightStreak >= NIGHT_STREAK_WARNING) {
    escalate("warning");
    reasons.push(`Üst üste ${consecutiveNightStreak} gece vardiyası`);
  }

  if (clopeningCountInWindow >= CLOPENING_DANGER_COUNT) {
    escalate("danger");
    reasons.push(`Son günlerde ${clopeningCountInWindow} kez yetersiz dinlenmeli geçiş (clopening)`);
  } else if (clopeningCountInWindow === 1) {
    escalate("warning");
    reasons.push("Yetersiz dinlenmeli bir vardiya geçişi (clopening)");
  }

  if (overtimeThresholdHours > 0 && weeklyOvertimeHours > 0) {
    if (weeklyOvertimeHours >= overtimeThresholdHours + OVERTIME_DANGER_MARGIN_HOURS) {
      escalate("danger");
      reasons.push(`Bu hafta ${Math.round(weeklyOvertimeHours)} saat çalıştı (eşik: ${overtimeThresholdHours}s)`);
    } else if (weeklyOvertimeHours >= overtimeThresholdHours) {
      escalate("warning");
      reasons.push(`Bu hafta ${Math.round(weeklyOvertimeHours)} saat çalıştı (eşik: ${overtimeThresholdHours}s)`);
    }
  }

  return { riskLevel, consecutiveNightStreak, clopeningCountInWindow, reasons };
}
