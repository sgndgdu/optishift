// İşletmenin saat dilimi. Sunucu (Vercel) UTC çalışır; "bugün", "haftanın günü" ve
// "hafta başı" her zaman Türkiye saatine göre hesaplanmalı, yoksa 00:00-03:00
// arasında önceki günün (Pazartesi gecesi önceki haftanın) vardiyası aranır.
export const BUSINESS_TZ = "Europe/Istanbul";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TZ,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hourCycle: "h23",
});

function wallParts(at: Date) {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFmt.formatToParts(at)) {
    if (type !== "literal") p[type] = Number(value);
  }
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// YYYY-MM-DD tarihine n gün ekler (saat diliminden bağımsız takvim aritmetiği)
export function addDays(dateStr: string, n: number): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// YYYY-MM-DD için gün indeksi, 0 = Pazartesi … 6 = Pazar
export function dayIndexOf(dateStr: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7;
}

// YYYY-MM-DD'nin içinde bulunduğu haftanın Pazartesi'si
export function weekStartOf(dateStr: string): string {
  return addDays(dateStr, -dayIndexOf(dateStr));
}

// Türkiye saatine göre bugünün tarihi (YYYY-MM-DD)
export function businessToday(at: Date = new Date()): string {
  const p = wallParts(at);
  return ymd(p.year, p.month, p.day);
}

// Türkiye saatine göre bugün: tarih, gün indeksi (0 = Pzt) ve hafta başı
export function businessNow(at: Date = new Date()): { date: string; dayIdx: number; weekStart: string } {
  const date = businessToday(at);
  return { date, dayIdx: dayIndexOf(date), weekStart: weekStartOf(date) };
}

// Türkiye saatiyle "YYYY-MM-DD HH:MM" anını gerçek bir Date'e çevirir
export function businessWallTime(dateStr: string, hhmm: string): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const p = wallParts(new Date(guess));
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess;
  return new Date(guess - offset);
}

// Haftanın başlangıcını (Pazartesi, Türkiye saatine göre) verir — YYYY-MM-DD
export function getWeekStart(offsetWeeks = 0): string {
  return addDays(businessNow().weekStart, offsetWeeks * 7);
}

// Verilen Date'den haftanın başlangıcını verir
export function getWeekStartFromDate(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// YYYY-MM-DD tarihine n hafta ekler
export function addWeeks(dateStr: string, n: number): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const date = new Date(y, mo - 1, d + n * 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function timeAgo(ts: number | null): string {
  if (!ts) return "";
  const diff = Date.now() - ts * 1000;
  const minutes = Math.floor(diff / 60000);
  const hours   = Math.floor(diff / 3600000);
  const days    = Math.floor(diff / 86400000);
  if (minutes < 1) return "Az önce";
  if (hours   < 1) return `${minutes} dakika önce`;
  if (hours   < 24) return `${hours} saat önce`;
  return `${days} gün önce`;
}
