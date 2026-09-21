/**
 * KPI/istatistik kartlarının ikon+zemin rengi için tek anlam haritası
 * (bkz. Claude Design "OptiShift Design System" → Kararlar #5). Önceden her
 * kart kendi rastgele rengini taşıyordu (turuncu/mavi/yeşil karışık, anlamsız).
 *
 * forest = nötr sayaç · attention = dikkat/bekleyen · danger = sorun/gecikme ·
 * positive = olumlu/yolunda gösterge.
 */
export type KpiTone = "neutral" | "attention" | "danger" | "positive";

const KPI_TONE_CLASSES: Record<KpiTone, { bg: string; color: string }> = {
  neutral:   { bg: "bg-forest-100",  color: "text-forest-600" },
  attention: { bg: "bg-amber-100",   color: "text-amber-600" },
  danger:    { bg: "bg-red-100",     color: "text-red-600" },
  positive:  { bg: "bg-emerald-100", color: "text-emerald-600" },
};

export function kpiToneClasses(tone: KpiTone): { bg: string; color: string } {
  return KPI_TONE_CLASSES[tone];
}
