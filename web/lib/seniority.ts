/**
 * Kıdemli personel TEK KAYNAĞI: işe giriş tarihinden türetilir, elle işaretlenmez.
 * "Kıdemli Personel Kuralı" (rules.ensure_senior_per_shift) açıksa motor her vardiyada en az
 * bir kıdemli bulundurmaya çalışır. İşe giriş tarihi girilmemiş kişi kıdemli sayılmaz.
 */
export const SENIOR_AFTER_YEARS = 1;

/** hireDate ve today "YYYY-MM-DD" */
export function isSenior(hireDate: string | null | undefined, today: string): boolean {
  if (!hireDate || !/^\d{4}-\d{2}-\d{2}/.test(hireDate)) return false;
  const [y, m, d] = hireDate.slice(0, 10).split("-").map(Number);
  const threshold = `${String(y + SENIOR_AFTER_YEARS).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return threshold <= today;
}
