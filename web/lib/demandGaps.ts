/**
 * Yarım dolu ihtiyaç tablosu: tabloda en az bir sayı varken hiç sayı girilmemiş açık günler.
 * Motor bu günlerde "ihtiyaç yok" değil "herkesi yaz" gibi davranır (coverage-max), bu yüzden
 * plan oluşturmadan önce uyarılır ve tek dokunuşla doldurulması önerilir.
 */
export type DemandRows = Record<string, Record<string | number, number>>;

export function demandGapDays(matrix: DemandRows | undefined, skipDays: number[] = []): number[] {
  const rows = Object.values(matrix ?? {});
  const dayTotal = (d: number) => rows.reduce((s, r) => s + (Number(r?.[d]) || 0), 0);
  const days = [0, 1, 2, 3, 4, 5, 6];
  if (!days.some(d => dayTotal(d) > 0)) return [];
  return days.filter(d => !skipDays.includes(d) && dayTotal(d) === 0);
}

/** Her satırda ilk girilen sayıyı boş günlere kopyalar (atlanacak günler boş kalır). */
export function fillAllRows(matrix: DemandRows, skipDays: number[] = []): DemandRows {
  const out: DemandRows = {};
  for (const [id, row] of Object.entries(matrix ?? {})) {
    const first = [0, 1, 2, 3, 4, 5, 6].map(d => Number(row?.[d]) || 0).find(v => v > 0);
    out[id] = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => {
      const v = Number(row?.[d]) || 0;
      return [d, v > 0 || !first || skipDays.includes(d) ? v : first];
    }));
  }
  return out;
}
