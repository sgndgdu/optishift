import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { canManageLocation } from "@/lib/access";
import { aiChat, aiChatProvider, type ChatTurn } from "@/lib/ai/chat";
import { businessToday } from "@/lib/date";

// Plan Asistanı sohbeti (lib/ai/chat). Bağlam: ekrandaki haftanın özeti (lib/copilot buildWeekSnapshot,
// kaydedilmemiş değişiklikler dahil). Asistan sadece öneri verir, planı değiştirmez.

const MAX_QUESTION = 500;
const MAX_TURNS = 8;
const MAX_SNAPSHOT_CHARS = 80_000;
const DAILY_LIMIT = 60; // kişi başı, ücretsiz kotayı korumak için (sunucu örneği başına, kabaca)
const usage = new Map<string, { day: string; n: number }>();

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ enabled: auth.role !== "employee" && aiChatProvider() !== null });
}

function systemPrompt(snapshotJson: string): string {
  return [
    "Sen OptiShift'in Plan Asistanı'sın. Bir işletme müdürüne haftalık vardiya planı hakkında yardım ediyorsun.",
    "Kurallar:",
    "- Türkçe, kısa ve net yaz. Gerekirse madde işareti kullan, en fazla 8 madde.",
    "- Sadece aşağıdaki hafta verisine dayan. Veride olmayan bir şeyi uydurma; bilmiyorsan söyle.",
    "- Sayıları ve isimleri veriden aynen al.",
    "- Planı sen değiştiremezsin; değişiklik önerirsen müdürün Vardiya Planı'nda yapacağı adımı söyle.",
    "- İş Kanunu sınırlarını (haftalık saat, 11 saat dinlenme, hafta tatili) gözet.",
    "- Gün numaraları: 0=Pazartesi … 6=Pazar.",
    `Bugün: ${businessToday()}.`,
    "Haftanın verisi (JSON):",
    snapshotJson,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  if (!aiChatProvider()) return NextResponse.json({ error: "Asistan sohbeti bu kurulumda kapalı." }, { status: 503 });

  const body = await req.json().catch(() => null) as {
    location_id?: string; question?: string; history?: ChatTurn[]; snapshot?: unknown;
  } | null;
  const question = body?.question?.trim() ?? "";
  if (!body?.location_id || !question) return NextResponse.json({ error: "Soru boş olamaz" }, { status: 400 });
  if (question.length > MAX_QUESTION) return NextResponse.json({ error: "Soru çok uzun" }, { status: 400 });
  if (!(await canManageLocation(getDB(), auth, body.location_id))) {
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  }

  const snapshotJson = JSON.stringify(body.snapshot ?? {});
  if (snapshotJson.length > MAX_SNAPSHOT_CHARS) return NextResponse.json({ error: "Hafta verisi çok büyük" }, { status: 413 });

  const day = businessToday();
  const u = usage.get(auth.id);
  const n = u && u.day === day ? u.n : 0;
  if (n >= DAILY_LIMIT) return NextResponse.json({ error: "Bugünkü soru sınırına ulaşıldı, yarın tekrar deneyin." }, { status: 429 });
  usage.set(auth.id, { day, n: n + 1 });

  const history = (Array.isArray(body.history) ? body.history : [])
    .filter(t => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string")
    .slice(-MAX_TURNS)
    .map(t => ({ role: t.role, text: t.text.slice(0, 2000) }));
  // Sohbet kullanıcıyla başlamalı
  while (history.length && history[0].role !== "user") history.shift();

  const result = await aiChat(systemPrompt(snapshotJson), [...history, { role: "user", text: question }]);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ answer: result.text });
}
