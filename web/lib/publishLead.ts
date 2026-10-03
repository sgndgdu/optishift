/**
 * Erken Yayın göstergesi: planın hafta başlamadan kaç gün önce yayınlandığı (ortalama).
 * "0,1 gün" gibi ham ondalıklar yerine müdürün tek bakışta anlayacağı dil.
 * Kaynak: GET /api/schedule/publish-stats (avg_lead_days; negatif = hafta başladıktan sonra).
 */
export function formatPublishLead(days: number | null): { short: string; sentence: string | null; tone: "good" | "ok" | "late" | "none" } {
  if (days === null) return { short: "—", sentence: null, tone: "none" };
  const tone = days >= 7 ? "good" : days >= 3 ? "ok" : "late";
  if (days >= 1) {
    const n = Math.round(days);
    return { short: `${n} gün önce`, sentence: `Planlar ortalama ${n} gün önceden yayınlanıyor`, tone };
  }
  if (days >= 0) return { short: "Son gün yayın", sentence: "Planlar genellikle hafta başlamadan hemen önce yayınlanıyor", tone };
  return { short: "Geç", sentence: "Planlar genellikle hafta başladıktan sonra yayınlanıyor", tone };
}
