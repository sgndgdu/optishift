/**
 * Yıllık izin motoru — TEK KAYNAK.
 *
 * Felsefe prev_score / ytd_overtime_hours ile aynı: kalan izin TÜRETİLMİŞ bir
 * değerdir, hiçbir yerde elle artırılıp azaltılmaz. Girdiler: işe giriş tarihi,
 * onaylı yıllık izinler, elle düzeltme günü (personnel.leave_adjustment_days).
 *
 * İki mod (rules.auto_leave_entitlement_enabled):
 *  - SABİT (varsayılan, eski davranış): yıllık hak = personnel.annual_leave_days_total;
 *    kullanılan = içinde bulunulan TAKVİM yılının onaylı yıllık izinleri.
 *  - KIDEME GÖRE (İş K. m.53): her hizmet yıldönümünde o yılın hakkı eklenir
 *    (1-5 yıl→14, 5+→20, 15+→26; 18 yaş altı için min 20); kullanılmayan
 *    otomatik devreder (kümülatif model: toplam hak − toplam kullanım).
 *
 * Gün sayımı (İş K. m.56): izin aralığına rastlayan hafta tatili izinden
 * sayılmaz — kişinin sabit izin günü, yoksa Pazar düşülür.
 */

export interface ApprovedLeave {
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
}

export interface LeaveBalanceInput {
  hireDate?: string | null;            // YYYY-MM-DD
  today?: Date;
  autoEntitlement: boolean;            // rules.auto_leave_entitlement_enabled
  fixedAnnualDays: number;             // personnel.annual_leave_days_total (sabit mod hakkı)
  adjustmentDays?: number;             // personnel.leave_adjustment_days (± elle düzeltme)
  weeklyOffDay?: number | null;        // 0=Pzt … 6=Paz; null → Pazar
  isMinor?: boolean;                   // 18 yaş altı → hak en az 20 gün (m.53)
  approvedAnnualLeaves: ApprovedLeave[];
}

export interface LeaveBalance {
  mode: "fixed" | "seniority";
  seniorityYears: number;              // tam hizmet yılı
  entitledTotal: number;               // bugüne kadar hak edilen (mod'a göre yıllık ya da kümülatif)
  usedDays: number;
  adjustmentDays: number;
  remaining: number;
  nextAccrualDate: string | null;      // bir sonraki hak ediş (yıldönümü) — sabit modda yılbaşı
}

/** İş K. m.53 — kıdeme göre yıllık ücretli izin hakkı (gün) */
export function entitledDaysForServiceYear(completedYears: number, isMinor = false): number {
  if (completedYears < 1) return 0;
  let days: number;
  if (completedYears >= 15) days = 26;
  else if (completedYears > 5) days = 20;
  else days = 14; // 1-5 yıl (5 dahil)
  if (isMinor && days < 20) days = 20;
  return days;
}

/** İzin aralığındaki fiilî izin günü sayısı — hafta tatili (m.56) düşülür. */
export function countLeaveDays(startDate: string, endDate: string, weeklyOffDay?: number | null): number {
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  // 0=Pzt…6=Paz projede kullanılan indeks; JS getUTCDay: 0=Paz
  const offIdx = weeklyOffDay !== null && weeklyOffDay !== undefined && weeklyOffDay >= 0 && weeklyOffDay <= 6
    ? weeklyOffDay
    : 6; // varsayılan hafta tatili: Pazar
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dayIdx = (cur.getUTCDay() + 6) % 7; // 0=Pzt…6=Paz
    if (dayIdx !== offIdx) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

/** Tam hizmet yılı (yıldönümü geçtiyse sayılır) */
export function seniorityYears(hireDate: string, today: Date): number {
  const hire = new Date(hireDate + "T00:00:00Z");
  if (Number.isNaN(hire.getTime()) || hire > today) return 0;
  let years = today.getUTCFullYear() - hire.getUTCFullYear();
  const anniv = new Date(hire);
  anniv.setUTCFullYear(hire.getUTCFullYear() + years);
  if (anniv > today) years--;
  return Math.max(0, years);
}

export function computeLeaveBalance(input: LeaveBalanceInput): LeaveBalance {
  const today = input.today ?? new Date();
  const adjustment = input.adjustmentDays ?? 0;
  const sYears = input.hireDate ? seniorityYears(input.hireDate, today) : 0;

  const usedInRange = (from?: Date) =>
    input.approvedAnnualLeaves
      .filter(l => !from || new Date(l.start_date + "T00:00:00Z") >= from)
      .reduce((sum, l) => sum + countLeaveDays(l.start_date, l.end_date, input.weeklyOffDay), 0);

  if (input.autoEntitlement && input.hireDate) {
    // Kümülatif model: her tamamlanan hizmet yılı, o yılın hakkını ekler; devir otomatik
    let entitled = 0;
    for (let y = 1; y <= sYears; y++) {
      entitled += entitledDaysForServiceYear(y, input.isMinor);
    }
    const used = usedInRange(); // işe girişten beri tüm onaylı yıllık izinler
    const hire = new Date(input.hireDate + "T00:00:00Z");
    const nextAnniv = new Date(hire);
    nextAnniv.setUTCFullYear(hire.getUTCFullYear() + sYears + 1);
    return {
      mode: "seniority",
      seniorityYears: sYears,
      entitledTotal: entitled,
      usedDays: used,
      adjustmentDays: adjustment,
      remaining: entitled + adjustment - used,
      nextAccrualDate: nextAnniv.toISOString().split("T")[0],
    };
  }

  // Sabit mod: bu takvim yılının kullanımı, sabit yıllık hakka karşı
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const used = usedInRange(yearStart);
  return {
    mode: "fixed",
    seniorityYears: sYears,
    entitledTotal: input.fixedAnnualDays,
    usedDays: used,
    adjustmentDays: adjustment,
    remaining: input.fixedAnnualDays + adjustment - used,
    nextAccrualDate: `${today.getUTCFullYear() + 1}-01-01`,
  };
}

/** leave_requests.type hem Türkçe etiket hem eski kod değeriyle kaydedilmiş olabilir */
export function isAnnualLeaveType(type?: string | null): boolean {
  if (!type) return false;
  const t = type.toLocaleLowerCase("tr-TR");
  return t.includes("yıllık") || t === "annual";
}
