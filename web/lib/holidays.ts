export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  isReligious?: boolean;
}

// Türkiye Resmi Tatil Günleri — 2025-2027
// Dini bayramlar (Ramazan + Kurban) hicri takvime göre her yıl değişir.
const FIXED_HOLIDAYS: Array<{ month: number; day: number; name: string }> = [
  { month: 1,  day: 1,  name: "Yılbaşı" },
  { month: 4,  day: 23, name: "Ulusal Egemenlik ve Çocuk Bayramı" },
  { month: 5,  day: 1,  name: "Emek ve Dayanışma Günü" },
  { month: 5,  day: 19, name: "Atatürk'ü Anma, Gençlik ve Spor Bayramı" },
  { month: 7,  day: 15, name: "Demokrasi ve Milli Birlik Günü" },
  { month: 8,  day: 30, name: "Zafer Bayramı" },
  { month: 10, day: 29, name: "Cumhuriyet Bayramı" },
];

const RELIGIOUS_HOLIDAYS: Holiday[] = [
  // 2025
  { date: "2025-03-30", name: "Ramazan Bayramı 1. Gün",  isReligious: true },
  { date: "2025-03-31", name: "Ramazan Bayramı 2. Gün",  isReligious: true },
  { date: "2025-04-01", name: "Ramazan Bayramı 3. Gün",  isReligious: true },
  { date: "2025-06-06", name: "Kurban Bayramı 1. Gün",   isReligious: true },
  { date: "2025-06-07", name: "Kurban Bayramı 2. Gün",   isReligious: true },
  { date: "2025-06-08", name: "Kurban Bayramı 3. Gün",   isReligious: true },
  { date: "2025-06-09", name: "Kurban Bayramı 4. Gün",   isReligious: true },
  // 2026
  { date: "2026-03-20", name: "Ramazan Bayramı 1. Gün",  isReligious: true },
  { date: "2026-03-21", name: "Ramazan Bayramı 2. Gün",  isReligious: true },
  { date: "2026-03-22", name: "Ramazan Bayramı 3. Gün",  isReligious: true },
  { date: "2026-05-27", name: "Kurban Bayramı 1. Gün",   isReligious: true },
  { date: "2026-05-28", name: "Kurban Bayramı 2. Gün",   isReligious: true },
  { date: "2026-05-29", name: "Kurban Bayramı 3. Gün",   isReligious: true },
  { date: "2026-05-30", name: "Kurban Bayramı 4. Gün",   isReligious: true },
  // 2027
  { date: "2027-03-09", name: "Ramazan Bayramı 1. Gün",  isReligious: true },
  { date: "2027-03-10", name: "Ramazan Bayramı 2. Gün",  isReligious: true },
  { date: "2027-03-11", name: "Ramazan Bayramı 3. Gün",  isReligious: true },
  { date: "2027-05-16", name: "Kurban Bayramı 1. Gün",   isReligious: true },
  { date: "2027-05-17", name: "Kurban Bayramı 2. Gün",   isReligious: true },
  { date: "2027-05-18", name: "Kurban Bayramı 3. Gün",   isReligious: true },
  { date: "2027-05-19", name: "Kurban Bayramı 4. Gün",   isReligious: true },
];

function buildFixedHolidays(years: number[]): Holiday[] {
  const result: Holiday[] = [];
  for (const year of years) {
    for (const h of FIXED_HOLIDAYS) {
      result.push({
        date: `${year}-${String(h.month).padStart(2, "0")}-${String(h.day).padStart(2, "0")}`,
        name: h.name,
      });
    }
  }
  return result;
}

export const TURKISH_HOLIDAYS: Holiday[] = [
  ...buildFixedHolidays([2024, 2025, 2026, 2027]),
  ...RELIGIOUS_HOLIDAYS,
].sort((a, b) => a.date.localeCompare(b.date));

export function getHolidaysForDate(date: string): Holiday[] {
  return TURKISH_HOLIDAYS.filter(h => h.date === date);
}
