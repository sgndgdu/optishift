/**
 * Türkiye takvimi: plan haftasındaki özel günler. TEK KAYNAK (saf, tarayıcıda da çalışır).
 * Resmî tatiller lib/holidays'ten; burada arife (yarım gün), Ramazan ayı, okul tatilleri (MEB takvimi) ve
 * ticari özel günler eklenir. Notlar sektöre göre seçilir; yoğunluk için kesin sayı iddia edilmez,
 * işletmenin kendi geçmişi lib/weekCalendar'da ayrıca karşılaştırılır.
 */
import { TURKISH_HOLIDAYS } from "@/lib/holidays";

export type SpecialDayKind = "holiday" | "half_holiday" | "ramadan" | "school_break" | "commercial";
export type SpecialDay = { date: string; name: string; kind: SpecialDayKind; note: string };

// Ramazan ayı (ilk oruç günü - bayramdan önceki gün, Diyanet takvimi)
const RAMADAN: { start: string; end: string }[] = [
  { start: "2025-03-01", end: "2025-03-29" },
  { start: "2026-02-19", end: "2026-03-19" },
  { start: "2027-02-08", end: "2027-03-08" },
];

// MEB çalışma takvimi: okulların kapalı olduğu dönemler (hafta sonları dahil tam aralık)
const SCHOOL_BREAKS: { start: string; end: string; name: string }[] = [
  { start: "2025-06-28", end: "2025-09-07", name: "Okulların yaz tatili" },
  { start: "2025-11-08", end: "2025-11-16", name: "Okulların kasım ara tatili" },
  { start: "2026-01-17", end: "2026-02-01", name: "Okulların yarıyıl tatili" },
  { start: "2026-03-14", end: "2026-03-22", name: "Okulların mart ara tatili" },
  { start: "2026-06-27", end: "2026-09-13", name: "Okulların yaz tatili" },
  { start: "2026-11-14", end: "2026-11-22", name: "Okulların kasım ara tatili" },
  { start: "2027-01-23", end: "2027-02-07", name: "Okulların yarıyıl tatili" },
  { start: "2027-03-06", end: "2027-03-14", name: "Okulların mart ara tatili" },
  { start: "2027-06-26", end: "2027-09-12", name: "Okulların yaz tatili" },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDaysIso = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
/** Ayın n. haftanın gün'ü (0=Pazar) */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCDate(d.getUTCDate() + 7 * (n - 1));
  return iso(d);
}

type Commercial = { date: string; name: string; notes: Partial<Record<string, string>> };
function commercialDays(year: number): Commercial[] {
  const food = "Restoran ve kafelerde akşam yoğunluğu genelde artar.";
  return [
    { date: `${year}-02-14`, name: "Sevgililer Günü", notes: { hospitality: food, retail: "Hediye alışverişi önceki günlerde artar." } },
    { date: nthWeekday(year, 5, 0, 2), name: "Anneler Günü", notes: { hospitality: "Öğle ve akşam yemeklerinde yoğunluk genelde artar.", retail: "Hediye alışverişi önceki hafta artar." } },
    { date: nthWeekday(year, 6, 0, 3), name: "Babalar Günü", notes: { hospitality: food, retail: "Hediye alışverişi önceki hafta artar." } },
    { date: `${year}-11-24`, name: "Öğretmenler Günü", notes: { retail: "Hediye alışverişi önceki günlerde artar." } },
    { date: addDaysIso(nthWeekday(year, 11, 4, 4), 1), name: "Kasım indirim günü (Black Friday)", notes: { retail: "Mağaza ve internet siparişlerinde yoğunluk genelde artar.", logistics: "Sonraki günlerde gönderi sayısı genelde artar." } },
    { date: `${year}-12-31`, name: "Yılbaşı gecesi", notes: { hospitality: "Akşam ve gece yoğunluğu genelde artar.", retail: "Gün içinde alışveriş artar, akşam erken kapanış olabilir." } },
  ];
}

const HOLIDAY_PAY = "Bu gün çalışan kişiye günlük ücretine ek olarak bir günlük ücret ödenir (İş Kanunu m.47).";

