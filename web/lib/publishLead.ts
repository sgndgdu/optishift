/**
 * Erken Yayın göstergesi: planın hafta başlamadan kaç gün önce yayınlandığı (ortalama).
 * "0,1 gün" gibi ham ondalıklar yerine müdürün tek bakışta anlayacağı dil.
 * Kaynak: GET /api/schedule/publish-stats (avg_lead_days; negatif = hafta başladıktan sonra).
 */
export function formatPublishLead(days: number | null): { short: string; sentence: string | null; tone: "good" | "ok" | "late" | "none" } {
  if (days === null) return { short: "—", sentence: null, tone: "none" };
  // Tek kural: hafta başladıktan sonra yayın = geç; son 3 gün içinde = dikkat; daha önce = iyi
  const tone = days < 0 ? "late" : days >= 3 ? "good" : "ok";
  if (days >= 1) {
    const n = Math.round(days);
    return { short: `${n} gün önce`, sentence: `Planlar ortalama ${n} gün önceden yayınlanıyor`, tone };
  }
  if (days >= 0) return { short: "son gün", sentence: "Planlar genellikle hafta başlamadan hemen önce yayınlanıyor", tone };
  return { short: "geç", sentence: "Planlar genellikle hafta başladıktan sonra yayınlanıyor", tone };
}
