/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { computeFatigueRisk, type FatigueDayEntry } from "@/lib/fatigue";

const LOOKBACK_DAYS = 10;

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mondayOf(d: Date): string {
  const c = new Date(d);
  const day = c.getDay();
  c.setDate(c.getDate() - ((day + 6) % 7));
  return isoDate(c);
}

function dateForWeekDay(weekStart: string, day: number): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const dt = new Date(y, m - 1, d + day);
  return isoDate(dt);
}

// rules.fatigue_radar_enabled açıkken: son ~10 günün yayınlanmış vardiyaları +
// bu haftanın fazla mesai kaydı üzerinden kişi başı risk listesi döner. Dashboard
// kartı ve schedule sayfasının risk ikonu aynı endpoint'i kullanır.
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  if (!location_id) return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    const loc = await db.prepare(`SELECT id, rules, shift_definitions FROM locations WHERE id = ? AND org_id = ?`).get(location_id, auth.org_id) as any;
    if (!loc) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

    let rules: any = {};
    try { rules = JSON.parse(loc.rules || "{}"); } catch { /* boş kalsın */ }
    if (rules.fatigue_radar_enabled !== true) {
      return NextResponse.json({ error: "Kaza Risk Radarı bu şubede kapalı" }, { status: 403 });
    }

    let shiftDefs: { id: string; is_night?: boolean }[] = [];
    try { shiftDefs = JSON.parse(loc.shift_definitions || "[]"); } catch { /* boş kalsın */ }
    const nightDefIds = new Set(shiftDefs.filter((s) => s.is_night).map((s) => String(s.id)));
    const isNightTime = (start?: string | null, end?: string | null) => {
      if (!start || !end) return false;
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      if ([sh, sm, eh, em].some(Number.isNaN)) return false;
      const startMin = sh * 60 + sm;
      let endMin = eh * 60 + em;
      if (endMin <= startMin) endMin += 1440;
      return startMin >= 22 * 60 || endMin > 24 * 60;
    };

    const personnelRows = await db.prepare(
      `SELECT id, name FROM personnel WHERE assigned_location_ids LIKE ? AND status = 'active'`
    ).all(`%"${location_id}"%`) as any[];
    if (personnelRows.length === 0) return NextResponse.json({ enabled: true, at_risk: [] });

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
    const cutoffWeekStart = mondayOf(cutoff);

    const assignRows = await db.prepare(
      `SELECT personnel_id, week_start, day, shift_id, start_time, end_time
       FROM shift_assignments
       WHERE location_id = ? AND week_start >= ? AND publication_status = 'published'
       ORDER BY week_start ASC, day ASC`
    ).all(location_id, cutoffWeekStart) as any[];

    const entriesByPerson = new Map<string, FatigueDayEntry[]>();
    for (const r of assignRows) {
      if (!r.start_time || !r.end_time) continue;
      const date = dateForWeekDay(r.week_start, Number(r.day));
      if (date < isoDate(cutoff)) continue; // hafta sınırından çekildi ama gün bazında hâlâ pencerenin dışında olabilir
      const isNight = nightDefIds.has(String(r.shift_id)) || isNightTime(r.start_time, r.end_time);
      const list = entriesByPerson.get(r.personnel_id) || [];
      list.push({ date, is_night: isNight, start_time: r.start_time, end_time: r.end_time });
      entriesByPerson.set(r.personnel_id, list);
    }

    const thresholdHours = typeof rules.overtime_threshold_hours === "number" ? rules.overtime_threshold_hours : 45;

    const thisWeekStart = mondayOf(new Date());
    const overtimeRows = await db.prepare(
      `SELECT personnel_id, overtime_hours FROM overtime_records WHERE location_id = ? AND week_start = ?`
    ).all(location_id, thisWeekStart) as any[];
    const overtimeByPerson = new Map<string, number>();
    for (const r of overtimeRows) {
      overtimeByPerson.set(r.personnel_id, (overtimeByPerson.get(r.personnel_id) ?? 0) + Number(r.overtime_hours || 0));
    }

    const atRisk = personnelRows
      .map((p) => {
        const entries = entriesByPerson.get(p.id) ?? [];
        const risk = computeFatigueRisk(entries, overtimeByPerson.get(p.id) ?? 0, thresholdHours);
        return { personnel_id: p.id, name: p.name, ...risk };
      })
      .filter((r) => r.riskLevel !== "none")
      .sort((a, b) => (a.riskLevel === b.riskLevel ? 0 : a.riskLevel === "danger" ? -1 : 1));

    return NextResponse.json({ enabled: true, at_risk: atRisk });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
