/**
 * Şubenin çalışma saatlerini tek satırlık özete çevirir (Ayarlar → Temel).
 * Aynı saatlere sahip ardışık günler gruplanır: "Pzt-Cum 09:00-22:00 · Cmt 10:00-23:00 · Paz kapalı".
 * Girilmemiş gün, Ayarlar'daki varsayılanla aynı: açık, 00:00-23:59.
 */

import { DAY_SHORT } from "@/lib/constants";

export type DayHours = { isOpen: boolean; open: string; close: string };

const DEFAULT: DayHours = { isOpen: true, open: "00:00", close: "23:59" };

export function summarizeOperatingHours(hours: Record<number | string, Partial<DayHours> | undefined> | null | undefined): string {
  const days: DayHours[] = Array.from({ length: 7 }, (_, d) => ({ ...DEFAULT, ...(hours?.[d] ?? {}) }));
  const key = (h: DayHours) => (h.isOpen ? `${h.open}-${h.close}` : "kapalı");
  const label = (h: DayHours) => {
    if (!h.isOpen) return "kapalı";
    return h.open === "00:00" && (h.close === "23:59" || h.close === "24:00") ? "24 saat açık" : `${h.open}-${h.close}`;
  };

  if (days.every(h => key(h) === key(days[0]))) {
    return days[0].isOpen ? `Her gün ${label(days[0])}` : "Her gün kapalı";
  }

  const parts: string[] = [];
  for (let start = 0; start < 7;) {
    let end = start;
    while (end + 1 < 7 && key(days[end + 1]) === key(days[start])) end++;
    const range = start === end ? DAY_SHORT[start] : `${DAY_SHORT[start]}-${DAY_SHORT[end]}`;
    parts.push(`${range} ${label(days[start])}`);
    start = end + 1;
  }
  return parts.join(" · ");
}
