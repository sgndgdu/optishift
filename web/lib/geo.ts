/** İki koordinat arası mesafeyi metre cinsinden hesaplar (Haversine formülü). */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Dünya yarıçapı, metre
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export type GeocodeHit = { name: string; admin1?: string; admin2?: string; country?: string; latitude: number; longitude: number };

const trLower = (s: string) => s.toLocaleLowerCase("tr-TR").trim();

/**
 * "İzmir, Bornova" gibi bir aramada en uygun sonucu seçer (saf fonksiyon, test edilebilir).
 * Open-Meteo virgüllü sorguyu tanımıyor ve "Kadıköy" gibi yaygın adlarda başka ildeki
 * bir köyü ilk sıraya koyabiliyor; bu yüzden ilçe aranır, sonuçlardan ili tutan seçilir.
 */
export function pickGeocodeHit(hits: GeocodeHit[], context: string[]): GeocodeHit | null {
  if (!hits.length) return null;
  const ctx = context.map(trLower).filter(Boolean);
  if (ctx.length) {
    const match = hits.find(h => [h.admin1, h.admin2, h.name].some(v => v && ctx.includes(trLower(v))));
    if (match) return match;
  }
  return hits[0];
}

/** Serbest metin konumu koordinata çevirir: "Şehir, ilçe", "ilçe, şehir" ya da tek ad. */
export async function geocodePlace(query: string): Promise<(GeocodeHit & { label: string }) | null> {
  const parts = query.split(",").map(p => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const search = async (name: string): Promise<GeocodeHit[]> => {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=tr&format=json`);
    const d = await r.json();
    return Array.isArray(d.results) ? d.results : [];
  };
  // Önce en belirgin parça (genelde ilçe, sonda), bulunamazsa diğer parçalar
  for (const part of [...parts].reverse()) {
    const hit = pickGeocodeHit(await search(part), parts.filter(p => p !== part));
    if (hit) return { ...hit, label: [hit.name, hit.admin1, hit.country].filter(Boolean).join(", ") };
  }
  return null;
}
