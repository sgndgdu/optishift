/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { managerOutsideBranch } from "@/lib/access";
import { hasPerm } from "@/lib/userAccess";
import { claimOpenShift } from "@/lib/openShifts";
import { decideSwap } from "@/lib/swapDecision";
import { formatDateTR } from "@/lib/date";
import { canBendRules, notifyRequester, publishPermit, requestRuleException } from "@/lib/ruleExceptions";

/**
 * Kural istisnası (lib/ruleExceptions).
 * GET ?location_id=: hesap sahibine bekleyenler (Onaylar › Kural istisnası). Diğerlerine boş.
 * GET ?location_id=&week_start=&kind=publish_week: bu hafta için istek durumu (Vardiya Planı yayın penceresi).
 * POST { kind: "publish_week", location_id, week_start, violations }: kurala uymayan planı yayınlamak için izin ister.
 * PATCH { id, decision: "approve" | "reject" }: sadece hesap sahibi. Onayda işlem hesap sahibi adına uygulanır.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const sp = new URL(req.url).searchParams;
  const locationId = sp.get("location_id");
  const weekStart = sp.get("week_start");
  const db = getDB();
  try {
    if (sp.get("kind") === "publish_week" && locationId && weekStart) {
      if (auth.role === "employee" || managerOutsideBranch(auth, locationId)) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      const permit = await publishPermit(db, auth.org_id, locationId, weekStart);
      const pending = await db.prepare(
        `SELECT id FROM rule_exceptions WHERE org_id = ? AND kind = 'publish_week' AND ref_key = ? AND status = 'pending' LIMIT 1`
      ).get(auth.org_id, `${locationId}|${weekStart}`);
      return NextResponse.json({ approved: !!permit, approved_violations: permit?.violations ?? [], pending: !!pending });
    }
    if (!canBendRules(auth)) return NextResponse.json([]);
    const rows = await db.prepare(`
      SELECT re.*, l.name AS location_name FROM rule_exceptions re LEFT JOIN locations l ON l.id = re.location_id
      WHERE re.org_id = ? AND re.status = 'pending' AND (?::text IS NULL OR re.location_id = ?::text)
      ORDER BY re.created_at ASC
    `).all(auth.org_id, locationId, locationId) as any[];
    return NextResponse.json(rows.map(r => ({ ...r, violations: safeList(r.violations) })));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee" || !hasPerm(auth, "publish")) return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  const db = getDB();
  try {
    const { kind, location_id, week_start, violations } = await req.json();
    if (kind !== "publish_week" || !location_id || !/^\d{4}-\d{2}-\d{2}$/.test(String(week_start ?? ""))) {
      return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
    }
    if (managerOutsideBranch(auth, location_id)) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    const loc = await db.prepare(`SELECT name FROM locations WHERE id = ? AND org_id = ?`).get(location_id, auth.org_id) as any;
    if (!loc) return NextResponse.json({ error: "Şube bulunamadı" }, { status: 404 });
    const list = (Array.isArray(violations) ? violations : []).map((v: unknown) => String(v).slice(0, 300)).filter(Boolean).slice(0, 200);
    if (list.length === 0) return NextResponse.json({ error: "Kurala uymayan madde yok" }, { status: 400 });
    if (canBendRules(auth)) return NextResponse.json({ error: "Hesap sahibi onay istemeden yayınlayabilir" }, { status: 400 });
    await requestRuleException(db, auth, {
      kind: "publish_week", location_id, ref_key: `${location_id}|${week_start}`, payload: { location_id, week_start },
      summary: `${loc.name} şubesinin ${formatDateTR(week_start)} haftasının planını yayınlamak istiyor.`,
      violations: list,
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!canBendRules(auth)) return NextResponse.json({ error: "Kural istisnasını sadece hesap sahibi onaylar" }, { status: 403 });
  const db = getDB();
  try {
    const { id, decision } = await req.json();
    if (!id || (decision !== "approve" && decision !== "reject")) return NextResponse.json({ error: "id ve karar zorunlu" }, { status: 400 });
    const row = await db.prepare(`SELECT * FROM rule_exceptions WHERE id = ? AND org_id = ?`).get(id, auth.org_id) as any;
    if (!row || row.status !== "pending") return NextResponse.json({ error: "Bu istek artık onay beklemiyor" }, { status: 409 });
    const now = Math.floor(Date.now() / 1000);

    if (decision === "reject") {
      await db.prepare(`UPDATE rule_exceptions SET status = 'rejected', decided_by = ?, decided_at = ? WHERE id = ?`).run(auth.id, now, id);
      await notifyRequester(db, row, "Kural istisnası onaylanmadı", `Hesap sahibi onaylamadı: ${row.summary}`, row.kind === "publish_week" ? "/schedule" : "/requests");
      return NextResponse.json({ success: true });
    }

    const payload = safeObj(row.payload);
    let error: string | null = null;
    if (row.kind === "open_shift_assign") {
      const r = await claimOpenShift(db, auth.org_id, Number(payload.open_shift_id), String(payload.personnel_id), payload.name ? String(payload.name) : null,
        { assignedByManager: true, force: true, assigner: auth });
      if (!r.ok) error = r.error;
    } else if (row.kind === "loan_approve") {
      const os = await db.prepare(`SELECT claimed_by, claimed_by_name FROM open_shifts WHERE id = ? AND org_id = ?`).get(payload.open_shift_id, auth.org_id) as any;
      const r = os ? await claimOpenShift(db, auth.org_id, Number(payload.open_shift_id), os.claimed_by, os.claimed_by_name ?? null, { loanApproval: true, force: true }) : null;
      if (!r) error = "Vardiya bulunamadı";
      else if (!r.ok) error = r.error;
    } else if (row.kind === "swap_approve") {
      const r = await decideSwap(db, auth, { id: payload.swap_id, status: "manager_approved", force: true });
      if (r.status >= 300) error = r.body?.error ?? "Vardiya değiştirme onaylanamadı";
    }
    // publish_week: onay bir izindir (lib/ruleExceptions publishPermit), sorumlu planı yayınlar
    if (error) return NextResponse.json({ error: `Uygulanamadı: ${error} İsteği reddedebilirsiniz.` }, { status: 409 });

    await db.prepare(`UPDATE rule_exceptions SET status = 'approved', decided_by = ?, decided_at = ? WHERE id = ?`).run(auth.id, now, id);
    await notifyRequester(db, row, "Kural istisnası onaylandı",
      row.kind === "publish_week" ? `Hesap sahibi onayladı. Planı 24 saat içinde yayınlayabilirsiniz: ${row.summary}` : `Hesap sahibi onayladı ve işlem yapıldı: ${row.summary}`,
      row.kind === "publish_week" ? "/schedule" : "/requests");
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function safeList(raw: unknown): string[] {
  try { const v = JSON.parse(String(raw ?? "[]")); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}
function safeObj(raw: unknown): Record<string, any> {
  try { const v = JSON.parse(String(raw ?? "{}")); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
