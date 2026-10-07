/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Plan haftasının takvimi (sunucu): TEK KAYNAK. Özel günler (lib/specialDays), işletmenin aynı özel gündeki
 * kendi geçmişi (yayınlanmış plandaki kişi sayısı ve varsa ciro, normal aynı gün ortalamasıyla) ve şubenin
 * konumu girilmişse hava durumu (Open-Meteo, anahtarsız; sadece koordinat gider).
 * Gösterildiği yerler: Vardiya Planı "Bu haftanın takvimi" kartı, İşletme Asistanı bağlamı, sabah özeti.
 */
import { addDays, businessToday, formatDateTR } from "@/lib/date";
import { DAY_NAMES } from "@/lib/constants";
import { previousOccurrence, specialDaysInRange, type SpecialDayKind } from "@/lib/specialDays";
import { industryFromRules } from "@/lib/templates";

export type CalendarItem = { date: string; title: string; detail: string; kind: SpecialDayKind | "weather" };

const J = (raw: unknown, d: any) => { try { return typeof raw === "string" ? JSON.parse(raw) : (raw ?? d); } catch { return d; } };
const dayIdx = (iso: string) => (new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7;
const weekOf = (iso: string) => addDays(iso, -dayIdx(iso));
const BASELINE_WEEKS = 4;
const WEATHER_DAYS = 14;

async function headcount(db: any, locationId: string, date: string): Promise<number | null> {
  const row = await db.prepare(`
    SELECT COUNT(*)::int AS n, BOOL_OR(publication_status = 'published') AS pub FROM shift_assignments
    WHERE location_id = ? AND week_start = ? AND day = ? AND COALESCE(kind,'regular') = 'regular'
  `).get(locationId, weekOf(date), dayIdx(date)) as any;
  // Hafta yayınlanmamışsa (ya da plan yoksa) sayı bilinmiyor
  const anyPub = await db.prepare(`SELECT 1 FROM shift_assignments WHERE location_id = ? AND week_start = ? AND publication_status = 'published' LIMIT 1`)
    .get(locationId, weekOf(date));
  return anyPub ? Number(row?.n ?? 0) : null;
}

async function revenue(db: any, locationId: string, date: string): Promise<number | null> {
  const r = await db.prepare(`SELECT revenue, footfall FROM location_sales_data WHERE location_id = ? AND date = ?`).get(locationId, date).catch(() => null) as any;
  const v = r?.revenue ?? r?.footfall;
  return v == null ? null : Number(v);
}

/** Aynı özel günün geçmişteki karşılığı, işletmenin kendi verisiyle. Veri yoksa null. */
async function historyNote(db: any, locationId: string, prev: string): Promise<string | null> {
  const n = await headcount(db, locationId, prev);
  const base: number[] = [], baseRev: number[] = [];
  for (let w = 1; w <= BASELINE_WEEKS; w++) {
    const d = addDays(prev, -7 * w);
    const h = await headcount(db, locationId, d);
    if (h !== null) base.push(h);
    const r = await revenue(db, locationId, d);
    if (r !== null) baseRev.push(r);
  }
  const parts: string[] = [];
  const when = `${formatDateTR(prev, { weekday: false })} ${prev.slice(0, 4)}`;
  if (n !== null && base.length >= 2) {
    const avg = Math.round((base.reduce((a, b) => a + b, 0) / base.length) * 10) / 10;
    parts.push(`Geçen sefer (${when}) ${n} kişi çalıştı, normal bir ${DAY_NAMES[dayIdx(prev)]} ortalaması ${avg} kişi.`);
  }
  const rev = await revenue(db, locationId, prev);
  if (rev !== null && baseRev.length >= 2) {
    const avg = baseRev.reduce((a, b) => a + b, 0) / baseRev.length;
    if (avg > 0) {
      const pct = Math.round(((rev - avg) / avg) * 100);
      parts.push(`O gün ciro normal ${DAY_NAMES[dayIdx(prev)]} gününden %${Math.abs(pct)} ${pct >= 0 ? "yüksekti" : "düşüktü"}.`);
    }
  }
  return parts.length ? parts.join(" ") : null;
}

async function weatherItems(lat: number, lon: number, start: string, end: string): Promise<CalendarItem[]> {
  const today = businessToday();
  const from = start < today ? today : start;
  const to = end > addDays(today, WEATHER_DAYS) ? addDays(today, WEATHER_DAYS) : end;
  if (from > to) return [];
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FIstanbul&start_date=${from}&end_date=${to}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(3500) }).catch(() => null);
  if (!res?.ok) return [];
  const d = await res.json().catch(() => null) as any;
  const days: string[] = d?.daily?.time ?? [];
  const out: CalendarItem[] = [];
  days.forEach((date, i) => {
    const hi = Number(d.daily.temperature_2m_max?.[i]), lo = Number(d.daily.temperature_2m_min?.[i]), rain = Number(d.daily.precipitation_probability_max?.[i]);
    if (rain >= 70) out.push({ date, kind: "weather", title: `Yağmur bekleniyor (%${Math.round(rain)})`, detail: "Açık alanı olan işletmede ve yol durumunda yoğunluğu etkileyebilir." });
    else if (hi >= 34) out.push({ date, kind: "weather", title: `Çok sıcak (${Math.round(hi)}°C)`, detail: "Açık alanda ve sıcak ortamda çalışanlara mola ve su hatırlatın." });
    else if (lo <= 0) out.push({ date, kind: "weather", title: `Don riski (${Math.round(lo)}°C)`, detail: "Sabah yol durumu gecikmelere yol açabilir." });
  });
  return out;
}

export async function buildWeekCalendar(db: any, locationId: string, weekStart: string, opts: { weather?: boolean } = {}): Promise<CalendarItem[]> {
  const loc = await db.prepare(`SELECT rules, latitude, longitude FROM locations WHERE id = ?`).get(locationId) as any;
  if (!loc) return [];
  const industry = industryFromRules(J(loc.rules, {}))?.key ?? null;
  const end = addDays(weekStart, 6);
  const items: CalendarItem[] = [];
  for (const s of specialDaysInRange(weekStart, end, industry)) {
    let detail = s.note;
    const prev = previousOccurrence(s);
    if (prev) {
      const h = await historyNote(db, locationId, prev).catch(() => null);
      if (h) detail = `${detail} ${h}`;
    }
    items.push({ date: s.date, title: s.name, detail, kind: s.kind });
  }
  if (opts.weather !== false && typeof loc.latitude === "number" && typeof loc.longitude === "number" && (industry === "hospitality" || industry === "retail" || industry === "logistics" || industry === "security")) {
    items.push(...await weatherItems(loc.latitude, loc.longitude, weekStart, end).catch(() => []));
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

/** Asistan bağlamı ve sabah özeti için tek satırlık metinler */
export function calendarLines(items: CalendarItem[]): string[] {
  return items.map(i => `${formatDateTR(i.date)}: ${i.title}. ${i.detail}`);
}
