/**
 * Güvenilirlik: son haftaların yayınlanmış vardiyalarında gelmeme ve geç kalma.
 * Kaynak giriş (check-in) kayıtları. Şube giriş sistemini düzenli kullanmıyorsa (geçmiş
 * vardiyaların yarısından azında giriş) veri yok sayılır: kimse haksız yere "gelmedi" görünmez. Az vardiyası olan
 * kişi (MIN_SHIFTS altı) değerlendirilmez. Saf fonksiyon; DB okuması /api/reliability'de.
 */

export const RELIABILITY_WEEKS = 8;
const MIN_SHIFTS = 4;
const LATE_MIN = 10;
const MIN_CHECKIN_COVERAGE = 0.5;
const TR_OFFSET_MS = 3 * 3600_000; // Europe/Istanbul, 2016'dan beri sabit UTC+3

export interface ReliabilityRow {
  personnel_id: string;
  week_start: string;
  day: number;
  start_time: string | null;
  end_time: string | null;
  check_in_at: number | null; // unix saniye
  status?: string | null;
}

export interface Reliability {
  shifts: number;
  missed: number;
  late: number;
  /** 0-1; 1 = hiç kaçırmadı ve geç kalmadı */
  score: number;
}

function startEpoch(ws: string, day: number, hhmm: string): number {
  const [y, m, d] = ws.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return Date.UTC(y, m - 1, d + day, h, mi) - TR_OFFSET_MS;
}

export function computeReliability(rows: ReliabilityRow[], nowMs: number): Record<string, Reliability> {
  const past = rows.filter(r => {
    if (!r.start_time || !r.end_time || r.status === "swapped") return false;
    const s = startEpoch(r.week_start, r.day, r.start_time);
    let e = startEpoch(r.week_start, r.day, r.end_time);
    if (e <= s) e += 86_400_000;
    return e < nowMs;
  });
  // Şube girişi düzenli kullanmıyorsa (geçmiş vardiyaların yarısından azında giriş var) veri yok sayılır:
  // ara sıra kullanılan sistemde herkes haksız yere "gelmedi" görünürdü
  const withCheckIn = past.filter(r => r.check_in_at).length;
  if (withCheckIn === 0 || withCheckIn < past.length * MIN_CHECKIN_COVERAGE) return {};

  const acc: Record<string, { shifts: number; missed: number; late: number }> = {};
  for (const r of past) {
    const a = (acc[r.personnel_id] ??= { shifts: 0, missed: 0, late: 0 });
    a.shifts++;
    if (!r.check_in_at || r.status === "absent") { a.missed++; continue; }
    const lateMin = (r.check_in_at * 1000 - startEpoch(r.week_start, r.day, r.start_time!)) / 60_000;
    if (lateMin > LATE_MIN) a.late++;
  }
  const out: Record<string, Reliability> = {};
  for (const [pid, a] of Object.entries(acc)) {
    if (a.shifts < MIN_SHIFTS) continue;
    out[pid] = { ...a, score: Math.max(0, 1 - (a.missed + 0.5 * a.late) / a.shifts) };
  }
  return out;
}

/** Kısa Türkçe özet: "son 8 haftada 2 kez gelmedi, 1 kez geç kaldı" (sorun yoksa null). */
export function reliabilityNote(r: Reliability | undefined): string | null {
  if (!r || (r.missed === 0 && r.late === 0)) return null;
  const parts = [r.missed ? `${r.missed} kez gelmedi` : "", r.late ? `${r.late} kez geç kaldı` : ""].filter(Boolean);
  return `Son ${RELIABILITY_WEEKS} haftada ${parts.join(", ")}`;
}

/** Dikkat gerektiren eşik: 2+ gelmeme ya da skor %80 altı. */
export const isUnreliable = (r: Reliability | undefined) => !!r && (r.missed >= 2 || r.score < 0.8);
