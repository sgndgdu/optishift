/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Ekip üyesinin asistanı için bağlam (lib/ai/chat): SADECE kişinin kendi verisi ve portalda zaten gördükleri.
 * Kendi vardiyaları (bugünden gelecek haftanın sonuna, yayınlanmış), o günlerde birlikte çalıştığı kişiler,
 * izinleri ve kalan izni, uygunluk durumu, alabileceği açık vardiyalar. Başkasının saati, puanı, ücreti, izni YOK.
 * [v12] / [ilan 5] numaraları asistanın işlem önerisi içindir (lib/ai/teamActions).
 */
import type { AuthUser } from "@/lib/auth";
import { addDays, businessNow } from "@/lib/date";
import { DAY_SHORT } from "@/lib/constants";
import { leaveTypeLabel } from "@/lib/leave";
import { loadLeaveBalance } from "@/lib/leaveBalance";

const J = (raw: unknown, d: any) => { try { return typeof raw === "string" ? JSON.parse(raw) : (raw ?? d); } catch { return d; } };
const short = (iso: string) => { const [, m, dd] = iso.split("-"); return `${Number(dd)}.${Number(m)}`; };
const dayName = (iso: string) => DAY_SHORT[(new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7];
const hoursOf = (a: string, b: string) => {
  const [x, y] = [a, b].map(t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; });
  return ((y <= x ? y + 1440 : y) - x) / 60;
};
const STATUS: Record<string, string> = { pending: "sorumlu onayı bekliyor", approved: "onaylandı", rejected: "reddedildi" };