/** Aralıktaki özel günler (tarih sırasıyla). industry: lib/templates sektör anahtarı (hospitality, retail…) */
export function specialDaysInRange(start: string, end: string, industry?: string | null): SpecialDay[] {
  const out: SpecialDay[] = [];
  const within = (d: string) => d >= start && d <= end;

  for (const h of TURKISH_HOLIDAYS) {
    if (!within(h.date)) continue;
    const note = h.isReligious && industry === "hospitality"
      ? `Resmî tatil. Bayramda yoğunluk işletmeye göre çok değişir: tatil bölgesinde artar, iş merkezinde azalır. ${HOLIDAY_PAY}`
      : `Resmî tatil. ${HOLIDAY_PAY}`;
    out.push({ date: h.date, name: h.name, kind: "holiday", note });
  }
  // Arife: dini bayramlardan ve Cumhuriyet Bayramı'ndan önceki gün öğleden sonra resmî tatil
  const firstDays = TURKISH_HOLIDAYS.filter(h => /1\. Gün$/.test(h.name) || h.name === "Cumhuriyet Bayramı");
  for (const h of firstDays) {
    const arife = addDaysIso(h.date, -1);
    if (!within(arife)) continue;
    const bayram = h.name.replace(/ 1\. Gün$/, "");
    out.push({
      date: arife, name: `${bayram} arifesi`, kind: "half_holiday",
      note: `Öğleden sonra (13.00'ten itibaren) resmî tatil. Öğleden sonra çalışan kişiye o saatler için ek ücret ödenir.${industry === "retail" ? " Bayram öncesi alışveriş genelde arifeye kadar artar." : ""}`,
    });
  }
  for (const r of RAMADAN) {
    if (r.end < start || r.start > end) continue;
    const note = industry === "hospitality"
      ? "İftar vaktinde yoğunluk artar, öğlen sakinleşebilir. Akşam vardiyasını iftardan önce başlatmayı düşünün."
      : "Çalışma saatlerinde değişiklik isteyen olabilir (sahur, iftar).";
    out.push({ date: r.start < start ? start : r.start, name: `Ramazan ayı (${r.start.slice(8)}.${r.start.slice(5, 7)} - ${r.end.slice(8)}.${r.end.slice(5, 7)})`, kind: "ramadan", note });
  }
  for (const b of SCHOOL_BREAKS) {
    if (b.end < start || b.start > end) continue;
    const note = industry === "hospitality"
      ? "Aileler tatilde: kafe, restoran ve otellerde gündüz yoğunluğu genelde artar. Öğrenci ekip üyeleri daha çok gün çalışmak isteyebilir."
      : industry === "retail"
      ? "Alışveriş merkezlerinde gündüz yoğunluğu genelde artar. Çocuklu ekip üyeleri izin isteyebilir."
      : "Çocuklu ekip üyeleri izin isteyebilir.";
    out.push({ date: b.start < start ? start : b.start, name: b.name, kind: "school_break", note });
  }
  const years = [...new Set([start.slice(0, 4), end.slice(0, 4)])].map(Number);
  for (const y of years) for (const c of commercialDays(y)) {
    if (!within(c.date)) continue;
    const note = (industry && c.notes[industry]) || "";
    if (!note) continue; // sektörü ilgilendirmeyen gün yazılmaz
    out.push({ date: c.date, name: c.name, kind: "commercial", note });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

/** Geçmişteki aynı özel gün (ör. geçen yılın Cumhuriyet Bayramı ya da bir önceki Kurban Bayramı 1. günü) */
export function previousOccurrence(day: SpecialDay): string | null {
  if (day.kind === "holiday") {
    const base = day.name;
    const prev = TURKISH_HOLIDAYS.filter(h => h.name === base && h.date < day.date).map(h => h.date).sort();
    return prev.length ? prev[prev.length - 1] : null;
  }
  if (day.kind === "half_holiday") {
    const bayram = day.name.replace(/ arifesi$/, "");
    const firsts = TURKISH_HOLIDAYS.filter(h => (h.name === `${bayram} 1. Gün` || h.name === bayram) && addDaysIso(h.date, -1) < day.date).map(h => h.date).sort();
    return firsts.length ? addDaysIso(firsts[firsts.length - 1], -1) : null;
  }
  if (day.kind === "commercial") {
    const y = Number(day.date.slice(0, 4)) - 1;
    return commercialDays(y).find(c => c.name === day.name)?.date ?? null;
  }
  return null;
}
