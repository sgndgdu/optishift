// Haftanın başlangıcını (Pazartesi) verir — YYYY-MM-DD
export function getWeekStart(offsetWeeks = 0): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7) + offsetWeeks * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