export async function buildTeamContext(db: any, auth: AuthUser): Promise<{ text: string; locationId: string | null }> {
  const me = await db.prepare(`SELECT * FROM personnel WHERE id = ? AND org_id = ?`).get(auth.personnel_id, auth.org_id) as any;
  if (!me) return { text: "Kişi kaydı bulunamadı.", locationId: null };
  const { date: today, weekStart } = businessNow();
  const until = addDays(weekStart, 13);
  const locIds = [...new Set([me.primary_location_id, ...J(me.assigned_location_ids, [])].filter(Boolean))] as string[];
  const ph = locIds.map(() => "?").join(",") || "''";
  const locs = locIds.length ? await db.prepare(`SELECT id, name, rules FROM locations WHERE id IN (${ph})`).all(...locIds) as any[] : [];
  const home = locs.find(l => l.id === me.primary_location_id) ?? locs[0];
  const rules = J(home?.rules, {});
  const out: string[] = [];

  out.push(`Bugün: ${dayName(today)} ${short(today)} (${today})`);
  out.push(`Kişi: ${me.name}${me.title ? `, ${me.title}` : ""}. Şube: ${home?.name ?? "-"}${locs.length > 1 ? ` (ayrıca: ${locs.filter(l => l !== home).map(l => l.name).join(", ")})` : ""}`);
  const limits = [`haftalık en fazla ${me.max_weekly_hours ?? rules.max_weekly_hours ?? 45} saat`, `iki vardiya arası en az ${rules.min_rest_hours ?? 11} saat dinlenme`];
  if (me.weekly_off_day !== null && me.weekly_off_day !== undefined) limits.push(`sabit izin günü ${DAY_SHORT[Number(me.weekly_off_day)]}`);
  out.push(`Çalışma kuralları: ${limits.join(", ")}`);
  const off: string[] = [];
  if (rules.leave_requests_enabled === false) off.push("izin talebi");
  if (rules.open_shifts_enabled === false) off.push("açık vardiya");
  if (rules.swap_requests_enabled === false) off.push("vardiya değiştirme");
  if (off.length) out.push(`Bu şubede kapalı olanlar: ${off.join(", ")}`);

  // Kendi vardiyaları ve o gün birlikte çalıştıkları
  const mine = await db.prepare(`
    SELECT id, location_id, week_start, day, start_time, end_time, COALESCE(kind,'regular') AS kind
    FROM shift_assignments
    WHERE personnel_id = ? AND publication_status = 'published' AND (week_start::date + day) BETWEEN ?::date AND ?::date
    ORDER BY week_start, day, start_time
  `).all(me.id, today, until) as any[];
  const locName = new Map(locs.map(l => [l.id, l.name]));
  out.push(`### Vardiyalarım (yayınlanmış, ${short(today)}-${short(until)})`);
  if (!mine.length) out.push("- Yayınlanmış vardiya yok.");
  const weekHours = new Map<string, number>();
  for (const s of mine) {
    const date = addDays(s.week_start, Number(s.day));
    const mates = await db.prepare(`
      SELECT p.name, sa.start_time, sa.end_time FROM shift_assignments sa JOIN personnel p ON p.id = sa.personnel_id
      WHERE sa.location_id = ? AND sa.week_start = ? AND sa.day = ? AND sa.publication_status = 'published'
        AND sa.personnel_id != ? AND COALESCE(sa.kind,'regular') = 'regular'
      ORDER BY sa.start_time
    `).all(s.location_id, s.week_start, s.day, me.id) as any[];
    // Sadece saatleri kesişenler (bütün günün listesi uzun ve gereksiz)
    const span = (a: string, b: string) => { const [x, y] = [a, b].map(t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; }); return [x, y <= x ? y + 1440 : y]; };
    const [ms, me2] = span(s.start_time, s.end_time);
    const together = mates.filter(m => { const [a, b] = span(m.start_time, m.end_time); return a < me2 && ms < b; });
    if (s.kind === "regular") weekHours.set(s.week_start, (weekHours.get(s.week_start) ?? 0) + hoursOf(s.start_time, s.end_time));
    out.push(`- ${dayName(date)} ${short(date)} (${date}) ${s.start_time}-${s.end_time}${s.kind === "on_call" ? " icap nöbeti" : ""}${locs.length > 1 ? `, ${locName.get(s.location_id) ?? ""}` : ""} [v${s.id}]` +
      (together.length ? `. Aynı saatlerde çalışanlar: ${together.map(m => m.name).join(", ")}` : ""));
  }
  for (const [ws, h] of weekHours) out.push(`- ${ws === weekStart ? "Bu hafta" : "Gelecek hafta"} toplam: ${Math.round(h * 10) / 10} saat`);

  // İzinler
  const leaves = await db.prepare(`
    SELECT id, type, start_date, end_date, status FROM leave_requests
    WHERE personnel_id = ? AND (status = 'pending' OR end_date >= ?) ORDER BY start_date LIMIT 10
  `).all(me.id, addDays(today, -7)) as any[];
  out.push("### İzinlerim");
  const bal = await loadLeaveBalance(db, me.id, auth.org_id).catch(() => null);
  if (bal) out.push(`- Kalan yıllık izin: ${bal.remaining} gün (hak ${bal.entitledTotal}, kullanılan ${bal.usedDays})${bal.firstEligibleDate ? `. Yıllık izin hakkı ${bal.firstEligibleDate} tarihinde başlar` : ""}`);
  for (const l of leaves) out.push(`- ${leaveTypeLabel(l.type)} ${short(l.start_date)}-${short(l.end_date)}: ${STATUS[l.status] ?? l.status}`);
  if (!leaves.length) out.push("- Yaklaşan izin kaydı yok.");

  // Uygunluk
  if (rules.availability_collection_enabled !== false) {
    const nextWeek = addDays(weekStart, 7);
    const av = await db.prepare(`SELECT * FROM availability WHERE personnel_id = ? AND week_start = ?`).get(me.id, nextWeek) as any;
    if (!av) out.push(`### Uygunluk: gelecek hafta (${short(nextWeek)}) için henüz girilmedi. Uygunluk sayfasından girilir.`);
    else {
      const st = (d: number) => { const r = av[`day_${d}`]; const v = typeof r === "string" && r.startsWith("{") ? J(r, {}).status : r; return v || "available"; };
      const no = [0, 1, 2, 3, 4, 5, 6].filter(d => st(d) === "unavailable").map(d => DAY_SHORT[d]);
      const flex = [0, 1, 2, 3, 4, 5, 6].filter(d => st(d) === "preferred_not").map(d => DAY_SHORT[d]);
      out.push(`### Uygunluk (gelecek hafta girildi): ${no.length ? `gelemem ${no.join(", ")}` : "her gün uygun"}${flex.length ? `; tercih etmem ${flex.join(", ")}` : ""}`);
    }
  }

  // Açık vardiyalar
  if (rules.open_shifts_enabled !== false && locIds.length) {
    const open = await db.prepare(`
      SELECT os.id, os.location_id, os.date, os.start_time, os.end_time, os.hero_bonus_multiplier, os.released_by
      FROM open_shifts os WHERE os.status = 'open' AND os.date >= ? AND os.location_id IN (${ph})
      ORDER BY os.date, os.start_time LIMIT 12
    `).all(today, ...locIds) as any[];
    const busyDays = new Set(mine.map(s => addDays(s.week_start, Number(s.day))));
    out.push("### Açık vardiyalar (ilk alan alır)");
    const rows = open.filter(o => o.released_by !== me.id);
    if (!rows.length) out.push("- Şu an açık vardiya yok.");
    for (const o of rows) {
      out.push(`- ${dayName(o.date)} ${short(o.date)} (${o.date}) ${o.start_time}-${o.end_time}${locs.length > 1 ? `, ${locName.get(o.location_id) ?? ""}` : ""}, +${o.hero_bonus_multiplier ?? 6} puan${busyDays.has(o.date) ? " (o gün zaten vardiyanız var, alamazsınız)" : ""} [ilan ${o.id}]`);
    }
    const mineOpen = open.filter(o => o.released_by === me.id);
    for (const o of mineOpen) out.push(`- Sizin bıraktığınız: ${short(o.date)} ${o.start_time}-${o.end_time}, henüz kimse almadı (alınana kadar sizde)`);
  }

  // Vardiya değiştirme
  const swaps = await db.prepare(`
    SELECT COUNT(*)::int AS n FROM shift_swap_requests WHERE (requester_id = ? OR target_id = ?) AND status IN ('pending','peer_accepted')
  `).get(me.id, me.id).catch(() => null) as any;
  if (Number(swaps?.n ?? 0) > 0) out.push(`### Süren vardiya değiştirme talebi: ${swaps.n} (Talepler sayfasında)`);

  return { text: out.join("\n"), locationId: home?.id ?? null };
}
