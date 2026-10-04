/** Sayıları Türkçe biçimde yazar: 3513.5 → "3.513,5" (en fazla 1 ondalık). Ekranda saat/puan/tutar için. */
export function trNum(n: number | null | undefined, digits = 1): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("tr-TR", { maximumFractionDigits: digits });
}
