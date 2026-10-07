/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { canManageLocation } from "@/lib/access";
import { aiChat, aiChatProvider } from "@/lib/ai/chat";
import { extractJson, planInstructPrompt, resolveDirectives, type InstructCtx } from "@/lib/ai/planInstruct";
import { businessToday } from "@/lib/date";

// Cümleyle plan değiştirme, 1. adım: isteği motor kısıtlarına çevirir (lib/ai/planInstruct). Kayıt yazmaz.
// 2. adım istemcide: kısıtlar /api/generate `overrides` ile motora gider, mevcut plan en az değişir.

const MAX_TEXT = 600;
const DAILY_LIMIT = 40;
const usage = new Map<string, { day: string; n: number }>();
const OPTS = { thinking: "low" as const, timeoutMs: 20_000, models: [process.env.GEMINI_CHAT_MODEL || "gemini-flash-lite-latest", "gemini-3.5-flash"] };
const J = (raw: unknown, d: any) => { try { return typeof raw === "string" ? JSON.parse(raw) : (raw ?? d); } catch { return d; } };

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  if (!aiChatProvider()) return NextResponse.json({ error: "Yapay zekâ bu kurulumda kapalı." }, { status: 503 });

  const body = await req.json().catch(() => null) as { location_id?: string; week_start?: string; text?: string } | null;
  const text = body?.text?.trim() ?? "";
  const locationId = body?.location_id ?? "";
  const weekStart = body?.week_start ?? "";
  if (!text || !locationId || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ error: "İstek çok uzun" }, { status: 400 });

  const db = getDB();
  if (!(await canManageLocation(db, auth, locationId))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

  const day = businessToday();
  const u = usage.get(auth.id);
  const n = u && u.day === day ? u.n : 0;
  if (n >= DAILY_LIMIT) return NextResponse.json({ error: "Bugünkü sınıra ulaşıldı, yarın tekrar deneyin." }, { status: 429 });
  usage.set(auth.id, { day, n: n + 1 });

  const loc = await db.prepare(`SELECT shift_definitions FROM locations WHERE id = ? AND org_id = ?`).get(locationId, auth.org_id) as any;
  if (!loc) return NextResponse.json({ error: "Şube bulunamadı" }, { status: 404 });
  const shifts = (J(loc.shift_definitions, []) as any[])
    .filter(s => !s.on_call && s.start && s.end)
    .map(s => ({ id: String(s.id), name: String(s.name ?? `${s.start}-${s.end}`), start: String(s.start), end: String(s.end) }));
  const people = await db.prepare(`
    SELECT id, name, weekly_off_day FROM personnel
    WHERE org_id = ? AND status != 'inactive' AND (primary_location_id = ? OR assigned_location_ids LIKE ?) ORDER BY name
  `).all(auth.org_id, locationId, `%"${locationId}"%`) as any[];
  const departments = await db.prepare(`SELECT id, name FROM departments WHERE location_id = ? ORDER BY name`).all(locationId) as any[];
  const ctx: InstructCtx = { people, shifts, departments, weekStart, today: day };

  const result = await aiChat(planInstructPrompt(ctx), [{ role: "user", text }], OPTS);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  const json = extractJson(result.text);
  if (json && typeof json.ask === "string" && json.ask.trim()) return NextResponse.json({ ask: json.ask.trim().slice(0, 400), overrides: [], summary: [], dropped: [] });
  const raw = Array.isArray(json?.directives) ? json!.directives as unknown[] : [];
  if (!raw.length) return NextResponse.json({ ask: "İstek anlaşılamadı. Kişi adı, gün ve vardiyayı yazarak tekrar deneyin.", overrides: [], summary: [], dropped: [] });
  return NextResponse.json(resolveDirectives(raw, ctx));
}
