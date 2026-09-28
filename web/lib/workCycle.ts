/**
 * Çalışma döngüsü (rotasyon deseni): kişi başı tekrar eden çalış/dinlen günleri.
 * rules.work_cycle = { pattern, anchor (Pazartesi, YYYY-MM-DD), offsets: {personelId: kaydırma} }.
 * Motor: "O" günü kişiye hiç vardiya yazılmaz; "D" sadece gündüz, "N" sadece gece vardiyası;
 * "W"/"D"/"N" günlerinde çalıştırmayı tercih eder (esnek). Ekip rotasyonundan (hangi ekip
 * hangi vardiyada, rotation_template) bağımsızdır.
 */

export type DayState = "W" | "D" | "N" | "O";

export const WORK_CYCLES: Record<string, { label: string; description: string; days: DayState[] }> = {
  "4-4": { label: "4 çalış 4 dinlen", description: "8 günlük döngü; üretim ve depoda yaygın.", days: ["W", "W", "W", "W", "O", "O", "O", "O"] },
  "2-2-3": { label: "2-2-3 (Panama)", description: "14 günde 7 iş günü; her iki haftada bir uzun hafta sonu.", days: ["W", "W", "O", "O", "W", "W", "W", "O", "O", "W", "W", "O", "O", "O"] },
  "12-36": { label: "Gün aşırı (12/36)", description: "Bir gün çalış, bir gün dinlen; 12 saatlik vardiyalarla.", days: ["W", "O"] },
  "5-2": { label: "5 çalış 2 dinlen", description: "Dinlenme günleri kişiye göre kaydırılır, her gün aynı sayıda kişi olur.", days: ["W", "W", "W", "W", "W", "O", "O"] },
  "6-3": { label: "6 çalış 3 dinlen", description: "9 günlük döngü.", days: ["W", "W", "W", "W", "W", "W", "O", "O", "O"] },
  "D-N-O-O": { label: "Gündüz · Gece · Boş · Boş (12/24-12/48)", description: "Güvenlik ve sağlıkta yaygın: gündüz nöbeti, ertesi gün gece, sonra iki gün dinlenme.", days: ["D", "N", "O", "O"] },
  "DD-NN-OOOO": { label: "2 gündüz · 2 gece · 4 boş", description: "4 ekipli kesintisiz sistem, 8 günlük döngü.", days: ["D", "D", "N", "N", "O", "O", "O", "O"] },
};

export interface WorkCycleConfig {
  pattern: string;
  anchor: string;
  offsets: Record<string, number>;
}

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Kişinin haftadaki 7 günlük durumu; deseni ya da kaydırması yoksa null. */
export function weekStates(cfg: WorkCycleConfig | null | undefined, personnelId: string, weekStart: string): DayState[] | null {
  const pat = cfg && WORK_CYCLES[cfg.pattern];
  const off = cfg?.offsets?.[personnelId];
  if (!pat || typeof off !== "number" || !cfg?.anchor) return null;
  const len = pat.days.length;
  const base = dayDiff(cfg.anchor, weekStart);
  return Array.from({ length: 7 }, (_, d) => pat.days[(((base + d + off) % len) + len) % len]);
}

/**
 * Kişileri döngüye eşit dağıtır: her gün (yaklaşık) aynı sayıda kişi çalışır ve dinlenir.
 * Sıra verilen sıradır (çağıran isme göre sıralar); mevcut kaydırmalar korunmaz.
 */
export function distributeOffsets(personnelIds: string[], pattern: string): Record<string, number> {
  const len = WORK_CYCLES[pattern]?.days.length ?? 1;
  const n = personnelIds.length;
  return Object.fromEntries(personnelIds.map((id, i) => [id, n ? Math.floor((i * len) / n) % len : 0]));
}
