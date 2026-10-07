/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Sabah özeti: TEK KAYNAK. Günlük görev (cron/autopilot, 08:00) her şubenin sorumlularına tek bildirim gönderir:
 * bugün kaç kişi çalışıyor, kim izinde, karar bekleyen işler ve bunların hazır çözümleri (lib/suggestions).
 * Yeni bir şey üretmez, var olanı sorumluya kendiliğinden ulaştırır. Bugün planı ve bekleyen işi olmayan şubeye gitmez.
 * Şube ayarı `rules.morning_brief_enabled` (varsayılan açık); aynı gün ikinci kez gitmez (`rules.morning_brief_sent`).
 */
import type { AuthUser } from "@/lib/auth";
import { businessNow } from "@/lib/date";
import { buildSuggestions } from "@/lib/suggestions";
import { notifyBranchManagers } from "@/lib/managerNotifications";
import { specialDaysInRange } from "@/lib/specialDays";
import { industryFromRules } from "@/lib/templates";

const parseRules = (r: any) => { try { return typeof r === "string" ? JSON.parse(r || "{}") : (r ?? {}); } catch { return {}; } };
const names = (list: string[], max = 3) =>
  list.length <= max ? list.join(", ") : `${list.slice(0, max).join(", ")} ve ${list.length - max} kişi daha`;

export type MorningBrief = { title: string; message: string; link: string; urgent: number };

export async function buildMorningBrief(db: any, orgId: string, locationId: string): Promise<MorningBrief | null> {
  const { date: today, dayIdx, weekStart } = businessNow();
  const working = await db.prepare(`
    SELECT p.name, sa.start_time FROM shift_assignments sa JOIN personnel p ON p.id = sa.personnel_id
    WHERE sa.location_id = ? AND sa.week_start = ? AND sa.day = ? AND sa.publication_status = 'published'
      AND COALESCE(sa.kind, 'regular') = 'regular'
    ORDER BY sa.start_time
  `).all(locationId, weekStart, dayIdx) as { name: string; start_time: string }[];
  const onLeave = await db.prepare(`
    SELECT p.name FROM leave_requests lr JOIN personnel p ON p.id = lr.personnel_id
    WHERE p.org_id = ? AND p.primary_location_id = ? AND lr.status = 'approved' AND lr.start_date <= ? AND lr.end_date >= ?
  `).all(orgId, locationId, today, today) as { name: string }[];
  const pendingSwaps = await db.prepare(`
    SELECT COUNT(*)::int AS n FROM shift_swap_requests sr JOIN shift_assignments sa ON sa.id = sr.requester_shift_id
    WHERE sr.org_id = ? AND sa.location_id = ? AND sr.status = 'peer_accepted' AND (sa.week_start::date + sa.day) >= ?::date
  `).get(orgId, locationId, today).catch(() => ({ n: 0 })) as any;

  // Hazır çözümler hesap sahibi gözüyle hazırlanır; bildirimi alan her sorumlu Ana Sayfa'da kendi yetkisiyle görür
  const owner = { id: "brief", org_id: orgId, role: "admin", location_id: locationId, personnel_id: null, name: "" } as AuthUser;
  const suggestions = await buildSuggestions(db, owner, locationId).catch(() => []);
  const swaps = Number(pendingSwaps?.n ?? 0);
  if (!working.length && !suggestions.length && !swaps) return null;

  const parts: string[] = [];
  if (working.length) {
    const first = working[0].start_time;
    parts.push(`Bugün ${working.length} kişi çalışıyor, ilk vardiya ${first}.`);
  } else parts.push("Bugün yayınlanmış vardiya yok.");
  if (onLeave.length) parts.push(`İzinde: ${names(onLeave.map(l => l.name))}.`);
  if (suggestions.length) {
    parts.push(`${suggestions.length} iş kararınızı bekliyor ve çözümleri hazır.`);
    parts.push(suggestions[0].title);
  }
  if (swaps) parts.push(`${swaps} vardiya değiştirme talebi onayınızı bekliyor.`);
  if (!suggestions.length && !swaps) parts.push("Karar bekleyen bir iş yok.");

  // Bugün özel bir günse (resmî tatil, arife, sektörü ilgilendiren özel gün) tek cümle (lib/specialDays)
  const loc = await db.prepare(`SELECT rules FROM locations WHERE id = ?`).get(locationId) as any;
  const special = specialDaysInRange(today, today, industryFromRules(parseRules(loc?.rules))?.key ?? null)
    .find(d => d.kind === "holiday" || d.kind === "half_holiday" || d.kind === "commercial");
  if (special) parts.splice(1, 0, `Bugün ${special.name}: ${special.note.split(". ")[0].replace(/\.$/, "")}.`);

  const urgent = suggestions.filter(s => s.urgent).length;
  return {
    title: suggestions.length ? `Günaydın, ${suggestions.length} iş hazır çözümüyle bekliyor` : "Günaydın, bugünün özeti",
    message: parts.join(" "),
    link: suggestions.length ? "/dashboard#hazir-cozumler" : swaps ? "/requests" : "/dashboard",
    urgent,
  };
}

/** Günlük görev: bütün şubelere sabah özeti */
export async function sendMorningBriefs(db: any, budgetMs = 40_000): Promise<{ sent: number; checked: number }> {
  const today = businessNow().date;
  const started = Date.now();
  const locs = await db.prepare(`SELECT id, org_id, rules FROM locations`).all() as any[];
  let sent = 0;
  for (const loc of locs) {
    if (Date.now() - started > budgetMs) break;
    const rules = parseRules(loc.rules);
    if (rules.morning_brief_enabled === false || rules.morning_brief_sent === today) continue;
    try {
      const brief = await buildMorningBrief(db, loc.org_id, loc.id);
      if (brief) {
        await notifyBranchManagers(db, loc.org_id, loc.id, null, { type: "morning_brief", title: brief.title, message: brief.message, link: brief.link });
        sent++;
      }
      // Kurallar yeniden okunup tek anahtar yazılır (arada kaydedilen ayar ezilmesin)
      const fresh = await db.prepare(`SELECT rules FROM locations WHERE id = ?`).get(loc.id) as any;
      await db.prepare(`UPDATE locations SET rules = ? WHERE id = ?`).run(JSON.stringify({ ...parseRules(fresh?.rules), morning_brief_sent: today }), loc.id);
    } catch (e) {
      console.error("[morningBrief]", loc.id, e);
    }
  }
  return { sent, checked: locs.length };
}
